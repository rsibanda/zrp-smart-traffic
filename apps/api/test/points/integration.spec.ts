import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configure } from '../../src/configure';
import { PrismaService } from '../../src/prisma.service';
import { hashToken } from '../../src/auth';
config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);
describe('Verified driver points ledger', () => {
  let app: INestApplication, db: PrismaService;
  const ids = Array.from({ length: 5 }, () => randomUUID()),
    tokens = ids.map(() => randomBytes(32).toString('hex'));
  const auth = (i: number) => ({ Authorization: `Bearer ${tokens[i]}` });
  const offenceIds: string[] = [],
    ticketIds: string[] = [];
  const licence = `TEST-${randomUUID()}`;
  let driverId: string,
    categoryId: string,
    vehicleId: string,
    first: { id: string; publicReference: string; offenceId: string };
  const balance = async (i = 3) =>
    (
      await request(app.getHttpServer())
        .get('/api/v1/motorist/driver-points')
        .set(auth(i))
        .expect(200)
    ).body;
  const draft = async (responsible = true) => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/offences')
      .set(auth(2))
      .send({
        requestKey: randomUUID(),
        vehicleId,
        categoryId,
        notes: '',
        location: 'Synthetic junction',
        observedAt: new Date().toISOString(),
        ...(responsible ? { responsibleDriverId: driverId } : {}),
      })
      .expect(201);
    offenceIds.push(result.body.id);
    return result.body.id as string;
  };
  const issue = async (id: string) => {
    const result = await request(app.getHttpServer())
      .post(`/api/v1/offences/${id}/submit`)
      .set(auth(2))
      .send({})
      .expect(201);
    if (!ticketIds.includes(result.body.id)) ticketIds.push(result.body.id);
    return result.body;
  };
  beforeAll(async () => {
    if (
      !['localhost', '127.0.0.1'].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error('Local fixtures only');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configure(app);
    await app.init();
    db = app.get(PrismaService);
    const roles = ['ADMIN', 'SUPERVISOR', 'OFFICER', 'USER', 'USER'] as const;
    for (let i = 0; i < ids.length; i++) {
      await db.user.create({
        data: {
          id: ids[i],
          name: `Points fixture ${i}`,
          email: `${ids[i]}@example.invalid`,
          role: roles[i],
          passwordHash: 'unused',
          supervisorId: i === 2 ? ids[1] : null,
        },
      });
      await db.session.create({
        data: {
          userId: ids[i],
          tokenHash: hashToken(tokens[i]),
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    }
    driverId = (
      await db.driver.create({
        data: {
          fullName: 'Synthetic Driver',
          licenceNumber: licence,
          licenceStatus: 'VALID',
        },
      })
    ).id;
    vehicleId = (
      await db.vehicle.create({
        data: {
          registrationNumber: `PT${randomBytes(4).toString('hex').toUpperCase()}`,
          make: 'Sample',
          model: 'Saloon',
          colour: 'White',
          registrationStatus: 'VALID',
          motoristId: ids[4],
        },
      })
    ).id;
    categoryId = (
      await db.offenceCategory.create({
        data: {
          code: `PT-${randomUUID()}`,
          name: 'Illustrative speeding',
          description: 'Synthetic points test',
          demoFineAmount: 25,
          demeritPoints: 3,
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (db) {
      if (driverId)
        await db.driverPointsLedger.deleteMany({ where: { driverId } });
      await db.payment.deleteMany({ where: { ticketId: { in: ticketIds } } });
      await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      await db.offence.deleteMany({ where: { id: { in: offenceIds } } });
      if (vehicleId) await db.vehicle.deleteMany({ where: { id: vehicleId } });
      if (categoryId)
        await db.offenceCategory.deleteMany({ where: { id: categoryId } });
      if (driverId) {
        await db.driverPointsAccount.deleteMany({ where: { driverId } });
        await db.driver.deleteMany({ where: { id: driverId } });
      }
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids.slice(2) } } });
      await db.user.deleteMany({ where: { id: { in: ids.slice(0, 2) } } });
    }
    if (app) await app.close();
  });
  it('requires admin identity verification and creates one opening allowance', async () => {
    expect((await balance()).status).toBe('PENDING_DRIVER_IDENTIFICATION');
    const dto = {
      licenceNumber: licence,
      motoristEmail: `${ids[3]}@example.invalid`,
      verified: true,
      reason: 'Synthetic driver identity checked.',
    };
    await request(app.getHttpServer())
      .post('/api/v1/admin/driver-identities/verify')
      .set(auth(3))
      .send(dto)
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/driver-identities/verify')
      .set(auth(0))
      .send(dto)
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/driver-identities/verify')
      .set(auth(0))
      .send(dto)
      .expect(201);
    expect((await balance()).remaining).toBe(12);
    expect(
      await db.driverPointsLedger.count({
        where: { driverId, event: 'OPENING' },
      }),
    ).toBe(1);
  });
  it('deducts 3 once at issuance, does not debit drafts or the vehicle owner, and survives concurrent retry', async () => {
    const id = await draft();
    expect((await balance()).remaining).toBe(12);
    const [a, b] = await Promise.all([issue(id), issue(id)]);
    first = a;
    expect(a.id).toBe(b.id);
    expect((await balance()).remaining).toBe(9);
    expect((await balance(4)).status).toBe('PENDING_DRIVER_IDENTIFICATION');
    expect(
      (await db.ticket.findUniqueOrThrow({ where: { id: a.id } })).motoristId,
    ).toBe(ids[3]);
    expect(
      await db.driverPointsLedger.count({
        where: { ticketId: a.id, event: 'ISSUANCE' },
      }),
    ).toBe(1);
    const dashboard = await request(app.getHttpServer())
      .get('/api/v1/motorist/dashboard')
      .set(auth(3))
      .expect(200);
    expect(dashboard.body.driverPoints.remaining).toBe(9);
    await request(app.getHttpServer())
      .get(`/api/v1/offences/${id}`)
      .set(auth(1))
      .expect(200);
  });
  it('leaves points unchanged on successful payment and credits cancellation exactly once', async () => {
    const payment = await request(app.getHttpServer())
      .post('/api/v1/motorist/payments')
      .set(auth(3))
      .send({
        requestKey: randomUUID(),
        reference: first.publicReference,
        method: 'ECOCASH',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/motorist/payments/${payment.body.reference}/outcome`)
      .set(auth(3))
      .send({ outcome: 'APPROVE' })
      .expect(201);
    expect((await balance()).remaining).toBe(9);
    for (const status of ['UNDER_REVIEW', 'CANCELLED'])
      await request(app.getHttpServer())
        .post(`/api/v1/offences/${first.offenceId}/review`)
        .set(auth(1))
        .send({ status, notes: 'Synthetic review reversal.' })
        .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/offences/${first.offenceId}/review`)
      .set(auth(1))
      .send({ status: 'CANCELLED', notes: 'Retry cancellation.' })
      .expect(409);
    expect((await balance()).remaining).toBe(12);
    expect(
      await db.driverPointsLedger.count({
        where: { ticketId: first.id, event: 'CANCELLATION' },
      }),
    ).toBe(1);
  });
  it('preserves historical tickets without backfilling a driver debit', async () => {
    const offenceId = await draft(false);
    await db.offence.update({
      where: { id: offenceId },
      data: { status: 'SUBMITTED' },
    });
    const legacy = await db.ticket.create({
      data: {
        offenceId,
        publicReference: randomBytes(32).toString('hex'),
        demoFineAmountSnapshot: 25,
        demeritPointsSnapshot: 7,
        motoristId: ids[3],
      },
    });
    ticketIds.push(legacy.id);
    expect(legacy.pointsAssessment).toBe('LEGACY_NOT_ASSESSED');
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/motorist/infringements/${legacy.publicReference}`)
      .set(auth(3))
      .expect(200);
    expect(detail.body.driverIdentification).toBe('LEGACY_NOT_ASSESSED');
    expect(detail.body.pointsDeducted).toBe(0);
    expect((await balance()).remaining).toBe(12);
    expect(
      await db.driverPointsLedger.count({ where: { ticketId: legacy.id } }),
    ).toBe(0);
  });
  it('keeps full debits below zero and does not charge an unidentified driver', async () => {
    await db.offenceCategory.update({
      where: { id: categoryId },
      data: { demeritPoints: 15 },
    });
    const high = await issue(await draft());
    expect((await balance()).remaining).toBe(0);
    expect((await balance()).totalDeducted).toBe(15);
    const unknown = await issue(await draft(false));
    expect(unknown.pointsAssessment).toBe('PENDING_DRIVER_IDENTIFICATION');
    expect(
      await db.driverPointsLedger.count({ where: { ticketId: unknown.id } }),
    ).toBe(0);
    for (const status of ['UNDER_REVIEW', 'CANCELLED'])
      await request(app.getHttpServer())
        .post(`/api/v1/offences/${high.offenceId}/review`)
        .set(auth(1))
        .send({ status, notes: 'Restore full recorded debit.' })
        .expect(201);
    expect((await balance()).remaining).toBe(12);
  });
});
