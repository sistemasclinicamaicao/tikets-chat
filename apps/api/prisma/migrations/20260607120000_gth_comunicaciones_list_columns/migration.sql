-- Columnas desnormalizadas para filtros y listado paginado (sin cargar payload completo).
ALTER TABLE "gth_comunicaciones_records"
  ADD COLUMN "area" TEXT NOT NULL DEFAULT '—',
  ADD COLUMN "estado" TEXT NOT NULL DEFAULT '—',
  ADD COLUMN "tipo_contrato" TEXT NOT NULL DEFAULT '—',
  ADD COLUMN "fecha_ingreso" VARCHAR(32) NOT NULL DEFAULT '—';

CREATE INDEX "gth_comunicaciones_records_area_idx" ON "gth_comunicaciones_records"("area");
CREATE INDEX "gth_comunicaciones_records_estado_idx" ON "gth_comunicaciones_records"("estado");
CREATE INDEX "gth_comunicaciones_records_cargo_idx" ON "gth_comunicaciones_records"("cargo");
CREATE INDEX "gth_comunicaciones_records_tipo_contrato_idx" ON "gth_comunicaciones_records"("tipo_contrato");
