import { isAbsolute } from 'path';
export function runtimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const storage = env.EVIDENCE_STORAGE ?? 'local';
  if (!['local', 's3'].includes(storage))
    throw new Error('Invalid EVIDENCE_STORAGE');
  if (storage === 's3') {
    for (const name of [
      'EVIDENCE_S3_BUCKET',
      'AWS_ENDPOINT_URL_S3',
      'AWS_REGION',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
    ])
      if (!env[name])
        throw new Error(`Missing ${name} for private evidence storage`);
    const endpoint = new URL(env.AWS_ENDPOINT_URL_S3!);
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error(
        'Storage endpoint must be HTTPS without credentials or query parameters',
      );
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid PORT');
  const origins = (
    env.CORS_ORIGIN ??
    env.WEB_ORIGIN ??
    (production ? '' : 'http://localhost:5173')
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origins.length) throw new Error('CORS_ORIGIN is required in production');
  for (const origin of origins) {
    const url = new URL(origin);
    if (
      url.origin !== origin ||
      !['http:', 'https:'].includes(url.protocol) ||
      (production && url.protocol !== 'https:')
    )
      throw new Error(
        'CORS_ORIGIN requires exact origins, HTTPS in production',
      );
  }
  if (production && !env.DATABASE_URL)
    throw new Error('DATABASE_URL is required');
  if (
    production &&
    storage === 'local' &&
    (!env.EVIDENCE_DIRECTORY || !isAbsolute(env.EVIDENCE_DIRECTORY))
  )
    throw new Error(
      'EVIDENCE_DIRECTORY requires an absolute persistent-volume path',
    );
  const trustProxy = env.TRUST_PROXY?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (trustProxy?.some((s) => ['true', '*', '0.0.0.0/0', '::/0'].includes(s)))
    throw new Error('Specify trusted proxy addresses or subnets');
  return {
    production,
    port,
    origins,
    trustProxy,
    host: env.HOST ?? (production ? '0.0.0.0' : '127.0.0.1'),
  };
}
