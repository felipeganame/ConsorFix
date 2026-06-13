# ADR-001 — ORM, esquema base y estrategia RLS / pgvector

- Estado: **Aceptada (provisional)** — confirmar tras primer spike de migraciones (Fase 0.4 final).
- Fecha: 2026-06-12
- Decisores: equipo ConsorcioFix
- Relacionado: regla 1 y 2 de `CLAUDE.md`, RF-H02, G14, docs/04 §2 y §6.

## Contexto

Necesitamos un acceso a Postgres 16 + pgvector que cumpla simultáneamente:

1. **Aislamiento multi-tenant por RLS** con `SET LOCAL app.tenant_id = $1` por transacción. El usuario de DB de la app **no** es owner de las tablas (RLS no aplica a owners).
2. **Soporte de pgvector** (tipo `vector(384)`, índice `ivfflat`) para dedup semántico (G14).
3. **Migraciones versionadas** ejecutables por un rol owner separado del rol de la app.
4. **Pool de conexiones** que NO recicle conexiones con `app.tenant_id` colado entre requests.

Las dos opciones realistas en TS son **Prisma** y **Drizzle**.

## Opciones evaluadas

### Prisma
- Pros: gran ergonomía, generación de tipos, ecosistema maduro.
- Contras críticos:
  - El cliente de Prisma maneja transacciones a través de un proxy; los `$transaction` interactivos sí permiten `SET LOCAL`, pero el patrón requiere atravesar el proxy en cada consulta para garantizar que la misma conexión retiene el `SET LOCAL`. Es frágil.
  - Schema de Prisma no modela `vector` nativamente — habría que recurrir a `Unsupported("vector(384)")` y queries crudas para todo lo de embeddings, perdiendo tipos.
  - Soporte de roles y RLS es manual y siempre "fuera del happy path".

### Drizzle ORM
- Pros decisivos:
  - SQL-builder explícito; cualquier `db.execute(sql\`SET LOCAL app.tenant_id = ${id}\`)` se ejecuta en la **misma transacción** que las siguientes queries del callback `db.transaction(...)` — encaja con el patrón requerido sin sorpresas.
  - `pgvector` soportado por `drizzle-orm/pg-core` (tipo `vector`, índice `ivfflat`/`hnsw`).
  - Migraciones generadas por `drizzle-kit` en SQL plano: legibles, ejecutables por `psql` como rol owner.
  - Modelo de tablas en TS con `pgTable(...)`: tipos full sin generación externa.
- Contras: menos "magia" (a propósito); algunas operaciones complejas requieren SQL crudo (lo cual es **bueno** acá).

## Decisión

**Drizzle ORM** + `drizzle-kit` para migraciones SQL versionadas en `apps/api/drizzle/`.

### Patrón de acceso a DB (regla 1 de CLAUDE.md)

```ts
// Pseudocódigo del wrapper que toda request usa.
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
    return fn(tx);
  });
}
```

- Un **interceptor NestJS** (RF-H02) extrae `tenant_id` del JWT y envuelve el handler en `withTenant`.
- Las migraciones NO se ejecutan con `app_user`; se ejecutan con `owner_user`.
- Las políticas RLS se crean en migración, una por tabla tenant-scoped, del tipo `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

### Pool de conexiones

- `node-postgres` con `pg-pool`. `release()` ejecuta `RESET ALL` antes de devolver al pool (config `afterCreate`/manual) para garantizar que `app.tenant_id` no se filtre entre requests.
- `SET LOCAL` ya está acotado a la transacción, pero `RESET ALL` al release es defensa en profundidad.

### Esquema base inicial (resumen)

Tablas tenant-scoped (todas con `tenant_id uuid not null` + política RLS):

`tenant`, `consorcio`, `unidad`, `residente`, `vinculo_residente`, `usuario_admin`, `tecnico`, `categoria`, `ticket`, `clasificacion_ia`, `ticket_evento`, `voto`, `presupuesto`, `media`, `registro_conducta`, `notificacion`, `sesion_bot`, `webhook_event`, `audit_log`.

Excepción: `tenant` se filtra por su propio `id = current_setting('app.tenant_id')::uuid`.

Índices base:
- `ticket(consorcio_id, estado, created_at desc)` — bandeja del admin (RF-D01).
- `ticket(client_generated_id) unique` — idempotencia app (RF-E05, G15).
- `webhook_event(wamid) unique` — idempotencia Meta (RNF-11).
- `voto(ticket_id, residente_id) unique` — RF-E03.
- `ticket using ivfflat (embedding vector_cosine_ops)` con filtro previo por consorcio + categoría + estado abierto (G14).

## Consecuencias

- Cada PR que agrega una tabla tenant-scoped debe agregar: (a) política RLS, (b) test en `pnpm test:isolation` que intente cruzar tenants y falle.
- La capa de aplicación nunca emite SQL contra Postgres sin pasar por `withTenant` (excepción: rutas públicas como `/health` y verificación del webhook).
- Cambiar de ORM más adelante es caro: las migraciones SQL son portables, pero la capa de tipos no.

## Revisar cuando

- Volumen de embeddings supere los 1M de filas por consorcio (evaluar `hnsw` vs `ivfflat`).
- Aparezcan necesidades de read replicas (el wrapper `withTenant` debería ruteable a la primaria solo si hay escritura).
