# ConsorcioFix — Arquitectura y Modelo de Datos

> Propuesta técnica de referencia para arrancar el desarrollo con Claude Code. Implementa las decisiones G2 (stack TS), G12 (tenant = administración), G14 (dedup), G15 (offline) y G17 (abstracción IA). Todo es ajustable, pero esta es la línea base coherente con el Ante Proyecto.

---

## 1. Vista de contenedores (C4 nivel 2)

```mermaid
flowchart TB
    R([Residente]) -->|texto/audio/foto| WA[WhatsApp Cloud API<br/>Meta]
    R -->|app| APP[App Móvil<br/>React Native + Expo<br/>offline-first]
    ADM([Administrador]) --> PANEL[Panel Admin Web<br/>React + Vite]
    WA -->|webhook firmado| API
    APP --> API[Backend API<br/>NestJS · TypeScript<br/>REST + validación Zod]
    PANEL --> API
    API --> Q[(Cola de trabajos<br/>BullMQ + Redis)]
    Q --> WORK[Worker de procesamiento<br/>mismo monorepo]
    WORK --> IA[Capa AIProvider<br/>Whisper · LLM estructurado · embeddings]
    IA -.->|HTTP| EXT1[OpenAI / Anthropic APIs]
    WORK --> DB[(PostgreSQL 16<br/>RLS multi-tenant + pgvector)]
    API --> DB
    WORK -->|mensajes salientes / plantillas| WA
    API --> ST[(Object Storage<br/>fotos y comprobantes<br/>S3-compatible / MinIO en dev)]
    WORK --> ST
    API --> SENTRY[Sentry + métricas]
    APP -. push .-> FCM[Expo Push / FCM]
```

**Decisiones clave:**

1. **Monorepo TypeScript** (pnpm workspaces o Turborepo):
   ```
   /apps
     /api          → NestJS (REST, auth, RBAC, webhooks)
     /worker       → procesamiento async (IA, notificaciones)
     /admin-web    → React + Vite (panel)
     /mobile       → React Native + Expo
   /packages
     /domain       → entidades, máquina de estados del ticket, reglas puras
     /contracts    → tipos compartidos + schemas Zod (API y eventos)
     /ai           → AIProvider: ITranscriber, IClassifier, IEmbedder
     /messaging    → IMessagingProvider (WhatsApp Cloud hoy; Twilio/360dialog mañana)
   ```
2. **Webhook fire-and-forget:** el endpoint de Meta valida firma, persiste el evento crudo (tabla `webhook_events`, idempotencia por `wamid`) y responde 200. Todo lo demás pasa por BullMQ (RNF-03, RNF-11).
3. **Abstracciones por riesgo** (del análisis de riesgos del Ante Proyecto): `IMessagingProvider` y `AIProvider` como puertos; los adaptadores concretos viven en `/packages`. Cambiar proveedor = cambiar binding + env vars.
4. **RLS por tenant:** cada request setea `SET LOCAL app.tenant_id = $1` en la transacción; políticas RLS en todas las tablas tenant-scoped. El usuario de DB de la app **no** es owner de las tablas (RLS no aplica a owners). Tests de aislamiento dedicados (RF-H02).
5. **Dedup semántico:** `pgvector` con embedding de la descripción normalizada; índice ivfflat; filtro previo por consorcio + categoría + estado abierto (G14) para que la búsqueda vectorial sea barata.
6. **Offline app:** cola local persistente (SQLite vía expo-sqlite o WatermelonDB) con `client_generated_id` UUID v4 generado en el dispositivo; el backend hace upsert idempotente (G15).

## 2. Modelo de datos (ERD)

```mermaid
erDiagram
    TENANT ||--o{ CONSORCIO : contiene
    TENANT ||--o{ USUARIO_ADMIN : tiene
    TENANT ||--o{ TECNICO : registra
    CONSORCIO ||--o{ UNIDAD : compone
    CONSORCIO ||--o{ CATEGORIA : configura
    UNIDAD ||--o{ VINCULO_RESIDENTE : ocupa
    RESIDENTE ||--o{ VINCULO_RESIDENTE : posee
    RESIDENTE ||--o{ TICKET : reporta
    RESIDENTE ||--o{ VOTO : emite
    CONSORCIO ||--o{ TICKET : agrupa
    UNIDAD |o--o{ TICKET : "refiere (si unidad)"
    TICKET ||--o{ TICKET_EVENTO : historial
    TICKET ||--o{ MEDIA : adjunta
    TICKET ||--o{ VOTO : recibe
    TICKET ||--o{ PRESUPUESTO : presupuesta
    TICKET ||--o| CLASIFICACION_IA : sugiere
    TICKET |o--o| TECNICO : asignado
    TICKET ||--o{ NOTIFICACION : dispara
    TICKET |o--o| TICKET : duplicado_de
    UNIDAD ||--o{ REGISTRO_CONDUCTA : convivencia
    WEBHOOK_EVENT ||--o| TICKET : origina
    SESION_BOT }o--|| RESIDENTE : pertenece

    TENANT { uuid id PK string nombre string plan }
    CONSORCIO { uuid id PK uuid tenant_id FK string nombre enum tipo "EDIFICIO|BARRIO|OFICINAS" string direccion }
    UNIDAD { uuid id PK uuid consorcio_id FK string etiqueta "ej 5B / Lote 12" }
    RESIDENTE { uuid id PK string nombre string telefono_e164 UK string email }
    VINCULO_RESIDENTE { uuid id PK uuid residente_id FK uuid unidad_id FK enum rol "PROPIETARIO|INQUILINO" bool activo }
    USUARIO_ADMIN { uuid id PK uuid tenant_id FK string email UK enum rol "SUPER_ADMIN|ADMIN" }
    TECNICO { uuid id PK uuid tenant_id FK string nombre string rubro string telefono }
    CATEGORIA { uuid id PK uuid consorcio_id FK string nombre bool es_conducta }
    TICKET { uuid id PK uuid tenant_id FK uuid consorcio_id FK uuid unidad_id FK "null si común" uuid reportante_id FK enum tipo "INFRAESTRUCTURA|CONDUCTA" enum origen "UNIDAD|ESPACIO_COMUN" enum urgencia "CRITICA|ALTA|MEDIA|BAJA" enum estado string titulo text descripcion_normalizada vector embedding string client_generated_id UK int votos_count timestamptz created_at }
    CLASIFICACION_IA { uuid ticket_id PK json sugerido json corregido_por_admin float confianza string modelo string prompt_version }
    TICKET_EVENTO { uuid id PK uuid ticket_id FK enum transicion uuid autor_id text nota timestamptz at }
    VOTO { uuid id PK uuid ticket_id FK uuid residente_id FK "UK(ticket,residente)" }
    PRESUPUESTO { uuid id PK uuid ticket_id FK uuid tecnico_id FK decimal monto enum estado "BORRADOR|CONFIRMADO" string comprobante_url }
    MEDIA { uuid id PK uuid ticket_id FK enum tipo "FOTO|AUDIO|COMPROBANTE" string storage_url string wa_media_id }
    REGISTRO_CONDUCTA { uuid id PK uuid unidad_id FK uuid ticket_id FK enum resultado "DESCARTADO|AVISO|SANCION" text detalle }
    NOTIFICACION { uuid id PK uuid ticket_id FK uuid destinatario_id enum canal "WHATSAPP|PUSH" string plantilla enum estado "PENDIENTE|ENVIADA|FALLIDA" }
    SESION_BOT { uuid id PK string telefono_e164 uuid consorcio_ctx FK json estado_flujo timestamptz expira_at }
    WEBHOOK_EVENT { uuid id PK string wamid UK json payload enum estado "RECIBIDO|PROCESADO|ERROR" }
```

**Notas del modelo:**
- `VINCULO_RESIDENTE` es la pieza que resuelve "propietario e inquilino diferenciados por unidad" (RF-A04/A07) y "usuario en múltiples consorcios" (el bot lista los consorcios derivados de sus vínculos activos, RF-B02).
- `TICKET.unidad_id` nullable: null = espacio común. `origen` lo sugiere la IA y lo confirma el admin.
- `CLASIFICACION_IA` guarda sugerido vs. corregido + versión de prompt y modelo → dataset de mejora (RF-C04, G16) y material de tesis.
- `votos_count` desnormalizado para ordenar la bandeja sin agregaciones costosas; consistencia por trigger o en el servicio.
- Todas las tablas tenant-scoped llevan `tenant_id` (directo o derivable) y política RLS `tenant_id = current_setting('app.tenant_id')::uuid`.

## 3. Contratos clave (resumen)

| Endpoint / evento | Descripción |
|---|---|
| `POST /webhooks/whatsapp` | Recepción Meta. Valida firma, persiste `webhook_event`, encola, responde 200. |
| `GET /webhooks/whatsapp` | Verificación del challenge de Meta (setup). |
| `POST /tickets` (app) | Crea reporte desde app. Acepta `client_generated_id`; idempotente. |
| `POST /tickets/:id/votes` | Upvote (único por residente). |
| `POST /tickets/:id/transitions` | Transición de estado (solo ADMIN, valida máquina de estados en `/packages/domain`). |
| `POST /tickets/:id/budgets` | Alta de presupuesto/costo. |
| `POST /consorcios/:id/residents/import` | Importación Excel/CSV con reporte de errores. |
| Job `process-incoming-message` | Orquesta P1: sesión → transcripción → extracción → dedup → confirmación. |
| Job `send-notification` | Salientes con plantilla; maneja ventana 24h y reintentos. |
| Job `evaluate-classifier` | Corre dataset etiquetado y emite métricas (RF-C06). |

## 4. Pipeline de IA (detalle)

```mermaid
flowchart LR
    A[Mensaje crudo] --> B{¿Audio?}
    B -- Sí --> C[ITranscriber.transcribe<br/>Whisper API · es-AR]
    B -- No --> D
    C --> D[IClassifier.extract<br/>LLM con salida estructurada JSON Schema:<br/>titulo, descripcion, categoria,<br/>origen, urgencia, ubicacion, confianza]
    D --> E{¿Schema válido y completo?}
    E -- No --> F[Repreguntar campo faltante<br/>máx 2 iteraciones]
    E -- Sí --> G[IEmbedder.embed descripcion]
    G --> H[Dedup: filtro SQL + pgvector top-k]
    H --> I[Resultado al flujo del bot P1]
```

- **Prompts versionados** en `/packages/ai/prompts/*.md` con changelog — cada cambio de prompt es un experimento medible con el script de evaluación (P8).
- **Criterios de urgencia** explícitos en el prompt (riesgo a personas > daño progresivo > confort), para cumplir la promesa del pitch de "perito objetivo".
- **Costo por ticket** trackeado: tokens in/out por llamada en tabla de telemetría (RF-C07).

## 5. Entornos y despliegue

| Entorno | Infra | Notas |
|---|---|---|
| **dev local** | Docker Compose: postgres+pgvector, redis, minio, mailhog, mock de WhatsApp y mock de IA | `docker compose up` y a programar. Los mocks permiten desarrollar sin gastar API ni exponer webhooks. Para probar Meta real: túnel (ngrok/cloudflared). |
| **staging** | VPS barato o Fly.io/Railway con contenedores; DB administrada o en el mismo VPS | Deploy automático desde `main` tras CI verde. Smoke E2E post-deploy. |
| **piloto/prod** | Igual que staging con aprobación manual | Sentry + backups diarios de Postgres (proceso de soporte del Sprint 0). |

## 6. Seguridad (síntesis operable)

1. JWT corto + refresh; hash Argon2id; rate limiting en auth y webhook.
2. RLS en Postgres + tests de aislamiento que intentan leer datos cruzados con tokens de otro tenant (deben fallar) — riesgo crítico del Ante Proyecto.
3. RBAC en guards de NestJS con matriz declarativa testeada (RF-H01/H03).
4. Validación de firma del webhook; secrets solo por env; `npm audit`/Snyk en CI; ZAP baseline scan pre-piloto (RNF-04).
5. Datos personales: minimización y consentimiento (Ley 25.326) — documentar en tesis (RNF-05).
