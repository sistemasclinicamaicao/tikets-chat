-- Lista cédulas con fotografía en PostgreSQL (metadatos; no muestra el binario en la grilla).
-- Ejecutar en pgAdmin / DBeaver. Para UNA cédula con el archivo, ver al final.

SELECT
  TRIM(r.document_id) AS cedula,
  r.id AS record_id,
  r.full_name AS nombre,
  r.photo_file_name AS archivo,
  r.photo_mime_type AS mime_type,
  length(r.photo_data) AS photo_bytes_length,
  r.photo_uploaded_at
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
  AND r.document_id IS NOT NULL
  AND TRIM(r.document_id) <> ''
ORDER BY r.document_id;

-- Fotos aún solo en MinIO (API antigua o pendiente de backfill):
SELECT
  TRIM(r.document_id) AS cedula,
  r.full_name AS nombre,
  r.photo_attachment_id,
  r.photo_uploaded_at
FROM gth_comunicaciones_records r
WHERE r.photo_attachment_id IS NOT NULL
  AND (r.photo_data IS NULL OR length(r.photo_data) = 0)
ORDER BY r.photo_uploaded_at DESC NULLS LAST;

-- Una cédula concreta (sustituya el valor):
-- SELECT photo_mime_type, photo_file_name, length(photo_data), photo_data
-- FROM gth_comunicaciones_records
-- WHERE TRIM(document_id) = '1120748165';
