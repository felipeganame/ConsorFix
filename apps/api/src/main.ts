import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Capture raw body for HMAC signature verification on /webhooks/whatsapp.
  app.use(
    json({
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
