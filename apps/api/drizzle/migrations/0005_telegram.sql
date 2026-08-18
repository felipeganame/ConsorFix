-- Migration 0005 — canal Telegram (RF-B01 sobre un segundo proveedor).
--
-- Telegram identifica a la persona por `chat_id` numérico, no por teléfono, y
-- todo el ruteo del sistema es por `telefono_e164`. Hace falta un puente.
--
-- Se resuelve con el flujo nativo de Telegram: la primera vez, el bot pide
-- compartir el contacto con un botón (`request_contact`), Telegram manda el
-- teléfono verificado por la plataforma, y ahí se vincula el chat con el
-- residente. De ahí en más el ruteo es directo por chat_id.
--
-- Importante para la regla 1: el teléfono que llega por ese botón lo verifica
-- Telegram, no el usuario escribiéndolo. Nadie puede reclamar el chat de otro.

BEGIN;

ALTER TABLE "residente"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" text,
  ADD COLUMN IF NOT EXISTS "telegram_vinculado_at" timestamptz;

-- Un chat de Telegram pertenece a una sola persona, en todo el sistema.
-- A diferencia del teléfono —que puede repetirse entre administraciones,
-- ver el ruteo ambiguo del bot— acá el índice es global a propósito: si el
-- mismo chat pudiera mapear a dos residentes volveríamos a tener el problema
-- de elegir tenant a la suerte, pero sin forma de detectarlo.
CREATE UNIQUE INDEX IF NOT EXISTS residente_telegram_chat_id_key
  ON "residente"("telegram_chat_id") WHERE "telegram_chat_id" IS NOT NULL;

COMMIT;
