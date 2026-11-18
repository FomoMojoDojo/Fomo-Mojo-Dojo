#!/usr/bin/env bash
# (Re)create the local SearXNG container with the keyed Brave engine (2026-11-18, the SearXNG restore).
#
# The container is a plain `docker run` (not compose). Everything is as it was before this script — image, name, network
# ai-network, port 8888 → 8080, restart always, the config and cache bind mounts — plus two READ-ONLY mounts:
#   * scripts/searxng/braveapi_keyfile.py → the engines dir (reads the key file, hands it to the stock braveapi engine)
#   * ~/.mojomap/brave-api-key           → /run/secrets/brave_api_key   (the key; mode 600 on the host, never copied)
# settings.yml (~/searxng/config, outside the repo) names `engine: braveapi_keyfile` with NO api_key — see
# scripts/searxng/settings-braveapi.yml for the exact block. The key is in no file this script writes and is never echoed.
set -euo pipefail
cd "$(dirname "$0")/../.."
KEY="$HOME/.mojomap/brave-api-key"
[ -s "$KEY" ] || { echo "run-searxng: no key file at $KEY" >&2; exit 1; }
[ "$(stat -f %Lp "$KEY")" = 600 ] || { echo "run-searxng: $KEY must be mode 600" >&2; exit 1; }
grep -q "engine: braveapi_keyfile" "$HOME/searxng/config/settings.yml" || { echo "run-searxng: settings.yml does not name braveapi_keyfile" >&2; exit 1; }
if grep -qiE "^\s*api_key:\s*['\"]?[A-Za-z0-9_-]{16,}" "$HOME/searxng/config/settings.yml"; then echo "run-searxng: settings.yml carries an api_key value — remove it" >&2; exit 1; fi
docker rm -f searxng >/dev/null 2>&1 || true
docker run -d --name searxng --restart always --network ai-network -p 8888:8080 \
  -v "$HOME/searxng/config:/etc/searxng" \
  -v "$HOME/searxng/data:/var/cache/searxng" \
  -v "$PWD/scripts/searxng/braveapi_keyfile.py:/usr/local/searxng/searx/engines/braveapi_keyfile.py:ro" \
  -v "$KEY:/run/secrets/brave_api_key:ro" \
  searxng/searxng:latest >/dev/null
echo "run-searxng: started"
