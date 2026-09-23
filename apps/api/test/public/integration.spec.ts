import 'reflect-metadata';
import {config} from 'dotenv';
import {resolve} from 'path';
import {unlink} from 'fs/promises';
import {randomUUID} from 'crypto';
import {INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {ExpressAdapter} from '@nestjs/platform-express';
import request from 'supertest';
import sharp from 'sharp';
import {AppModule} from '../../src/app.module';
import {configure} from '../../src/configure';
import {PrismaService} from '../../src/prisma.service';
import {evidenceDirectory} from '../../src/evidence.controller';
config({path: resolve(__dirname, '../../../../.env')});
describe('Public ticket isolation and private evidence', () => {
  let app: INestApplication; let db: PrismaService; let officer: string; let other: string; let supervisor: string;
  let offenceId: string; let ticketId: string; let reference: string; let code: string; let publicToken: string; let evidenceId: string; let alertId: string;
  const reportKey = randomUUID();
  beforeAll(async () => {
    const module = await Test.createTestingModule({imports: [AppModule]}).compile(); app = module.createNestApplication(new ExpressAdapter()); configure(app); await app.init(); db = app.get(PrismaService);
    const login = async (email: string) => (await request(app.getHttpServer()).post('/api/v1/auth/login').send({email, password: process.env.DEMO_PASSWORD}).expect(200)).body.token;
    officer = await login('officer@demo.invalid'); other = await login('officer2@demo.invalid'); supervisor = await login('supervisor@demo.invalid');
    const vehicle = await db.vehicle.findUniqueOrThrow({where: {registrationNumber: 'DEMO001'}}); const category = await db.offenceCategory.findFirstOrThrow({where: {active: true}});
    const result = await request(app.getHttpServer()).post('/api/v1/offences').auth(officer, {type: 'bearer'}).send({requestKey: randomUUID(), vehicleId: vehicle.id, categoryId: category.id, observedAt: new Date().toISOString(), location: 'Private demo test', notes: 'Private evidence and public verification test'}).expect(201); offenceId = result.body.id;
  }, 30000);
  afterAll(async () => {
    if (db) {
      const records = offenceId ? await db.evidence.findMany({where: {offenceId}}) : [];
      for (const record of records) await unlink(resolve(evidenceDirectory, record.privateStorageKey)).catch(() => undefined);
      if (offenceId) {await db.evidence.deleteMany({where: {offenceId}}); await db.ticket.deleteMany({where: {offenceId}}); await db.offence.deleteMany({where: {id: offenceId}});}
      const report = await db.incident.findUnique({where: {requestKey: reportKey}});
      await db.incident.deleteMany({where: {requestKey: reportKey}});
      if (alertId) await db.trafficAlert.deleteMany({where: {id: alertId}});
      await db.auditEvent.deleteMany({where: {entityId: {in: [offenceId, ticketId, evidenceId, alertId, report?.id].filter((id): id is string => Boolean(id))}}});
    }
    if (app) await app.close();
  });
  it('inspects image content, enforces limits and keeps evidence private', async () => {
    const path = `/api/v1/offences/${offenceId}/evidence`;
    await request(app.getHttpServer()).post(path).auth(officer, {type: 'bearer'}).attach('file', Buffer.from('<svg>bad</svg>'), {filename: 'fake.jpg', contentType: 'image/jpeg'}).expect(400);
    await request(app.getHttpServer()).post(path).auth(officer, {type: 'bearer'}).attach('file', Buffer.from('bad'), {filename: 'file.html', contentType: 'text/html'}).expect(400);
    await request(app.getHttpServer()).post(path).auth(officer, {type: 'bearer'}).attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), {filename: 'large.jpg', contentType: 'image/jpeg'}).expect(413);
    const bytes = await sharp({create: {width: 16, height: 16, channels: 3, background: '#14566a'}}).png().toBuffer();
    const result = await request(app.getHttpServer()).post(path).auth(officer, {type: 'bearer'}).attach('file', bytes, {filename: 'demo.png', contentType: 'image/png'}).expect(201); evidenceId = result.body.id;
    expect(result.body.privateStorageKey).toBeUndefined(); expect(result.body.mimeType).toBe('image/jpeg');
    const retry = await request(app.getHttpServer()).post(path).auth(officer, {type: 'bearer'}).attach('file', bytes, {filename: 'demo.png', contentType: 'image/png'}).expect(201); expect(retry.body.id).toBe(evidenceId);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).auth(other, {type: 'bearer'}).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).auth(supervisor, {type: 'bearer'}).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).auth(officer, {type: 'bearer'}).expect(200).expect('Content-Type', /image\/jpeg/);
  });
  it('requires both factors and gives public sessions no staff access', async () => {
    const submitted = await request(app.getHttpServer()).post(`/api/v1/offences/${offenceId}/submit`).auth(officer, {type: 'bearer'}).send({}).expect(201); ticketId = submitted.body.id; reference = submitted.body.publicReference;
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).auth(supervisor, {type: 'bearer'}).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/tickets/${ticketId}/access-code`).auth(other, {type: 'bearer'}).send({}).expect(404);
    const access = await request(app.getHttpServer()).post(`/api/v1/tickets/${ticketId}/access-code`).auth(officer, {type: 'bearer'}).send({}).expect(201); code = access.body.verificationCode;
    await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: '0000000000000000'}).expect(401);
    const verified = await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: code}).expect(200); publicToken = verified.body.token;
    expect(Object.keys(verified.body.ticket).sort()).toEqual(['warning', 'reference', 'demoAmount', 'status', 'issuedAt', 'category', 'paymentStatus', 'simulatedAt', 'receiptReference'].sort());
    await request(app.getHttpServer()).get('/api/v1/vehicles?registration=DEMO001').auth(publicToken, {type: 'bearer'}).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/evidence/${evidenceId}`).auth(publicToken, {type: 'bearer'}).expect(401);
    await request(app.getHttpServer()).get('/api/v1/public/tickets/current').auth(officer, {type: 'bearer'}).expect(401);
  });
  it('simulates once across retries and revokes access when the code changes', async () => {
    const pay = () => request(app.getHttpServer()).post('/api/v1/public/tickets/payment-simulation').auth(publicToken, {type: 'bearer'}).send({}).expect(200);
    const [first, second] = await Promise.all([pay(), pay()]); expect(first.body.receiptReference).toBe(second.body.receiptReference); expect(first.body.paymentStatus).toBe('SIMULATED_PAID');
    expect(await db.auditEvent.count({where: {entityId: ticketId, action: 'PAYMENT_SIMULATED'}})).toBe(1);
    const access = await request(app.getHttpServer()).post(`/api/v1/tickets/${ticketId}/access-code`).auth(officer, {type: 'bearer'}).send({}).expect(201);
    await request(app.getHttpServer()).get('/api/v1/public/tickets/current').auth(publicToken, {type: 'bearer'}).expect(401);
    await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: code}).expect(401);
    const verified = await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: access.body.verificationCode}).expect(200);
    await db.publicTicketSession.updateMany({where: {ticketId}, data: {expiresAt: new Date(0)}});
    await request(app.getHttpServer()).get('/api/v1/public/tickets/current').auth(verified.body.token, {type: 'bearer'}).expect(401);
    const renewed = await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: access.body.verificationCode}).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/offences/${offenceId}/review`).auth(supervisor, {type: 'bearer'}).send({status: 'UNDER_REVIEW', notes: 'Fictional cancellation test'}).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/offences/${offenceId}/review`).auth(supervisor, {type: 'bearer'}).send({status: 'CANCELLED', notes: 'Fictional cancellation test'}).expect(201);
    await request(app.getHttpServer()).post('/api/v1/public/tickets/payment-simulation').auth(renewed.body.token, {type: 'bearer'}).send({}).expect(409);
    await request(app.getHttpServer()).post('/api/v1/public/tickets/verify').send({reference, verificationCode: access.body.verificationCode}).expect(429);
  });
  it('accepts unverified public reports without disclosing staff records', async () => {
    const payload = {requestKey: reportKey, type: 'HAZARD', location: 'Fictional public report area', description: 'Fictional road obstruction'};
    const first = await request(app.getHttpServer()).post('/api/v1/public/incidents').send(payload).expect(201);
    expect(first.body.id).toBeUndefined(); await request(app.getHttpServer()).post('/api/v1/public/incidents').send(payload).expect(201);
    expect(await db.incident.count({where: {requestKey: reportKey}})).toBe(1);
    const report = await db.incident.findUniqueOrThrow({where: {requestKey: reportKey}}); expect(report.source).toBe('PUBLIC_UNVERIFIED'); expect(report.reportedBy).toBeNull();
    await request(app.getHttpServer()).get('/api/v1/incidents').expect(401);
  });
  it('publishes and withdraws demo alerts with supervisor permissions', async () => {
    await request(app.getHttpServer()).post('/api/v1/alerts').auth(officer, {type: 'bearer'}).send({title: 'Demo alert', message: 'Fictional traffic exercise'}).expect(403);
    const alert = await request(app.getHttpServer()).post('/api/v1/alerts').auth(supervisor, {type: 'bearer'}).send({title: 'Demo alert', message: 'Fictional traffic exercise'}).expect(201); alertId = alert.body.id;
    const visible = await request(app.getHttpServer()).get('/api/v1/public/notices').expect(200); expect(visible.body.alerts.some((row: {id: string}) => row.id === alertId)).toBe(true);
    await request(app.getHttpServer()).patch(`/api/v1/alerts/${alertId}`).auth(supervisor, {type: 'bearer'}).send({active: false}).expect(200);
    const hidden = await request(app.getHttpServer()).get('/api/v1/public/notices').expect(200); expect(hidden.body.alerts.some((row: {id: string}) => row.id === alertId)).toBe(false);
  });
});
