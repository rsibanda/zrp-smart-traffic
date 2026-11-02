import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import * as argon2 from 'argon2';
import { resolve } from 'path';
import { AuthController } from './auth';
import { configure } from './configure';
import { PrismaService } from './prisma.service';

const productionOrigin = 'https://thunderous-moxie-b0872a.netlify.app';
const previewOrigin =
  'https://deploy-preview-1--thunderous-moxie-b0872a.netlify.app';

describe('Exact Netlify preview CORS and bearer login', () => {
  const original = { ...process.env };
  const password = 'Synthetic-login-test-only';
  let productionOnly: INestApplication, approvedPreview: INestApplication;
  async function application(origins: string[]) {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example',
      EVIDENCE_STORAGE: 'local',
      EVIDENCE_DIRECTORY: resolve('storage'),
      CORS_ORIGIN: origins.join(','),
    });
    const user = {
      id: 'officer',
      name: 'Test Officer',
      email: 'test@example.invalid',
      role: 'OFFICER',
      active: true,
      passwordHash: await argon2.hash(password),
    };
    let session: { tokenHash: string; expiresAt: Date } | undefined;
    const tx = {
      session: {
        deleteMany: jest.fn(),
        create: jest.fn(
          async ({
            data,
          }: {
            data: { tokenHash: string; expiresAt: Date };
          }) => {
            session = data;
          },
        ),
      },
      auditEvent: { create: jest.fn() },
    };
    const db = {
      user: { findUnique: jest.fn(async () => user) },
      session: {
        findUnique: jest.fn(
          async ({ where }: { where: { tokenHash: string } }) =>
            session?.tokenHash === where.tokenHash
              ? { ...session, user }
              : null,
        ),
      },
      auditEvent: tx.auditEvent,
      $transaction: async (work: (transaction: typeof tx) => unknown) =>
        work(tx),
    };
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }])],
      controllers: [AuthController],
      providers: [{ provide: PrismaService, useValue: db }],
    }).compile();
    const app = module.createNestApplication();
    configure(app);
    await app.init();
    return app;
  }
  beforeAll(async () => {
    productionOnly = await application([productionOrigin]);
    approvedPreview = await application([productionOrigin, previewOrigin]);
  });
  afterAll(async () => {
    await productionOnly?.close();
    await approvedPreview?.close();
    process.env = original;
  });
  const preflight = (app: INestApplication, origin: string) =>
    request(app.getHttpServer())
      .options('/api/v1/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');
  it('reproduces the missing preview allow-origin header with the existing production-only setting', async () => {
    expect(
      (await preflight(productionOnly, productionOrigin).expect(204)).headers[
        'access-control-allow-origin'
      ],
    ).toBe(productionOrigin);
    expect(
      (await preflight(productionOnly, previewOrigin)).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });
  it.each([productionOrigin, previewOrigin])(
    'allows exactly configured origin %s without cookie credentials or redirects',
    async (origin) => {
      const response = await preflight(approvedPreview, origin).expect(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-headers']).toMatch(
        /content-type/i,
      );
      expect(response.headers['access-control-allow-headers']).toMatch(
        /authorization/i,
      );
      expect(
        response.headers['access-control-allow-credentials'],
      ).toBeUndefined();
      expect(response.headers.vary).toContain('Origin');
      expect(response.headers.location).toBeUndefined();
    },
  );
  it.each([
    'https://deploy-preview-2--thunderous-moxie-b0872a.netlify.app',
    'https://deploy-preview-1--another-site.netlify.app',
    previewOrigin + '.evil.example',
    previewOrigin.replace('https:', 'http:'),
    'null',
  ])('does not grant CORS to %s', async (origin) => {
    expect(
      (await preflight(approvedPreview, origin)).headers[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });
  it('returns a readable login token response and keeps authentication dependent on the bearer token', async () => {
    const login = await request(approvedPreview.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', previewOrigin)
      .send({ email: 'test@example.invalid', password, category: 'OFFICER' })
      .expect(200);
    expect(login.headers['access-control-allow-origin']).toBe(previewOrigin);
    expect(login.headers['set-cookie']).toBeUndefined();
    expect(login.headers.location).toBeUndefined();
    expect(login.headers['cache-control']).toBe('no-store');
    expect(login.body.token).toMatch(/^[a-f0-9]{64}$/);
    expect(login.body.user.passwordHash).toBeUndefined();
    await request(approvedPreview.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Origin', previewOrigin)
      .set('Cookie', 'session=untrusted')
      .expect(401);
    const me = await request(approvedPreview.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Origin', previewOrigin)
      .auth(login.body.token, { type: 'bearer' })
      .expect(200);
    expect(me.body.role).toBe('OFFICER');
    expect(me.headers['access-control-allow-origin']).toBe(previewOrigin);
  });
  it('keeps invalid passwords and mismatched login categories rejected with readable 401 responses', async () => {
    for (const credentials of [
      { password: 'incorrect', category: 'OFFICER' },
      { password, category: 'SUPERVISOR' },
    ]) {
      const response = await request(approvedPreview.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Origin', previewOrigin)
        .send({ email: 'test@example.invalid', ...credentials })
        .expect(401);
      expect(response.headers['access-control-allow-origin']).toBe(
        previewOrigin,
      );
      expect(response.body.message).toBe('Invalid credentials');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(response.headers.location).toBeUndefined();
    }
  });
});
