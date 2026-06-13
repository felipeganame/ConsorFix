# ConsorcioFix — Especificación de Requerimientos

> Convenciones: **RF** = requerimiento funcional, **RNF** = no funcional. Prioridad MoSCoW: **M** (Must — MVP de tesis), **S** (Should — entra si el cronograma acompaña), **C** (Could — candidato), **W** (Won't — fuera de alcance declarado). Cada RF referencia el gap (`Gx`) del doc 01 cuando aplica.

---

## 1. Requerimientos funcionales

### Módulo A — Tenancy, identidad y onboarding

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-A01 | El Super Admin puede crear una administración (tenant) con sus datos básicos. | M | Tenant creado con `tenant_id`; todo dato posterior queda scopeado a ese id. |
| RF-A02 | El administrador puede crear, editar y archivar consorcios dentro de su tenant, indicando tipo (edificio, barrio cerrado, oficinas/cowork). | M | Un admin con 2 consorcios los ve y opera ambos con un solo login (G12). |
| RF-A03 | El administrador puede definir la estructura de unidades de un consorcio (torre/piso/unidad o lote). | M | Unidades creadas individualmente o en lote ("pisos 1-10, deptos A-D"). |
| RF-A04 | El administrador puede dar de alta residentes (propietario/inquilino) asociándolos a una o más unidades, con su teléfono en formato E.164. | M | Un mismo teléfono puede estar vinculado a unidades en distintos consorcios (G6). El vínculo distingue rol propietario/inquilino por unidad. |
| RF-A05 | El administrador puede importar residentes masivamente desde Excel/CSV con validación y reporte de errores fila por fila. | M | Archivo con errores parciales: filas válidas se importan, inválidas se reportan con motivo. |
| RF-A06 | Un teléfono no registrado que escribe al bot recibe un mensaje explicando cómo sumarse (contactar a su administración). | M | Ningún flujo de reporte disponible para no registrados (G6). |
| RF-A07 | El sistema registra para cada unidad quién es el propietario aun cuando el ocupante sea un inquilino. | M | Necesario para la derivación (RF-D03). |

### Módulo B — Captura por WhatsApp (bot)

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-B01 | El bot recibe mensajes de texto, audio y foto vía WhatsApp Cloud API (webhook). | M | Los 3 tipos generan un reporte; otros tipos reciben respuesta de "formato no soportado". |
| RF-B02 | Si el usuario pertenece a más de un consorcio, el bot pregunta a cuál refiere el reporte mostrando la lista de sus consorcios. | M | Usuario con 1 consorcio: no se pregunta. Usuario con N: lista interactiva; la respuesta fija el contexto de la sesión (G6, pitch). |
| RF-B03 | El bot mantiene sesiones de conversación con estado y timeout (ej. 15 min) para completar un reporte en varios mensajes. | M | Sesión expirada → el bot reinicia el flujo amablemente. Estado persistido (no en memoria del proceso). |
| RF-B04 | Los audios se transcriben automáticamente (Whisper) antes del análisis. | M | Audio en castellano rioplatense → texto con calidad suficiente para clasificar. Errores de transcripción no tiran el flujo: fallback a "no te entendí, ¿podés escribirlo?". |
| RF-B05 | La IA extrae del mensaje una estructura: descripción normalizada, categoría, ubicación probable, urgencia técnica sugerida y origen (unidad vs. espacio común). | M | Salida JSON validada por schema; campos faltantes → el bot repregunta solo lo que falta. |
| RF-B06 | Antes de crear el ticket, el bot muestra el resumen estructurado y pide confirmación. | M | El usuario puede corregir categoría/ubicación antes de confirmar. |
| RF-B07 | El bot detecta posibles duplicados y ofrece sumarse (votar) al ticket existente en lugar de crear uno nuevo. | M | Heurística + similitud semántica (G14); el usuario decide. |
| RF-B08 | El tiempo total de carga de un reporte simple vía bot es menor a 60 segundos. | M | Medido en E2E con reporte de texto sin ambigüedades. |
| RF-B09 | Las fotos se almacenan asociadas al ticket y son visibles en panel y app. | M | Foto descargada de la API de Meta y persistida en storage propio (las URLs de Meta expiran). |
| RF-B10 | El usuario puede consultar por WhatsApp el estado de sus tickets abiertos ("estado" / menú). | S | Lista con id corto, título y estado actual. |

### Módulo C — Pipeline de IA

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-C01 | Clasificador de origen: unidad privada vs. espacio común, con confianza. | M | Accuracy ≥ 85% en dataset etiquetado (G4). Confianza baja → marcar para revisión del admin. |
| RF-C02 | Clasificador de categoría (plomería, electricidad, ascensor, seguridad, limpieza, conducta, otros — taxonomía configurable por tipo de consorcio). | M | Accuracy ≥ 90% top-1 (G4). Taxonomía editable por el Super Admin/Admin (proceso estratégico del Sprint 0). |
| RF-C03 | Asignación de urgencia técnica objetiva (ej. CRÍTICA / ALTA / MEDIA / BAJA) con criterios definidos (riesgo a personas, daño progresivo, servicios esenciales). | M | El prompt/criterios versionados en el repo; la urgencia no depende del tono emocional del mensaje (pitch). |
| RF-C04 | Toda salida de IA es una *sugerencia* que el administrador puede corregir; las correcciones quedan registradas. | M | Cada corrección guarda valor sugerido vs. valor final → alimenta el dataset (G16). |
| RF-C05 | Capa de abstracción de proveedor de IA (transcripción y LLM intercambiables). | M | Cambiar de proveedor = cambiar configuración, no código de dominio (G17, riesgo de costos). |
| RF-C06 | Script de evaluación del clasificador contra dataset etiquetado, reportando accuracy, precision, recall y F1 por clase. | M | Corre localmente y en CI; resultados versionados (G16). |
| RF-C07 | Caché de clasificaciones para entradas equivalentes y monitoreo de costo por ticket. | S | Mitigación del riesgo "costos de LLM" del Ante Proyecto. |

### Módulo D — Ciclo de vida del ticket (panel admin)

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-D01 | Bandeja centralizada de tickets filtrable por consorcio, estado, categoría, urgencia y origen, ordenada por prioridad (urgencia + votos). | M | Un admin multi-consorcio ve todo su tenant y puede filtrar por consorcio. |
| RF-D02 | El administrador valida cada ticket nuevo: confirma o corrige la clasificación de la IA y decide el camino (validar / derivar / rechazar / marcar duplicado). | M | Estados según máquina de estados (G13). Toda transición queda en un historial auditable con autor y timestamp. |
| RF-D03 | Derivación al propietario: si el problema es interno de la unidad, el ticket pasa a `DERIVADO`, se notifica al propietario de esa unidad y sale de la bandeja activa. | M | Si el reportante es inquilino, la notificación va al propietario (RF-A07, G7). Auto-archivo a N días configurable. |
| RF-D04 | Asignación de técnico a un ticket validado, con notificación al técnico (WhatsApp saliente / email) incluyendo detalle y fotos. | M | Técnico como registro del tenant, no usuario con login (G8). |
| RF-D05 | Registro de presupuestos y costos por ticket (monto, proveedor, comprobante adjunto, estado borrador/confirmado). | M | Costo confirmado de ticket común → visible a los residentes del consorcio (G10). |
| RF-D06 | Resolución y cierre: el admin marca `RESUELTO` (con nota/foto opcional); el cierre definitivo ocurre tras notificar al reportante y votantes. | M | Reabrir un ticket cerrado crea trazabilidad (motivo de reapertura). |
| RF-D07 | ABM de técnicos del tenant (nombre, rubro, contacto). | M | — |
| RF-D08 | Tablero simple de métricas: tickets por estado, tiempo medio de resolución, costo acumulado por consorcio/período. | S | Las métricas de negocio del Ante Proyecto (observabilidad). |

### Módulo E — App móvil del residente

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-E01 | Login del residente y visualización de sus consorcios/unidades. | M | Mismo modelo de identidad que el bot. |
| RF-E02 | Feed de incidencias de espacios comunes del consorcio con estado, votos y costos confirmados. | M | Tickets derivados/privados no aparecen en el feed (G10, G11). |
| RF-E03 | Upvote de incidencias comunes (1 por usuario), que suscribe a notificaciones del ticket. | M | G18. El contador impacta la prioridad en la bandeja del admin. |
| RF-E04 | Creación de reportes desde la app (texto/foto), pasando por el mismo pipeline de IA. | M | Paridad de pipeline con el bot. |
| RF-E05 | **Modo offline:** los reportes creados sin señal se encolan localmente y se sincronizan al recuperar conectividad, sin duplicarse. | M | Idempotencia por `client_generated_id`; indicador visual de "pendiente de sincronizar" (G5, G15). Probado en subsuelo/modo avión. |
| RF-E06 | Detalle de ticket con línea de tiempo de estados y costos visibles según reglas. | M | — |
| RF-E07 | Notificaciones push de cambios de estado en tickets propios o votados. | S | Complemento del canal WhatsApp (G9). |

### Módulo F — Conductas y convivencia

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-F01 | Reporte de incidencias de conducta (ruidos, estacionamiento, mascotas, etc.) vía bot o app, con evidencia opcional. | S | Clasificado por la misma IA con tipo `CONDUCTA` (G3). |
| RF-F02 | Los reportes de conducta son anónimos frente a terceros: solo el admin ve al reportante; no aparecen en el feed ni se votan. | S | G11. |
| RF-F03 | El admin gestiona el reporte de conducta: descartar, emitir aviso al infractor, o registrar sanción según reglamento. | S | Historial de avisos/sanciones por unidad consultable por el admin. |

### Módulo G — Notificaciones

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-G01 | Notificación al reportante en cada transición relevante de su ticket (creado, validado, derivado, asignado, resuelto, con costo). | M | Vía WhatsApp usando plantillas aprobadas fuera de la ventana de 24h (G9); push como secundario. |
| RF-G02 | Set mínimo de plantillas HSM registradas en Meta: creación, cambio de estado, derivación, resolución con costo. | M | Plantillas versionadas en el repo con su estado de aprobación. |
| RF-G03 | Los votantes de un ticket reciben las mismas notificaciones de estado que el reportante. | S | G18. |

### Módulo H — Seguridad y RBAC

| ID | Requerimiento | Prio | Criterios de aceptación |
|---|---|---|---|
| RF-H01 | Roles: SUPER_ADMIN, ADMIN (tenant), RESIDENTE (con vínculo propietario/inquilino por unidad). Técnico sin login en MVP. | M | Matriz de permisos documentada y testeada (G8, G12). |
| RF-H02 | Aislamiento multi-tenant con Row-Level Security en PostgreSQL: ninguna query puede leer datos de otro tenant. | M | Suite de tests de aislamiento automatizada en CI (riesgo crítico del Ante Proyecto). |
| RF-H03 | Dentro de un tenant, un residente solo accede a datos de los consorcios a los que pertenece. | M | Tests de autorización por consorcio. |
| RF-H04 | Autenticación con tokens de corta duración + refresh; webhook de WhatsApp validado por firma (`X-Hub-Signature-256`). | M | — |
| RF-H05 | Auditoría de acciones sensibles (transiciones de estado, costos, sanciones, cambios de RBAC). | S | Tabla `audit_log` inmutable. |

### Won't (declarados fuera de alcance)

| ID | Requerimiento | Prio |
|---|---|---|
| RF-W01 | Mantenimiento predictivo con IA. | W |
| RF-W02 | Comparador automático de presupuestos. | W |
| RF-W03 | Mediación automática de conflictos según reglamento. | W |
| RF-W04 | Pasarela de pago / gestión de expensas. | C (candidato, no comprometido) |
| RF-W05 | Chat / red social entre vecinos. | C (candidato, no comprometido) |

## 2. Requerimientos no funcionales

| ID | Categoría | Requerimiento | Verificación |
|---|---|---|---|
| RNF-01 | Performance | Respuesta del bot al usuario ≤ 5 s para texto; ≤ 15 s para audio (incluida transcripción). Reporte completo < 60 s. | k6/Artillery + E2E. |
| RNF-02 | Performance | API p95 < 300 ms en endpoints de lectura del panel con 50 consorcios y 10k tickets. | k6 con datos sintéticos. |
| RNF-03 | Escalabilidad | Arquitectura multi-tenant en base única; procesamiento de IA desacoplado por cola de trabajos (los webhooks responden 200 de inmediato y procesan async). | Revisión de arquitectura + test de picos. |
| RNF-04 | Seguridad | RLS activo en todas las tablas tenant-scoped; OWASP Top 10 verificado con ZAP; dependencias auditadas (npm audit/Snyk). | CI + pentest básico pre-piloto. |
| RNF-05 | Privacidad | Datos personales tratados conforme Ley 25.326 (AR): minimización, consentimiento informado en alta de residentes, derecho de supresión. | Checklist legal en la tesis. |
| RNF-06 | Disponibilidad | Si la API de IA o de Meta falla, los reportes no se pierden: quedan encolados con reintentos exponenciales y alerta. | Test de caos básico (apagar mock de OpenAI). |
| RNF-07 | Calidad | Cobertura unitaria ≥ 70% en módulos críticos (clasificación, RBAC, tickets); PR bloqueado bajo umbral; code review obligatorio. | GitHub Actions + branch protection. |
| RNF-08 | Observabilidad | Errores en Sentry (backend + app); métricas: tiempo medio de resolución, tasa de error del bot, latencia API, costo IA por ticket. | Dashboards. |
| RNF-09 | Portabilidad | Despliegue completo con Docker Compose (dev) y contenedores en cloud (staging/prod); proveedor de mensajería y de IA intercambiables por configuración. | `docker compose up` levanta todo el stack local con mocks. |
| RNF-10 | Mantenibilidad | Monorepo TypeScript con tipos compartidos; lint/format en CI; documentación por módulo (README) según Definition of Done. | CI. |
| RNF-11 | Idempotencia | Webhooks de Meta (que reintentan) y sync offline no generan tickets duplicados. | Tests de integración con reintentos simulados. |
| RNF-12 | i18n | UI y bot en español (es-AR); textos centralizados para futura localización. | — |
