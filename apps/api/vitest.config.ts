import { defineConfig } from 'vitest/config';

// Unit tests for the API. Excludes test/isolation/** which needs a live DB
// and is run separately via `pnpm test:isolation`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/unit/**/*.test.ts'],
    exclude: ['test/isolation/**', 'node_modules/**', 'dist/**'],
    passWithNoTests: true,
  },
});
