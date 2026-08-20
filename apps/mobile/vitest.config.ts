import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Tests de la lógica pura de la app, corriendo en Node.
 *
 * No se levanta React Native: lo que se prueba es la cola offline, que es la
 * pieza donde un bug se traduce en un reporte perdido. AsyncStorage y expo se
 * resuelven a stubs por alias — son las únicas dependencias nativas que toca
 * este módulo, y stubearlas es más simple y más rápido que arrastrar el preset
 * de jest de Expo entero.
 *
 * Hasta ahora `pnpm test` corría `echo 'mobile tests added in Phase 4'`, así que
 * el paquete reportaba verde en CI sin ejecutar nada.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'test/stubs/async-storage.ts'),
      'expo-constants': path.resolve(__dirname, 'test/stubs/expo-constants.ts'),
    },
  },
});
