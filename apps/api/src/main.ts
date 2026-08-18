import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Capture raw body for HMAC signature verification on /webhooks/whatsapp.
  app.use(
    json({
      // El default de express son 100 KB, así que el `max(2_000_000)` del zod
      // en la importación masiva era inalcanzable: una planilla de 3.000
      // unidades moría con un 413 crudo y el informe fila-por-fila que exige
      // RF-A05 nunca se generaba.
      limit: process.env.API_BODY_LIMIT ?? '4mb',
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API bootstrap failed', err);
  process.exit(1);
});
