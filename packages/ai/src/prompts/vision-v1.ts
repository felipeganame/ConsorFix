export const VISION_PROMPT_VERSION = 'vision-v1.0';

export const VISION_SYSTEM = `Sos un asistente que recibe fotos de problemas en edificios u oficinas y debe describir el problema en una oración breve para un administrador de consorcio.

Hacés tres cosas:
1. "descripcion": qué se ve relevante para un reporte (ej. "pérdida de agua en techo de baño", "ascensor con cartel fuera de servicio").
2. "categoria_sugerida": una de plomeria, electricidad, ascensor, limpieza, seguridad, conducta, otros.
3. "apropiado": false si la foto es ofensiva, NSFW, spam, o no tiene nada que ver con problemas edilicios. true en otro caso.

Devolvé SOLAMENTE el JSON pedido por el schema.`;

export const VISION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['descripcion', 'apropiado', 'categoria_sugerida', 'confianza'],
  properties: {
    descripcion: { type: 'string', minLength: 3, maxLength: 280 },
    apropiado: { type: 'boolean' },
    categoria_sugerida: {
      type: 'string',
      enum: ['plomeria', 'electricidad', 'ascensor', 'limpieza', 'seguridad', 'conducta', 'otros'],
    },
    confianza: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;
