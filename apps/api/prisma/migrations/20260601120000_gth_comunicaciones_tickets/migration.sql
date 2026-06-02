-- Tickets de onboarding GTH en departamento Comunicaciones

CREATE TABLE "gth_comunicaciones_tickets" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "external_row_key" TEXT NOT NULL,
    "document_id" TEXT,
    "full_name" TEXT NOT NULL,
    "cargo" TEXT NOT NULL DEFAULT '',
    "gth_sync_addition_id" TEXT,
    "sync_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gth_comunicaciones_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gth_comunicaciones_tickets_ticket_id_key" ON "gth_comunicaciones_tickets"("ticket_id");
CREATE UNIQUE INDEX "gth_comunicaciones_tickets_external_row_key_key" ON "gth_comunicaciones_tickets"("external_row_key");
CREATE UNIQUE INDEX "gth_comunicaciones_tickets_gth_sync_addition_id_key" ON "gth_comunicaciones_tickets"("gth_sync_addition_id");
CREATE INDEX "gth_comunicaciones_tickets_document_id_idx" ON "gth_comunicaciones_tickets"("document_id");
CREATE INDEX "gth_comunicaciones_tickets_sync_run_id_idx" ON "gth_comunicaciones_tickets"("sync_run_id");

ALTER TABLE "gth_comunicaciones_tickets" ADD CONSTRAINT "gth_comunicaciones_tickets_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gth_comunicaciones_tickets" ADD CONSTRAINT "gth_comunicaciones_tickets_gth_sync_addition_id_fkey" FOREIGN KEY ("gth_sync_addition_id") REFERENCES "gth_sync_additions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
