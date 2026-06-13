# ConsorcioFix

Plataforma SaaS multi-tenant de gestión de incidencias en consorcios (edificios, barrios cerrados, oficinas). Captura por WhatsApp y app móvil, triaje con IA (Whisper + LLM), gestión desde panel web. Tesis de grado de Ingeniería en Sistemas.

## Docs canónicos

- [`docs/01-vision-alcance-y-gaps.md`](docs/01-vision-alcance-y-gaps.md) — alcance y gaps G1..G18
- [`docs/02-requerimientos.md`](docs/02-requerimientos.md) — RF/RNF + criterios de aceptación
- [`docs/03-procesos-bpmn.md`](docs/03-procesos-bpmn.md) — procesos P1..P8 + máquina de estados
- [`docs/04-arquitectura-y-datos.md`](docs/04-arquitectura-y-datos.md) — C4, ERD, contratos
- [`docs/05-plan-desarrollo-claude-code.md`](docs/05-plan-desarrollo-claude-code.md) — fases
- [`docs/adr/`](docs/adr/) — decisiones de arquitectura
- [`CLAUDE.md`](CLAUDE.md) — reglas para Claude Code (stack, convenciones, comandos)

## Cómo probar la app (modo demo local)

```bash
# 1) Levantar infra
docker compose up -d postgres mock-whatsapp mock-ai
pnpm install

# 2) Migrar + seedear DB
export DATABASE_OWNER_URL=postgres://owner_user:owner_pass@localhost:5433/consorciofix
pnpm db:migrate
pnpm seed

# 3) Boot API + admin web (terminales separadas o background)
export DATABASE_URL=postgres://app_user:app_pass@localhost:5433/consorciofix
export DATABASE_OWNER_URL=postgres://owner_user:owner_pass@localhost:5433/consorciofix
export JWT_SECRET=dev-secret
export WHATSAPP_PROVIDER=mock
export WHATSAPP_MOCK_URL=http://localhost:8081
export WHATSAPP_VERIFY_TOKEN=test-verify-token
export WHATSAPP_APP_SECRET=test-app-secret
export API_PORT=3000

pnpm --filter @consorciofix/api start         # http://localhost:3000
pnpm --filter @consorciofix/admin-web dev     # http://localhost:5173
```

Abrir **http://localhost:5173/login**, entrar con `admin@consorciofix.dev / admin123`.

### Probar el flujo bot → ticket → bandeja

```bash
BODY='{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"messages":[{"id":"wamid.DEMO-001","from":"5491100000001","type":"text","text":{"body":"Hay una perdida de agua grande en el palier"},"timestamp":"1781322308"}]}}]}]}'
SIG=$(node -e "console.log('sha256='+require('crypto').createHmac('sha256','test-app-secret').update('$BODY').digest('hex'))")
curl -X POST http://localhost:3000/webhooks/whatsapp -H "content-type: application/json" -H "x-hub-signature-256: $SIG" -d "$BODY"

# Lo que respondió el bot al usuario:
curl http://localhost:8081/__outbox | jq

# El ticket aparece en la bandeja del admin (refrescar la UI)
```

## Estado actual

**Fase 0 — Fundaciones ✅** monorepo, docker, CI, ADR-001, migraciones 0001+0002.

**Fase 1 — Núcleo de dominio ✅**
- Schema completo: 18 tablas + `_migrations`, 16 con RLS, triggers `updated_at` + `votos_count`
- Aislamiento multi-tenant (RF-H02): **8/8 tests** — RLS bloquea SELECT/UPDATE/DELETE/INSERT cross-tenant
- Máquina de estados 4 estados: REGISTRADO → VALIDADO → SOLUCIONADO | DESCARTADO (TDD 9/9, 100% coverage)
- RBAC matrix + row-level policies (`packages/domain/src/rbac/`, 100% coverage)
- Auth: JWT (jose HS256) + Argon2id; login unificado admin / super_admin / residente
- Tickets API: list/byId/create/transition/vote/unvote con guards de rol + visibilidad por origen
- CRUDs admin: `/consorcios`, `/unidades` (+bulk), `/residentes` (+invite-inquilino self-service), `/vinculos`, `/categorias`
- `DomainErrorFilter` mapea errores de dominio a RFC 7807
- Seeds idempotentes con 4 cuentas demo + datos representativos

**Fase 2 — Canal WhatsApp (MVP funcional ✅, hardening pendiente)**
- Webhook intake `POST/GET /webhooks/whatsapp` con verificación de challenge + firma HMAC-SHA256 + idempotencia por `wamid` (RNF-11)
- `verifyMetaSignature` con **7/7 tests** (tamper, secret wrong, prefix wrong, hex inválido, Buffer/string)
- `IMessagingProvider` con adaptador mock + adaptador WhatsApp Cloud real (send, template, media download)
- `MockClassifier` (heurística determinística) implementa `IClassifier` — listo para reemplazar por LLM
- BotService P1 mínimo: phone lookup cross-tenant → consorcio dispatch (single) → classify → create ticket → reply WA
- **E2E verificado por curl:** webhook → bot → ticket en bandeja + reply al user
- 🟡 BullMQ durable queue (hoy `setImmediate`)
- 🟡 Multi-consorcio session flow (RF-B02)
- 🟡 Audio via Whisper + media download integration

**Fase 1.7 — Admin Web ✅** (login + bandeja + ticket detail + transitions + ABM consorcios/unidades/residentes). Vite proxy `/api → :3000`. Sessión en `sessionStorage`.

**Próximo:** session bot multi-consorcio → IA real (Whisper + LLM) → app móvil Expo.

## Test sweep

```
typecheck         12/12   ✅
unit              all     ✅
RLS isolation      8/8    ✅
signature HMAC     7/7    ✅
state machine      9/9    100% coverage
RBAC matrix+pol    all    100% coverage
```

## Credenciales dev (post-seed)

| email | password | rol |
|---|---|---|
| `super@consorciofix.dev` | `super123` | SUPER_ADMIN |
| `admin@consorciofix.dev` | `admin123` | ADMIN (tenant demo) |
| `propi@consorciofix.dev` | `resi123` | RESIDENTE — propietario unidad 4A |
| `inqui@consorciofix.dev` | `resi123` | RESIDENTE — inquilino unidad 4A |

## Endpoints (resumen)

```
Public:
  GET    /health
  POST   /auth/login                          { email, password }
  POST   /auth/refresh                        { refreshToken }
  GET    /webhooks/whatsapp                   (challenge verify)
  POST   /webhooks/whatsapp                   (firma HMAC obligatoria si secret)
  POST   /internal/bot/process                (header x-internal-token)

ADMIN / SUPER_ADMIN:
  GET    /tickets[?consorcio_id=&estado=]
  GET    /tickets/:id
  POST   /tickets/:id/transitions             { to, origen?, categoria_id?, nota? }
  GET    /consorcios | POST | GET/:id | PATCH/:id
  GET    /unidades | POST | POST /bulk
  GET    /residentes | POST
  GET    /vinculos | POST
  GET    /categorias | POST

RESIDENTE:
  POST   /tickets                             (crea reporte)
  POST   /tickets/:id/votes
  DELETE /tickets/:id/votes
  POST   /residentes/invite-inquilino         (propietario self-service)
```

## Orquestación con Ruflo

```bash
npx ruflo@latest status
npx ruflo@latest memory search -q "<query>"
```
