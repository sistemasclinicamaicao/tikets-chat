/** One-shot: añade role y last_read_at si faltan (tabla Prisma antigua). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.$executeRawUnsafe(
    'ALTER TABLE chat_channel_members ADD COLUMN IF NOT EXISTS role TEXT NULL',
  );
  await p.$executeRawUnsafe(
    'ALTER TABLE chat_channel_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ NULL',
  );
  await p.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS chat_channel_members_channel_read_idx ON chat_channel_members(channel_id, last_read_at)',
  );
  console.log('OK: chat_channel_members tiene role y last_read_at (si faltaban).');
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
