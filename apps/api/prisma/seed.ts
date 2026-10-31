import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient, Role } from '../generated/client';
import * as argon2 from 'argon2';

config({ path: resolve(__dirname, '../../../.env') });
const db = new PrismaClient();
async function seed() {
  const production = process.env.NODE_ENV === 'production';
  if (production && process.env.ALLOW_DEMO_SEED !== 'true')
    throw new Error('Explicit ALLOW_DEMO_SEED=true required');
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      'Set DEMO_PASSWORD to at least 12 characters in the root .env',
    );
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  // Generated development identities; not real people or government records.
  const names: Record<string, string> = {
    user: 'Tawanda Ncube',
    officer: 'Officer Tendai Moyo',
    officer2: 'Officer Rudo Dube',
    supervisor: 'Inspector Chipo Ndlovu',
    'unassigned-supervisor': 'Inspector Farai Sibanda',
    admin: 'Nyasha Chirwa',
  };
  await db.$transaction(
    async (tx) => {
      if (production && (await tx.user.count()))
        throw new Error('Production seed requires an empty user table');
      for (const [local, role] of [
        ['user', Role.USER],
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
            name: names[local],
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
              badgeNumber: local === 'officer' ? 'ZRP-1042' : 'ZRP-1043',
              stationName: 'Harare Central',
            },
          });
      }
      const supervisor = await tx.user.findUniqueOrThrow({
        where: { email: 'supervisor@demo.invalid' },
      });
      const officer = await tx.user.findUniqueOrThrow({
        where: { email: 'officer@demo.invalid' },
      });
      await tx.user.updateMany({
        where: {
          email: { in: ['officer@demo.invalid', 'officer2@demo.invalid'] },
          supervisorId: null,
          role: 'OFFICER',
        },
        data: { supervisorId: supervisor.id },
      });
      await tx.systemSetting.upsert({
        where: { key: 'demo' },
        create: { key: 'demo' },
        update: {},
      });
      await tx.trafficAlert.upsert({
        where: { id: 'd0000000-0000-4000-8000-000000000003' },
        update: {},
        create: {
          id: 'd0000000-0000-4000-8000-000000000003',
          title: 'Traffic Advisory',
          message: 'Traffic information and road advisories will appear here.',
          createdBy: supervisor.id,
        },
      });
      await tx.incident.upsert({
        where: { requestKey: 'd0000000-0000-4000-8000-000000000001' },
        update: {},
        create: {
          requestKey: 'd0000000-0000-4000-8000-000000000001',
          reportedBy: officer.id,
          supervisorId: supervisor.id,
          type: 'HAZARD',
          description: 'Road obstruction reported near the intersection.',
          location: 'Samora Machel Avenue, Harare',
          latitude: -17.8253,
          longitude: 31.0335,
        },
      });
      await tx.checkpoint.upsert({
        where: { id: 'd0000000-0000-4000-8000-000000000002' },
        update: {},
        create: {
          id: 'd0000000-0000-4000-8000-000000000002',
          name: 'Central Traffic Checkpoint',
          location: 'Samora Machel Avenue, Harare',
          latitude: -17.819,
          longitude: 31.043,
          startAt: new Date(Date.now() - 900000),
          endAt: new Date(Date.now() + 86400000),
          createdBy: supervisor.id,
        },
      });
      const driver = await tx.driver.upsert({
        where: { licenceNumber: 'L0001042' },
        update: {},
        create: {
          fullName: 'Tawanda Ncube',
          licenceNumber: 'L0001042',
          licenceStatus: 'VALID',
        },
      });
      const motorist = await tx.user.findUniqueOrThrow({
        where: { email: 'user@demo.invalid' },
      });
      await tx.vehicle.upsert({
        where: { registrationNumber: 'ABC1234' },
        update: {},
        create: {
          registrationNumber: 'ABC1234',
          make: 'Toyota',
          model: 'Corolla',
          colour: 'Silver',
          registrationStatus: 'REGISTERED',
          driverId: driver.id,
          motoristId: motorist.id,
        },
      });
      // Only the explicitly identified synthetic development vehicle is linked;
      // never infer ownership by name or overwrite an administrator's assignment.
      await tx.vehicle.updateMany({
        where: {
          registrationNumber: 'ABC1234',
          driverId: driver.id,
          motoristId: null,
        },
        data: { motoristId: motorist.id },
      });
      await tx.offenceCategory.upsert({
        where: { code: 'TRF-001' },
        update: {},
        create: {
          code: 'TRF-001',
          name: 'Traffic offence',
          description: 'General traffic offence observation.',
          demoFineAmount: '25.00',
        },
      });
      // The ten requested categories come from the catalogue data migration.
      // Preserve these distinct older examples without overwriting admin edits.
      for (const [code, name, amount, points] of [
        ['TRF-SIG', 'Failure to obey traffic signal', 120, 4],
        ['TRF-RDW', 'Unroadworthy vehicle', 80, 2],
        ['TRF-DIS', 'Distracted driving', 90, 2],
      ] as const) {
        await tx.offenceCategory.upsert({
          where: { code },
          update: {},
          create: {
            code,
            name,
            description:
              'Configured academic reference value; not an official penalty.',
            demoFineAmount: amount,
            demeritPoints: points,
            paymentDueDays: 30,
          },
        });
      }
    },
    { timeout: 60000 },
  );
  console.log(
    'Development accounts, ABC1234 and traffic category seeded. Existing records preserved; seeded account sessions revoked.',
  );
}
seed()
  .catch((error: unknown) => {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'UNKNOWN';
    console.error(
      `Seed error code: ${/^P\d{4}$/.test(code) ? code : 'UNKNOWN'}`,
    );
    console.error(
      'Seed failed. Check database access and DEMO_PASSWORD (minimum 12 characters). Production requires ALLOW_DEMO_SEED=true and an empty user table.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
