import type { IImageVision, ImageVisionOutput } from './ports.js';

/**
 * Mock vision: respuesta canónica. Suficiente para el flow del bot sin red.
 */
export class MockVision implements IImageVision {
  async describe(_image: ArrayBuffer, _opts: { contentType?: string; promptVersion: string }): Promise<ImageVisionOutput> {
    return {
      descripcion: 'foto adjunta del problema reportado',
      apropiado: true,
      categoria_sugerida: 'otros',
      confianza: 0.6,
      modelo: 'mock-vision@0.0.1',
    };
  }
}
