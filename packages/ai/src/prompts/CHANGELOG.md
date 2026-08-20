# Prompts changelog

Cada cambio de prompt **debe** correr `pnpm ai:eval` y registrar el resultado acá (regla 9 de CLAUDE.md).

Hasta el 2026-08-17 esta regla era inaplicable: `ai:eval` apuntaba a un archivo
inexistente y fallaba con `MODULE_NOT_FOUND`. Ahora el comando corre contra
`src/eval/datasets/classifier-v1.jsonl` (302 casos etiquetados es-AR) y sale con
código 1 si no se alcanzan los umbrales, así que se puede poner en CI.

## Criterios de salida (docs/05 §Fase 3, gap G4)

| Tarea | Mínimo |
|---|---|
| tipo | ≥ 95 % accuracy |
| origen | ≥ 85 % accuracy |
| categoria | ≥ 90 % top-1 |
| urgencia | sin umbral formal; se mide y se reporta |

## Resultados

| Version | Fecha | Provider | Cambio | tipo | origen | categoria | urgencia |
|---|---|---|---|---|---|---|---|
| classifier-v1.0 | 2026-08-17 | mock | baseline del clasificador simulado | — | 61,1 % | 50,7 % | 37,2 % |
| classifier-v1.1 | 2026-08-17 | mock | detección de `tipo` y `unidad_reportada_texto` (RF-F01) | 88,3 % | 61,1 % | 50,7 % | 37,2 % |
| classifier-v1.1 | 2026-08-20 | **openai** gpt-4o-mini | primera corrida con el modelo real | 98,7 % | 90,5 % | 80,7 % | 55,6 % |
| classifier-v1.2 | 2026-08-20 | **openai** gpt-4o-mini | guía por categoría + `otros` como último recurso; conducta ⇒ origen UNIDAD; CRÍTICA vs ALTA definidas | 98,7 % | **94,9 %** | 84,3 % | 56,0 % |
| classifier-v1.3 | 2026-08-20 | openai gpt-4o-mini | instalaciones generales son ESPACIO_COMUN; escala de urgencia completa (MEDIA vs ALTA) | 98,3 % | 95,6 % | 85,3 % | 59,7 % |
| classifier-v1.4 | 2026-08-20 | openai gpt-4o-mini | seguridad por principio de riesgo y no por lista de objetos; se saca "portones automáticos ⇒ electricidad", que contradecía al dataset | 98,3 % | 94,9 % | 85,0 % | 62,5 % |
| classifier-v1.5 | 2026-08-20 | openai gpt-4o-mini | desempate asimétrico (ante riesgo a personas, CRÍTICA) + el tono no altera la urgencia en ninguna dirección | **99,0 %** | **95,6 %** | **88,3 %** | **63,5 %** |
| classifier-v1.6 | 2026-08-20 | openai gpt-4o-mini | `es_reporte`: el modelo puede abstenerse cuando el mensaje no describe ningún problema | **99,0 %** | **97,0 %** | 87,3 % | **65,5 %** |

### RF-C03 — urgencia frente al tono (20 casos trampa)

| Version | global | tono-inflado | tono-atenuado |
|---|---|---|---|
| classifier-v1.4 | 60,0 % | 80,0 % | 40,0 % |
| classifier-v1.5 | **70,0 %** | 60,0 % | **80,0 %** |
| classifier-v1.6 | **70,0 %** | **70,0 %** | 70,0 % |

Estos 20 casos son el argumento central de la tesis y **el eval no los medía por
separado**: estaban en el dataset desde el principio, promediados con los otros
282. Se agregó la métrica al `ai:eval`, partida en las dos direcciones del sesgo,
porque fallar en cada una significa algo distinto: en `tono-inflado` el sistema se
deja llevar por el drama; en `tono-atenuado` pasa por alto un peligro real porque
el vecino fue educado, y eso es mucho más grave.

**El hallazgo no es el porcentaje, es el patrón.** En v1.4 el modelo detectaba
correctamente la gravedad de los casos minimizados —los ubicaba en ALTA, no en
BAJA— pero descontaba un nivel por la cortesía del mensaje. En la dirección
opuesta pasaba lo simétrico: *"URGENTÍSIMO una lamparita"* subía de BAJA a MEDIA.
El tono corría la urgencia exactamente un nivel, en su misma dirección.

v1.5 lo corrige con un desempate **asimétrico**: sin riesgo a personas se elige el
nivel menor (inflar todo hace que nada sea urgente), pero ante riesgo se elige
CRÍTICA aunque haya duda, porque subestimar un peligro cuesta una persona
lastimada y sobreestimarlo cuesta una visita de más. El acierto en `tono-atenuado`
pasó de 40 % a 80 %, a costa de `tono-inflado` (80 % → 60 %). Es el intercambio
correcto y conviene defenderlo como decisión, no disimularlo como mejora neta.

### Nota metodológica: por qué se paró en v1.5

Categoría recorrió 80,7 % → 84,3 % → 85,3 % → 85,0 % → 88,3 % en cinco
iteraciones, contra un umbral de 90 % (RF-C02). Seguir agregando reglas para que
el modelo acierte casos puntuales de este dataset sería **sobreajustar al conjunto
de evaluación**: el número sube y la capacidad real no. Los cambios de v1.3 a v1.5
se limitaron a corregir contradicciones introducidas por versiones anteriores y a
reemplazar listas de objetos por los principios que esas listas intentaban
expresar.

El análisis de los 47 desaciertos de categoría en v1.3 mostró tres grupos:

1. **Una contradicción propia**: v1.2 mandaba "portones automáticos" a
   electricidad y el dataset los etiqueta `otros`. Corregido en v1.4.
2. **Una categoría faltante en la taxonomía**: el gas no es plomería ni
   electricidad, y aparece en al menos cuatro casos. El dataset los pone en
   `plomeria` (por los caños) y el modelo en `otros` o `seguridad` (por el
   riesgo); los dos criterios son razonables. RF-C02 ya prevé que la taxonomía sea
   configurable, así que agregar `gas` es coherente con el diseño.
3. **Ambigüedad irreducible entre síntoma y causa raíz**: *"se cayó un pedazo de
   revoque del techo del baño por la humedad"* está etiquetado `plomeria` (la
   causa) y el modelo responde `otros` (lo que se ve). Hace falta fijar el
   criterio y aplicarlo a los 302 casos antes de que este número signifique algo.

Antes de volver a tocar el prompt conviene resolver 2 y 3, que son decisiones de
producto y de etiquetado, no de ingeniería de prompts.

### Por qué `tipo` tiene el umbral más alto (95 %)

Equivocar el tipo no es equivocar una etiqueta: cambia el circuito entero. Un
reporte de infraestructura clasificado como conducta se vuelve anónimo, deja de
votarse y pide una unidad acusada que no existe. Al revés, una denuncia
clasificada como infraestructura **expone al denunciante**, porque el
`reportanteId` solo se oculta en conducta. Es el error más caro del sistema.

El 88,3 % del mock esconde el número que importa: **recall de 23,1 % en
CONDUCTA** — se le escapan 30 de 39 denuncias. Con `INFRAESTRUCTURA` siendo el
87 % del dataset, un clasificador que respondiera siempre "infraestructura"
sacaría 87 % de accuracy sin detectar una sola denuncia. Por eso se reporta
macro-F1 y la matriz de confusión, y no solo accuracy.

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

## Lectura de la corrida del 2026-08-20 (primera con modelo real)

Antes de esta fecha las cifras salían del mock, que no es una medición: el stub
clasifica por palabras clave y siempre acierta lo que él mismo decidió. Al poner
una API key apareció que **el clasificador real nunca había funcionado**: el modo
estricto de salida estructurada de OpenAI exige que todas las propiedades estén en
`required`, dos campos eran `optional()`, y las 302 llamadas se rechazaban. Está
en el commit que arregla el schema; vale para la tesis como ejemplo de que
"implementado" y "funciona" no son lo mismo.

**Qué cambió v1.2 y por qué.** La matriz de confusión de v1.1 mostraba una sola
causa dominante en categoría: `otros` con 50,5 % de precisión, comiéndose 15 casos
de plomería, 15 de seguridad, 11 de conducta y 7 de limpieza. Cuando el modelo
elegía una categoría específica acertaba entre 96 % y 100 %, así que el problema
no era de capacidad sino de instrucción: el prompt listaba las siete categorías
sin decir qué entra en cada una ni que `otros` fuera el último recurso.

**El eval encontró una ambigüedad de la especificación, no solo errores.** Los 21
desaciertos de `origen` en v1.1 eran casi todos conductas donde el dataset dice
UNIDAD y el modelo decía ESPACIO_COMUN (*"el del 3D no levanta la caca del perro
en el jardín"*). Ninguno se equivocaba: `origen` significaba dos cosas distintas
—dónde ocurre el hecho, o quién puede verlo—. v1.2 lo define como decisión de
visibilidad y fija que una conducta es siempre UNIDAD, porque publicar una
denuncia a todo el consorcio expone a las dos partes. El recall de UNIDAD pasó de
84,3 % a 97,0 %.

**Lo que sigue faltando, con su causa identificada.**

- **Categoría 84,3 % contra un umbral de 90 %** (RF-C02). `otros` mejoró de 50,5 %
  a 60,7 % de precisión pero sigue absorbiendo 12 casos de plomería y 10 de
  seguridad. Seguridad tiene 64,7 % de recall.
- **Origen: instalaciones generales mal clasificadas.** El prompt enumera lugares
  comunes (palier, hall, cochera) y no menciona instalaciones centrales, así que
  *"la calefacción central"*, *"el filtro del tanque"*, *"el matafuegos del quinto
  piso"* y *"el toldo de la terraza"* se van a UNIDAD. Es una omisión del prompt,
  no del modelo.
- **Urgencia 56 %, y es el más débil por una razón de especificación**: de 105
  casos MEDIA el modelo dijo ALTA en 49. v1.2 definió CRÍTICA vs ALTA (recall de
  CRÍTICA: 32 % → 42 %) pero **nadie definió dónde termina MEDIA y empieza ALTA**,
  ni en el prompt ni en los requerimientos. Sin esa definición la métrica mide un
  desacuerdo, no un error.
- **Ambigüedades del dataset que ningún prompt puede resolver.** *"Entraron a
  robar a una cochera y forzaron un auto"* no es una cosa rota ni la conducta de un
  vecino: la taxonomía no tiene dónde ponerlo. *"Dejan la basura afuera del
  contenedor"* es conducta y limpieza a la vez. *"El caño de la cocina del 4to
  gotea sobre la cochera"* nace en una unidad y afecta un espacio común. Antes de
  seguir subiendo números hay que decidir qué es la respuesta correcta en estos
  casos, o marcarlos como indeterminables igual que ya se hace con los `ambiguo`.

El dataset es 100 % sintético (302 casos, 0 del piloto). Las cifras miden
consistencia contra etiquetas propias, no desempeño en producción, y conviene
decirlo así en la defensa.

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

## v1.6 — la abstención (2026-08-20)

Un vecino escribió "Gracias" por Telegram y el bot le abrió un ticket: *"Agujero
en el techo del pasillo"*, urgencia alta, nada de eso mencionado en el mensaje.
"No te dije gracias!" salió como un ticket de CONDUCTA titulado *"Agradecimiento
no expresado"*.

No era un problema de calidad del prompt sino de contrato: el esquema **obligaba
a clasificar**. Frente a un texto sin ningún problema adentro, la única salida
válida era inventar uno, y el modelo hacía lo que se le pedía. La respuesta es un
campo nuevo, `es_reporte`, que le da al modelo una salida honesta, y el bot la
respeta cortando antes de crear el ticket.

Sobre los 302 casos del dataset no hay regresión: `origen` +1,4 pts y `urgencia`
+2,0 pts, `categoria` −1,0 pt (3 casos sobre 300, dentro del ruido de muestreo de
un set de este tamaño) y `tipo` igual. Era lo esperable: todos los casos del
dataset **son** reportes, así que el campo nuevo no cambia nada ahí — el valor
está justamente en los mensajes que el dataset no tiene.

Eso es también su limitación como medición: la abstención no está evaluada por el
eval, porque el dataset no incluye ni un solo mensaje que no sea un reporte.
Quedó verificada a mano contra el modelo real (se abstiene en "Gracias", "No te
dije gracias!" y "hola todo bien?"; sigue registrando "se rompió el portón" y
"buenas, hay olor a gas") y con tests de integración contra el mock. Medirla en
serio pide una clase nueva de casos en el dataset — cortesías, preguntas,
consultas administrativas— que es trabajo pendiente, no resuelto.

`categoria` sigue abajo del 90 % de corte por lo ya anotado más arriba: falta la
categoría `gas` y el dataset etiqueta a veces por síntoma y a veces por causa
raíz. Es deuda de taxonomía, no de prompt.
