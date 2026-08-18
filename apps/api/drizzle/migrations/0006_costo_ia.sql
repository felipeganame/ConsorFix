-- Migration 0006 — telemetría de costo de IA por ticket (RF-C07).
--
-- Sin esto no se puede responder "¿cuánto sale clasificar un ticket?", que es
-- una pregunta de negocio directa: define si el modelo de precios del SaaS
-- cierra. Y para la tesis es un número medible más, no una estimación.
--
-- Los tokens los devuelve el propio SDK en cada llamada; hasta ahora se
-- descartaban. El costo en USD se calcula al insertar, porque las tarifas
-- cambian y recalcular históricos con la tarifa nueva daría números falsos.

BEGIN;

ALTER TABLE "clasificacion_ia"
  ADD COLUMN IF NOT EXISTS "tokens_in" integer,
  ADD COLUMN IF NOT EXISTS "tokens_out" integer,
  ADD COLUMN IF NOT EXISTS "costo_usd" numeric(12, 6),
  ADD COLUMN IF NOT EXISTS "latencia_ms" integer,
  -- Si la respuesta salió de caché no se le cobra al tenant ni cuenta para el
  -- costo promedio por ticket.
  ADD COLUMN IF NOT EXISTS "cache_hit" boolean NOT NULL DEFAULT false;

-- Para el tablero: costo acumulado por tenant y por período.
CREATE INDEX IF NOT EXISTS clasificacion_ia_costo_idx
  ON "clasificacion_ia"("tenant_id", "created_at")
  WHERE "costo_usd" IS NOT NULL;

COMMIT;
