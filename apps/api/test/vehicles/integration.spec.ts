import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configure } from '../../src/configure';
import { PrismaService } from '../../src/prisma.service';
import { hashToken } from '../../src/auth';
import { Role } from '../../generated/client';

config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);
describe('Verified motorist vehicle management', () => {
  let app: INestApplication, db: PrismaService;
  const ids: string[] = [],
    offences: string[] = [];
  const tokens: Record<string, string> = {},
    users: Record<string, string> = {};
  let vehicleId: string, categoryId: string;
  const plate = `T${randomBytes(5).toString('hex').toUpperCase()}`;
  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    who = 'USER',
  ) => {
    const client = request(app.getHttpServer());
    return client[method](`/api/v1${path}`).auth(tokens[who], {
      type: 'bearer',
    });
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication(new ExpressAdapter());
    configure(app);
    await app.init();
    db = app.get(PrismaService);
    for (const name of ['SUPERVISOR', 'OFFICER', 'USER', 'OTHER', 'ADMIN']) {
      const id = randomUUID();
      ids.push(id);
      users[name] = id;
      await db.user.create({
        data: {
          id,
          name: `Test ${name}`,
          email: `${id}@example.invalid`,
          role: (name === 'OTHER' ? 'USER' : name) as Role,
          passwordHash: 'not-a-login-hash',
          ...(name === 'OFFICER' ? { supervisorId: users.SUPERVISOR } : {}),
        },
      });
      tokens[name] = randomBytes(32).toString('hex');
      await db.session.create({
        data: {
          userId: id,
          tokenHash: hashToken(tokens[name]),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    }
    const v = await db.vehicle.create({
      data: {
        registrationNumber: plate,
        make: 'Test',
        model: 'Sample',
        colour: 'Silver',
        registrationStatus: 'REGISTERED',
      },
    });
    vehicleId = v.id;
    const c = await db.offenceCategory.create({
      data: {
        code: `T-${randomBytes(6).toString('hex')}`,
        name: 'Test speeding',
        description: 'Synthetic test rules',
        demoFineAmount: 80,
        demeritPoints: 3,
        paymentDueDays: 30,
      },
    });
    categoryId = c.id;
  });
  afterAll(async () => {
    if (db) {
      await db.vehicleLinkRequest.deleteMany({
        where: { motoristId: { in: ids } },
      });
      await db.ticket.deleteMany({ where: { offenceId: { in: offences } } });
      await db.offence.deleteMany({ where: { id: { in: offences } } });
      await db.vehicle.deleteMany({ where: { id: vehicleId } });
      await db.offenceCategory.deleteMany({ where: { id: categoryId } });
      await db.auditEvent.deleteMany({
        where: {
          OR: [{ actorId: { in: ids } }, { entityId: { in: offences } }],
        },
      });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });
  const review = {
    status: 'VERIFIED',
    note: 'Synthetic ownership evidence checked',
    checked: true,
  };
  it('checks without exposing the registry, derives requester, deduplicates and requires admin approval', async () => {
    const unknown = await call('post', '/motorist/vehicles/check')
      .send({ registration: 'UNKNOWN999' })
      .expect(201);
    const known = await call('post', '/motorist/vehicles/check')
      .send({ registration: plate.toLowerCase() })
      .expect(201);
    expect(known.body.vehicle).toBeNull();
    expect(known.body.message).toBe(unknown.body.message);
    await call('post', '/motorist/vehicles/link-request')
      .send({ registration: plate, motoristId: users.OTHER })
      .expect(400);
    await call('post', '/motorist/vehicles/link-request')
      .send({ registration: '??' })
      .expect(400);
    const [a, b] = await Promise.all([
      call('post', '/motorist/vehicles/link-request').send({
        registration: plate,
      }),
      call('post', '/motorist/vehicles/link-request').send({
        registration: plate,
      }),
    ]);
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.status).toBe('PENDING');
    expect((await call('get', '/motorist/vehicles')).body.total).toBe(0);
    await call('get', `/motorist/vehicles/${plate}`).expect(404);
    await call('post', `/admin/vehicle-link-requests/${a.body.id}/review`)
      .send(review)
      .expect(403);
    await call(
      'post',
      `/admin/vehicle-link-requests/${a.body.id}/review`,
      'SUPERVISOR',
    )
      .send(review)
      .expect(403);
    await call(
      'post',
      `/admin/vehicle-link-requests/${a.body.id}/review`,
      'ADMIN',
    )
      .send({ ...review, checked: false })
      .expect(400);
    await call(
      'post',
      `/admin/vehicle-link-requests/${a.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(201);
    await call(
      'post',
      `/admin/vehicle-link-requests/${a.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(201);
    const inventory = await call('get', '/motorist/vehicles').expect(200);
    expect(inventory.body.summary.registeredVehicles).toBe(1);
    expect(inventory.body.items[0]).toMatchObject({
      registrationNumber: plate,
      ownershipStatus: 'VERIFIED',
    });
    expect(inventory.body.items[0].id).toBeUndefined();
    expect(
      (await call('get', '/motorist/dashboard')).body.registeredVehicles,
    ).toBe(1);
    await call('get', `/motorist/vehicles/${plate}`, 'OTHER').expect(404);
    await call('get', `/motorist/vehicles/${plate}/status`, 'OTHER').expect(
      404,
    );
    await call('patch', `/motorist/vehicles/${plate}`, 'OTHER')
      .send({ nickname: 'Stolen label' })
      .expect(404);
    await call('patch', `/motorist/vehicles/${plate}`)
      .send({ nickname: 'Family car', registrationStatus: 'ACTIVE' })
      .expect(400);
    const edited = await call('patch', `/motorist/vehicles/${plate}`)
      .send({ nickname: 'Family car' })
      .expect(200);
    expect(edited.body.nickname).toBe('Family car');
    await call('post', '/motorist/vehicles/link-request')
      .send({ registration: plate })
      .expect(409);
    expect(
      (await call('get', '/motorist/vehicles/requests', 'OTHER')).body.total,
    ).toBe(0);
  });
  it('does not grant another account a vehicle or confirm a nonexistent plate', async () => {
    const other = await call('post', '/motorist/vehicles/link-request', 'OTHER')
      .send({ registration: plate })
      .expect(201);
    await call(
      'post',
      `/admin/vehicle-link-requests/${other.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(409);
    await call(
      'post',
      `/admin/vehicle-link-requests/${other.body.id}/review`,
      'ADMIN',
    )
      .send({ ...review, status: 'REJECTED' })
      .expect(201);
    const unknown = await call(
      'post',
      '/motorist/vehicles/link-request',
      'OTHER',
    )
      .send({ registration: 'UNKNOWN999' })
      .expect(201);
    await call(
      'post',
      `/admin/vehicle-link-requests/${unknown.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(409);
    await call(
      'post',
      `/admin/vehicle-link-requests/${unknown.body.id}/review`,
      'ADMIN',
    )
      .send({ ...review, status: 'REJECTED' })
      .expect(201);
    const checked = await call('post', '/motorist/vehicles/check', 'OTHER')
      .send({ registration: plate })
      .expect(201);
    expect(checked.body.vehicle).toBeNull();
  });
  it('uses central account-scoped tickets, calculates amounts and requires a clear balance before approved unlink', async () => {
    const createTicket = async (owner: string) => {
      const offence = await db.offence.create({
        data: {
          requestKey: randomUUID(),
          officerId: users.OFFICER,
          supervisorId: users.SUPERVISOR,
          vehicleId,
          categoryId,
          location: 'Test intersection',
          notes: 'Test record',
          observedAt: new Date(),
          status: 'SUBMITTED',
        },
      });
      offences.push(offence.id);
      return db.ticket.create({
        data: {
          offenceId: offence.id,
          publicReference: randomBytes(24).toString('hex'),
          motoristId: owner,
          demoFineAmountSnapshot: 80,
          demeritPointsSnapshot: 3,
        },
      });
    };
    const own = await createTicket(users.USER);
    await createTicket(users.OTHER);
    const detail = await call('get', `/motorist/vehicles/${plate}`).expect(200);
    expect(detail.body.totalPayable).toBe(80);
    expect(detail.body.activeInfringements).toBe(1);
    expect(detail.body.infringements.total).toBe(1);
    expect(detail.body.infringements.items[0].displayReference).toBe(
      own.displayReference,
    );
    expect(detail.body.statusSource).toContain('no national registry');
    const inventory = await call('get', '/motorist/vehicles');
    expect(inventory.body.summary.totalPayable).toBe(80);
    expect(inventory.body.summary.vehiclesRequiringAttention).toBe(1);
    await call('post', `/motorist/vehicles/${plate}/unlink-request`)
      .send({})
      .expect(409);
    const payment = await call('post', '/motorist/payments')
      .send({
        reference: own.publicReference,
        requestKey: randomUUID(),
        method: 'ECOCASH',
      })
      .expect(201);
    await call('post', `/motorist/payments/${payment.body.reference}/outcome`)
      .send({ outcome: 'APPROVE' })
      .expect(201);
    const paid = await call('get', `/motorist/vehicles/${plate}/status`).expect(
      200,
    );
    expect(paid.body.totalPayable).toBe(0);
    expect(paid.body.paidAmount).toBe(80);
    const unlink = await call(
      'post',
      `/motorist/vehicles/${plate}/unlink-request`,
    )
      .send({})
      .expect(201);
    expect(
      (await call('get', '/motorist/dashboard')).body.registeredVehicles,
    ).toBe(1);
    const later = await createTicket(users.USER);
    await call(
      'post',
      `/admin/vehicle-link-requests/${unlink.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(409);
    await db.ticket.update({
      where: { id: later.id },
      data: { status: 'CANCELLED' },
    });
    await call(
      'post',
      `/admin/vehicle-link-requests/${unlink.body.id}/review`,
      'ADMIN',
    )
      .send(review)
      .expect(201);
    expect(
      (await call('get', '/motorist/dashboard')).body.registeredVehicles,
    ).toBe(0);
    await call('get', `/motorist/vehicles/${plate}`).expect(404);
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: own.id } })).motoristId,
    ).toBe(users.USER);
    expect(
      (await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }))
        .nickname,
    ).toBeNull();
  });
});
