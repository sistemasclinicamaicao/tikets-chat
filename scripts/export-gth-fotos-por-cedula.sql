-- Exporta CSV: cédula + metadatos de foto GTH en PostgreSQL (sin incluir el binario).
-- Desde psql en el servidor o con cliente que soporte \copy.
-- Para listar en pgAdmin use: scripts/consultar-gth-fotos-por-cedula.sql

\copy (
  SELECT
    TRIM(r.document_id) AS cedula,
    r.id AS record_id,
    r.full_name AS nombre,
    r.photo_file_name AS archivo,
    r.photo_mime_type AS mime_type,
    r.photo_size_bytes,
    r.photo_uploaded_at::text AS foto_subida_at,
    length(r.photo_data) AS photo_bytes_length
  FROM gth_comunicaciones_records r
  WHERE r.photo_data IS NOT NULL
    AND r.document_id IS NOT NULL
    AND TRIM(r.document_id) <> ''
  ORDER BY r.document_id
) TO STDOUT WITH (FORMAT csv, HEADER true, ENCODING 'UTF8')
