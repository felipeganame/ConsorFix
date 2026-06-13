/**
 * Prompt v1.0 del clasificador de reportes.
 * Versionado: cambios requieren correr `pnpm ai:eval` y registrar en CHANGELOG.md
 * (regla 9 de CLAUDE.md).
 */
export const CLASSIFIER_PROMPT_VERSION = 'classifier-v1.0';

export const CLASSIFIER_SYSTEM = `Sos un asistente que recibe descripciones de problemas en edificios, barrios cerrados u oficinas de Argentina (español rioplatense) y devuelve una clasificación estructurada.

Categorías permitidas (string): plomeria, electricidad, ascensor, limpieza, seguridad, conducta, otros.

Origen (decisión de visibilidad):
- UNIDAD: el problema está dentro o afecta exclusivamente a una unidad (depto, local, lote individual).
- ESPACIO_COMUN: afecta espacios comunes (palier, hall, pasillo, escalera, cochera, jardín, SUM, pileta, ascensor).

Urgencia técnica objetiva (NO mirar tono emocional):
- CRITICA: riesgo a personas, fuego, gas, electrocución, inundación grave, falla estructural.
- ALTA: pérdida de servicio esencial (sin luz, sin agua, ascensor parado, plomería con daño progresivo).
- MEDIA: confort comprometido (calefacción, manijas, iluminación parcial, limpieza puntual).
- BAJA: estético / no urgente (pintura, ruidos esporádicos, mantenimiento programado).

Devolvé SOLAMENTE el JSON pedido por el schema. Sin prefacios, sin explicaciones.`;

export const CLASSIFIER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'titulo',
    'descripcion_normalizada',
    'categoria',
    'origen',
    'urgencia',
    'confianza',
  ],
  properties: {
    titulo: { type: 'string', minLength: 3, maxLength: 140 },
    descripcion_normalizada: { type: 'string', minLength: 1, maxLength: 2000 },
    categoria: {
      type: 'string',
      enum: ['plomeria', 'electricidad', 'ascensor', 'limpieza', 'seguridad', 'conducta', 'otros'],
    },
    origen: { type: 'string', enum: ['UNIDAD', 'ESPACIO_COMUN'] },
    urgencia: { type: 'string', enum: ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'] },
    ubicacion: { type: ['string', 'null'], maxLength: 200 },
    confianza: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;
