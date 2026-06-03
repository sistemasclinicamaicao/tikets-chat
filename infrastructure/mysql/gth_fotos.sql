-- Tabla réplica de fotos GTH (Comunicaciones) para integraciones en Hostinger / clinicamaicao.com
-- Ejecutar en phpMyAdmin sobre la BD u680603156_fotos
-- Si la tabla existe con columnas incorrectas, DROP + CREATE corrige el esquema (pierde filas existentes).

DROP TABLE IF EXISTS gth_fotos;

CREATE TABLE gth_fotos (
  cedula_digits VARCHAR(32) NOT NULL PRIMARY KEY,
  tipo_documento VARCHAR(32) NULL,
  documento_display VARCHAR(64) NULL,
  nombre VARCHAR(255) NULL,
  mime_type VARCHAR(127) NOT NULL,
  foto LONGBLOB NOT NULL,
  record_id CHAR(36) NULL,
  actualizado_en DATETIME NOT NULL,
  INDEX idx_actualizado (actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
