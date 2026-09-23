// Applies migrations and seed in a unique disposable schema, preserving the demo schema.
import {config} from 'dotenv';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {PrismaClient} from '../apps/api/generated/client/index.js';
config({path: '.env'});
const schema = `verification_${randomBytes(8).toString('hex')}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set('schema', schema);
const env = {...process.env, DATABASE_URL: url.toString()};
const db = new PrismaClient({datasources: {db: {url: url.toString()}}});
try {
  execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma'], {env, stdio: 'pipe'});
  execFileSync(process.execPath, ['node_modules/ts-node/dist/bin.js', '--project', 'apps/api/tsconfig.tools.json', 'apps/api/prisma/seed.ts'], {env, stdio: 'pipe'});
  const [users, vehicle, incidents, checkpoints, alerts] = await Promise.all([db.user.count(), db.vehicle.count(), db.incident.count(), db.checkpoint.count(), db.trafficAlert.count()]);
  if (users !== 5 || vehicle < 1 || incidents < 1 || checkpoints < 1 || alerts < 1) throw new Error('Fresh seed verification failed');
  console.log('PASS: all migrations and fictional seed data on a fresh disposable schema. Existing demo records preserved.');
} finally {
  if (!/^verification_[a-f0-9]{16}$/.test(schema)) throw new Error('Unexpected disposable schema name');
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
}
