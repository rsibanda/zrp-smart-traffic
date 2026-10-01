import { afterEach, expect, it, vi } from 'vitest';
import { responseError, serviceUnavailable } from './api';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('uses the backend origin for protected, public and evidence routes', async () => {
  vi.stubEnv('VITE_API_URL', 'https://traffic.example/');
  vi.resetModules();
  const { apiUrl } = await import('./api');
  for (const path of ['/auth/login', '/public/tickets/verify', '/evidence/id'])
    expect(apiUrl(path)).toBe(`https://traffic.example/api/v1${path}`);
});
it('keeps the local proxy when no origin is supplied', async () => {
  vi.stubEnv('VITE_API_URL', '');
  expect((await import('./api')).apiUrl('/auth/me')).toBe('/api/v1/auth/me');
});
it('sanitizes gateway error responses', async () => {
  expect(
    (
      await responseError(
        new Response('<html>private diagnostic</html>', { status: 502 }),
      )
    ).message,
  ).toBe(serviceUnavailable);
});
