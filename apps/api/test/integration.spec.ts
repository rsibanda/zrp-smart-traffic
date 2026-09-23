import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configure } from '../src/configure';
import { PrismaService } from '../src/prisma.service';

config({ path: resolve(__dirname, '../../../.env') });
describe('Real PostgreSQL demo workflow (migrate and seed first)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let officer: string;
  let other: string;
  let supervisor: string;
  let draftId: string;
  let ticketId: string;
  const created: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication(new ExpressAdapter());
    configure(app);
    await app.init();
    db = app.get(PrismaService);
    const login = async (email: string) => {
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: process.env.DEMO_PASSWORD })
        .expect(200);
      expect(result.body.user.passwordHash).toBeUndefined();
      return result.body.token as string;
    };
    officer = await login('officer@demo.invalid');
    other = await login('officer2@demo.invalid');
    supervisor = await login('supervisor@demo.invalid');
  }, 30000);
  afterAll(async () => {
    if (db && created.length)
      await db.$transaction(async (tx) => {
        await tx.ticket.deleteMany({ where: { offenceId: { in: created } } });
        await tx.auditEvent.deleteMany({
          where: { entityType: 'Offence', entityId: { in: created } },
        });
        await tx.offence.deleteMany({ where: { id: { in: created } } });
      });
    if (app) await app.close();
  });
  it('rejects anonymous requests, invalid credentials and unknown payload fields', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/vehicles?registration=DEMO001')
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'officer@demo.invalid', password: 'incorrect' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/offences')
      .auth(officer, { type: 'bearer' })
      .send({ role: 'ADMIN' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/vehicles')
      .auth(officer, { type: 'bearer' })
      .expect(400);
  });
  it('looks up fictional plates and creates one draft across retries', async () => {
    const vehicle = await request(app.getHttpServer())
      .get('/api/v1/vehicles?registration=demo-001')
      .auth(officer, { type: 'bearer' })
      .expect(200);
    expect(vehicle.body.items[0].registrationNumber).toBe('DEMO001');
    const unknown = await request(app.getHttpServer())
      .get('/api/v1/vehicles?registration=UNKNOWN')
      .auth(officer, { type: 'bearer' })
      .expect(200);
    expect(unknown.body.items).toEqual([]);
    const categories = await request(app.getHttpServer())
      .get('/api/v1/offence-categories')
      .auth(officer, { type: 'bearer' })
      .expect(200);
    const payload = {
      requestKey: randomUUID(),
      vehicleId: vehicle.body.items[0].id,
      categoryId: categories.body[0].id,
      location: 'Demo training area',
      notes: 'Fictional test observation',
      observedAt: new Date().toISOString(),
    };
    const draft = await request(app.getHttpServer())
      .post('/api/v1/offences')
      .auth(officer, { type: 'bearer' })
      .send(payload)
      .expect(201);
    draftId = draft.body.id;
    created.push(draftId);
    const retry = await request(app.getHttpServer())
      .post('/api/v1/offences')
      .auth(officer, { type: 'bearer' })
      .send(payload)
      .expect(201);
    expect(retry.body.id).toBe(draftId);
    await request(app.getHttpServer())
      .post('/api/v1/offences')
      .auth(officer, { type: 'bearer' })
      .send({ ...payload, notes: 'Changed notes' })
      .expect(409);
    await request(app.getHttpServer())
      .get(`/api/v1/offences/${draftId}`)
      .auth(other, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/offences/${draftId}`)
      .auth(supervisor, { type: 'bearer' })
      .expect(404);
  });
  it('issues exactly one ticket under simultaneous submission and protects reads', async () => {
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/offences/${draftId}/submit`)
          .auth(officer, { type: 'bearer' })
          .expect(201),
      ),
    );
    expect(new Set(results.map((result) => result.body.id)).size).toBe(1);
    ticketId = results[0].body.id;
    expect(await db.ticket.count({ where: { offenceId: draftId } })).toBe(1);
    expect(
      await db.auditEvent.count({
        where: { entityId: draftId, action: 'TICKET_ISSUED' },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/tickets/${ticketId}`)
      .auth(other, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/offences/${draftId}/submit`)
      .auth(other, { type: 'bearer' })
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/api/v1/offences')
      .auth(supervisor, { type: 'bearer' })
      .expect(200);
    expect(
      list.body.items.some((item: { id: string }) => item.id === draftId),
    ).toBe(true);
  });
  it('enforces review roles, assignments and transitions', async () => {
    const endpoint = `/api/v1/offences/${draftId}/review`;
    await request(app.getHttpServer())
      .post(endpoint)
      .auth(officer, { type: 'bearer' })
      .send({ status: 'UNDER_REVIEW', notes: 'Demo review' })
      .expect(403);
    // Use a database-created session to avoid coupling this boundary test to login throttling.
    const { hashToken } = await import('../src/auth');
    const token = randomBytes(32).toString('hex');
    const unassigned = await db.user.findUniqueOrThrow({
      where: { email: 'unassigned-supervisor@demo.invalid' },
    });
    await db.session.upsert({
      where: { tokenHash: hashToken(token) },
      update: { expiresAt: new Date(Date.now() + 60000) },
      create: {
        tokenHash: hashToken(token),
        userId: unassigned.id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    try {
      await request(app.getHttpServer())
        .post(endpoint)
        .auth(token, { type: 'bearer' })
        .send({ status: 'UNDER_REVIEW', notes: 'Demo review' })
        .expect(404);
    } finally {
      await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    await request(app.getHttpServer())
      .post(endpoint)
      .auth(supervisor, { type: 'bearer' })
      .send({ status: 'CONFIRMED', notes: 'Demo review' })
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .auth(supervisor, { type: 'bearer' })
      .send({ status: 'UNDER_REVIEW', notes: 'Demo review' })
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .auth(supervisor, { type: 'bearer' })
      .send({ status: 'CONFIRMED', notes: 'Demo confirmed' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/audit-events')
      .auth(officer, { type: 'bearer' })
      .expect(403);
  });
  it('revokes sessions on logout', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .auth(officer, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(officer, { type: 'bearer' })
      .expect(401);
  });
});
