-- Enterprise tickets: replace legacy ticket tables, add RBAC dept roles, workflows, assets, etc.

DROP TABLE IF EXISTS "asset_lifecycle_entries" CASCADE;
DROP TABLE IF EXISTS "ticket_assignments" CASCADE;
DROP TABLE IF EXISTS "ticket_form_values" CASCADE;
DROP TABLE IF EXISTS "ticket_attachments" CASCADE;
DROP TABLE IF EXISTS "ticket_comments" CASCADE;
DROP TABLE IF EXISTS "ticket_events" CASCADE;
DROP TABLE IF EXISTS "tickets" CASCADE;
DROP TABLE IF EXISTS "attachments" CASCADE;
DROP TABLE IF EXISTS "template_fields" CASCADE;
DROP TABLE IF EXISTS "templates" CASCADE;
DROP TABLE IF EXISTS "assets" CASCADE;
DROP TABLE IF EXISTS "workflow_transitions" CASCADE;
DROP TABLE IF EXISTS "workflow_definitions" CASCADE;
DROP TABLE IF EXISTS "ticket_priorities" CASCADE;
DROP TABLE IF EXISTS "ticket_statuses" CASCADE;
DROP TABLE IF EXISTS "user_department_roles" CASCADE;

ALTER TABLE "chat_channels" DROP CONSTRAINT IF EXISTS "chat_channels_ticket_id_fkey";

UPDATE "chat_channels" SET "ticket_id" = NULL WHERE "ticket_id" IS NOT NULL;

CREATE TABLE "user_department_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_department_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_department_roles_user_id_department_id_key" ON "user_department_roles"("user_id", "department_id");
CREATE INDEX "user_department_roles_user_id_idx" ON "user_department_roles"("user_id");
CREATE INDEX "user_department_roles_department_id_idx" ON "user_department_roles"("department_id");

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "global_role" TEXT;

ALTER TABLE "user_department_roles" ADD CONSTRAINT "user_department_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_department_roles" ADD CONSTRAINT "user_department_roles_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticket_statuses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'active',
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ticket_statuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_statuses_code_key" ON "ticket_statuses"("code");

CREATE TABLE "ticket_priorities" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "response_minutes" INTEGER,
    "resolution_minutes" INTEGER,
    CONSTRAINT "ticket_priorities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_priorities_code_key" ON "ticket_priorities"("code");

CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_definitions" ADD CONSTRAINT "workflow_definitions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "from_status_id" TEXT NOT NULL,
    "to_status_id" TEXT NOT NULL,
    "requires_comment" BOOLEAN NOT NULL DEFAULT false,
    "requires_resolution" BOOLEAN NOT NULL DEFAULT false,
    "requires_checklist" BOOLEAN NOT NULL DEFAULT false,
    "requires_supervisor_approval" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usage_type" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "templates" ADD CONSTRAINT "templates_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "template_fields" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "field_label" TEXT NOT NULL,
    "field_type" TEXT NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "config_json" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "template_fields_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "template_fields" ADD CONSTRAINT "template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serial_number" TEXT,
    "qr_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "assets" ADD CONSTRAINT "assets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" BIGSERIAL NOT NULL,
    "department_id" TEXT NOT NULL,
    "template_id" TEXT,
    "requester_id" TEXT NOT NULL,
    "assigned_to" TEXT,
    "supervisor_id" TEXT,
    "asset_id" TEXT,
    "status_id" TEXT NOT NULL,
    "priority_id" TEXT NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "classification_source" TEXT NOT NULL DEFAULT 'manual',
    "reported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_at" TIMESTAMP(3),
    "first_response_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "sla_due_at" TIMESTAMP(3),
    "sla_breach" BOOLEAN NOT NULL DEFAULT false,
    "closure_summary" TEXT,
    "custom_data_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "ticket_statuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "ticket_priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ticket_events" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "old_value_json" JSONB NOT NULL DEFAULT '{}',
    "new_value_json" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ticket_comments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "comment_type" TEXT NOT NULL DEFAULT 'public',
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "attachment_id" TEXT NOT NULL,
    "attachment_role" TEXT NOT NULL DEFAULT 'general',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticket_form_values" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "template_field_id" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ticket_form_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_form_values_ticket_id_template_field_id_key" ON "ticket_form_values"("ticket_id", "template_field_id");

ALTER TABLE "ticket_form_values" ADD CONSTRAINT "ticket_form_values_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_form_values" ADD CONSTRAINT "ticket_form_values_template_field_id_fkey" FOREIGN KEY ("template_field_id") REFERENCES "template_fields"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ticket_assignments" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "assigned_to" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "assignment_type" TEXT NOT NULL DEFAULT 'manual',
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "notes" TEXT,
    CONSTRAINT "ticket_assignments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ticket_assignments" ADD CONSTRAINT "ticket_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "asset_lifecycle_entries" (
    "id" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "asset_lifecycle_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "asset_lifecycle_entries" ADD CONSTRAINT "asset_lifecycle_entries_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_channels" ADD CONSTRAINT "chat_channels_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
