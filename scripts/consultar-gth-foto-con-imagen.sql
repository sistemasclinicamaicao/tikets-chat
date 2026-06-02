-- =============================================================================
-- Fotos GTH en PostgreSQL: cédula + ver la imagen
-- =============================================================================
-- Los editores SQL (EasyPanel, pgAdmin) NO muestran imágenes en la grilla.
-- Use una de estas opciones:
--
--   1) Esta consulta incluye photo_data (BYTEA): en DBeaver puede abrir la celda
--      como imagen. En EasyPanel verá bytes/hex — use la opción 3.
--
--   2) Una sola cédula en base64 (opción B más abajo).
--
--   3) Vista HTML con todas las fotos (recomendado):
--      cd apps/api
--      npm run export:gth-fotos-html
--      Abrir: exports/gth-fotos/index.html
-- =============================================================================

-- Opción A: listado con binario (preview en DBeaver al abrir photo_data)
SELECT
  TRIM(r.document_id) AS cedula,
  r.full_name AS nombre,
  r.photo_mime_type,
  r.photo_file_name,
  length(r.photo_data) AS bytes,
  r.photo_data
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
ORDER BY r.document_id;

-- Opción B: UNA cédula — data URI (pegue el valor en una pestaña del navegador
-- o use solo para registros pequeños; >500 KB puede truncar el editor)
/*
SELECT
  TRIM(r.document_id) AS cedula,
  r.full_name AS nombre,
  r.photo_mime_type,
  (
    'data:' || COALESCE(NULLIF(TRIM(r.photo_mime_type), ''), 'image/jpeg')
    || ';base64,'
    || encode(r.photo_data, 'base64')
  ) AS foto_para_navegador
FROM gth_comunicaciones_records r
WHERE TRIM(r.document_id) = '1120748165';
*/
