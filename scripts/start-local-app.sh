#!/bin/zsh

set -euo pipefail

PROJECT_DIR="/Users/fomomojodojo/Downloads/happy-file-hugger-main"
PORT="8080"
HOST="0.0.0.0"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR"

if lsof -iTCP:"$PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Skipping app start."
  exit 0
fi

# Start Docker Desktop if it is not running yet.
if ! docker info >/dev/null 2>&1; then
  open -ga Docker || true
fi

# Wait for Docker to become available before starting the local Supabase stack.
for _ in {1..90}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if docker info >/dev/null 2>&1; then
  supabase start >/tmp/hfh-supabase-start.log 2>&1 || true
else
  echo "Docker did not become ready in time. Starting the frontend only."
fi

exec npm run dev -- --host "$HOST" --port "$PORT"
