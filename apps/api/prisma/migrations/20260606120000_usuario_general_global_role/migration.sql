-- Rol global "usuario_general" para usuarios que antes no tenían rol global (solo activos).
UPDATE "users"
SET "global_role" = 'usuario_general'
WHERE "global_role" IS NULL
  AND "is_active" = true;
