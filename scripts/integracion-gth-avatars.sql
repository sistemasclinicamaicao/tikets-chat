-- =============================================================================
-- Integración: avatares GTH Comunicaciones (PostgreSQL)
-- Tabla: gth_comunicaciones_records
-- Clave de búsqueda: cédula / employee_id (columna document_id, solo dígitos)
-- Foto: columna photo_data (BYTEA) + photo_mime_type
-- =============================================================================
-- Ejecute UNA VEZ la sección "Vista" si quiere un nombre estable (v_gth_avatars).
-- Las demás consultas funcionan sin la vista.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Vista (opcional, ejecutar una vez)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2) Avatar de UNA persona por cédula (recomendado para otras apps)
--    Sustituya :cedula por el valor (ej. '1120748165' o '1120748165')
--    Coincide igual que Chat-Tickets: texto exacto o solo dígitos.
-- -----------------------------------------------------------------------------
SELECT
  TRIM(r.document_id) AS cedula,
  r.full_name AS nombre,
  r.photo_mime_type AS mime_type,
  r.photo_file_name AS archivo,
  r.photo_size_bytes AS size_bytes,
  r.photo_data AS foto,
  r.photo_uploaded_at AS actualizado_en
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
  AND (
    TRIM(r.document_id) = TRIM(:cedula)
    OR regexp_replace(COALESCE(TRIM(r.document_id), ''), '[^0-9]', '', 'g')
       = regexp_replace(TRIM(:cedula), '[^0-9]', '', 'g')
  )
LIMIT 1;

-- Misma consulta usando la vista (después de crearla):
-- SELECT cedula, nombre, mime_type, archivo, size_bytes, foto, actualizado_en
-- FROM v_gth_avatars
-- WHERE cedula_digits = regexp_replace(TRIM(:cedula), '[^0-9]', '', 'g')
-- LIMIT 1;

-- -----------------------------------------------------------------------------
-- 3) Variante JSON / APIs que no manejan BYTEA: base64 en una columna
--    (solo para UNA cédula; no use en listados masivos)
-- -----------------------------------------------------------------------------
SELECT
  TRIM(r.document_id) AS cedula,
  r.full_name AS nombre,
  r.photo_mime_type AS mime_type,
  encode(r.photo_data, 'base64') AS foto_base64,
  r.photo_uploaded_at AS actualizado_en
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
  AND regexp_replace(COALESCE(TRIM(r.document_id), ''), '[^0-9]', '', 'g')
      = regexp_replace(TRIM(:cedula), '[^0-9]', '', 'g')
LIMIT 1;

-- En la app: data:image/jpeg;base64,{foto_base64}
-- o decodificar base64 → bytes y guardar/mostrar como imagen.

-- -----------------------------------------------------------------------------
-- 4) Catálogo: todas las cédulas con avatar (sin binario; para sincronizar IDs)
-- -----------------------------------------------------------------------------
SELECT
  TRIM(r.document_id) AS cedula,
  regexp_replace(COALESCE(TRIM(r.document_id), ''), '[^0-9]', '', 'g') AS cedula_digits,
  r.full_name AS nombre,
  r.photo_mime_type AS mime_type,
  r.photo_size_bytes AS size_bytes,
  r.photo_uploaded_at AS actualizado_en
FROM gth_comunicaciones_records r
WHERE r.photo_data IS NOT NULL
  AND length(r.photo_data) > 0
  AND r.document_id IS NOT NULL
  AND TRIM(r.document_id) <> ''
ORDER BY cedula;

-- -----------------------------------------------------------------------------
-- 5) Ejemplo con valor fijo (Editor SQL sin placeholders)
-- -----------------------------------------------------------------------------
-- SELECT cedula, nombre, mime_type, foto
-- FROM v_gth_avatars
-- WHERE cedula_digits = '1120748165';

-- -----------------------------------------------------------------------------
-- Uso en aplicaciones (columna foto = BYTEA)
-- -----------------------------------------------------------------------------
-- • Node (pg):     const buf = row.foto;  // Buffer
--                  res.type(row.mime_type).send(buf);
-- • PHP (PDO):     $bytes = $row['foto']; // stream o base64_encode($bytes)
-- • Python:        bytes(row['foto'])
-- • C# / Java:     leer columna binaria como byte[]
-- • HTTP (sin SQL): GET {API}/auth/login-avatar/{employeeId}/content
--                  (misma foto; employeeId = cédula con o sin formato)
-- =============================================================================
