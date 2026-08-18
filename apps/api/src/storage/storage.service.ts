import { Injectable, Logger } from '@nestjs/common';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

/**
 * Almacenamiento de objetos S3-compatible (MinIO en dev) — RF-B09.
 *
 * Antes de esto, las fotos y audios que mandaban los residentes se descargaban
 * de Meta, se pasaban al modelo de visión o de transcripción, y **se
 * descartaban**. La tabla `media` existía y nunca se escribía. Como las URLs de
 * Meta expiran en minutos, la evidencia fotográfica de cada ticket se perdía
 * para siempre — justo lo que sirve para justificar un gasto ante un consorcio.
 *
 * Si el storage no está configurado, `subir` devuelve null y el flujo del bot
 * sigue: perder la foto es malo, pero perder el reporte es peor.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly client: S3Client | null;
  private readonly publicBase: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.log.warn('storage sin configurar (S3_*): la media NO se va a persistir');
      this.client = null;
      this.publicBase = '';
      return;
    }

    this.client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? 'us-east-1',
      credentials: { accessKeyId, secretAccessKey },
      // MinIO no soporta el estilo virtual-host por defecto.
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
    });
    this.publicBase = `${endpoint.replace(/\/$/, '')}/${this.bucket}`;
  }

  get habilitado(): boolean {
    return this.client !== null;
  }

  /**
   * Sube un objeto y devuelve su URL, o null si el storage no está disponible.
   *
   * La clave incluye el tenant para que un listado accidental no cruce
   * administraciones, y un UUID para que dos archivos con el mismo nombre no se
   * pisen.
   */
  async subir(
    tenantId: string,
    tipo: 'foto' | 'audio' | 'comprobante',
    bytes: ArrayBuffer,
    contentType: string,
  ): Promise<{ url: string; key: string; sizeBytes: number } | null> {
    if (!this.client) return null;

    const ext = extensionDe(contentType);
    const key = `${tenantId}/${tipo}/${randomUUID()}${ext}`;
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: new Uint8Array(bytes),
          ContentType: contentType,
        }),
      );
      return { url: `${this.publicBase}/${key}`, key, sizeBytes: bytes.byteLength };
    } catch (err) {
      // No se propaga: el reporte del residente vale más que su adjunto.
      this.log.error({ err: (err as Error).message, key }, 'no se pudo subir la media');
      return null;
    }
  }
}

function extensionDe(contentType: string): string {
  const mapa: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
  };
  return mapa[contentType.split(';')[0]!.trim().toLowerCase()] ?? '';
}
