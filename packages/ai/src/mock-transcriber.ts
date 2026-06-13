import type { ITranscriber } from './ports.js';

/**
 * Transcriber determinístico para dev/tests.
 * Devuelve un texto canónico — los tests pueden inyectar otro adapter.
 */
export class MockTranscriber implements ITranscriber {
  async transcribe(_audio: ArrayBuffer, _opts: { language?: string }) {
    return {
      text: 'Hola, hay una pérdida de agua en el palier del cuarto piso.',
      modelVersion: 'mock-transcriber@0.0.1',
    };
  }
}
