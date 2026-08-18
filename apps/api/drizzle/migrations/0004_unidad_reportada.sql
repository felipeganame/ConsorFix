-- Migration 0004 — unidad reportada en tickets de conducta (RF-F01, opción A).
--
-- Hasta ahora `unidad_id` significaba dos cosas opuestas según el tipo:
--   INFRAESTRUCTURA → la unidad AFECTADA por el problema
--   CONDUCTA        → la unidad del vecino ACUSADO
-- Es el mismo campo con semántica invertida, y hacía imposible expresar el
-- caso normal de una denuncia: "yo, de la 4A, denuncio a la 5B". Con un solo
-- campo, o se pierde quién denuncia o se pierde a quién se denuncia.
--
-- Se separa: `unidad_id` queda como la unidad asociada al reporte y
-- `unidad_reportada_id` como la unidad acusada. La visibilidad de conducta
-- (RF-F02: solo el admin y los ocupantes de la unidad reportada) pasa a
-- depender de la columna nueva.

BEGIN;

ALTER TABLE "ticket"
  ADD COLUMN IF NOT EXISTS "unidad_reportada_id" uuid
    REFERENCES "unidad"("id") ON DELETE SET NULL;

-- Backfill: en los tickets de conducta existentes, `unidad_id` YA era la
-- unidad acusada, así que se copia tal cual. Sin esto, los tickets previos
-- dejarían de verse para los ocupantes de la unidad reportada.
UPDATE "ticket"
   SET "unidad_reportada_id" = "unidad_id"
 WHERE "tipo" = 'CONDUCTA'
   AND "unidad_reportada_id" IS NULL
   AND "unidad_id" IS NOT NULL;

-- La visibilidad de conducta filtra por esta columna en cada request del feed.
CREATE INDEX IF NOT EXISTS ticket_unidad_reportada_idx
  ON "ticket"("unidad_reportada_id") WHERE "unidad_reportada_id" IS NOT NULL;

-- Un ticket VALIDADO de conducta sin unidad acusada es inconsistente: no lo
-- puede ver nadie y el admin no puede registrarle avisos ni sanciones (P5).
-- Se exige a nivel de base y no solo en la aplicación, porque la app móvil ya
-- venía creando conductas sin unidad que quedaban en un callejón sin salida.
ALTER TABLE "ticket"
  DROP CONSTRAINT IF EXISTS ticket_conducta_validada_requiere_unidad;
ALTER TABLE "ticket"
  ADD CONSTRAINT ticket_conducta_validada_requiere_unidad
  CHECK (
    "tipo" <> 'CONDUCTA'
    OR "estado" IN ('REGISTRADO', 'DESCARTADO')
    OR "unidad_reportada_id" IS NOT NULL
  );

COMMIT;
