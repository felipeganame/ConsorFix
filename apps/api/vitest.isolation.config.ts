import { defineConfig } from 'vitest/config';

// Suite crítica: aislamiento multi-tenant por RLS (RF-H02).
// Requiere postgres up con migraciones aplicadas. Si DATABASE_URL no está,
// los tests fallan ruidosamente (intencional — esta suite no se mockea).
export default defineConfig({
  test: {
    include: ['test/isolation/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // misma DB = no paralelizar
    },
  },
});
