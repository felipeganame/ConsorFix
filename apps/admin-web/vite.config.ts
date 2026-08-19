import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * El destino del proxy sale del entorno, no de una constante.
 *
 * `API_PORT` ya existía y el resto del monorepo la respeta —la API para
 * escuchar, el worker para llamarla, la app móvil vía `EXPO_PUBLIC_API_URL`—
 * pero acá el puerto estaba escrito a mano. Cambiar `API_PORT` levantaba la API
 * en el puerto nuevo y dejaba al panel pegándole al 3000, así que todo el panel
 * fallaba con un error de red y nada indicaba por qué.
 *
 * Se acepta `API_URL` completa (por si la API vive en otra máquina) y, si no
 * está, se arma con `API_PORT`. El 3000 queda como default para no cambiarle el
 * entorno a nadie que no haya definido las variables.
 */
const apiTarget =
  process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.ADMIN_WEB_PORT ?? 5173),
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
