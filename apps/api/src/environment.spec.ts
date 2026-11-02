import { runtimeConfig } from './environment';
import { resolve } from 'path';
const production = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example',
  CORS_ORIGIN: 'https://traffic.netlify.app',
  EVIDENCE_DIRECTORY: resolve('storage'),
};
describe('deployment configuration', () => {
  it('permits remote evidence without a disk only with complete HTTPS storage configuration', () => {
    const env = {
      ...production,
      EVIDENCE_DIRECTORY: undefined,
      EVIDENCE_STORAGE: 's3',
      EVIDENCE_S3_BUCKET: 'private-evidence',
      AWS_ENDPOINT_URL_S3: 'https://storage.example',
      AWS_REGION: 'eu-central-1',
      AWS_ACCESS_KEY_ID: 'test-key',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
    };
    expect(() => runtimeConfig(env)).not.toThrow();
    expect(() =>
      runtimeConfig({ ...env, AWS_SECRET_ACCESS_KEY: '' }),
    ).toThrow();
    expect(() =>
      runtimeConfig({ ...env, AWS_ENDPOINT_URL_S3: 'http://storage.example' }),
    ).toThrow();
  });
  it('preserves local defaults and binds production to the host network', () => {
    expect(runtimeConfig({}).host).toBe('127.0.0.1');
    expect(runtimeConfig(production).host).toBe('0.0.0.0');
  });
  it('requires exact HTTPS origins and persistent storage in production', () => {
    for (const CORS_ORIGIN of [
      '',
      '*',
      'http://traffic.netlify.app',
      'https://traffic.netlify.app/path',
    ])
      expect(() => runtimeConfig({ ...production, CORS_ORIGIN })).toThrow();
    expect(() =>
      runtimeConfig({ ...production, EVIDENCE_DIRECTORY: 'relative' }),
    ).toThrow();
    expect(() => runtimeConfig({ ...production, DATABASE_URL: '' })).toThrow();
    expect(() =>
      runtimeConfig({ ...production, TRUST_PROXY: 'true' }),
    ).toThrow();
  });
});
