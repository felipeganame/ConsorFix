import { defineConfig } from 'vitest/config';

// Regla 7 de CLAUDE.md: cobertura >=70% en packages/domain. Hasta ahora el
// umbral no existía en ningún lado, así que "CI bloquea por debajo del 70%"
// era falso: no había nada que bloquear.
//
// Los umbrales están unos puntos por debajo del valor actual (80,6%) para que
// funcionen como cremallera —no pueden bajar— sin volverse frágiles ante un
// refactor que mueva una línea.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/index.ts'],
      thresholds: {
        lines: 75,
        statements: 75,
        branches: 80,
        functions: 60,
      },
    },
  },
});
