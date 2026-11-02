import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { resolve } from 'path';
import { configure } from './configure';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

describe('production HTTP configuration', () => {
  let app: INestApplication;
  const original = { ...process.env };
  const query = jest.fn();
  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      CORS_ORIGIN: 'https://traffic.netlify.app',
      EVIDENCE_DIRECTORY: resolve('storage'),
    });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: query } }],
    }).compile();
    app = module.createNestApplication();
    configure(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    process.env = original;
  });
  it('exposes only a minimal health response and hides Swagger', async () => {
    query.mockResolvedValueOnce([{ value: 1 }]);
    const result = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(result.body).toEqual({ status: 'ok' });
    await request(app.getHttpServer()).get('/api/docs').expect(404);
    query.mockRejectedValueOnce(new Error('private database diagnostics'));
    const unavailable = await request(app.getHttpServer())
      .get('/health')
      .expect(503);
    expect(unavailable.text).not.toContain('private database');
  });
  it('permits Authorization preflight only for the configured origin', async () => {
    const allowed = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://traffic.netlify.app')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'https://traffic.netlify.app',
    );
    const denied = await request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
