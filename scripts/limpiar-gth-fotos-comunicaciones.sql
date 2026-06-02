-- Limpia TODAS las fotos de gth_comunicaciones_records (solo metadatos/BYTEA en PG).
-- Los blobs MinIO legacy requieren: npm run clear:gth-comunicaciones-photos (apps/api)

UPDATE gth_comunicaciones_records
SET
  photo_data = NULL,
  photo_mime_type = NULL,
  photo_file_name = NULL,
  photo_size_bytes = NULL,
  photo_uploaded_at = NULL,
  photo_uploaded_by_user_id = NULL,
  photo_attachment_id = NULL
WHERE photo_data IS NOT NULL
   OR photo_attachment_id IS NOT NULL
   OR photo_uploaded_at IS NOT NULL;
