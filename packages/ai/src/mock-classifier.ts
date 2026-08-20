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

    // El modelo real distingue qué quiere el vecino (`intencion`) y puede no
    // clasificar nada. El mock imita eso, si no esos caminos del bot no se
    // podrían testear sin gastar una llamada paga. Los patrones son deliberadamente
    // angostos —texto enteramente social, o una pregunta explícita por reportes
    // propios—: todos los casos del dataset de evaluación traen un problema
    // adentro, así que la baseline no se mueve.
    const soloSocial =
      /^[\s\p{P}]*(?:(?:hola|buenas|buen\s+d[íi]a|buenas\s+(?:tardes|noches)|gracias|no\s+te\s+dije\s+gracias|chau|saludos|todo\s+bien|c[óo]mo\s+(?:va|and[áa]s|est[áa]s))[\s\p{P}]*)+$/iu.test(
        lower.trim(),
      );
    // Pregunta por reportes propios: pide un verbo/sustantivo de seguimiento y
    // que NO haya nada roto en la frase, así "se rompió el ascensor, alguna
    // novedad?" sigue siendo un reporte.
    const preguntaEstado =
      /\?|^(?:como|cómo|que|qué|cual|cuál|hay|tengo|ya)\b/i.test(text.trim()) &&
      /\b(?:reporte|reportes|reclamo|reclamos|registro|registros|ticket|novedad|novedades|pendiente|pendientes|estado)\b/i.test(
        lower,
      ) &&
      !/\b(?:romp|rot[oa]|perd|fuga|filtra|no funciona|no anda|sin luz|sin agua|olor|ruido|sucio|basura)/i.test(lower);

    const intencion = soloSocial ? 'OTRO' : preguntaEstado ? 'CONSULTA_ESTADO' : null;
    if (intencion) {
      return ClassifierOutput.parse({
        intencion,
        titulo: 'Sin reporte',
        descripcion_normalizada: text.trim() || '(vacío)',
        tipo: 'INFRAESTRUCTURA',
        categoria: 'otros',
        origen: 'UNIDAD',
        urgencia: 'BAJA',
        confianza: 0.9,
        modelo: 'mock-classifier@0.0.1',
        prompt_version: opts.promptVersion,
      });
    }
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

    // El mock deriva el tipo de la categoría: es una heurística pobre a
    // propósito, para que la baseline del eval no se infle.
    const tipo = categoria === 'conducta' ? 'CONDUCTA' : 'INFRAESTRUCTURA';
    const unidadMencionada = /\b(?:del?|la|el)\s+(\d{1,3}\s*[°ºa-zA-Z]{0,3}|lote\s*\d{1,3})\b/i.exec(text);

    const candidate = {
      titulo: text.slice(0, 80).trim() || 'Reporte sin descripción',
      tipo,
      ...(tipo === 'CONDUCTA' && unidadMencionada ? { unidad_reportada_texto: unidadMencionada[1]!.trim() } : {}),
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
