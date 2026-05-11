-- Soft-hide conversation per user (audit: rows and messages remain).
ALTER TABLE "chat_channel_members"
  ADD COLUMN IF NOT EXISTS "hidden_from_ui_at" TIMESTAMPTZ NULL;
