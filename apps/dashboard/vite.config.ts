import { defineConfig } from 'vitest/config';
export default defineConfig({
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
});
