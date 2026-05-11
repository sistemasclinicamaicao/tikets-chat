-- Ensure chat_channel_members has the columns expected by chat service queries.
ALTER TABLE "chat_channel_members"
  ADD COLUMN IF NOT EXISTS "role" TEXT NULL;

ALTER TABLE "chat_channel_members"
  ADD COLUMN IF NOT EXISTS "last_read_at" TIMESTAMPTZ NULL;

-- Keep performance for unread-count and membership lookups.
CREATE INDEX IF NOT EXISTS "chat_channel_members_channel_read_idx"
  ON "chat_channel_members"("channel_id", "last_read_at");
