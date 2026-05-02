import { defineConfig } from 'vitest/config';

// Integration tests use the real Cloudflare Workers runtime via @cloudflare/vitest-pool-workers.
// Requires native rollup binaries — run in a standard terminal or CI, not from Electron-based tools.
export default defineConfig({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
    include: ['test/routes/**/*.test.ts', 'test/**/*.integration.test.ts'],
  },
});
