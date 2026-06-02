-- Registros GTH de Comunicaciones (sin ticket obligatorio)

CREATE TABLE "gth_comunicaciones_records" (
    "id" TEXT NOT NULL,
    "external_row_key" TEXT NOT NULL,
    "document_id" TEXT,
    "full_name" TEXT NOT NULL,
    "cargo" TEXT NOT NULL DEFAULT '',
    "payload" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "photo_attachment_id" TEXT,
    "photo_uploaded_at" TIMESTAMP(3),
    "photo_uploaded_by_user_id" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gth_comunicaciones_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gth_comunicaciones_records_external_row_key_key" ON "gth_comunicaciones_records"("external_row_key");
CREATE UNIQUE INDEX "gth_comunicaciones_records_photo_attachment_id_key" ON "gth_comunicaciones_records"("photo_attachment_id");
CREATE INDEX "gth_comunicaciones_records_document_id_idx" ON "gth_comunicaciones_records"("document_id");
CREATE INDEX "gth_comunicaciones_records_is_active_idx" ON "gth_comunicaciones_records"("is_active");
CREATE INDEX "gth_comunicaciones_records_last_synced_at_idx" ON "gth_comunicaciones_records"("last_synced_at");

ALTER TABLE "gth_comunicaciones_records" ADD CONSTRAINT "gth_comunicaciones_records_photo_attachment_id_fkey" FOREIGN KEY ("photo_attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gth_comunicaciones_records" ADD CONSTRAINT "gth_comunicaciones_records_photo_uploaded_by_user_id_fkey" FOREIGN KEY ("photo_uploaded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Poblar desde directorio GTH existente
INSERT INTO "gth_comunicaciones_records" (
    "id",
    "external_row_key",
    "document_id",
    "full_name",
    "cargo",
    "payload",
    "is_active",
    "last_synced_at",
    "created_at",
    "updated_at"
)
SELECT
    md5('gth-rec:' || d.external_row_key),
    d.external_row_key,
    d.document_id,
    COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ',
            d.payload->>'PRIMERNOMBRE',
            d.payload->>'SEGUNDONOMBRE',
            d.payload->>'PRIMERAPELLIDO',
            d.payload->>'SEGUNDOAPELLIDO'
        )), ''),
        'Empleado GTH'
    ),
    COALESCE(NULLIF(TRIM(d.payload->>'CARGO'), ''), ''),
    d.payload,
    CASE
        WHEN COALESCE(NULLIF(TRIM(UPPER(d.payload->>'ESTADO')), ''), 'ACTIVO') IN (
            'ACTIVO', 'ACTIVE', 'A', '1', 'SI', 'SÍ', 'S', 'VIGENTE', 'EMPLEADO'
        ) THEN true
        ELSE false
    END,
    d.last_seen_at,
    d.first_seen_at,
    NOW()
FROM "gth_directory" d
ON CONFLICT ("external_row_key") DO NOTHING;

-- Copiar fotos desde tickets legacy (gth_photo)
UPDATE "gth_comunicaciones_records" r
SET
    "photo_attachment_id" = sub.attachment_id,
    "photo_uploaded_at" = sub.created_at,
    "updated_at" = NOW()
FROM (
    SELECT DISTINCT ON (ct.external_row_key)
        ct.external_row_key,
        ta.attachment_id,
        ta.created_at
    FROM "gth_comunicaciones_tickets" ct
    INNER JOIN "ticket_attachments" ta
        ON ta.ticket_id = ct.ticket_id
        AND ta.attachment_role = 'gth_photo'
    INNER JOIN "attachments" a ON a.id = ta.attachment_id
    WHERE a.mime_type LIKE 'image/%'
    ORDER BY ct.external_row_key, ta.created_at ASC
) sub
WHERE r.external_row_key = sub.external_row_key
  AND r.photo_attachment_id IS NULL;
