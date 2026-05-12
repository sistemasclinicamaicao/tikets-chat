#!/bin/sh
set -eu

# #region agent log
node -e "console.log(JSON.stringify({sessionId:'de3583',hypothesisId:'H2',location:'docker-entrypoint:1',message:'entrypoint_start',data:{hasDatabaseUrl:Boolean(process.env.DATABASE_URL)},timestamp:Date.now()}))"
# #endregion

echo "[api] applying prisma migrations..."
# #region agent log
if ! npx prisma migrate deploy; then
  node -e "console.log(JSON.stringify({sessionId:'de3583',hypothesisId:'H2',location:'docker-entrypoint:migrate',message:'prisma_migrate_deploy_failed',data:{},timestamp:Date.now()}))"
  exit 1
fi
node -e "console.log(JSON.stringify({sessionId:'de3583',hypothesisId:'H2',location:'docker-entrypoint:migrate',message:'prisma_migrate_deploy_ok',timestamp:Date.now()}))"
# #endregion

echo "[api] starting server..."
node dist/main
