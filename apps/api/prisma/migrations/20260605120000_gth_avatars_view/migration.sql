-- Vista estable para integraciones externas (avatar por cédula desde photo_data).
CREATE OR REPLACE VIEW v_gth_avatars AS
SELECT
  TRIM(r.document_id) AS cedula,
  regexp_replace(COALESCE(TRIM(r.document_id), ''), '[^0-9]', '', 'g') AS cedula_digits,
  r.id AS record_id,
  r.full_name AS nombre,
  r.photo_mime_type AS mime_type,
  r.photo_file_name AS archivo,
  r.photo_size_bytes AS size_bytes,
  r.photo_data AS foto,
  r.photo_uploaded_at AS actualizado_en
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
  AND r.document_id IS NOT NULL
  AND TRIM(r.document_id) <> '';
