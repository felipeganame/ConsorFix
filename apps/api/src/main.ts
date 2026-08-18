import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json } from 'express';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Capture raw body for HMAC signature verification on /webhooks/whatsapp.
  // Captura del rawBody para verificar la firma HMAC de los webhooks.
  const capturarRaw = (req: unknown, _res: unknown, buf: Buffer): void => {
    (req as { rawBody?: Buffer }).rawBody = buf;
  };

  // El límite grande va SOLO en la importación masiva, y va PRIMERO porque el
  // primer `json()` que matchea gana.
  //
  // Ponerlo global —como estaba— multiplicaba por 40 la superficie de DoS sin
  // autenticar: cualquiera podía postear 4 MB a /auth/login o al webhook, y con
  // el throttler en 120 req/min una sola IP pasaba de mover 12 MB a 480 MB. Todo
  // para resolver el problema de un endpoint que solo usa un ADMIN. Encima el
  // `verify` guarda el body dos veces (Buffer + objeto parseado).
  app.use(
    '/import',
    json({ limit: process.env.API_IMPORT_BODY_LIMIT ?? '4mb', verify: capturarRaw }),
  );

  // El resto queda acotado. El default de express son 100 KB; se sube un poco
  // por los payloads de webhook con media y varios mensajes.
  app.use(json({ limit: process.env.API_BODY_LIMIT ?? '256kb', verify: capturarRaw }));
  const port = Number(process.env.API_PORT ?? 3000);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('API bootstrap failed', err);
  process.exit(1);
});
