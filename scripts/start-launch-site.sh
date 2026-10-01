#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$PROJECT_DIR/launch-site"
PORT="${PORT:-3010}"
# N1b (2026-09-30): loopback only, same reasoning as start-local-app.sh.
HOST="${HOST_BIND:-127.0.0.1}"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cd "$APP_DIR"

exec npm run dev -- --hostname "$HOST" --port "$PORT"
