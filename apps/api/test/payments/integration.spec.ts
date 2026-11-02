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
describe('Account ownership and simulated payment transactions', () => {
  let app: INestApplication, db: PrismaService;
  const ids: string[] = [],
    offences: string[] = [];
  const tokens: Record<string, string> = {},
    users: Record<string, string> = {};
  let vehicleId: string, categoryId: string;
  const plate = `T${randomBytes(5).toString('hex').toUpperCase()}`;
  const call = (method: 'get' | 'post', path: string, who = 'USER') => {
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
  async function issue() {
    const draft = await call('post', '/offences', 'OFFICER')
      .send({
        requestKey: randomUUID(),
        vehicleId,
        categoryId,
        location: 'Test intersection',
        notes: 'Observed for integration testing',
        observedAt: new Date().toISOString(),
      })
      .expect(201);
    offences.push(draft.body.id);
    const [a, b] = await Promise.all([
      call('post', `/offences/${draft.body.id}/submit`, 'OFFICER').send({}),
      call('post', `/offences/${draft.body.id}/submit`, 'OFFICER').send({}),
    ]);
    expect(a.status).toBe(201);
    expect(b.body.id).toBe(a.body.id);
    expect(a.body.displayReference).toMatch(/^INF-\d{4}-\d{6,}$/);
    expect(b.body.displayReference).toBe(a.body.displayReference);
    return a.body;
  }
  it('requires admin verified linkage and isolates linked vehicles and issued tickets', async () => {
    await call('post', '/admin/motorist-links')
      .send({ registration: plate, email: `${users.USER}@example.invalid` })
      .expect(403);
    await call('post', '/admin/motorist-links', 'ADMIN')
      .send({ registration: plate, email: `${users.USER}@example.invalid` })
      .expect(201);
    const ticket = await issue();
    const own = await call(
      'get',
      `/motorist/infringements/${ticket.publicReference}`,
    ).expect(200);
    expect(own.body.demeritPoints).toBe(3);
    expect(own.body.amount).toBe('80');
    expect(own.body.currency).toBe('USD');
    expect(own.body.displayReference).toBe(ticket.displayReference);
    expect(own.body.id).toBeUndefined();
    await call(
      'get',
      `/motorist/infringements/${ticket.publicReference}`,
      'OTHER',
    ).expect(404);
    await call('get', '/motorist/dashboard', 'OFFICER').expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/motorist/dashboard')
      .expect(401);
    const vehicles = await call('get', '/motorist/vehicles', 'OTHER').expect(
      200,
    );
    expect(vehicles.body.total).toBe(0);
    const summary = await call('get', '/motorist/dashboard').expect(200);
    expect(summary.body.totalPayable).toBe(80);
    expect(summary.body.demeritPoints).toBe(3);
    expect(summary.body.registeredVehicles).toBe(1);
    const linked = await call('get', '/motorist/vehicles').expect(200);
    expect(linked.body.total).toBe(summary.body.registeredVehicles);
    expect(linked.body.items[0].registrationNumber).toBe(plate);
    const byReference = await call(
      'get',
      `/offences?q=${ticket.displayReference}`,
      'SUPERVISOR',
    ).expect(200);
    expect(byReference.body.items[0].ticket.displayReference).toBe(
      ticket.displayReference,
    );
  });
  it.each([
    ['ECOCASH', 'APPROVE', 'SUCCESS'],
    ['ECOCASH', 'DECLINE', 'FAILED'],
    ['ECOCASH', 'TIMEOUT', 'TIMED_OUT'],
    ['INNBUCKS', 'APPROVE', 'SUCCESS'],
    ['INNBUCKS', 'DECLINE', 'FAILED'],
    ['INNBUCKS', 'TIMEOUT', 'TIMED_OUT'],
    ['CARD', 'APPROVE', 'SUCCESS'],
    ['CARD', 'DECLINE', 'FAILED'],
    ['CARD', 'ERROR', 'FAILED'],
    ['CARD', 'CANCEL', 'CANCELLED'],
  ])(
    '%s %s produces %s with atomic ticket and receipt state',
    async (method, outcome, status) => {
      const ticket = await issue();
      const dto = {
        requestKey: randomUUID(),
        reference: ticket.publicReference,
        method,
        ...(method === 'CARD' ? { last4: '4242' } : {}),
      };
      await call('post', '/motorist/payments', 'OTHER').send(dto).expect(404);
      const [a, b] = await Promise.all([
        call('post', '/motorist/payments').send(dto),
        call('post', '/motorist/payments').send(dto),
      ]);
      expect(a.status).toBe(201);
      expect(b.body.reference).toBe(a.body.reference);
      await call(
        'post',
        `/motorist/payments/${a.body.reference}/outcome`,
        'OTHER',
      )
        .send({ outcome })
        .expect(404);
      const before = await call('get', '/motorist/dashboard');
      const responses = await Promise.all([
        call('post', `/motorist/payments/${a.body.reference}/outcome`).send({
          outcome,
        }),
        call('post', `/motorist/payments/${a.body.reference}/outcome`).send({
          outcome,
        }),
      ]);
      expect(responses[0].body.status).toBe(status);
      expect(responses[1].body).toEqual(responses[0].body);
      const own = await call(
        'get',
        `/motorist/infringements/${ticket.publicReference}`,
      ).expect(200);
      expect(own.body.paymentStatus).toBe(
        status === 'SUCCESS' ? 'PAID' : 'PENDING',
      );
      await call(
        'get',
        `/motorist/payments/${a.body.reference}/receipt`,
        'OTHER',
      ).expect(404);
      const receipt = await call(
        'get',
        `/motorist/payments/${a.body.reference}/receipt`,
      ).expect(status === 'SUCCESS' ? 200 : 404);
      if (status === 'SUCCESS') {
        expect(receipt.body.ticketDisplayReference).toBe(
          ticket.displayReference,
        );
        expect(receipt.body.method).toBe(method);
        expect(receipt.body.currency).toBe('USD');
        expect(own.body.receiptPaymentReference).toBe(a.body.reference);
        const history = await call('get', '/motorist/payments');
        expect(
          history.body.items.find(
            (p: { reference: string }) => p.reference === a.body.reference,
          ),
        ).toMatchObject({
          method,
          ticketDisplayReference: ticket.displayReference,
          status: 'SUCCESS',
        });
        expect(receipt.body.notice).toContain('no funds');
        expect(receipt.body.id).toBeUndefined();
        await call('post', '/motorist/payments')
          .send({ ...dto, requestKey: randomUUID() })
          .expect(409);
        const after = await call('get', '/motorist/dashboard');
        expect(after.body.totalPayable).toBe(before.body.totalPayable - 80);
        expect(after.body.demeritPoints).toBe(before.body.demeritPoints);
        const staff = await call(
          'get',
          `/offences/${ticket.offenceId}`,
          'SUPERVISOR',
        ).expect(200);
        expect(staff.body.paymentStatus).toBe('PAID');
        expect(staff.body.ticket.payments[0].method).toBe(method);
      }
      const stored = await db.payment.findUniqueOrThrow({
        where: { paymentReference: a.body.reference },
      });
      expect(JSON.stringify(stored)).not.toContain('4242424242424242');
      expect(stored).not.toHaveProperty('cvv');
      expect(
        await db.payment.count({
          where: { ticketId: ticket.id, status: 'SUCCESS' },
        }),
      ).toBe(status === 'SUCCESS' ? 1 : 0);
    },
  );
  it('rejects sensitive or forged fields, derives overdue, and preserves immutable ownership', async () => {
    const ticket = await issue();
    await call('post', '/motorist/payments')
      .send({
        requestKey: randomUUID(),
        reference: ticket.publicReference,
        method: 'CARD',
        last4: '4242',
        cardNumber: '4242424242424242',
        cvv: '123',
        amount: 1,
        motoristId: users.OTHER,
      })
      .expect(400);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { dueAt: new Date(Date.now() - 1000) },
    });
    const overdue = await call(
      'get',
      `/motorist/infringements/${ticket.publicReference}`,
    ).expect(200);
    expect(overdue.body.paymentStatus).toBe('OVERDUE');
    const filtered = await call(
      'get',
      '/offences?paymentStatus=OVERDUE',
      'SUPERVISOR',
    ).expect(200);
    expect(
      filtered.body.items.some(
        (i: { ticket: { id: string } }) => i.ticket.id === ticket.id,
      ),
    ).toBe(true);
    await call('post', '/admin/motorist-links', 'ADMIN')
      .send({ registration: plate, email: `${users.OTHER}@example.invalid` })
      .expect(201);
    await call(
      'get',
      `/motorist/infringements/${ticket.publicReference}`,
      'OTHER',
    ).expect(404);
    const newTicket = await issue();
    await call(
      'get',
      `/motorist/infringements/${newTicket.publicReference}`,
      'OTHER',
    ).expect(200);
    await call(
      'get',
      `/motorist/infringements/${newTicket.publicReference}`,
    ).expect(404);
  });
  it('claims only the verified ticket, prevents second-account claims, and expires abandoned payment attempts', async () => {
    await db.vehicle.update({
      where: { id: vehicleId },
      data: { motoristId: null },
    });
    const ticket = await issue();
    const code = await call(
      'post',
      `/tickets/${ticket.id}/access-code`,
      'OFFICER',
    )
      .send({})
      .expect(201);
    const dto = {
      reference: ticket.publicReference,
      verificationCode: code.body.verificationCode,
    };
    await call('post', '/public/tickets/verify')
      .send({
        ...dto,
        reference: ticket.displayReference,
        verificationCode: '0000000000000000',
      })
      .expect(401);
    await call('post', '/public/tickets/verify')
      .send({ ...dto, reference: ticket.displayReference })
      .expect(200);
    await call('post', '/public/tickets/verify').send(dto).expect(200);
    await call('post', '/public/tickets/verify', 'OTHER').send(dto).expect(401);
    expect(
      (await db.vehicle.findUniqueOrThrow({ where: { id: vehicleId } }))
        .motoristId,
    ).toBeNull();
    const started = await call('post', '/motorist/payments')
      .send({
        requestKey: randomUUID(),
        reference: ticket.publicReference,
        method: 'ECOCASH',
      })
      .expect(201);
    await db.payment.update({
      where: { paymentReference: started.body.reference },
      data: { createdAt: new Date(Date.now() - 960000) },
    });
    const expired = await call(
      'post',
      `/motorist/payments/${started.body.reference}/outcome`,
    )
      .send({ outcome: 'APPROVE' })
      .expect(201);
    expect(expired.body.status).toBe('TIMED_OUT');
    expect(
      (
        await db.publicTicketAccess.findUniqueOrThrow({
          where: { ticketId: ticket.id },
        })
      ).paidAt,
    ).toBeNull();
    const next = await call('post', '/motorist/payments')
      .send({
        requestKey: randomUUID(),
        reference: ticket.publicReference,
        method: 'INNBUCKS',
      })
      .expect(201);
    await db.ticket.update({
      where: { id: ticket.id },
      data: { status: 'CANCELLED' },
    });
    const cancelled = await call(
      'post',
      `/motorist/payments/${next.body.reference}/outcome`,
    )
      .send({ outcome: 'APPROVE' })
      .expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    await call(
      'get',
      `/motorist/payments/${next.body.reference}/receipt`,
    ).expect(404);
  });
});
