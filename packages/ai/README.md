# @consorciofix/ai

Puertos y adaptadores del pipeline de IA. Nada fuera de este paquete debe
importar un SDK de proveedor (regla 10 de CLAUDE.md): el resto del sistema
consume `IClassifier`, `IEmbedder`, `ITranscriber` e `IImageVision`.

## Cómo se elige el proveedor

`AI_<CAPACIDAD>_PROVIDER` gana; si falta, cae a `AI_PROVIDER`; si falta también,
`mock`. Si el proveedor está configurado pero **falta su API key, se cae a mock
con un warning en vez de fallar** — cómodo en dev, peligroso en producción:
conviene revisar los logs al desplegar.

Esto permite mezclar: clasificar con Claude, embeder con OpenAI, transcribir con
Whisper, todo por env y sin tocar código.

## Variables de entorno

No pude leer `.env.example` (hay una regla de permisos que lo bloquea), así que
esta es la lista derivada de leer el código. **Verificar que estén todas ahí.**

| Variable | Para qué | Default |
|---|---|---|
| `AI_PROVIDER` | Proveedor por defecto de todas las capacidades | `mock` |
| `AI_CLASSIFIER_PROVIDER` | `mock` \| `openai` \| `anthropic` \| `google` | hereda `AI_PROVIDER` |
| `AI_EMBEDDER_PROVIDER` | `mock` \| `openai` \| `voyage` | hereda `AI_PROVIDER` |
| `AI_TRANSCRIBER_PROVIDER` | `mock` \| `openai` | hereda `AI_PROVIDER` |
| `AI_VISION_PROVIDER` | `mock` \| `openai` \| `anthropic` | hereda `AI_PROVIDER` |
| `OPENAI_API_KEY` | Requerida por los adaptadores de OpenAI | — |
| `ANTHROPIC_API_KEY` | Requerida por los adaptadores de Anthropic | — |
| `GOOGLE_API_KEY` | Requerida por el clasificador de Google | — |
| `VOYAGE_API_KEY` | Requerida por el embedder de Voyage | — |
| `AI_CLASSIFIER_MODEL` | Modelo del clasificador | según proveedor |
| `AI_EMBEDDER_MODEL` | Modelo de embeddings | `text-embedding-3-small` |
| `AI_TRANSCRIBER_MODEL` | Modelo de transcripción | `whisper-1` |
| `AI_VISION_MODEL` | Modelo de visión | según proveedor |
| `OPENAI_BASE_URL` | Para apuntar al mock local | `https://api.openai.com/v1` |
| `ANTHROPIC_BASE_URL` | Idem | oficial |
| `GOOGLE_BASE_URL` | Idem | oficial |
| `DEDUP_THRESHOLD` | Umbral de similitud coseno para dedup | `0.85` con openai, `0.55` con mock |

### Para arrancar con IA real solo hace falta la key

```bash
OPENAI_API_KEY=sk-...
AI_PROVIDER=openai
```

Con eso el bot transcribe audios con Whisper, clasifica con GPT y usa embeddings
reales para el dedup. El umbral de dedup se ajusta solo al detectar `openai`,
porque el embedder simulado produce vectores con normas mucho más chicas.

## Evaluación del clasificador

```bash
pnpm ai:eval                                    # baseline con mock
pnpm ai:eval -- --provider openai               # corrida real
pnpm ai:eval -- --limit 20                      # humo rápido
pnpm ai:eval -- --out results/v1-openai.json    # reporte completo en JSON
```

Emite accuracy, precision/recall/F1 por clase, macro-F1 y matriz de confusión
para cada una de las tres tareas (origen, categoría, urgencia), y **sale con
código 1 si no se alcanzan los umbrales**, así que sirve como gate de CI.

Dataset: `src/eval/datasets/classifier-v1.jsonl`, 302 casos etiquetados en
español rioplatense. Ver `src/prompts/CHANGELOG.md` para los criterios de
salida, los resultados registrados y las notas de diseño del dataset.

### Agregar casos reales del piloto (G16)

El dataset es JSONL justamente para poder apendear sin reescribir. Los casos
reales salen de la tabla `clasificacion_ia`, que desde el 2026-08-17 guarda la
sugerencia de la IA y —cuando el admin corrige al validar— el par
sugerido/corregido en `corregido_por_admin`. Marcarlos con `"source": "piloto"`
y anonimizar antes de versionarlos.

## Deudas conocidas

- **`VoyageEmbedder` está roto conceptualmente**: pide `output_dimension: 384`,
  dimensión que Voyage no soporta (acepta 256/512/1024), y después trunca y
  rellena con ceros. Eso rompe la norma del vector y por lo tanto la similitud
  por coseno. No usarlo hasta migrarlo o descartarlo.
- **Los adaptadores de visión nunca persisten la versión del prompt** por una
  condición invertida, lo que incumple la regla 9 para esa capacidad.
- **Modelos por defecto de 2024** en varios adaptadores.
- **Sin reintentos**: ningún adaptador reintenta ante un error transitorio del
  proveedor. Es una de las razones para migrar a Vercel AI SDK, que los trae.
