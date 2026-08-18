import type { ClassifierOutput } from './schemas.js';

/**
 * Consumo de una llamada al proveedor (RF-C07).
 *
 * Los adaptadores sobre el AI SDK lo obtienen sin costo extra: `generateObject`
 * y `embed` ya lo devuelven. Antes se descartaba, y por eso no se podía
 * responder cuánto sale clasificar un ticket.
 */
export interface UsoIa {
  tokensIn?: number;
  tokensOut?: number;
  /** Calculado en el adaptador con la tarifa vigente al momento de la llamada. */
  costoUsd?: number;
  latenciaMs?: number;
  cacheHit?: boolean;
}

export interface ITranscriber {
  transcribe(audio: ArrayBuffer, opts: { language?: string }): Promise<{ text: string; modelVersion: string }>;
}

export interface IClassifier {
  classify(text: string, opts: { promptVersion: string }): Promise<ClassifierOutput & { uso?: UsoIa }>;
}

export interface IEmbedder {
  embed(text: string): Promise<{ vector: number[]; modelVersion: string }>;
}

export interface ImageVisionOutput {
  /** Texto descriptivo del contenido relevante para el reporte. */
  descripcion: string;
  /** ¿Es contenido apropiado (no NSFW / no spam)? */
  apropiado: boolean;
  /** Categoría sugerida del problema visualizado. */
  categoria_sugerida: 'plomeria' | 'electricidad' | 'ascensor' | 'limpieza' | 'seguridad' | 'conducta' | 'otros';
  confianza: number;
  modelo: string;
}

export interface IImageVision {
  describe(
    image: ArrayBuffer,
    opts: { contentType?: string; promptVersion: string },
  ): Promise<ImageVisionOutput>;
}
