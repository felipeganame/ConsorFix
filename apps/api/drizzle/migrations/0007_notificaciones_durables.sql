-- Migration 0007 — notificaciones durables y ventana de 24 h (RF-G01/G02).
--
-- La fila de `notificacion` ya se creaba como PENDIENTE antes de enviar, así
-- que la base ya funcionaba como cola. Lo que faltaba era alguien que recogiera
-- lo que quedó colgado: si la API se reiniciaba a mitad de un envío, la fila
-- quedaba PENDIENTE para siempre y nadie se enteraba.
--
-- Se agrega el momento del próximo reintento (con backoff) en vez de una cola
-- nueva en BullMQ: el estado ya está en la base, duplicarlo en Redis agregaría
-- una fuente de verdad más sin resolver nada que esto no resuelva.

BEGIN;

ALTER TABLE "notificacion"
  ADD COLUMN IF NOT EXISTS "proximo_intento_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "ultimo_intento_at" timestamptz;

-- El reaper busca por esto en cada pasada: parcial para no indexar las ya
-- enviadas, que son la mayoría y no se vuelven a mirar.
CREATE INDEX IF NOT EXISTS notificacion_pendientes_idx
  ON "notificacion"("proximo_intento_at")
  WHERE "estado" IN ('PENDIENTE', 'FALLIDA');

-- Ventana de 24 h de WhatsApp (RF-G02). Meta solo permite texto libre dentro de
-- las 24 h desde el último mensaje del usuario; fuera de eso exige una plantilla
-- aprobada. Sin registrar el último inbound no se puede decidir cuál mandar, y
-- hoy se mandaba siempre texto libre: fuera de la ventana Meta lo rechaza y la
-- notificación se pierde en silencio.
ALTER TABLE "residente"
  ADD COLUMN IF NOT EXISTS "ultimo_inbound_at" timestamptz;

COMMIT;
