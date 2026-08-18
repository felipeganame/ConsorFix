import type { IClassifier } from './ports.js';
import { ClassifierOutput } from './schemas.js';

/**
 * Mock classifier — deterministic heuristics on the input text.
 * Used in dev + tests to avoid burning real API credits. Same I/O contract
 * as the real LLM-backed implementation.
 */
export class MockClassifier implements IClassifier {
  async classify(text: string, opts: { promptVersion: string }) {
    const lower = text.toLowerCase();
    const urgencia =
      /fuego|gas|incendio|inundaci/.test(lower)
        ? 'CRITICA'
        : /pérdida|perdida|fuga|sin luz|ascensor|electric/.test(lower)
          ? 'ALTA'
          : 'MEDIA';
    const categoria =
      /plomer|agua|pérdida|perdida|caño/.test(lower)
        ? 'plomeria'
        : /luz|electric|cable/.test(lower)
          ? 'electricidad'
          : /ascensor/.test(lower)
            ? 'ascensor'
            : /ruido|ruidos|molest|vecin/.test(lower)
              ? // 'conducta', no 'ruidos': esta última no está en el vocabulario
                // del prompt, así que ningún proveedor real podría devolverla.
                'conducta'
              : /basura|suciedad|limpiez/.test(lower)
                ? 'limpieza'
                : /robo|inseguridad|portón|porton|reja|camara|cámara/.test(lower)
                  ? 'seguridad'
                  : 'otros';
    const origen =
      /palier|cochera|sum|hall|escaler|pasillo|comun|jardin|parrilla|pileta|piscina/.test(lower)
        ? 'ESPACIO_COMUN'
        : 'UNIDAD';

    const candidate = {
      titulo: text.slice(0, 80).trim() || 'Reporte sin descripción',
      descripcion_normalizada: text.trim(),
      categoria,
      origen,
      urgencia,
      ubicacion: undefined,
      confianza: 0.82,
      modelo: 'mock-classifier@0.0.1',
      prompt_version: opts.promptVersion,
    };
    return ClassifierOutput.parse(candidate);
  }
}
