import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomUUID, randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configure } from '../../src/configure';
import { PrismaService } from '../../src/prisma.service';
config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);
describe('Staff administration and operations boundaries', () => {
  let app: INestApplication;
  let db: PrismaService;
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const accounts: string[] = [];
  const incidents: string[] = [];
  const checkpoints: string[] = [];
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication(new ExpressAdapter());
    configure(app);
    await app.init();
    db = app.get(PrismaService);
    for (const role of [
      'admin',
      'officer',
      'officer2',
      'supervisor',
      'unassigned-supervisor',
    ]) {
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: `${role}@demo.invalid`,
          password: process.env.DEMO_PASSWORD,
        })
        .expect(200);
      tokens[role] = result.body.token;
      ids[role] = result.body.user.id;
    }
  }, 30000);
  afterAll(async () => {
    if (db) {
      await db.incident.deleteMany({ where: { id: { in: incidents } } });
      await db.checkpoint.deleteMany({ where: { id: { in: checkpoints } } });
      await db.auditEvent.deleteMany({
        where: {
          OR: [
            { entityId: { in: [...accounts, ...incidents, ...checkpoints] } },
            { actorId: { in: accounts } },
          ],
        },
      });
      await db.user.deleteMany({ where: { id: { in: accounts } } });
    }
    if (app) await app.close();
  });
  const get = (path: string, role = 'admin') =>
    request(app.getHttpServer())
      .get(`/api/v1${path}`)
      .auth(tokens[role], { type: 'bearer' });
  const post = (path: string, role: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .auth(tokens[role], { type: 'bearer' })
      .send(body);
  const patch = (path: string, role: string, body: object) =>
    request(app.getHttpServer())
      .patch(`/api/v1${path}`)
      .auth(tokens[role], { type: 'bearer' })
      .send(body);
  it('enforces admin access, protects self and never exposes password hashes', async () => {
    await get('/admin/users', 'officer').expect(403);
    await get('/admin/security', 'supervisor').expect(403);
    await request(app.getHttpServer()).get('/api/v1/admin/users').expect(401);
    const result = await get('/admin/users').expect(200);
    expect(JSON.stringify(result.body)).not.toContain('passwordHash');
    await patch(`/admin/users/${ids.admin}`, 'admin', { active: false }).expect(
      409,
    );
    await patch(`/admin/users/${ids.supervisor}`, 'admin', {
      active: false,
    }).expect(409);
  });
  it('creates accounts, validates assignments, and revokes sessions on role changes', async () => {
    const payload = {
      name: 'Fictional integration officer',
      email: `${randomUUID()}@demo.invalid`,
      password: randomBytes(24).toString('hex'),
      role: 'OFFICER',
      supervisorId: ids.supervisor,
    };
    await post('/admin/users', 'admin', {
      ...payload,
      supervisorId: ids.officer,
    }).expect(400);
    const result = await post('/admin/users', 'admin', payload).expect(201);
    accounts.push(result.body.id);
    expect(result.body.passwordHash).toBeUndefined();
    expect(
      await db.user.findUnique({ where: { id: result.body.id } }),
    ).toMatchObject({ supervisorId: ids.supervisor });
    const token = randomBytes(32).toString('hex');
    const { hashToken } = await import('../../src/auth');
    await db.session.create({
      data: {
        userId: result.body.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await patch(`/admin/users/${result.body.id}`, 'admin', {
      role: 'SUPERVISOR',
    }).expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
    expect(
      await db.user.findUnique({ where: { id: result.body.id } }),
    ).toMatchObject({ supervisorId: null });
  });
  it('reports incidents idempotently and limits reads and transitions to owners', async () => {
    const payload = {
      requestKey: randomUUID(),
      type: 'ACCIDENT',
      description: 'Fictional integration collision',
      location: 'Demo test area',
      latitude: -17.8,
      longitude: 31.0,
    };
    const result = await post('/incidents', 'officer', payload).expect(201);
    const id = result.body.id;
    incidents.push(id);
    const retry = await post('/incidents', 'officer', payload).expect(201);
    expect(retry.body.id).toBe(id);
    await post('/incidents', 'officer', {
      ...payload,
      description: 'Changed payload',
    }).expect(409);
    await post('/incidents', 'officer2', payload).expect(409);
    const own = await get('/incidents?q=integration', 'officer').expect(200);
    expect(own.body.items.some((row: { id: string }) => row.id === id)).toBe(
      true,
    );
    const other = await get('/incidents?q=integration', 'officer2').expect(200);
    expect(other.body.items.some((row: { id: string }) => row.id === id)).toBe(
      false,
    );
    await patch(`/incidents/${id}`, 'officer', {
      status: 'IN_PROGRESS',
      notes: 'Demo review',
    }).expect(403);
    await patch(`/incidents/${id}`, 'unassigned-supervisor', {
      status: 'IN_PROGRESS',
      notes: 'Demo review',
    }).expect(404);
    await patch(`/incidents/${id}`, 'supervisor', {
      status: 'RESOLVED',
      notes: 'Demo review',
    }).expect(409);
    await patch(`/incidents/${id}`, 'supervisor', {
      status: 'IN_PROGRESS',
      notes: 'Demo review',
    }).expect(200);
    await patch(`/incidents/${id}`, 'supervisor', {
      status: 'RESOLVED',
      notes: 'Demo resolution',
    }).expect(200);
    await patch(`/incidents/${id}`, 'supervisor', {
      status: 'IN_PROGRESS',
      notes: 'Reopen attempt',
    }).expect(409);
    await post('/incidents', 'officer', {
      ...payload,
      requestKey: randomUUID(),
      longitude: undefined,
    }).expect(400);
  });
  it('validates checkpoint schedules, creator permissions and terminal states', async () => {
    const payload = {
      name: 'Integration demo checkpoint',
      location: 'Demo training area',
      latitude: -17.8,
      longitude: 31,
      startAt: new Date(Date.now() - 60000).toISOString(),
      endAt: new Date(Date.now() + 600000).toISOString(),
    };
    await post('/checkpoints', 'officer', payload).expect(403);
    await post('/checkpoints', 'supervisor', {
      ...payload,
      endAt: payload.startAt,
    }).expect(400);
    const result = await post('/checkpoints', 'supervisor', payload).expect(
      201,
    );
    checkpoints.push(result.body.id);
    await patch(`/checkpoints/${result.body.id}`, 'unassigned-supervisor', {
      status: 'ACTIVE',
    }).expect(404);
    await patch(`/checkpoints/${result.body.id}`, 'supervisor', {
      status: 'ACTIVE',
    }).expect(200);
    await patch(`/checkpoints/${result.body.id}`, 'supervisor', {
      status: 'CLOSED',
    }).expect(200);
    await patch(`/checkpoints/${result.body.id}`, 'supervisor', {
      status: 'ACTIVE',
    }).expect(409);
  });
  it('returns scoped analytics and safe security history', async () => {
    await get('/analytics/overview', 'officer').expect(403);
    const data = await get('/analytics/overview', 'supervisor').expect(200);
    expect(data.body.demo).toBe(true);
    expect(data.body.trend).toHaveLength(7);
    const unassigned = await get(
      '/analytics/overview',
      'unassigned-supervisor',
    ).expect(200);
    expect(unassigned.body.officers).toEqual([]);
    const security = await get('/admin/security').expect(200);
    expect(security.body.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(security.body)).not.toMatch(/passwordHash|tokenHash/);
  });
});
