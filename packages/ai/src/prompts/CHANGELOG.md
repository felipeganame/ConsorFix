# Prompts changelog

Cada cambio de prompt **debe** correr `pnpm ai:eval` y registrar el resultado acá (regla 9 de CLAUDE.md).

Hasta el 2026-08-17 esta regla era inaplicable: `ai:eval` apuntaba a un archivo
inexistente y fallaba con `MODULE_NOT_FOUND`. Ahora el comando corre contra
`src/eval/datasets/classifier-v1.jsonl` (302 casos etiquetados es-AR) y sale con
código 1 si no se alcanzan los umbrales, así que se puede poner en CI.

## Criterios de salida (docs/05 §Fase 3, gap G4)

| Tarea | Mínimo |
|---|---|
| origen | ≥ 85 % accuracy |
| categoria | ≥ 90 % top-1 |
| urgencia | sin umbral formal; se mide y se reporta |

## Resultados

| Version | Fecha | Provider | Cambio | origen | categoria | urgencia |
|---|---|---|---|---|---|---|
| classifier-v1.0 | 2026-08-17 | mock | baseline del clasificador simulado | 61,1 % | 50,7 % | 37,2 % |

**Sobre la fila del mock:** no es un resultado del sistema, es la línea de base
contra la que se compara. El clasificador simulado son expresiones regulares
sobre palabras clave, así que estos números miden cuánto se puede resolver sin
IA — y de paso confirman que el dataset discrimina. Un dataset donde el mock
sacara 90 % no probaría nada.

**Falta la fila que importa:** la corrida con un proveedor real. Requiere
`OPENAI_API_KEY` (o la del proveedor que se elija) en el entorno y después:

```bash
pnpm ai:eval -- --provider openai --out results/classifier-v1.0-openai.json
```

Esa corrida es la que produce las métricas del capítulo de validación de la
tesis. El comando imprime al final una fila lista para pegar en esta tabla.

## Notas de diseño del dataset

- **Formato JSONL**, un caso por línea: diffea limpio en git, se le pueden
  apendear los casos reales del piloto sin reescribir el archivo.
- **20 casos trampa de tono** (`tags: tono-inflado` / `tono-atenuado`): miden
  RF-C03, que exige urgencia técnica objetiva y no emocional. Ejemplos:
  *"URGENTÍSIMO!!! SE QUEMÓ UNA LAMPARITA"* debe dar `BAJA`, y *"nada
  importante, pero hay un cable pelado en el palier"* debe dar `CRITICA`.
  Es el argumento central de la tesis, así que conviene reportar la métrica de
  este subconjunto por separado.
- **Casos ambiguos y sin contenido** (`tags: ambiguo`): fijan solo la etiqueta
  defendible. *"Se llovió el techo"* fija categoría pero no origen, porque el
  origen es genuinamente indeterminable sin repreguntar.
- **Registros informales, formales y con errores de tipeo**: el canal es
  WhatsApp, no un formulario.
