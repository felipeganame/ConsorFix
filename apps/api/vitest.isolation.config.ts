import { defineConfig } from 'vitest/config';

// Suite crítica: aislamiento multi-tenant por RLS (RF-H02).
// Requiere postgres up con migraciones aplicadas. Si DATABASE_URL no está,
// los tests fallan ruidosamente (intencional — esta suite no se mockea).
export default defineConfig({
  test: {
    include: ['test/isolation/**/*.test.ts'],
    // El proveedor de IA se fija en `mock` a propósito.
    //
    // Sin esto los tests heredan el `AI_PROVIDER` del `.env` de quien los corre:
    // con una API key puesta, seis casos del bot fallaban —el clasificador real
    // normaliza los textos distinto que el stub y el umbral de dedup pasa de 0.55
    // a 0.85— mientras en CI, que no tiene key, pasaban. Un test que depende de
    // quién lo ejecuta no prueba nada. Y de paso: cada corrida completa dejaría
    // de ser gratis y dependería de que la red ande.
    env: {
      AI_PROVIDER: 'mock',
      AI_CLASSIFIER_PROVIDER: 'mock',
      AI_EMBEDDER_PROVIDER: 'mock',
      AI_TRANSCRIBER_PROVIDER: 'mock',
      AI_VISION_PROVIDER: 'mock',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // misma DB = no paralelizar
    },
  },
});
