import type { ClassifierOutput } from './schemas.js';

export interface ITranscriber {
  transcribe(audio: ArrayBuffer, opts: { language?: string }): Promise<{ text: string; modelVersion: string }>;
}

export interface IClassifier {
  classify(text: string, opts: { promptVersion: string }): Promise<ClassifierOutput>;
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
