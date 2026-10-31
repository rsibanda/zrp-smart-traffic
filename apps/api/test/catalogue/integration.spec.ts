import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../../generated/client';

config({ path: resolve(__dirname, '../../../../.env') });
jest.setTimeout(30000);

it('installs ten demonstration categories without duplicates, preserving existing IDs and unrelated entries', async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error('Local fixtures only');
  const db = new PrismaClient();
  const schema = `catalogue_${randomUUID().replaceAll('-', '')}`;
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../prisma/migrations/20261031090000_offence_catalogue/migration.sql',
    ),
    'utf8',
  );
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
      await tx.$executeRawUnsafe(
        'CREATE TABLE "OffenceCategory" (LIKE public."OffenceCategory" INCLUDING ALL)',
      );
      const existingId = randomUUID();
      await tx.$executeRaw`INSERT INTO "OffenceCategory" (id, code, name, description, "demoFineAmount", "demeritPoints") VALUES (${existingId}::uuid, 'TRF-SPD', 'Speeding', 'Existing example', 150, 3)`;
      await tx.$executeRaw`INSERT INTO "OffenceCategory" (id, code, name, description, "demoFineAmount", "demeritPoints") VALUES (${randomUUID()}::uuid, 'TRF-001', 'Traffic offence', 'Existing fallback', 25, 0)`;
      // Match an existing label even when an administrator used a different code.
      await tx.$executeRaw`INSERT INTO "OffenceCategory" (id, code, name, description, "demoFineAmount", "demeritPoints") VALUES (${randomUUID()}::uuid, 'CUSTOM-PARK', 'Illegal parking', 'Configured example', 40, 1)`;
      await tx.$executeRawUnsafe(migration);
      await tx.$executeRawUnsafe(migration);
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          name: string;
          demoFineAmount: { toString(): string };
          demeritPoints: number;
        }>
      >`SELECT * FROM "OffenceCategory"`;
      expect(rows).toHaveLength(11);
      expect(rows.find((r) => r.name === 'Speeding')).toMatchObject({
        id: existingId,
        demeritPoints: 3,
      });
      for (const [name, amount, points] of [
        ['Speeding', 50, 3],
        ['Drunk driving (DUI)', 200, 6],
        ['Running a red light', 80, 4],
        ['Mobile phone use while driving', 40, 3],
        ['Reckless driving', 150, 6],
        ['Driving without a valid licence', 100, 5],
        ['Failure to wear a seatbelt', 30, 2],
        ['Illegal parking', 25, 0],
        ['Driving an unregistered vehicle', 75, 3],
        ['Failure to obey traffic signs', 40, 2],
      ] as const) {
        const row = rows.find((r) => r.name === name)!;
        expect(row.demoFineAmount.toString()).toBe(String(amount));
        expect(row.demeritPoints).toBe(points);
      }
      // The schema is test-generated and contains only this temporary catalogue.
      await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  } finally {
    await db.$disconnect();
  }
});
