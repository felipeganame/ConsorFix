-- Migration 0003 — push token for Expo Push notifications (RF-E07).

BEGIN;

ALTER TABLE "residente"
  ADD COLUMN IF NOT EXISTS "push_token" text,
  ADD COLUMN IF NOT EXISTS "push_token_updated_at" timestamptz;

CREATE INDEX IF NOT EXISTS residente_push_token_idx
  ON "residente"("push_token") WHERE "push_token" IS NOT NULL;

COMMIT;
