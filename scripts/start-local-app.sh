#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-8080}"
# N1b (2026-09-30): loopback only. Remote viewers reach the app through `tailscale serve`, which
# proxies from this host, so 127.0.0.1 still serves every partner while no LAN or tailnet device can
# open the dev server directly. Overridable for a deliberate exception.
HOST="${HOST_BIND:-127.0.0.1}"
PARSER_PORT="8789"
FUNCTION_ENV_FILE="$PROJECT_DIR/supabase/functions/.env.local"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$PROJECT_DIR"

# Load edge-function secrets into the process environment so supabase/config.toml
# can inject them into the local edge runtime via [edge_runtime.secrets].
if [ -f "$FUNCTION_ENV_FILE" ]; then
  set -a
  source "$FUNCTION_ENV_FILE"
  set +a
else
  echo "Missing $FUNCTION_ENV_FILE; edge functions may fail without required secrets."
fi

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

# Start local parser service used by edge functions for PDF/DOCX extraction.
if ! lsof -iTCP:"$PARSER_PORT" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
  nohup npm run parser:start >/tmp/hfh-local-parser.log 2>&1 &
fi

exec npm run dev -- --host "$HOST" --port "$PORT"
