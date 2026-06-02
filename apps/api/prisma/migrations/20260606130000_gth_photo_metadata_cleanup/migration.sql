-- Metadatos huérfanos (fecha/tamaño sin imagen real).
UPDATE gth_comunicaciones_records
SET
  photo_uploaded_at = NULL,
  photo_uploaded_by_user_id = NULL,
  photo_mime_type = NULL,
  photo_file_name = NULL,
  photo_size_bytes = NULL,
  photo_data = NULL
WHERE photo_attachment_id IS NULL
  AND (photo_data IS NULL OR length(photo_data) = 0);
