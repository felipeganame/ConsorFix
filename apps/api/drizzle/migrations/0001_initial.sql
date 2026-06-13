-- Migration 0001 — base extensions + tenant table with RLS scaffolding.
-- Run as DATABASE_OWNER_URL (owner role). The app role (app_user) never runs migrations.
-- See ADR-001 for the multi-tenant strategy.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS "tenant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "nombre" text NOT NULL,
  "plan" text NOT NULL DEFAULT 'basico',
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- RLS for tenant: an authenticated session can ONLY see its own tenant row.
-- (Tables scoped under a tenant will filter by tenant_id; the `tenant` table
-- filters by `id`.)
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON "tenant";
CREATE POLICY tenant_isolation ON "tenant"
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- App role grants (created in postgres init script).
GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant" TO app_user;

COMMIT;
