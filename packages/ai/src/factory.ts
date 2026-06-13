import { AnthropicClassifier } from './anthropic-classifier.js';
import { AnthropicVision } from './anthropic-vision.js';
import { GoogleClassifier } from './google-classifier.js';
import { MockClassifier } from './mock-classifier.js';
import { MockEmbedder } from './mock-embedder.js';
import { MockTranscriber } from './mock-transcriber.js';
import { MockVision } from './mock-vision.js';
import { OpenAIClassifier } from './openai-classifier.js';
import { OpenAIEmbedder } from './openai-embedder.js';
import { OpenAITranscriber } from './openai-transcriber.js';
import { OpenAIVision } from './openai-vision.js';
import { VoyageEmbedder } from './voyage-embedder.js';
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
      return new OpenAIClassifier(key);
    }
    case 'anthropic': {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return warnFallback('ANTHROPIC_API_KEY', new MockClassifier());
      return new AnthropicClassifier(key);
    }
    case 'google': {
      const key = process.env.GOOGLE_API_KEY;
      if (!key) return warnFallback('GOOGLE_API_KEY', new MockClassifier());
      return new GoogleClassifier(key);
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
      return new OpenAIEmbedder(key);
    }
    case 'voyage': {
      const key = process.env.VOYAGE_API_KEY;
      if (!key) return warnFallback('VOYAGE_API_KEY', new MockEmbedder());
      return new VoyageEmbedder(key);
    }
    case 'mock':
    default:
      return new MockEmbedder();
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
    default:
      return new MockTranscriber();
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
