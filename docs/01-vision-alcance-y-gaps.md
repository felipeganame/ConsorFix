# ConsorcioFix — Visión, Alcance e Interpretación Consolidada

> Documento de síntesis. Unifica el Pitch (SIGI), el Sprint 0, el Ante Proyecto (ambas versiones) y el PPTX en una única fuente de verdad. Donde los documentos se contradicen, se señala la inconsistencia y se propone una resolución (marcada como **[DECISIÓN PROPUESTA]** — confirmar antes de codear).

---

## 1. Qué es ConsorcioFix (en una frase)

Plataforma SaaS **multi-tenant** de gestión de incidencias para consorcios (edificios, barrios cerrados, oficinas/coworks) que captura reportes por **WhatsApp y App móvil**, los **estructura y clasifica con IA** (transcripción + triaje objetivo de urgencia y origen unidad-vs-común), y los gestiona con trazabilidad completa de estados y costos desde un **panel web de administración**.

## 2. El problema que viene a resolver

1. **Información dispersa:** los reportes se pierden en grupos de WhatsApp saturados de ruido. No hay registro estructurado.
2. **Falta de trazabilidad:** el vecino no sabe si su problema fue visto, cuánto costará ni cuándo se arreglará. Desconfianza en los costos informados.
3. **Carga subjetiva y duplicada:** la urgencia la define el tono emocional del mensaje, no criterios técnicos; el mismo problema se reporta N veces.
4. **Ambigüedad unidad privada vs. espacio común:** la administración recibe problemas que en realidad corresponden al propietario de la unidad.
5. **Zonas sin señal:** cocheras y subsuelos impiden reportar en el momento.

## 3. La propuesta de valor (los 3 pilares)

| Pilar | Qué hace | Usuario principal |
|---|---|---|
| **Bot de WhatsApp** | Captura reportes por texto, audio o foto. IA transcribe (Whisper), estructura, categoriza, asigna urgencia técnica y detecta duplicados. Resuelve ambigüedad si el usuario pertenece a varios consorcios. | Residente |
| **App móvil** | Seguimiento de tickets, votación/upvote de problemas comunes, **modo offline** con sincronización diferida. | Residente |
| **Panel Admin Web** | Bandeja de tickets clasificados por IA, validación humana (el admin es el validador final), derivación unidad/común, asignación de técnicos, registro de presupuestos y costos, gestión de conductas, administración de múltiples consorcios. | Administrador |

**Principio rector:** la IA propone, el administrador dispone. Siempre hay un humano en el loop que valida la clasificación antes de que el ticket avance.

## 4. Actores del sistema

| Actor | Descripción | ¿Usuario del sistema? |
|---|---|---|
| **Super Admin (plataforma)** | Operador de ConsorcioFix. Da de alta administraciones (tenants). | Sí (interno) |
| **Administrador** | Administración de consorcios. Puede gestionar N consorcios bajo una única identidad. Dueño de los datos de su tenant. Valida tickets, asigna técnicos, registra costos, gestiona conductas, carga vecinos (incl. importación masiva desde Excel). | Sí |
| **Propietario** | Dueño de una o más unidades, en uno o más consorcios. Reporta, vota, consulta. Recibe derivaciones cuando el problema es interno de una unidad que alquila a un tercero. | Sí |
| **Inquilino** | Ocupa una unidad. Reporta, vota, consulta. | Sí |
| **Técnico** | Personal de mantenimiento asignado a tickets. **[GAP G8]** | Ver §6 |
| **Bot/IA** | Actor automatizado: Whisper + LLM. Transcribe, clasifica, estructura, deduplica. | Componente |

## 5. Alcance consolidado

### Dentro del alcance (MVP de tesis)

- Onboarding de tenant (administración) y consorcios; alta de unidades y vecinos por el admin (manual + importación Excel).
- Reporte de incidencias de **infraestructura** vía WhatsApp (texto/audio/foto) y vía App.
- Pipeline IA: transcripción (Whisper), extracción estructurada, categorización, urgencia técnica, clasificación **unidad vs. espacio común**, detección de duplicados.
- Resolución de ambigüedad multi-consorcio en el bot (listado de consorcios del usuario).
- Ciclo de vida completo del ticket con validación del administrador, derivación al propietario, asignación de técnico, registro de presupuestos/costos, resolución y cierre.
- Upvoting de incidencias comunes para evitar duplicados.
- Reporte y seguimiento de **incidencias de conducta** (ruidos, mal estacionamiento) con avisos/sanciones. *(Solo en Ante Proyecto — ver G3.)*
- App móvil con modo **offline** y sincronización diferida.
- RBAC estricto + aislamiento multi-tenant (row-level security).
- Notificaciones de cambio de estado al vecino.

### Fuera de alcance (explícito en los documentos)

- Mantenimiento predictivo con IA.
- Comparador automático de presupuestos con IA.
- Mediación automática de conflictos basada en el reglamento de copropiedad.

### Casos de uso candidatos (solo si sobra tiempo — no comprometer)

- Pasarela de pago / consulta de expensas.
- Chat directo o red social interna entre vecinos.
- Despliegue en consorcios reales en producción durante la tesis (el piloto sí está en cronograma; "producción real" es candidato).

## 6. Inconsistencias y gaps detectados (con resolución propuesta)

Esta es la parte más importante: lo que **no quedó claro** entre tus documentos. Cada gap tiene un ID para referenciarlo en los requerimientos y en el plan.

### G1 — Nombre del producto
- **Conflicto:** el pitch lo llama **SIGI**; el Ante Proyecto y el repo lo llaman **ConsorcioFix**.
- **[DECISIÓN PROPUESTA]:** usar **ConsorcioFix** en todo (es el nombre del Ante Proyecto final y del repositorio). SIGI queda como nombre histórico del pitch.

### G2 — Stack de backend contradictorio
- **Conflicto:** Sprint 0 dice "Backend en **Go/Node.js**". El Ante Proyecto, en calidad, menciona Jest/Vitest/**Pytest** y Ruff/Black ("backend **Python**"). Hay tres lenguajes implícitos.
- **[DECISIÓN PROPUESTA]:** **TypeScript end-to-end**: backend Node.js (NestJS o Fastify), panel web React, app móvil React Native (Expo). Justificación: (a) un solo lenguaje para un equipo de 2 personas, (b) tipos compartidos entre backend/panel/app, (c) Claude Code rinde muy bien generando TS, (d) ecosistema maduro para webhooks de WhatsApp y SDKs de OpenAI/Anthropic. Go queda como alternativa válida si priorizan performance del servicio de mensajería, pero fragmenta el stack. **Hay que corregir el Ante Proyecto:** o se elige Node y se reemplaza Ruff/Black/Pytest por ESLint/Prettier/Vitest, o se justifica un microservicio Python solo para el pipeline de IA.

### G3 — Alcance distinto entre Sprint 0 y Ante Proyecto
- **Conflicto:** el **módulo de conductas** (ruidos, estacionamiento, sanciones) existe solo en el Ante Proyecto; el Sprint 0 no lo menciona. Además, Sprint 0 pone "pasarela de pagos" y "chat entre vecinos" como *fuera de alcance*, mientras el Ante Proyecto los mueve a *candidatos*.
- **[DECISIÓN PROPUESTA]:** el Ante Proyecto (documento más reciente y formal) manda. Conductas **entra** al alcance pero como fase tardía (es funcionalmente más simple que infraestructura: no tiene técnico ni costos). Pagos y chat quedan como candidatos no comprometidos. Actualizar el Sprint 0 para que coincida.

### G4 — Métrica del clasificador IA inconsistente
- **Conflicto:** Sprint 0 pide "90% de precisión en la categorización automática"; el Ante Proyecto pide "≥85% en el clasificador unidad vs. común".
- **[DECISIÓN PROPUESTA]:** definir **dos métricas separadas**: (a) clasificador de *origen* (unidad vs. común): ≥85% accuracy sobre dataset etiquetado; (b) clasificador de *categoría* (plomería, eléctrico, ascensor...): ≥90% top-1. Documentar cómo se construye el dataset (ver G16).

### G5 — "Modo offline por WhatsApp" no es controlable
- **Conflicto:** Sprint 0 dice que la sincronización offline aplica "ya sea un reporte por whatsapp o por la app". WhatsApp maneja su propia cola de mensajes; el sistema no puede implementar offline ahí.
- **[DECISIÓN PROPUESTA]:** el modo offline es **exclusivo de la app móvil** (cola local de reportes + sync al recuperar señal). Para WhatsApp solo se documenta que la entrega diferida la resuelve la propia plataforma de Meta. Corregir la redacción en Sprint 0.

### G6 — Identidad y onboarding del vecino en WhatsApp subdefinido
- **Gap:** ¿cómo sabe el bot quién escribe? ¿Qué pasa si escribe un número no registrado?
- **[DECISIÓN PROPUESTA]:** el admin da de alta a los vecinos con su teléfono (manual o Excel). El bot identifica por número de WhatsApp (E.164). Número no registrado → el bot responde con instrucciones para contactar a su administración (no se permite auto-registro en MVP, coherente con "registro de usuarios por parte del administrador" del Sprint 0). Opcional: código de invitación para vincular un segundo teléfono.

### G7 — Flujo de derivación al propietario incompleto
- **Gap:** el Ante Proyecto dice que si el problema es interno de la unidad, el admin "deriva al propietario", pero no define qué significa: ¿se notifica? ¿el ticket se cierra? ¿quién lo cierra? ¿qué pasa si el reportante es el inquilino y el propietario es otro?
- **[DECISIÓN PROPUESTA]:** estado `DERIVADO`: el ticket queda registrado (trazabilidad), se notifica al propietario de la unidad (WhatsApp/push) indicando que la resolución corre por su cuenta, y el ticket sale de la bandeja activa del admin. El propietario puede marcarlo como resuelto o el sistema lo auto-archiva a N días. La administración no asigna técnico ni registra costos en derivados (en MVP).

### G8 — Rol Técnico ambiguo
- **Gap:** se "asigna personal técnico" pero no se define si el técnico es usuario del sistema (con login/app) o un simple registro.
- **[DECISIÓN PROPUESTA]:** en MVP el técnico es un **registro** (nombre, rubro, contacto) gestionado por el admin; la asignación notifica por WhatsApp saliente con el detalle del ticket, y el admin actualiza estados en su nombre. Un portal/rol de técnico con login es mejora post-MVP. Esto reduce muchísimo el alcance sin matar la propuesta de valor.

### G9 — Notificaciones salientes y ventana de 24h de WhatsApp
- **Gap:** ningún documento define cómo se avisan los cambios de estado. La WhatsApp Cloud API solo permite mensajes de formato libre dentro de las 24h de la última interacción del usuario; fuera de eso exige **plantillas (templates) aprobadas**.
- **[DECISIÓN PROPUESTA]:** definir un set mínimo de plantillas HSM: `ticket_creado`, `cambio_estado`, `derivacion_propietario`, `resolucion_costo`. Push notifications en la app como canal secundario. Esto es un requerimiento técnico real que hay que presupuestar (registro de templates en Meta Business).

### G10 — Visibilidad de costos sin reglas
- **Gap:** la transparencia de costos es promesa central, pero no se define quién ve qué: ¿todos los vecinos ven el costo de todas las reparaciones comunes? ¿solo el reportante? ¿y los presupuestos rechazados?
- **[DECISIÓN PROPUESTA]:** costos de **espacios comunes** visibles para todos los residentes del consorcio (es el corazón de la propuesta de transparencia); costos de tickets derivados/privados no aplican (G7). El admin puede marcar un costo como "borrador" hasta confirmarlo. Presupuestos alternativos no seleccionados: visibles solo para el admin en MVP.

### G11 — Privacidad en reportes de conducta
- **Gap:** reportar al vecino del 5°B por ruidos expone al reportante. No está definido el anonimato ni el manejo de evidencia.
- **[DECISIÓN PROPUESTA]:** el reportante de conducta es **anónimo frente al reportado y al resto de los vecinos**, visible solo para el admin. Los reportes de conducta no aparecen en el feed público ni son votables (a diferencia de infraestructura). El flujo termina en "aviso" o "sanción registrada" emitida por el admin. Dejar registrado en la tesis el cruce con datos personales (Ley 25.326) — buen punto para la defensa.

### G12 — Modelo de tenancy: ¿qué es el tenant?
- **Gap:** "multi-tenant" aparece en todos lados pero nunca se define si el tenant es el consorcio o la administración.
- **[DECISIÓN PROPUESTA]:** **tenant = administración** (la entidad que paga el SaaS), que contiene N consorcios. El aislamiento duro (RLS) es por tenant; dentro del tenant, el RBAC separa consorcios (un vecino del consorcio A no ve nada del consorcio B aunque compartan administración). Esto habilita el requisito "un administrador gestiona múltiples consorcios desde una única base de datos".

### G13 — Estados del ticket nunca definidos
- **Gap:** "Gestión del Ciclo de Vida del Ticket" es proceso crítico pero ningún documento enumera los estados.
- **[DECISIÓN PROPUESTA]:** máquina de estados definida en `03-procesos-bpmn.md` §P2: `NUEVO → EN_TRIAJE → PENDIENTE_VALIDACION → (VALIDADO | DERIVADO | RECHAZADO | DUPLICADO) → ASIGNADO → EN_REPARACION → RESUELTO → CERRADO`.

### G14 — Detección de duplicados sin mecanismo
- **Gap:** "evitar reportes duplicados" es objetivo pero no se dice cómo.
- **[DECISIÓN PROPUESTA]:** dedup en dos capas: (1) heurística barata: misma categoría + misma ubicación (espacio común) + ticket abierto → candidato; (2) similitud semántica con embeddings (pgvector) sobre la descripción estructurada. El bot ofrece al usuario: "Ya existe un reporte de X en Y, ¿es el mismo? → sumás tu voto". La decisión final de merge la confirma el usuario o el admin, nunca la IA sola.

### G15 — Tecnología de la app móvil sin definir
- **Gap:** ningún documento elige framework móvil ni estrategia offline.
- **[DECISIÓN PROPUESTA]:** **React Native + Expo** (coherente con G2). Offline-first con cola de mutaciones local (SQLite/WatermelonDB o TanStack Query + persistencia) y sync idempotente con `client_generated_id` para evitar duplicados al reintentar.

### G16 — Dataset etiquetado para evaluar la IA: no hay plan
- **Gap:** las métricas (≥85%/90%, precision/recall/F1) requieren un dataset etiquetado que nadie definió cómo construir.
- **[DECISIÓN PROPUESTA]:** (1) generar ~300 casos sintéticos realistas (audios/textos de incidencias en castellano cordobés, con etiquetas) para desarrollo; (2) recolectar casos reales del piloto y de las encuestas para el set de evaluación final; (3) script de evaluación en CI que corre el clasificador contra el dataset y reporta accuracy/precision/recall/F1. Esto además es oro para el capítulo de validación de la tesis.

### G17 — Proveedor de LLM
- **Gap:** Sprint 0 dice "OpenAI API (entre otras)". Whisper es de OpenAI; la clasificación puede ser cualquier LLM.
- **[DECISIÓN PROPUESTA]:** abstraer detrás de una interfaz `AIProvider` (igual que la capa de mensajería del análisis de riesgos): transcripción → Whisper API; clasificación/extracción → LLM con salida estructurada (OpenAI o Anthropic, intercambiables). Permite comparar costo/precisión, que también suma a la tesis.

### G18 — "Votación" ≠ "voto": semántica del upvote
- **Gap:** se habla de "votación de problemas comunes" sin definir su efecto.
- **[DECISIÓN PROPUESTA]:** el upvote (1 por usuario por ticket) incrementa un contador de afectados que (a) sube la prioridad visible en la bandeja del admin y (b) suscribe al votante a las notificaciones de ese ticket. No es una votación de asamblea ni tiene efectos legales.

## 7. Criterios de éxito del proyecto (consolidados)

| Métrica | Objetivo | Fuente |
|---|---|---|
| Tiempo de carga de un reporte vía WhatsApp | < 60 segundos | Ante Proyecto |
| Accuracy clasificador unidad vs. común | ≥ 85% | Ante Proyecto (ver G4) |
| Accuracy categorización de incidencia | ≥ 90% | Sprint 0 (ver G4) |
| NPS del prototipo | ≥ 40 | Ante Proyecto |
| Cobertura unitaria en módulos críticos | ≥ 70% | Ante Proyecto |
| Encuestas de validación | 80–120 respuestas, ≥5 consorcios | Ante Proyecto |
| Aislamiento multi-tenant | 0 fugas en tests automatizados de aislamiento | Análisis de riesgos |
