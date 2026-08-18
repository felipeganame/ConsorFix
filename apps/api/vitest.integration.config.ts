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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/db/schema/**'],
      // Umbrales POR MÓDULO y no globales: un promedio del paquete se puede
      // subir cubriendo cualquier cosa, y lo que la regla 7 exige es cobertura
      // en clasificación, RBAC y tickets concretamente.
      //
      // Los valores están apenas por debajo de lo medido hoy, así que actúan
      // como cremallera. `bot` y `webhooks` quedan sin umbral a propósito: hoy
      // están en 10% y 16%, y poner una meta inalcanzable solo dejaría el CI
      // rojo. Son la próxima deuda a atacar, no una que se pueda tapar acá.
      thresholds: {
        'src/tickets/**': { lines: 80, functions: 65 },
        'src/me/**': { lines: 90 },
        'src/auth/**': { lines: 80, functions: 80 },
        'src/metrics/**': { lines: 80 },
        'src/gastos/**': { lines: 60 },
      },
    },
    testTimeout: 30000,
    hookTimeout: 60000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // misma DB = no paralelizar
    },
  },
});
