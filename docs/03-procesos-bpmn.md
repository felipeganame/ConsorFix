# ConsorcioFix — Modelado de Procesos (BPMN)

> Los diagramas están en **Mermaid** para que rendericen directo en GitHub y sean parseables por Claude Code. Cada proceso indica sus *lanes* (responsables) al estilo BPMN; los subgrafos representan pools/lanes. Los procesos están alineados al mapa del Sprint 0: **estratégicos**, **críticos** y **de soporte**.

---

## Mapa global de procesos

```mermaid
flowchart TB
    subgraph EST[Procesos Estratégicos]
        E1[Planificación de producto<br/>taxonomía de categorías por tipo de consorcio]
        E2[Gestión de seguridad<br/>políticas RBAC y aislamiento multi-tenant]
    end
    subgraph CRIT[Procesos Críticos]
        P1[P1 · Captura y triaje de incidencias]
        P2[P2 · Ciclo de vida del ticket]
        P3[P3 · Derivación unidad vs. común]
        P4[P4 · Deduplicación y upvoting]
        P5[P5 · Gestión de conductas]
    end
    subgraph SOP[Procesos de Soporte]
        S1[Onboarding de tenant, consorcios y vecinos]
        S2[Sincronización offline de la app]
        S3[Notificaciones salientes]
        S4[Monitoreo de APIs externas y backups]
        S5[Evaluación continua del clasificador IA]
    end
    E1 --> P1
    E2 --> P1
    S1 --> P1
    P1 --> P4 --> P1
    P1 --> P2
    P2 --> P3
    P2 --> S3
    S2 --> P1
    P1 --> P5
```

---

## P1 — Captura y triaje de incidencias vía WhatsApp (proceso crítico nº1)

**Lanes:** Residente · WhatsApp Cloud API · Servicio de Mensajería · Pipeline IA · Sistema (dominio)

**Disparador:** el residente envía texto/audio/foto al número del bot.
**Resultado:** ticket creado en estado `PENDIENTE_VALIDACION` (o voto sumado a ticket existente), con confirmación al residente en < 60 s.

```mermaid
flowchart TD
    A([Residente envía mensaje<br/>texto / audio / foto]) --> B[Webhook recibe evento<br/>valida firma X-Hub-Signature-256]
    B --> B2[Responder 200 inmediato<br/>encolar trabajo async]
    B2 --> C{¿Teléfono registrado?}
    C -- No --> C1[Responder: contactá a tu administración<br/>RF-A06] --> FIN1([Fin])
    C -- Sí --> D{¿Sesión activa?}
    D -- No --> D1[Crear sesión con timeout 15 min]
    D -- Sí --> E
    D1 --> E{¿Usuario en más de un consorcio?}
    E -- Sí --> E1[Bot lista consorcios del usuario<br/>RF-B02] --> E2([Residente elige consorcio]) --> F
    E -- No --> F{Tipo de mensaje}
    F -- Audio --> G[Transcribir con Whisper<br/>RF-B04]
    F -- Foto --> H[Persistir media en storage propio<br/>RF-B09]
    F -- Texto --> I
    G --> I[LLM: extracción estructurada<br/>descripción, categoría, ubicación,<br/>urgencia, origen unidad/común<br/>RF-B05, RF-C01..C03]
    H --> I
    I --> J{¿Faltan datos clave?}
    J -- Sí --> J1[Bot repregunta solo lo faltante] --> K([Residente responde]) --> I
    J -- No --> L{¿Posible duplicado?<br/>heurística + embeddings RF-B07}
    L -- Sí --> L1[Bot ofrece sumarse al ticket existente]
    L1 --> L2{¿Acepta?}
    L2 -- Sí --> L3[Registrar upvote + suscripción<br/>→ ver P4] --> M1[Confirmar al residente] --> FIN2([Fin])
    L2 -- No --> N
    L -- No --> N[Bot muestra resumen estructurado<br/>y pide confirmación RF-B06]
    N --> O{¿Residente confirma?}
    O -- Corrige --> N
    O -- Cancela --> FIN3([Fin · sesión cerrada])
    O -- Sí --> P[Crear ticket PENDIENTE_VALIDACION<br/>con clasificación IA adjunta]
    P --> Q[Notificar nº de ticket al residente<br/>RF-G01] --> FIN4([Fin · pasa a P2])
```

**Reglas de negocio:**
- El webhook siempre responde 200 rápido; el procesamiento es asíncrono (cola). Reintentos de Meta no duplican (idempotencia por `wamid`, RNF-11).
- Si Whisper o el LLM fallan: el reporte queda encolado con reintentos; si persiste, el bot pide el reporte en texto y el ticket se crea sin clasificación con flag `REVISION_MANUAL` (RNF-06).
- Confianza del clasificador < umbral → flag `BAJA_CONFIANZA` visible para el admin (RF-C01).

---

## P2 — Ciclo de vida del ticket (máquina de estados)

> **Actualizado el 2026-08-18.** La máquina de nueve estados que describía esta sección quedó superada por la decisión del 2026-06-12, registrada en [ADR-002](adr/ADR-002-ciclo-de-vida-del-ticket.md). El diagrama original se conserva más abajo, tachado, porque el Ante Proyecto lo cita y conviene que sea trazable qué se cambió y por qué.

**Lanes:** Sistema · Administrador · Residente *(el técnico está fuera del sistema — ver ADR-002)*

```mermaid
stateDiagram-v2
    [*] --> REGISTRADO : reporte recibido (bot, app o carga manual del admin)
    REGISTRADO --> VALIDADO : el admin confirma origen y, en conducta, la unidad acusada
    REGISTRADO --> DESCARTADO : el admin descarta (no aplica)
    VALIDADO --> SOLUCIONADO : el admin registra la resolución y el costo (RF-D05/D06)
    VALIDADO --> DESCARTADO : el admin descarta
    DESCARTADO --> [*]
    SOLUCIONADO --> [*]
```

**Invariantes:**
- Las transiciones SOLO pasan por `packages/domain/src/ticket/transitions.ts` (regla 2 de CLAUDE.md). Hay un único `update` de `estado` en todo el código y está precedido por `assertTransition`.
- Toda transición registra autor, timestamp y nota → historial auditable en `ticket_evento`, consultable en `GET /tickets/:id/historial` (RF-D02, RF-H05).
- Solo el ADMIN ejecuta transiciones.
- `VALIDADO` exige que el admin confirme el `origen`, porque de eso depende la visibilidad. En un ticket de CONDUCTA exige además la `unidad_reportada_id` (RF-F01), respaldado por un CHECK en la base.
- **No hay reapertura.** Si el problema reaparece se crea un ticket nuevo: dos ocurrencias del mismo caño roto son dos incidencias, y así el tiempo de resolución de cada una se mide sin contaminar.
- Cada transición relevante dispara una notificación (P-S3, RF-G01).

### Diagrama original (superado — se conserva por trazabilidad)

<details>
<summary>Máquina de nueve estados del Ante Proyecto</summary>

Superada por ADR-002. Los estados `ASIGNADO` y `EN_REPARACION` presuponían que el técnico usa el sistema, y no lo usa: el admin lo contacta por afuera. Modelar estados que nadie transiciona producía tickets colgados para siempre esperando a un actor inexistente.

```
[*] --> NUEVO --> EN_TRIAJE --> PENDIENTE_VALIDACION
PENDIENTE_VALIDACION --> (VALIDADO | DERIVADO | RECHAZADO | DUPLICADO)
VALIDADO --> ASIGNADO --> EN_REPARACION --> RESUELTO --> CERRADO
CERRADO --> PENDIENTE_VALIDACION  (reapertura)
```

</details>

---

## P3 — Decisión y derivación: unidad privada vs. espacio común

**Lanes:** Pipeline IA · Administrador · Sistema · Propietario

```mermaid
flowchart TD
    A([Ticket PENDIENTE_VALIDACION<br/>con origen sugerido por IA]) --> B{Admin revisa origen}
    B -- IA acertó --> C{¿Origen?}
    B -- Corrige --> B1[Registrar corrección<br/>valor IA vs. valor final → dataset RF-C04] --> C
    C -- Espacio común --> D[VALIDADO<br/>sigue ciclo normal en P2] --> FIN1([Fin])
    C -- Unidad privada --> E[Identificar propietario de la unidad<br/>RF-A07]
    E --> F{¿Reportante = propietario?}
    F -- Sí --> G[Notificar: la resolución corre por tu cuenta<br/>plantilla derivacion_propietario]
    F -- No, es inquilino --> H[Notificar al propietario<br/>con detalle del problema]
    G --> I[Estado DERIVADO<br/>sale de bandeja activa]
    H --> I
    I --> J{¿Propietario marca resuelto<br/>antes de N días?}
    J -- Sí --> K[CERRADO con nota del propietario]
    J -- No --> L[Auto-archivo: CERRADO<br/>motivo: derivado sin gestión]
    K --> FIN2([Fin])
    L --> FIN2
```

---

## P4 — Deduplicación y upvoting

**Lanes:** Pipeline IA · Residente · Administrador · Sistema

```mermaid
flowchart TD
    A([Nuevo reporte estructurado]) --> B[Buscar candidatos:<br/>1. misma categoría + ubicación + abierto<br/>2. similitud semántica embeddings > umbral]
    B --> C{¿Candidatos?}
    C -- No --> D[Crear ticket nuevo] --> FIN1([Fin])
    C -- Sí --> E[Ofrecer al residente el ticket existente]
    E --> F{¿Residente acepta?}
    F -- Sí --> G[Upvote: +1 afectado<br/>suscribir a notificaciones<br/>RF-E03, G18]
    F -- No --> D
    G --> H[Recalcular prioridad en bandeja admin<br/>urgencia + nº de votos] --> FIN2([Fin])
    I([Caso tardío: admin detecta duplicado<br/>en PENDIENTE_VALIDACION]) --> J[Marcar DUPLICADO de ticket X<br/>migrar voto y suscripción del reportante] --> H
```

**Regla:** la IA nunca fusiona sola; el merge lo decide el residente (al reportar) o el admin (en validación) — G14.

---

## P5 — Gestión de incidencias de conducta

**Lanes:** Residente reportante · Pipeline IA · Administrador · Residente reportado

```mermaid
flowchart TD
    A([Reporte clasificado como CONDUCTA<br/>ruidos, estacionamiento, etc.]) --> B[Crear ticket de conducta<br/>visibilidad restringida: solo admin ve al reportante<br/>RF-F02 · no aparece en feed ni es votable]
    B --> C{Admin evalúa}
    C -- Sin mérito --> D[Descartar con motivo<br/>notificar al reportante] --> FIN1([Fin])
    C -- Primera vez / leve --> E[Emitir AVISO al residente infractor<br/>sin exponer al reportante]
    C -- Reincidente / grave --> F[Registrar SANCIÓN según reglamento<br/>en historial de la unidad RF-F03]
    E --> G[Registrar en historial de convivencia de la unidad]
    F --> G
    G --> H[Notificar resultado al reportante<br/>sin detalles sancionatorios sensibles] --> FIN2([Fin])
```

---

## P6 — Sincronización offline de la app (soporte)

**Lanes:** Residente · App móvil · Backend

```mermaid
flowchart TD
    A([Residente crea reporte sin señal<br/>cochera / subsuelo]) --> B[Guardar en cola local<br/>con client_generated_id UUID<br/>estado visual: pendiente de sincronizar]
    B --> C{¿Conectividad recuperada?}
    C -- No --> B
    C -- Sí --> D[Enviar cola en orden<br/>con client_generated_id]
    D --> E{Backend: ¿id ya procesado?}
    E -- Sí --> F[Responder ticket existente<br/>idempotencia RNF-11]
    E -- No --> G[Procesar por pipeline IA normal<br/>P1 desde extracción]
    F --> H[App actualiza estado local a sincronizado]
    G --> H
    H --> I{¿Conflicto? ej. ticket ya resuelto<br/>o duplicado detectado}
    I -- Sí --> J[Mostrar resolución al usuario<br/>ofrecer voto en ticket existente]
    I -- No --> FIN([Fin])
    J --> FIN
```

---

## P7 — Onboarding de tenant, consorcios y vecinos (soporte)

**Lanes:** Super Admin · Administrador · Sistema · Residente

```mermaid
flowchart TD
    A([Super Admin crea tenant<br/>administración RF-A01]) --> B[Admin recibe credenciales<br/>y accede al panel]
    B --> C[Admin crea consorcios<br/>tipo: edificio / barrio / oficinas RF-A02]
    C --> D[Define estructura de unidades RF-A03]
    D --> E{Alta de residentes}
    E -- Manual --> F[Form: nombre, teléfono E.164,<br/>unidad, rol propietario/inquilino RF-A04]
    E -- Masiva --> G[Importar Excel/CSV<br/>validar fila por fila RF-A05]
    G --> H{¿Errores?}
    H -- Sí --> I[Reporte de filas inválidas con motivo<br/>las válidas se importan igual]
    H -- No --> J
    I --> J[Residentes activos:<br/>pueden escribir al bot y usar la app]
    F --> J
    J --> K[Opcional: mensaje de bienvenida<br/>por WhatsApp con instrucciones] --> FIN([Fin])
```

---

## P8 — Evaluación continua del clasificador (soporte / calidad IA)

```mermaid
flowchart LR
    A[Dataset etiquetado<br/>300 sintéticos + casos reales G16] --> B[Script de evaluación<br/>RF-C06]
    C[Correcciones del admin<br/>RF-C04: IA vs. final] --> A
    B --> D[Métricas por clase:<br/>accuracy / precision / recall / F1]
    D --> E{¿Cumple umbrales?<br/>origen ≥85% · categoría ≥90%}
    E -- No --> F[Iterar prompts / few-shots / modelo<br/>documentar experimento]
    F --> B
    E -- Sí --> G[Versionar resultado en repo<br/>insumo del capítulo de validación de la tesis]
```
