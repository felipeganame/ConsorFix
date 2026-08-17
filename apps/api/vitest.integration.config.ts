import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

// Tests de integración: ejercitan servicios/controllers contra la DB real
// (postgres up + migraciones aplicadas), igual que la suite de isolation.
// Crean su propia data con prefijo único y limpian por cascade.
// Requiere DATABASE_URL (rol app, RLS aplica) y DATABASE_OWNER_URL.
//
// El transform es SWC y no el esbuild por defecto de vitest: esbuild NO emite
// metadata de decoradores, así que la inyección de dependencias de NestJS
// queda rota y los guards se instancian sin sus dependencias. Ese era el
// motivo por el que los tests previos llamaban a los servicios a mano
// (`new MeService()`) en vez de pegarle por HTTP — y por el que ningún guard
// estaba cubierto mientras tres endpoints filtraban datos privados.
export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // misma DB = no paralelizar
    },
  },
});
