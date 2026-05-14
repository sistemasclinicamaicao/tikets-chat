DROP INDEX IF EXISTS "chat_channels_department_id_key";

CREATE INDEX IF NOT EXISTS "chat_channels_department_id_idx"
ON "chat_channels"("department_id");
