import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { AppModule } from '../../src/app.module';
import { configure } from '../../src/configure';
import { PrismaService } from '../../src/prisma.service';
import { hashToken } from '../../src/auth';
config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);

describe('Ticket QR isolation, rotation and expiry', () => {
  let app: INestApplication, db: PrismaService;
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const tokens = ids.map(() => randomBytes(32).toString('hex'));
  let vehicleId: string,
    categoryId: string,
    offenceId: string,
    ticketId: string;
  let qrToken: string;
  const previousOrigin = process.env.PUBLIC_SITE_URL;
  const auth = (index: number) => ({
    Authorization: `Bearer ${tokens[index]}`,
  });
  beforeAll(async () => {
    if (
      !['localhost', '127.0.0.1'].includes(
        new URL(process.env.DATABASE_URL!).hostname,
      )
    )
      throw new Error('QR integration fixtures require a local database');
    process.env.PUBLIC_SITE_URL = 'https://traffic.example.org';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configure(app);
    await app.init();
    db = app.get(PrismaService);
    const roles = ['SUPERVISOR', 'OFFICER', 'USER', 'USER', 'OFFICER'] as const;
    for (let i = 0; i < ids.length; i++) {
      await db.user.create({
        data: {
          id: ids[i],
          email: `${ids[i]}@example.invalid`,
          name: `QR fixture ${i}`,
          role: roles[i],
          passwordHash: 'unused',
          supervisorId: i === 1 || i === 4 ? ids[0] : null,
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
    const vehicle = await db.vehicle.create({
      data: {
        registrationNumber: `QR${randomBytes(5).toString('hex').toUpperCase()}`,
        make: 'Sample',
        model: 'Saloon',
        colour: 'Blue',
        registrationStatus: 'VALID',
        motoristId: ids[2],
      },
    });
    vehicleId = vehicle.id;
    const category = await db.offenceCategory.create({
      data: {
        code: `QR-${randomUUID()}`,
        name: 'QR test offence',
        description: 'Synthetic test',
        demoFineAmount: 25,
        demeritPoints: 3,
      },
    });
    categoryId = category.id;
    const created = await request(app.getHttpServer())
      .post('/api/v1/offences')
      .set(auth(1))
      .send({
        requestKey: randomUUID(),
        vehicleId,
        categoryId,
        location: 'Test location',
        notes: '',
        observedAt: new Date().toISOString(),
      })
      .expect(201);
    offenceId = created.body.id;
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/offences/${offenceId}/submit`)
      .set(auth(1))
      .send({})
      .expect(201);
    ticketId = issued.body.id;
  });
  afterAll(async () => {
    if (db) {
      if (ticketId) await db.ticket.deleteMany({ where: { id: ticketId } });
      if (offenceId) await db.offence.deleteMany({ where: { id: offenceId } });
      if (vehicleId) await db.vehicle.deleteMany({ where: { id: vehicleId } });
      if (categoryId)
        await db.offenceCategory.deleteMany({ where: { id: categoryId } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids.slice(1) } } });
      await db.user.deleteMany({ where: { id: ids[0] } });
    }
    if (app) await app.close();
    if (previousOrigin === undefined) delete process.env.PUBLIC_SITE_URL;
    else process.env.PUBLIC_SITE_URL = previousOrigin;
  });
  it('creates an actual PNG QR only for the issuing officer and stores only the token hash', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .send({})
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(2))
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(4))
      .send({})
      .expect(404);
    const { body } = await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(1))
      .send({})
      .expect(201);
    const url = new URL(body.verificationUrl);
    qrToken = new URLSearchParams(url.hash.slice(1)).get('token')!;
    expect(url.origin).toBe('https://traffic.example.org');
    expect(url.pathname).toBe('/verify');
    expect(url.search).toBe('');
    expect(qrToken).toMatch(/^[a-f0-9]{64}$/);
    expect(body.displayReference).toMatch(/^INF-/);
    const image = await sharp(
      Buffer.from(body.qrImage.split(',')[1], 'base64'),
    ).metadata();
    expect(image.format).toBe('png');
    expect(image.width).toBe(600);
    const stored = await db.ticketVerificationToken.findFirstOrThrow({
      where: { ticketId },
    });
    expect(stored.tokenHash).toBe(hashToken(qrToken));
    expect(JSON.stringify(stored)).not.toContain(qrToken);
    const audit = await db.auditEvent.findMany({
      where: { entityId: ticketId },
    });
    expect(JSON.stringify(audit)).not.toContain(qrToken);
  });
  it('reveals validity only publicly and never claims another motorist’s ticket', async () => {
    const status = await request(app.getHttpServer())
      .post('/api/v1/public/ticket-qr/status')
      .send({ token: qrToken })
      .expect(201);
    expect(status.body).toEqual({ status: 'VALID' });
    await request(app.getHttpServer())
      .post('/api/v1/motorist/ticket-qr/verify')
      .send({ token: qrToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/motorist/ticket-qr/verify')
      .set(auth(3))
      .send({ token: qrToken })
      .expect(404);
    const ticket = await db.ticket.findUniqueOrThrow({
      where: { id: ticketId },
    });
    expect(ticket.motoristId).toBe(ids[2]);
    const own = await request(app.getHttpServer())
      .post('/api/v1/motorist/ticket-qr/verify')
      .set(auth(2))
      .send({ token: qrToken })
      .expect(201);
    expect(own.body.displayReference).toBe(ticket.displayReference);
    expect(own.body).not.toHaveProperty('id');
    await request(app.getHttpServer())
      .post('/api/v1/motorist/ticket-qr/verify')
      .set(auth(2))
      .send({ token: qrToken })
      .expect(201);
  });
  it('rejects expiry, rotation, revocation and cancellation while leaving manual codes independent', async () => {
    await db.ticketVerificationToken.updateMany({
      where: { ticketId },
      data: { expiresAt: new Date(0) },
    });
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/public/ticket-qr/status')
          .send({ token: qrToken })
          .expect(201)
      ).body,
    ).toEqual({ status: 'EXPIRED' });
    await request(app.getHttpServer())
      .post('/api/v1/motorist/ticket-qr/verify')
      .set(auth(2))
      .send({ token: qrToken })
      .expect(404);
    const fresh = await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(1))
      .send({})
      .expect(201);
    const next = new URLSearchParams(
      new URL(fresh.body.verificationUrl).hash.slice(1),
    ).get('token')!;
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/public/ticket-qr/status')
          .send({ token: qrToken })
          .expect(201)
      ).body.status,
    ).toBe('INVALID');
    await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr/revoke`)
      .set(auth(0))
      .send({})
      .expect(201);
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/public/ticket-qr/status')
          .send({ token: next })
          .expect(201)
      ).body.status,
    ).toBe('INVALID');
    const final = await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(1))
      .send({})
      .expect(201);
    await db.ticket.update({
      where: { id: ticketId },
      data: { status: 'CANCELLED' },
    });
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/public/ticket-qr/status')
          .send({
            token: new URLSearchParams(
              new URL(final.body.verificationUrl).hash.slice(1),
            ).get('token'),
          })
          .expect(201)
      ).body.status,
    ).toBe('INVALID');
    await request(app.getHttpServer())
      .post(`/api/v1/tickets/${ticketId}/qr`)
      .set(auth(1))
      .send({})
      .expect(409);
  });
});
