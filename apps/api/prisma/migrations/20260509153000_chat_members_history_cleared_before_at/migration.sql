-- Historial visible solo desde esta marca para ese miembro (tras "Eliminar conversación").
ALTER TABLE chat_channel_members
ADD COLUMN IF NOT EXISTS history_cleared_before_at TIMESTAMPTZ NULL;
