#!/bin/sh
set -eu

echo "[api] applying prisma migrations..."
npx prisma migrate deploy

echo "[api] starting server..."
node dist/main
