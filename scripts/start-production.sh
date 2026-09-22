#!/bin/sh
set -e

mkdir -p uploads database "${DATA_DIR:-/data}" "${UPLOAD_DIR:-uploads}"

if [ -n "$DATABASE_URL" ] && [ "$RUN_DB_INIT" = "true" ]; then
  npm run init-db:pg || true
fi

exec node server/index.js
