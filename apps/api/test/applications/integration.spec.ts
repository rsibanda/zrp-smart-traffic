import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { randomBytes, randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { AppModule } from '../../src/app.module';
import { configure } from '../../src/configure';
import { PrismaService } from '../../src/prisma.service';
import { hashToken } from '../../src/auth';
import { EvidenceStorage } from '../../src/evidence-storage';
config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);
describe('Vehicle applications and private review', () => {
  let app: INestApplication, db: PrismaService;
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const tokens = ids.map(() => randomBytes(32).toString('hex'));
  const auth = (i: number) => ({ Authorization: `Bearer ${tokens[i]}` });
  let categoryId: string, applicationId: string, fileId: string;
  let revision = 0;
  const plate = `VA${randomBytes(5).toString('hex').toUpperCase()}`;
  let png: Buffer;
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
    const roles = ['ADMIN', 'SUPERVISOR', 'USER', 'USER'] as const;
    for (let i = 0; i < ids.length; i++) {
      await db.user.create({
        data: {
          id: ids[i],
          name: 'Application fixture',
          email: `${ids[i]}@example.invalid`,
          role: roles[i],
          passwordHash: 'unused',
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
    png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    if (db) {
      const files = await db.vehicleApplicationFile.findMany({
        where: { uploadedBy: { in: ids } },
      });
      for (const f of files)
        await app
          .get(EvidenceStorage)
          .remove(f.storageKey)
          .catch(() => undefined);
      await db.vehicleApplicationPayment.deleteMany({
        where: { application: { request: { motoristId: { in: ids } } } },
      });
      await db.vehicleLinkRequest.deleteMany({
        where: { motoristId: { in: ids } },
      });
      await db.vehicle.deleteMany({ where: { motoristId: { in: ids } } });
      if (categoryId)
        await db.vehicleCategory.deleteMany({ where: { id: categoryId } });
      await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    if (app) await app.close();
  });
  it('uses admin-only categories and saves a private draft with a fee snapshot', async () => {
    const category = {
      code: `T${randomBytes(4).toString('hex').toUpperCase()}`,
      label: 'Synthetic category',
      feeMinor: 1000,
      active: true,
    };
    await request(app.getHttpServer())
      .post('/api/v1/admin/vehicle-categories')
      .set(auth(2))
      .send(category)
      .expect(403);
    categoryId = (
      await request(app.getHttpServer())
        .post('/api/v1/admin/vehicle-categories')
        .set(auth(0))
        .send(category)
        .expect(201)
    ).body.id;
    const dto = {
      requestKey: randomUUID(),
      revision: 0,
      categoryId,
      registration: plate,
      make: 'Sample',
      model: 'Car',
      year: 2020,
      colour: 'Blue',
      chassis: 'TEST-CHASSIS',
      engine: '',
      relationship: 'OWNER',
      declaration: true,
    };
    const saved = await request(app.getHttpServer())
      .post('/api/v1/motorist/vehicle-applications')
      .set(auth(2))
      .send(dto)
      .expect(201);
    applicationId = saved.body.requestId;
    expect(saved.body.feeMinor).toBe(1000);
    expect(saved.body.status).toBe('DRAFT');
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/motorist/vehicle-applications')
          .set(auth(2))
          .send(dto)
          .expect(201)
      ).body.requestId,
    ).toBe(applicationId);
    await request(app.getHttpServer())
      .get(`/api/v1/motorist/vehicle-applications/${applicationId}`)
      .set(auth(3))
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/motorist/vehicle-applications/${applicationId}/submit`)
      .set(auth(2))
      .send({ revision, declaration: true })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/vehicle-categories/${categoryId}`)
      .set(auth(0))
      .send({ ...category, feeMinor: 2500 })
      .expect(200);
  });
  it('validates attachments, protects downloads, and supports changes requested and resubmission', async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    await request(app.getHttpServer())
      .post(
        `/api/v1/motorist/vehicle-applications/${applicationId}/files/OWNERSHIP`,
      )
      .set(auth(3))
      .attach('file', png, { filename: 'photo.png', contentType: 'image/png' })
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `/api/v1/motorist/vehicle-applications/${applicationId}/files/FRONT`,
      )
      .set(auth(2))
      .attach('file', Buffer.from('MZ unsafe'), {
        filename: 'photo.png',
        contentType: 'image/png',
      })
      .expect(400);
    for (const kind of ['OWNERSHIP', 'FRONT', 'REAR_PLATE']) {
      const result = await request(app.getHttpServer())
        .post(
          `/api/v1/motorist/vehicle-applications/${applicationId}/files/${kind}`,
        )
        .set(auth(2))
        .attach(
          'file',
          kind === 'OWNERSHIP' ? Buffer.from(await pdf.save()) : png,
          {
            filename: kind === 'OWNERSHIP' ? 'document.pdf' : 'photo.png',
            contentType: kind === 'OWNERSHIP' ? 'application/pdf' : 'image/png',
          },
        )
        .expect(201);
      fileId = result.body.id;
      expect(result.body.storageKey).toBeUndefined();
    }
    await request(app.getHttpServer())
      .post(
        `/api/v1/motorist/vehicle-applications/${applicationId}/files/OTHER_1`,
      )
      .set(auth(2))
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'large.png',
        contentType: 'image/png',
      })
      .expect(400);
    revision = (
      await request(app.getHttpServer())
        .get(`/api/v1/motorist/vehicle-applications/${applicationId}`)
        .set(auth(2))
        .expect(200)
    ).body.revision;
    await request(app.getHttpServer())
      .post(`/api/v1/vehicle-application-files/${fileId}/download`)
      .set(auth(3))
      .send({})
      .expect(404);
    const signed = await request(app.getHttpServer())
      .post(`/api/v1/vehicle-application-files/${fileId}/download`)
      .set(auth(2))
      .send({})
      .expect(201);
    await request(app.getHttpServer()).get(signed.body.url).expect(200);
    await request(app.getHttpServer())
      .get(signed.body.url.replace(/signature=./, 'signature=z'))
      .expect(404);
    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/motorist/vehicle-applications/${applicationId}/submit`)
      .set(auth(2))
      .send({ revision, declaration: true })
      .expect(201);
    revision = submitted.body.revision;
    expect(submitted.body.feeMinor).toBe(1000);
    await request(app.getHttpServer())
      .post(`/api/v1/supervisor/vehicle-applications/${applicationId}/review`)
      .set(auth(2))
      .send({
        revision,
        status: 'APPROVED',
        reason: 'Self approval',
        checked: true,
      })
      .expect(403);
    const changed = await request(app.getHttpServer())
      .post(`/api/v1/supervisor/vehicle-applications/${applicationId}/review`)
      .set(auth(1))
      .send({
        revision,
        status: 'CHANGES_REQUESTED',
        reason: 'Please replace the front photo.',
        checked: true,
      })
      .expect(201);
    revision = changed.body.revision;
    await request(app.getHttpServer())
      .post(
        `/api/v1/motorist/vehicle-applications/${applicationId}/files/FRONT`,
      )
      .set(auth(2))
      .attach('file', png, {
        filename: 'replacement.png',
        contentType: 'image/png',
      })
      .expect(201);
    revision = (
      await request(app.getHttpServer())
        .get(`/api/v1/motorist/vehicle-applications/${applicationId}`)
        .set(auth(2))
        .expect(200)
    ).body.revision;
    revision = (
      await request(app.getHttpServer())
        .post(`/api/v1/motorist/vehicle-applications/${applicationId}/submit`)
        .set(auth(2))
        .send({ revision, declaration: true })
        .expect(201)
    ).body.revision;
    await request(app.getHttpServer())
      .post(`/api/v1/supervisor/vehicle-applications/${applicationId}/review`)
      .set(auth(1))
      .send({
        revision,
        status: 'APPROVED',
        reason: 'Documents verified for synthetic vehicle.',
        checked: true,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/supervisor/vehicle-applications/${applicationId}/review`)
      .set(auth(1))
      .send({
        revision,
        status: 'APPROVED',
        reason: 'Duplicate review.',
        checked: true,
      })
      .expect(409);
    expect(
      await db.vehicle.count({
        where: { registrationNumber: plate, motoristId: ids[2] },
      }),
    ).toBe(1);
    expect(
      (
        await db.vehicleApplication.findUniqueOrThrow({
          where: { requestId: applicationId },
          include: { decisions: true },
        })
      ).decisions,
    ).toHaveLength(2);
  });
  async function submittedFixture(
    registration = `VA${randomBytes(5).toString('hex').toUpperCase()}`,
  ) {
    // Focused review/payment fixture; the preceding test covers HTTP draft/upload/submission.
    return db.vehicleApplication.create({
      data: {
        request: {
          create: {
            motoristId: ids[2],
            registration,
            kind: 'APPLICATION',
            status: 'PENDING_REVIEW',
          },
        },
        category: { connect: { id: categoryId } },
        requestKey: randomUUID(),
        make: 'Sample',
        model: 'Car',
        year: 2020,
        colour: 'Blue',
        chassis: 'TEST-CHASSIS',
        engine: '',
        relationship: 'OWNER',
        declaration: true,
        feeMinor: 1000,
      },
    });
  }
  it('blocks ownership conflicts and records rejection without changing an association', async () => {
    const existing = await db.vehicle.create({
      data: {
        registrationNumber: `VC${randomBytes(5).toString('hex').toUpperCase()}`,
        motoristId: ids[3],
        make: 'Original',
        model: 'Car',
        colour: 'Green',
        registrationStatus: 'VALID',
      },
    });
    const application = await submittedFixture(existing.registrationNumber);
    const endpoint = `/api/v1/supervisor/vehicle-applications/${application.requestId}`;
    const detail = await request(app.getHttpServer())
      .get(endpoint)
      .set(auth(1))
      .expect(200);
    expect(detail.body.linkedToAnotherMotorist).toBe(true);
    expect(JSON.stringify(detail.body)).not.toContain(
      `${ids[3]}@example.invalid`,
    );
    await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set(auth(1))
      .send({
        revision: application.revision,
        status: 'APPROVED',
        reason: 'Checked application',
        checked: true,
      })
      .expect(409);
    await request(app.getHttpServer())
      .post(`${endpoint}/review`)
      .set(auth(1))
      .send({
        revision: application.revision,
        status: 'REJECTED',
        reason: 'Ownership could not be verified.',
        checked: true,
      })
      .expect(201);
    expect(
      (await db.vehicle.findUniqueOrThrow({ where: { id: existing.id } }))
        .motoristId,
    ).toBe(ids[3]);
    const motorist = await request(app.getHttpServer())
      .get(`/api/v1/motorist/vehicle-applications/${application.requestId}`)
      .set(auth(2))
      .expect(200);
    expect(motorist.body.status).toBe('REJECTED');
    expect(motorist.body.decisions[0].reason).toBe(
      'Ownership could not be verified.',
    );
  });
  it.each(['ECOCASH', 'INNBUCKS', 'CARD'])(
    'completes %s fees without approving the vehicle and isolates receipts',
    async (method) => {
      const application = await submittedFixture();
      const payment = await request(app.getHttpServer())
        .post(
          `/api/v1/motorist/vehicle-applications/${application.requestId}/payments`,
        )
        .set(auth(2))
        .send({ method, requestKey: randomUUID() })
        .expect(201);
      const endpoint = `/api/v1/motorist/application-payments/${payment.body.reference}/outcome`;
      await request(app.getHttpServer())
        .post(endpoint)
        .set(auth(3))
        .send({ outcome: 'APPROVE' })
        .expect(404);
      const paid = await request(app.getHttpServer())
        .post(endpoint)
        .set(auth(2))
        .send({ outcome: 'APPROVE' })
        .expect(201);
      expect(paid.body.status).toBe('SUCCESS');
      expect(paid.body.method).toBe(method);
      expect(paid.body.receiptReference).toMatch(/^APP-RCPT-/);
      expect(
        (
          await db.vehicleLinkRequest.findUniqueOrThrow({
            where: { id: application.requestId },
          })
        ).status,
      ).toBe('PENDING_REVIEW');
    },
  );
  it('preserves the fee snapshot and makes retries and success idempotent', async () => {
    for (const method of ['ECOCASH', 'INNBUCKS', 'CARD']) {
      const dto = { requestKey: randomUUID(), method };
      const started = await request(app.getHttpServer())
        .post(`/api/v1/motorist/vehicle-applications/${applicationId}/payments`)
        .set(auth(2))
        .send(dto)
        .expect(201);
      expect(started.body.feeMinor).toBe(1000);
      expect(started.body.method).toBe(method);
      expect(
        (
          await request(app.getHttpServer())
            .post(
              `/api/v1/motorist/vehicle-applications/${applicationId}/payments`,
            )
            .set(auth(2))
            .send(dto)
            .expect(201)
        ).body.reference,
      ).toBe(started.body.reference);
      const result = await request(app.getHttpServer())
        .post(
          `/api/v1/motorist/application-payments/${started.body.reference}/outcome`,
        )
        .set(auth(2))
        .send({ outcome: method === 'CARD' ? 'APPROVE' : 'DECLINE' })
        .expect(201);
      if (method === 'CARD') {
        expect(result.body.receiptReference).toMatch(/^APP-RCPT-/);
        expect(
          (
            await request(app.getHttpServer())
              .post(
                `/api/v1/motorist/application-payments/${started.body.reference}/outcome`,
              )
              .set(auth(2))
              .send({ outcome: 'APPROVE' })
              .expect(201)
          ).body.receiptReference,
        ).toBe(result.body.receiptReference);
      }
    }
    expect(
      await db.vehicleApplicationPayment.count({
        where: { applicationId, status: 'SUCCESS' },
      }),
    ).toBe(1);
    const staff = await request(app.getHttpServer())
      .get(`/api/v1/supervisor/vehicle-applications/${applicationId}`)
      .set(auth(1))
      .expect(200);
    expect(staff.body.payments[0].status).toBe('SUCCESS');
  });
});
