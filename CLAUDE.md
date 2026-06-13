# CLAUDE.md — ConsorcioFix

Plataforma SaaS multi-tenant de gestión de incidencias en consorcios (edificios, barrios cerrados, oficinas). Captura por WhatsApp y app móvil, triaje con IA (Whisper + LLM), gestión desde panel web. Tesis de grado de Ingeniería en Sistemas — equipo de 2 personas.

## Documentación canónica (leer antes de tareas grandes)

- `docs/01-vision-alcance-y-gaps.md` — alcance, decisiones y gaps resueltos (G1..G18)
- `docs/02-requerimientos.md` — RF/RNF con prioridades y criterios de aceptación
- `docs/03-procesos-bpmn.md` — procesos P1..P8 y máquina de estados del ticket
- `docs/04-arquitectura-y-datos.md` — contenedores, ERD, contratos, pipeline IA
- `docs/05-plan-desarrollo-claude-code.md` — fases, tareas y modelo recomendado
- `docs/adr/` — decisiones de arquitectura (crear una ADR por decisión relevante)

Cuando una tarea referencia un RF (ej. RF-B02) o un proceso (ej. P1), su especificación está en esos docs y **manda sobre cualquier suposición**.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo. TypeScript estricto en todo.
- **apps/api:** NestJS (REST). Validación con Zod (schemas en `packages/contracts`).
- **apps/worker:** procesamiento async con BullMQ (Redis). Los webhooks NUNCA procesan inline: persisten evento + encolan + responden 200.
- **apps/admin-web:** React + Vite.
- **apps/mobile:** React Native + Expo. Offline-first (cola local + `client_generated_id`).
- **packages/domain:** lógica pura (máquina de estados del ticket, reglas RBAC, dedup). Sin dependencias de framework. Acá vive lo testeado al 70%+.
- **packages/contracts:** tipos y schemas Zod compartidos.
- **packages/ai:** puertos `ITranscriber`, `IClassifier`, `IEmbedder` + adaptadores (OpenAI/Anthropic). Prompts versionados en `packages/ai/prompts/`.
- **packages/messaging:** puerto `IMessagingProvider` + adaptador WhatsApp Cloud API + mock.
- **DB:** PostgreSQL 16 + pgvector. **Multi-tenancy por Row-Level Security**: cada transacción setea `SET LOCAL app.tenant_id`. El usuario de DB de la app no es owner de las tablas.
- **Storage:** S3-compatible (MinIO en dev) para fotos/comprobantes.

## Comandos

```bash
docker compose up -d        # postgres, redis, minio, mocks de whatsapp e IA
pnpm install
pnpm db:migrate             # migraciones
pnpm seed                   # datos de desarrollo (1 tenant, 2 consorcios, residentes)
pnpm dev                    # api + worker + admin-web en watch
pnpm test                   # unitarios
pnpm test:integration       # Testcontainers
pnpm test:isolation         # suite de aislamiento multi-tenant (crítica)
pnpm lint && pnpm typecheck
pnpm ai:eval                # evalúa clasificador contra dataset etiquetado
```

## Reglas no negociables

1. **Aislamiento multi-tenant:** ningún query puede cruzar tenants. Toda tabla tenant-scoped tiene política RLS. Si agregás una tabla, agregás su política y un test en `test:isolation`.
2. **Máquina de estados:** las transiciones de ticket SOLO pasan por `packages/domain`. Nada de updates directos de `estado` en la DB.
3. **Idempotencia:** webhooks por `wamid`, reportes de app por `client_generated_id`. Reintentos jamás duplican tickets.
4. **IA sugiere, el admin decide:** toda salida del clasificador se persiste en `clasificacion_ia` como sugerencia; las correcciones del admin se registran (alimentan el dataset).
5. **Sin secretos en código:** todo por env vars; `.env.example` actualizado.
6. **Definition of Done por PR:** criterios de aceptación del RF cumplidos + tests unit/integración pasando + lint/typecheck verdes + README del módulo actualizado. PRs chicos, una unidad de trabajo por PR.
7. **Cobertura ≥70%** en `packages/domain` y módulos de clasificación/RBAC/tickets. CI bloquea por debajo.
8. **Español es-AR** en textos de usuario (bot, app, panel); código e identificadores en inglés.
9. **Prompts versionados:** cambiar un prompt del clasificador exige correr `pnpm ai:eval` y registrar el resultado en el changelog del prompt.
10. **Abstracciones de proveedor:** nunca llamar SDKs de OpenAI/Anthropic/Meta directamente desde dominio o API; siempre a través de `packages/ai` y `packages/messaging`.

## Convenciones

- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`...). Ramas `feature/RF-XXX-descripcion`.
- Errores de dominio tipados (no strings); respuestas de error RFC 7807.
- Tests de dominio primero (TDD) en: máquina de estados, RBAC, dedup, idempotencia, RLS.
- Fechas en UTC en DB; formateo en cliente. Teléfonos siempre E.164.
- IDs: UUID v4. IDs cortos legibles para tickets de cara al usuario (ej. `INC-0231`) generados por secuencia por consorcio.

## Contexto de negocio mínimo

- **Tenant = administración** (puede tener N consorcios). Residente puede pertenecer a varios consorcios → el bot desambigua (P1/RF-B02).
- **Roles:** SUPER_ADMIN, ADMIN, RESIDENTE. El **técnico está fuera del sistema**: el admin lo contacta por afuera, registra el costo y adjunta factura cuando se resuelve. **No hay tabla `tecnico`**.
- **Vínculo unidad-residente:** PROPIETARIO o INQUILINO (no hay PARTICIPANTE). N propietarios y N inquilinos por unidad (cada persona con su login). El propietario crea las altas de inquilinos desde la app.
- **Estados del ticket:** REGISTRADO → VALIDADO → SOLUCIONADO (feliz) | REGISTRADO/VALIDADO → DESCARTADO (admin descarta si no aplica). Sin reapertura: si reaparece el problema se crea ticket nuevo. (Decisión 2026-06-12, supera P2 del doc 03 — ver migración 0002 y `packages/domain/src/ticket/transitions.ts`.)
- **Origen del ticket:** UNIDAD (visible solo a admin + ocupantes de esa unidad) o ESPACIO_COMUN (visible a todos los residentes del consorcio). Se confirma al validar.
- **Tickets de conducta:** anónimos frente a terceros. Solo admin ve al reportante. Visible a admin + ocupantes de la **unidad reportada**.
- **Costo:** una sola entidad `gasto` (monto + comprobante_url + estado BORRADOR|CONFIRMADO), cargada por el admin. Reemplaza `presupuesto` del ERD original.
- Costos confirmados de espacios comunes: visibles a todos los residentes del consorcio (transparencia es la propuesta de valor).
