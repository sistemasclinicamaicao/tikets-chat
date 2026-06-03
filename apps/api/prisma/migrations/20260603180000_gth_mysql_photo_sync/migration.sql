-- AlterTable
ALTER TABLE "gth_comunicaciones_records" ADD COLUMN "mysql_photo_synced_at" TIMESTAMP(3),
ADD COLUMN "mysql_photo_sync_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mysql_photo_sync_last_error" VARCHAR(500);

-- CreateIndex
CREATE INDEX "gth_comunicaciones_records_mysql_photo_sync_idx" ON "gth_comunicaciones_records"("mysql_photo_synced_at", "photo_uploaded_at");
