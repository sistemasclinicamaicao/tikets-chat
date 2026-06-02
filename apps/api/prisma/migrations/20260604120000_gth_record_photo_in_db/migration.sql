-- Fotos Altas GTH (Comunicaciones) en PostgreSQL; MinIO solo legado hasta backfill.

ALTER TABLE "gth_comunicaciones_records"
  ADD COLUMN "photo_data" BYTEA,
  ADD COLUMN "photo_mime_type" VARCHAR(127),
  ADD COLUMN "photo_file_name" VARCHAR(255),
  ADD COLUMN "photo_size_bytes" INTEGER;
