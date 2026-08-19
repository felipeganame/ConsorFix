import { SdkClassifier } from './sdk-classifier.js';
import { SdkEmbedder } from './sdk-embedder.js';
import { AnthropicVision } from './anthropic-vision.js';
import { MockClassifier } from './mock-classifier.js';
import { MockEmbedder } from './mock-embedder.js';
import { MockTranscriber } from './mock-transcriber.js';
import { MockVision } from './mock-vision.js';
import { OpenAITranscriber } from './openai-transcriber.js';
import { OpenAIVision } from './openai-vision.js';
import type { IClassifier, IEmbedder, IImageVision, ITranscriber } from './ports.js';

export type ClassifierProvider = 'mock' | 'openai' | 'anthropic' | 'google';
export type EmbedderProvider = 'mock' | 'openai' | 'voyage';
export type TranscriberProvider = 'mock' | 'openai';
export type VisionProvider = 'mock' | 'openai' | 'anthropic';

/**
 * Resuelve qué adapter de IA usar por capacidad.
 *   AI_<CAPABILITY>_PROVIDER se evalúa primero; si falta cae a AI_PROVIDER; default mock.
 *   Cada provider requiere su key correspondiente:
 *     openai    → OPENAI_API_KEY
 *     anthropic → ANTHROPIC_API_KEY
 *     google    → GOOGLE_API_KEY
 *     voyage    → VOYAGE_API_KEY
 *   Si falta la key, se loggea warning y se cae a Mock.
 *
 * Permite mezclar (ej. clasificar con Claude, embedear con OpenAI,
 * transcribir con Whisper, vision con Claude) variando solo env.
 */
export function createClassifier(): IClassifier {
  const provider = (process.env.AI_CLASSIFIER_PROVIDER ?? process.env.AI_PROVIDER ?? 'mock') as ClassifierProvider;
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return warnFallback('OPENAI_API_KEY', new MockClassifier());
      return new SdkClassifier('openai', key);
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return warnFallback('ANTHROPIC_API_KEY', new MockClassifier());
      return new SdkClassifier('anthropic', key);
    }
    case 'google': {
      const key = process.env.GOOGLE_API_KEY;
      if (!key) return warnFallback('GOOGLE_API_KEY', new MockClassifier());
      return new SdkClassifier('google', key);
    }
    case 'mock':
    default:
      return new MockClassifier();
  }
}

export function createEmbedder(): IEmbedder {
  const provider = (process.env.AI_EMBEDDER_PROVIDER ?? process.env.AI_PROVIDER ?? 'mock') as EmbedderProvider;
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return warnFallback('OPENAI_API_KEY (embedder)', new MockEmbedder());
      return new SdkEmbedder(key);
    }
    case 'voyage': {
      // Voyage NO soporta output_dimension=384 (acepta 256/512/1024) y el
      // adaptador trunca y rellena con ceros, lo que rompe la norma del vector
      // y por lo tanto el coseno del dedup. Está mal hoy, así que no se ofrece
      // hasta arreglarlo o migrar la columna.
      // eslint-disable-next-line no-console
      console.warn('[ai] el embedder de Voyage produce vectores inválidos para vector(384) — usando mock');
      return new MockEmbedder();
    }
    case 'mock':
      return new MockEmbedder();
    default:
      return warnProveedorNoSoportado('embedder', provider, ['openai', 'mock'], new MockEmbedder());
  }
}

export function createTranscriber(): ITranscriber {
  const provider = (process.env.AI_TRANSCRIBER_PROVIDER ?? process.env.AI_PROVIDER ?? 'mock') as TranscriberProvider;
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return warnFallback('OPENAI_API_KEY (transcriber)', new MockTranscriber());
      return new OpenAITranscriber(key);
    }
    case 'mock':
      return new MockTranscriber();
    default:
      return warnProveedorNoSoportado('transcriber', provider, ['openai', 'mock'], new MockTranscriber());
  }
}

export function createVision(): IImageVision {
  const provider = (process.env.AI_VISION_PROVIDER ?? process.env.AI_PROVIDER ?? 'mock') as VisionProvider;
  switch (provider) {
    case 'openai': {
      const key = process.env.OPENAI_API_KEY;
      if (!key) return warnFallback('OPENAI_API_KEY (vision)', new MockVision());
      return new OpenAIVision(key);
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return warnFallback('ANTHROPIC_API_KEY (vision)', new MockVision());
      return new AnthropicVision(key);
    }
    case 'mock':
    default:
      return new MockVision();
  }
}

function warnFallback<T>(missingEnv: string, fallback: T): T {
  // eslint-disable-next-line no-console
  console.warn(`[ai] ${missingEnv} missing — falling back to mock`);
  return fallback;
}

/**
 * Avisa cuando el proveedor configurado NO existe para esta pieza del pipeline.
 *
 * Es el caso de `AI_PROVIDER=anthropic`: Anthropic no tiene API de embeddings ni
 * de transcripción, así que el embedder y el transcriber caían al `default` y
 * devolvían el mock **sin decir nada**. Se veía el clasificador contestando de
 * verdad y era razonable concluir que todo el pipeline era real, mientras el
 * dedup comparaba vectores falsos y los audios traían texto inventado. Para una
 * tesis eso es peor que un error: es una medición que parece válida.
 */
function warnProveedorNoSoportado<T>(
  pieza: string,
  provider: string,
  soportados: readonly string[],
  fallback: T,
): T {
  // eslint-disable-next-line no-console
  console.warn(
    `[ai] ${pieza}: el proveedor "${provider}" no está soportado (solo ${soportados.join(', ')}) — ` +
      `usando mock. Configurá AI_${pieza.toUpperCase()}_PROVIDER aparte si querés uno real.`,
  );
  return fallback;
}
