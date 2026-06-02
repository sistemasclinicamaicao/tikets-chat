-- Campos del API guardados en cada sincronización GTH (orden de columnas de la tabla).
ALTER TABLE "gth_sync_runs" ADD COLUMN "available_fields" JSONB;
