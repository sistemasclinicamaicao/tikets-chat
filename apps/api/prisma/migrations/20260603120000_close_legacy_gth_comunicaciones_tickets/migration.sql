-- Cierra tickets Alta GTH legacy (reemplazados por gth_comunicaciones_records).
UPDATE "tickets" AS t
SET
  "status_id" = closed.id,
  "closed_at" = NOW(),
  "closure_summary" = 'Alta GTH migrada a gestión Comunicaciones (sin ticket).',
  "updated_at" = NOW()
FROM "ticket_statuses" AS closed
WHERE closed."code" = 'cerrado'
  AND t."status_id" IN (SELECT id FROM "ticket_statuses" WHERE "is_closed" = false)
  AND (
    EXISTS (SELECT 1 FROM "gth_comunicaciones_tickets" gct WHERE gct."ticket_id" = t.id)
    OR t."subject" LIKE 'Alta GTH:%'
    OR (t."custom_data_json"->>'source') = 'gth'
  );
