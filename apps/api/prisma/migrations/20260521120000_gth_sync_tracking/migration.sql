-- Seguimiento de altas GTH por sincronización (cédula / external_row_key)

ALTER TABLE "gth_directory" ADD COLUMN "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "gth_directory" ADD COLUMN "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "gth_directory"
SET "first_seen_at" = "synced_at",
    "last_seen_at" = "synced_at";

CREATE INDEX "gth_directory_first_seen_at_idx" ON "gth_directory"("first_seen_at");

CREATE TABLE "gth_sync_runs" (
    "id" TEXT NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_by_user_id" TEXT,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "added_count" INTEGER NOT NULL DEFAULT 0,
    "removed_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "gth_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gth_sync_additions" (
    "id" TEXT NOT NULL,
    "sync_run_id" TEXT NOT NULL,
    "document_id" TEXT,
    "external_row_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "gth_sync_additions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gth_sync_runs_synced_at_idx" ON "gth_sync_runs"("synced_at");

CREATE UNIQUE INDEX "gth_sync_additions_sync_run_id_external_row_key_key" ON "gth_sync_additions"("sync_run_id", "external_row_key");
CREATE INDEX "gth_sync_additions_sync_run_id_idx" ON "gth_sync_additions"("sync_run_id");
CREATE INDEX "gth_sync_additions_document_id_idx" ON "gth_sync_additions"("document_id");

ALTER TABLE "gth_sync_runs" ADD CONSTRAINT "gth_sync_runs_synced_by_user_id_fkey" FOREIGN KEY ("synced_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "gth_sync_additions" ADD CONSTRAINT "gth_sync_additions_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "gth_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
