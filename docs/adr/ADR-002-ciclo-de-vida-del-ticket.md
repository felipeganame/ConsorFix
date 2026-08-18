# ADR-002 — Ciclo de vida del ticket, sin técnico y con una sola entidad de costo

- **Estado:** aceptada
- **Fecha de la decisión:** 2026-06-12
- **Fecha de registro:** 2026-08-17 *(la decisión se tomó y se implementó en junio; esta ADR se escribe después, ver "Nota sobre el registro tardío")*
- **Supera a:** `docs/03-procesos-bpmn.md` §P2, y las filas RF-D03, RF-D04 y RF-D07 de `docs/02-requerimientos.md`

## Contexto

`docs/03` §P2 definía una máquina de estados de nueve estados:

```
NUEVO → EN_TRIAJE → PENDIENTE_VALIDACION →
  (VALIDADO | DERIVADO | RECHAZADO | DUPLICADO) →
  ASIGNADO → EN_REPARACION → RESUELTO → CERRADO
```

Esa máquina asume un flujo que el producto no tiene:

1. **`ASIGNADO` y `EN_REPARACION` presuponen que el técnico usa el sistema.** No lo usa. El administrador lo contacta por afuera —teléfono, WhatsApp personal— y después registra el costo y adjunta la factura. Modelar estados que nadie transiciona produce tickets que se quedan para siempre en `ASIGNADO` porque el plomero no tiene la app.
2. **`RESUELTO` y `CERRADO` separados sin nada en el medio.** El cierre iba a ser un trámite automático o un botón que nadie aprieta.
3. **`DERIVADO` y `DUPLICADO` como estados** mezclan dos cosas distintas: el resultado de un ticket y su relación con otro. El duplicado ya se resuelve con `duplicado_de_id` y con la oferta de voto del bot (RF-B07).

En paralelo, el ERD original tenía `presupuesto` y `costo` como entidades separadas, replicando un circuito de aprobación de presupuestos que este producto no hace.

## Decisión

**Cuatro estados:**

```
REGISTRADO → VALIDADO → SOLUCIONADO        (camino feliz)
REGISTRADO → DESCARTADO                     (el admin descarta)
VALIDADO   → DESCARTADO
```

**Sin reapertura.** Si el problema reaparece, se crea un ticket nuevo. Es más honesto para las métricas: dos ocurrencias del mismo caño roto son dos incidencias, no una que "se volvió a abrir", y el tiempo de resolución de cada una se mide sin contaminar.

**No existe la entidad `tecnico`.** El técnico está fuera del sistema por diseño, no por falta de tiempo. El admin registra el costo cuando resuelve.

**Una sola entidad `gasto`** (`monto` + `comprobante_url` + `estado BORRADOR|CONFIRMADO`), que reemplaza a `presupuesto` y `costo`. El `BORRADOR` cubre el caso "tengo un número tentativo pero todavía no lo publico": los borradores nunca se muestran al residente.

## Consecuencias

**A favor:**

- La máquina de estados es chica y se puede testear al 100 %, que es lo que hoy tiene `packages/domain/src/ticket/transitions.ts`.
- No hay estados inalcanzables ni tickets colgados esperando a un actor que no existe.
- El tiempo de resolución (`validated_at` → `solucionado_at`) mide algo real.

**En contra, y asumido:**

- **No se puede responder "¿a quién se le asignó este ticket?" desde el sistema.** Esa información vive en la nota del admin o afuera. Si el piloto muestra que hace falta, es una entidad nueva, no un estado.
- **Se pierde la trazabilidad de la reincidencia.** Dos tickets separados no dicen "esto ya pasó antes". Mitigable con el dedup vectorial, que los relaciona por similitud sin unirlos.

**Deuda documental que esta ADR salda a medias:** `docs/02` sigue listando RF-D03 (derivación), RF-D04 (asignar técnico) y RF-D07 (ABM de técnicos) como **Must**, y `docs/03` §P2 sigue mostrando los nueve estados. Esta ADR los declara superados, pero **los documentos originales no fueron corregidos**. Hay que hacerlo antes de la defensa: un tribunal que lea los requerimientos va a buscar esos RF en el código y no los va a encontrar.

## Alternativas consideradas

- **Mantener los nueve estados y dejar los de técnico sin usar.** Descartada: estados que nadie transiciona son deuda que parece funcionalidad.
- **Modelar al técnico como usuario del sistema.** Descartada para el alcance de la tesis. Implica onboarding de terceros, otro canal de notificación y un rol más en el RBAC, y el equipo son dos personas.
- **Permitir reapertura con trazabilidad.** Descartada: complica las métricas y el caso se cubre con un ticket nuevo más el dedup.

## Nota sobre el registro tardío

Esta decisión se tomó el 2026-06-12 y se implementó de inmediato, pero durante dos meses vivió solo en comentarios de código (`transitions.ts`, la migración `0002`) y en `CLAUDE.md`. Una auditoría del 2026-08-17 la marcó como riesgo: la decisión más importante del núcleo contradecía dos documentos formales sin que existiera registro de por qué.

Se escribe ahora para dejar constancia. Vale como recordatorio de que el momento de escribir la ADR es cuando se toma la decisión, no cuando alguien nota que falta.
