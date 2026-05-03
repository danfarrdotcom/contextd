import { defineConfig } from 'vitest/config';

// Unit tests run in Node environment (no Workers pool, no native rollup needed).
// Integration tests (test/**/*.integration.test.ts) require the Workers pool and
// must be run in a standard terminal or CI — not via Claude Code (Electron restricts
// native module loading which vite-node requires for SSR transforms).
// Run integration tests with: pnpm test:integration
export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
  },
});
