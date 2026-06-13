-- Migration 0002 — core domain schema with RLS.
-- ERD source: docs/04-arquitectura-y-datos.md §2.
--
-- Cambios respecto al ERD original (decisión del producto, 2026-06-12):
--   * Sin tabla `tecnico`: el técnico es gestionado por el admin fuera del sistema.
--   * Estados del ticket simplificados: REGISTRADO | VALIDADO | DESCARTADO | SOLUCIONADO.
--   * Costo unificado en `gasto` (monto + factura + estado), reemplaza `presupuesto`.
--   * `ticket.origen` define visibilidad: UNIDAD = solo admin + ocupantes; ESPACIO_COMUN = todos del consorcio.
--   * Conducta: anónima frente a terceros (reportante_id solo visible al admin); reporte visible a admin + ocupantes de la unidad reportada.
--
-- Run as DATABASE_OWNER_URL.

BEGIN;

-- =========================================================
-- usuario_admin — SUPER_ADMIN tenant_id NULL; ADMIN scoped.
-- =========================================================
CREATE TABLE IF NOT EXISTS "usuario_admin" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "rol" text NOT NULL CHECK ("rol" IN ('SUPER_ADMIN', 'ADMIN')),
  "nombre" text NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usuario_admin_email_unique UNIQUE ("email")
);
ALTER TABLE "usuario_admin" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuario_admin" FORCE ROW LEVEL SECURITY;
CREATE POLICY usuario_admin_isolation ON "usuario_admin"
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- consorcio
-- =========================================================
CREATE TABLE IF NOT EXISTS "consorcio" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "tipo" text NOT NULL CHECK ("tipo" IN ('EDIFICIO', 'BARRIO', 'OFICINAS')),
  "direccion" text,
  "archivado" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX consorcio_tenant_idx ON "consorcio"("tenant_id");
ALTER TABLE "consorcio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consorcio" FORCE ROW LEVEL SECURITY;
CREATE POLICY consorcio_isolation ON "consorcio"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- unidad
-- =========================================================
CREATE TABLE IF NOT EXISTS "unidad" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "consorcio_id" uuid NOT NULL REFERENCES "consorcio"("id") ON DELETE CASCADE,
  "etiqueta" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unidad_consorcio_etiqueta_unique UNIQUE ("consorcio_id", "etiqueta")
);
CREATE INDEX unidad_consorcio_idx ON "unidad"("consorcio_id");
ALTER TABLE "unidad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "unidad" FORCE ROW LEVEL SECURITY;
CREATE POLICY unidad_isolation ON "unidad"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- residente — múltiples residentes por unidad, distintos logins por persona.
-- Telefono e164 único por tenant (un mismo número puede vivir en consorcios
-- de distintos tenants).
-- =========================================================
CREATE TABLE IF NOT EXISTS "residente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "telefono_e164" text NOT NULL,
  "email" text,
  "password_hash" text,
  "activo" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT residente_tenant_telefono_unique UNIQUE ("tenant_id", "telefono_e164")
);
CREATE INDEX residente_telefono_idx ON "residente"("telefono_e164");
CREATE INDEX residente_tenant_idx ON "residente"("tenant_id");
ALTER TABLE "residente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "residente" FORCE ROW LEVEL SECURITY;
CREATE POLICY residente_isolation ON "residente"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- vinculo_residente — N residentes x N unidades, rol PROPIETARIO|INQUILINO.
-- Cuando un PROPIETARIO crea un INQUILINO (alta desde la app), el campo
-- `creado_por_id` referencia al propietario que lo dio de alta (auditoría).
-- =========================================================
CREATE TABLE IF NOT EXISTS "vinculo_residente" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "residente_id" uuid NOT NULL REFERENCES "residente"("id") ON DELETE CASCADE,
  "unidad_id" uuid NOT NULL REFERENCES "unidad"("id") ON DELETE CASCADE,
  "rol" text NOT NULL CHECK ("rol" IN ('PROPIETARIO', 'INQUILINO')),
  "activo" boolean NOT NULL DEFAULT true,
  "creado_por_id" uuid REFERENCES "residente"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vinculo_unique UNIQUE ("residente_id", "unidad_id", "rol")
);
CREATE INDEX vinculo_residente_idx ON "vinculo_residente"("residente_id");
CREATE INDEX vinculo_unidad_idx ON "vinculo_residente"("unidad_id");
ALTER TABLE "vinculo_residente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vinculo_residente" FORCE ROW LEVEL SECURITY;
CREATE POLICY vinculo_isolation ON "vinculo_residente"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- categoria
-- =========================================================
CREATE TABLE IF NOT EXISTS "categoria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "consorcio_id" uuid NOT NULL REFERENCES "consorcio"("id") ON DELETE CASCADE,
  "nombre" text NOT NULL,
  "es_conducta" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categoria_consorcio_nombre_unique UNIQUE ("consorcio_id", "nombre")
);
CREATE INDEX categoria_consorcio_idx ON "categoria"("consorcio_id");
ALTER TABLE "categoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categoria" FORCE ROW LEVEL SECURITY;
CREATE POLICY categoria_isolation ON "categoria"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- ticket — máquina de estados simplificada: REGISTRADO|VALIDADO|DESCARTADO|SOLUCIONADO.
-- `origen` (UNIDAD|ESPACIO_COMUN) determina visibilidad y se confirma al validar.
-- `unidad_id` referencia a la unidad afectada: para INFRA UNIDAD es la del reportante;
-- para CONDUCTA es la unidad reportada (la del infractor).
-- `tipo` distingue INFRA vs CONDUCTA — CONDUCTA siempre es anónima frente a terceros.
-- Sin técnico. Dedup via embedding.
-- =========================================================
CREATE TABLE IF NOT EXISTS "ticket" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "consorcio_id" uuid NOT NULL REFERENCES "consorcio"("id") ON DELETE CASCADE,
  "unidad_id" uuid REFERENCES "unidad"("id") ON DELETE SET NULL,
  "reportante_id" uuid REFERENCES "residente"("id") ON DELETE SET NULL,
  "tipo" text NOT NULL CHECK ("tipo" IN ('INFRAESTRUCTURA', 'CONDUCTA')),
  "origen" text CHECK ("origen" IN ('UNIDAD', 'ESPACIO_COMUN')),
  "urgencia" text NOT NULL CHECK ("urgencia" IN ('CRITICA', 'ALTA', 'MEDIA', 'BAJA')),
  "estado" text NOT NULL DEFAULT 'REGISTRADO' CHECK ("estado" IN (
    'REGISTRADO', 'VALIDADO', 'DESCARTADO', 'SOLUCIONADO'
  )),
  "titulo" text NOT NULL,
  "descripcion_normalizada" text NOT NULL,
  "embedding" vector(384),
  "client_generated_id" uuid,
  "short_code" text,
  "votos_count" integer NOT NULL DEFAULT 0,
  "categoria_id" uuid REFERENCES "categoria"("id") ON DELETE SET NULL,
  "duplicado_de_id" uuid REFERENCES "ticket"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "validated_at" timestamptz,
  "solucionado_at" timestamptz,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_client_gen_unique UNIQUE ("tenant_id", "client_generated_id")
);
CREATE INDEX ticket_bandeja_idx ON "ticket"("consorcio_id", "estado", "created_at" DESC);
CREATE INDEX ticket_tenant_idx ON "ticket"("tenant_id");
CREATE INDEX ticket_short_code_idx ON "ticket"("consorcio_id", "short_code");
CREATE INDEX ticket_unidad_idx ON "ticket"("unidad_id") WHERE "unidad_id" IS NOT NULL;
-- Dedup vectorial; filtro previo por consorcio+estado para que sea barato.
CREATE INDEX ticket_embedding_idx ON "ticket" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
ALTER TABLE "ticket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket" FORCE ROW LEVEL SECURITY;
CREATE POLICY ticket_isolation ON "ticket"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- clasificacion_ia
-- =========================================================
CREATE TABLE IF NOT EXISTS "clasificacion_ia" (
  "ticket_id" uuid PRIMARY KEY REFERENCES "ticket"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "sugerido" jsonb NOT NULL,
  "corregido_por_admin" jsonb,
  "confianza" real,
  "modelo" text NOT NULL,
  "prompt_version" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "clasificacion_ia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clasificacion_ia" FORCE ROW LEVEL SECURITY;
CREATE POLICY clasificacion_ia_isolation ON "clasificacion_ia"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- ticket_evento — historial inmutable.
-- =========================================================
CREATE TABLE IF NOT EXISTS "ticket_evento" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "transicion" text NOT NULL,
  "estado_anterior" text,
  "estado_nuevo" text NOT NULL,
  "autor_id" uuid,
  "autor_tipo" text NOT NULL CHECK ("autor_tipo" IN ('ADMIN', 'SISTEMA', 'BOT', 'RESIDENTE')),
  "nota" text,
  "at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ticket_evento_ticket_idx ON "ticket_evento"("ticket_id", "at" DESC);
ALTER TABLE "ticket_evento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_evento" FORCE ROW LEVEL SECURITY;
CREATE POLICY ticket_evento_isolation ON "ticket_evento"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- voto — 1 voto por residente x ticket.
-- =========================================================
CREATE TABLE IF NOT EXISTS "voto" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "residente_id" uuid NOT NULL REFERENCES "residente"("id") ON DELETE CASCADE,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT voto_ticket_residente_unique UNIQUE ("ticket_id", "residente_id")
);
CREATE INDEX voto_ticket_idx ON "voto"("ticket_id");
ALTER TABLE "voto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "voto" FORCE ROW LEVEL SECURITY;
CREATE POLICY voto_isolation ON "voto"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- gasto — costo del arreglo cargado por el admin con factura adjunta.
-- Reemplaza la idea de "presupuesto" del ERD original. 1 ticket puede tener
-- N gastos (ej. plomero + materiales) — todos cuentan para el costo total.
-- =========================================================
CREATE TABLE IF NOT EXISTS "gasto" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "descripcion" text NOT NULL,
  "monto" numeric(14, 2) NOT NULL,
  "moneda" text NOT NULL DEFAULT 'ARS',
  "comprobante_url" text,
  "estado" text NOT NULL DEFAULT 'BORRADOR' CHECK ("estado" IN ('BORRADOR', 'CONFIRMADO')),
  "cargado_por_id" uuid REFERENCES "usuario_admin"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gasto_ticket_idx ON "gasto"("ticket_id");
ALTER TABLE "gasto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gasto" FORCE ROW LEVEL SECURITY;
CREATE POLICY gasto_isolation ON "gasto"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- media — fotos/audio/comprobantes por ticket.
-- =========================================================
CREATE TABLE IF NOT EXISTS "media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL CHECK ("tipo" IN ('FOTO', 'AUDIO', 'COMPROBANTE')),
  "storage_url" text NOT NULL,
  "wa_media_id" text,
  "size_bytes" integer,
  "mime_type" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_ticket_idx ON "media"("ticket_id");
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media" FORCE ROW LEVEL SECURITY;
CREATE POLICY media_isolation ON "media"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- registro_conducta — avisos/sanciones (RF-F03).
-- =========================================================
CREATE TABLE IF NOT EXISTS "registro_conducta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "unidad_id" uuid NOT NULL REFERENCES "unidad"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "resultado" text NOT NULL CHECK ("resultado" IN ('DESCARTADO', 'AVISO', 'SANCION')),
  "detalle" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registro_conducta_unidad_idx ON "registro_conducta"("unidad_id");
ALTER TABLE "registro_conducta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "registro_conducta" FORCE ROW LEVEL SECURITY;
CREATE POLICY registro_conducta_isolation ON "registro_conducta"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- notificacion — outbox. Sin técnico.
-- =========================================================
CREATE TABLE IF NOT EXISTS "notificacion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "ticket_id" uuid NOT NULL REFERENCES "ticket"("id") ON DELETE CASCADE,
  "destinatario_id" uuid NOT NULL,
  "destinatario_tipo" text NOT NULL CHECK ("destinatario_tipo" IN ('RESIDENTE', 'ADMIN')),
  "canal" text NOT NULL CHECK ("canal" IN ('WHATSAPP', 'PUSH', 'EMAIL')),
  "plantilla" text NOT NULL,
  "estado" text NOT NULL DEFAULT 'PENDIENTE' CHECK ("estado" IN ('PENDIENTE', 'ENVIADA', 'FALLIDA')),
  "intentos" integer NOT NULL DEFAULT 0,
  "provider_message_id" text,
  "error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notificacion_pending_idx ON "notificacion"("estado", "created_at")
  WHERE "estado" = 'PENDIENTE';
ALTER TABLE "notificacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notificacion" FORCE ROW LEVEL SECURITY;
CREATE POLICY notificacion_isolation ON "notificacion"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- sesion_bot — keyed por teléfono. NO tenant-scoped (pre-routing).
-- =========================================================
CREATE TABLE IF NOT EXISTS "sesion_bot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "telefono_e164" text NOT NULL,
  "tenant_id" uuid REFERENCES "tenant"("id") ON DELETE CASCADE,
  "consorcio_ctx_id" uuid REFERENCES "consorcio"("id") ON DELETE SET NULL,
  "estado_flujo" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expira_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sesion_bot_telefono_unique UNIQUE ("telefono_e164")
);
CREATE INDEX sesion_bot_expira_idx ON "sesion_bot"("expira_at");

-- =========================================================
-- webhook_event — idempotencia Meta. NO RLS (pre-routing).
-- =========================================================
CREATE TABLE IF NOT EXISTS "webhook_event" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'whatsapp',
  "wamid" text NOT NULL,
  "from_phone" text,
  "payload" jsonb NOT NULL,
  "estado" text NOT NULL DEFAULT 'RECIBIDO' CHECK ("estado" IN ('RECIBIDO', 'PROCESADO', 'ERROR')),
  "error" text,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz,
  CONSTRAINT webhook_event_wamid_unique UNIQUE ("provider", "wamid")
);
CREATE INDEX webhook_event_estado_idx ON "webhook_event"("estado", "received_at")
  WHERE "estado" = 'RECIBIDO';

-- =========================================================
-- audit_log — append-only.
-- =========================================================
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "actor_id" uuid,
  "actor_tipo" text NOT NULL CHECK ("actor_tipo" IN ('ADMIN', 'SUPER_ADMIN', 'SISTEMA')),
  "accion" text NOT NULL,
  "entidad" text NOT NULL,
  "entidad_id" uuid,
  "detalle" jsonb,
  "at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_entidad_idx ON "audit_log"("entidad", "entidad_id");
CREATE INDEX audit_log_tenant_idx ON "audit_log"("tenant_id", "at" DESC);
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_isolation ON "audit_log"
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- =========================================================
-- Triggers: updated_at + votos_count.
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_updated_at BEFORE UPDATE ON "ticket"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clasificacion_ia_updated_at BEFORE UPDATE ON "clasificacion_ia"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER gasto_updated_at BEFORE UPDATE ON "gasto"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER notificacion_updated_at BEFORE UPDATE ON "notificacion"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sesion_bot_updated_at BEFORE UPDATE ON "sesion_bot"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION bump_votos_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE "ticket" SET votos_count = votos_count + 1 WHERE id = NEW.ticket_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE "ticket" SET votos_count = GREATEST(votos_count - 1, 0) WHERE id = OLD.ticket_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER voto_count_trigger AFTER INSERT OR DELETE ON "voto"
  FOR EACH ROW EXECUTE FUNCTION bump_votos_count();

-- =========================================================
-- Grants.
-- =========================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "usuario_admin", "consorcio", "unidad", "residente", "vinculo_residente",
  "categoria", "ticket", "clasificacion_ia", "ticket_evento",
  "voto", "gasto", "media", "registro_conducta", "notificacion",
  "sesion_bot", "webhook_event"
TO app_user;
GRANT SELECT, INSERT ON "audit_log" TO app_user;

COMMIT;
