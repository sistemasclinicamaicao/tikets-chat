-- Directorio GTH (copia local desde integración CONEXION-GTH)
CREATE TABLE "gth_directory" (
    "id" TEXT NOT NULL,
    "external_row_key" TEXT NOT NULL,
    "document_id" TEXT,
    "payload" JSONB NOT NULL,
    "integration_name" TEXT,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_by_user_id" TEXT,

    CONSTRAINT "gth_directory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gth_directory_external_row_key_key" ON "gth_directory"("external_row_key");
CREATE INDEX "gth_directory_document_id_idx" ON "gth_directory"("document_id");
CREATE INDEX "gth_directory_synced_at_idx" ON "gth_directory"("synced_at");

ALTER TABLE "gth_directory" ADD CONSTRAINT "gth_directory_synced_by_user_id_fkey" FOREIGN KEY ("synced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
