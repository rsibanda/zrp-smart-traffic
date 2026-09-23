import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, Role } from '../generated/client';
import * as argon2 from 'argon2';

config({ path: resolve(__dirname, '../../../.env') });
const db = new PrismaClient();
async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      'Set DEMO_PASSWORD to at least 12 characters in the root .env',
    );
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await db.$transaction(async (tx) => {
    for (const [local, role] of [
      ['officer', Role.OFFICER],
      ['officer2', Role.OFFICER],
      ['supervisor', Role.SUPERVISOR],
      ['unassigned-supervisor', Role.SUPERVISOR],
      ['admin', Role.ADMIN],
    ] as const) {
      const user = await tx.user.upsert({
        where: { email: `${local}@demo.invalid` },
        update: { passwordHash },
        create: {
          email: `${local}@demo.invalid`,
          name: `Fictional ${local}`,
          role,
          passwordHash,
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      if (role === Role.OFFICER)
        await tx.officerProfile.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            badgeNumber: `DEMO-${local.toUpperCase()}`,
            stationName: 'Fictional Training Station',
          },
        });
    }
    const supervisor = await tx.user.findUniqueOrThrow({where: {email: 'supervisor@demo.invalid'}});
    const officer = await tx.user.findUniqueOrThrow({where: {email: 'officer@demo.invalid'}});
    await tx.user.updateMany({where: {email: {in: ['officer@demo.invalid', 'officer2@demo.invalid']}, supervisorId: null, role: 'OFFICER'}, data: {supervisorId: supervisor.id}});
    await tx.systemSetting.upsert({where: {key: 'demo'}, create: {key: 'demo'}, update: {}});
    await tx.trafficAlert.upsert({where: {id: 'd0000000-0000-4000-8000-000000000003'}, update: {}, create: {id: 'd0000000-0000-4000-8000-000000000003', title: 'Demo training notice', message: 'Fictional classroom traffic exercise. This is not a real road closure or official alert.', createdBy: supervisor.id}});
    await tx.incident.upsert({where: {requestKey: 'd0000000-0000-4000-8000-000000000001'}, update: {}, create: {requestKey: 'd0000000-0000-4000-8000-000000000001', reportedBy: officer.id, supervisorId: supervisor.id, type: 'HAZARD', description: 'Fictional training obstruction. This is not a real road alert.', location: 'Demo training intersection', latitude: -17.8253, longitude: 31.0335}});
    await tx.checkpoint.upsert({where: {id: 'd0000000-0000-4000-8000-000000000002'}, update: {}, create: {id: 'd0000000-0000-4000-8000-000000000002', name: 'Demo training checkpoint', location: 'Fictional operations area', latitude: -17.819, longitude: 31.043, startAt: new Date(Date.now() - 900000), endAt: new Date(Date.now() + 86400000), createdBy: supervisor.id}});
    const driver = await tx.driver.upsert({
      where: { licenceNumber: 'DEMO-LICENCE-001' },
      update: {},
      create: {
        fullName: 'Demo Driver One',
        licenceNumber: 'DEMO-LICENCE-001',
        licenceStatus: 'DEMO_VALID',
      },
    });
    await tx.vehicle.upsert({
      where: { registrationNumber: 'DEMO001' },
      update: {},
      create: {
        registrationNumber: 'DEMO001',
        make: 'Toyota',
        model: 'Corolla',
        colour: 'Silver',
        registrationStatus: 'DEMO_REGISTERED',
        driverId: driver.id,
      },
    });
    await tx.offenceCategory.upsert({
      where: { code: 'DEMO-OBS' },
      update: {},
      create: {
        code: 'DEMO-OBS',
        name: 'Fictional training offence',
        description:
          'Invented classroom category; no legal meaning or official tariff.',
        demoFineAmount: '25.00',
      },
    });
  });
  console.log(
    'Fictional demo accounts, DEMO001 and training category seeded. Existing records preserved; demo sessions revoked.',
  );
}
seed()
  .catch(() => {
    console.error(
      'Seed failed. Check database access and DEMO_PASSWORD (minimum 12 characters).',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
