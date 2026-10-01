import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
const envDir = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, envDir, 'VITE_');
  const api = process.env.VITE_API_URL ?? env.VITE_API_URL;
  if (command === 'build' && (process.env.NETLIFY === 'true' || api)) {
    if (!api) throw new Error('Set VITE_API_URL to the HTTPS backend origin');
    const url = new URL(api);
    if (
      url.origin !== api.replace(/\/+$/, '') ||
      !['http:', 'https:'].includes(url.protocol) ||
      (process.env.NETLIFY === 'true' &&
        (url.protocol !== 'https:' ||
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      throw new Error(
        'VITE_API_URL requires an origin without credentials or path; Netlify requires public HTTPS',
      );
  }
  return {
    envDir,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': 'http://127.0.0.1:3000' },
    },
    test: {
      environment: 'jsdom',
      clearMocks: true,
      pool: 'threads',
      maxWorkers: 1,
      fileParallelism: false,
    },
  };
});
