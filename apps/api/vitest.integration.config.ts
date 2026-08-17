import { defineConfig } from 'vitest/config';

// Tests de integración: ejercitan servicios/controllers contra la DB real
// (postgres up + migraciones aplicadas), igual que la suite de isolation.
// Crean su propia data con prefijo único y limpian por cascade.
// Requiere DATABASE_URL (rol app, RLS aplica) y DATABASE_OWNER_URL.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // misma DB = no paralelizar
    },
  },
});
