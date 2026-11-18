#!/usr/bin/env bash
# ── SEARCH-HEALTH GUARD — the session-open search-health check (2026-11-18, the SearXNG restore) ──────────────────────
#
# WHY. Since ≤2026-08-18 the four general engines (google, duckduckgo, startpage, brave) captcha or 403 this egress (a
# T-Mobile CGNAT address). Search now rests on ONE keyed engine, braveapi (scripts/searxng/braveapi_keyfile.py, the key
# read from a mounted file — never from settings.yml). This check passes only when THAT engine answers, and says
# exactly why when it does not. It spends one paid Brave query (about $0.005) per run.
#
#   s1. the keyed engine is loaded and enabled (GET /config)
#   s2. one control query returns ≥ 1 result from braveapi; a refusal names its reason, and the daily ceiling is read
#       from the engine's own counter (~/searxng/data/braveapi-usage.json)
#   s3. the four blocked engines are reported as they stand — informational, never relied on
#
#   bash scripts/guards/search-health-guard.sh ["<control query>"]     (default: "Charter Communications")
set -euo pipefail
cd "$(dirname "$0")/../.."
URL="${SEARXNG_HOST_URL:-http://localhost:8888}"
# a fixed public name: a guard never reads a client's row to build its query (edgewood-reference-guard, D4b)
Q="${1:-Charter Communications}"
fail() { echo "FAIL $1: $2"; echo "SearXNG dead this session — name-only plans run on the web_search lane; domain plans unaffected"; echo "guard: FAIL"; exit 1; }

CFG=$(curl -s -m 15 "$URL/config" || true)
[ -n "$CFG" ] || fail s1 "SearXNG is not answering at $URL"
ENG=$(printf '%s' "$CFG" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const e=(j.engines||[]).find(x=>x.name==="braveapi");console.log(e?(e.enabled?"enabled":"disabled"):"missing")})')
[ "$ENG" = enabled ] || fail s1 "the keyed engine braveapi is $ENG (not loaded: no key file at /run/secrets/brave_api_key, or settings.yml does not name braveapi_keyfile)"
echo "s1. the keyed engine braveapi is enabled in settings (s2 proves it started)"

RES=$(curl -s -m 40 "$URL/search?q=$(node -e 'console.log(encodeURIComponent(process.argv[1]))' "$Q")&format=json" || true)
[ -n "$RES" ] || fail s2 "the control query got no answer"
VERDICT=$(printf '%s' "$RES" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=j.results||[];const keyed=r.filter(x=>(x.engines||[x.engine]).includes("braveapi")).length;const un=Object.fromEntries((j.unresponsive_engines||[]).map(e=>[e[0],e[1]]));console.log(JSON.stringify({results:r.length,keyed,braveapi_refused:un.braveapi||null,blocked:["google","duckduckgo","startpage","brave"].map(e=>`${e}: ${un[e]||"answered"}`)}))})')
KEYED=$(printf '%s' "$VERDICT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).keyed))')
USAGE=$(cat "$HOME/searxng/data/braveapi-usage.json" 2>/dev/null || echo '{}')
if [ "$KEYED" -lt 1 ]; then
  WHY=$(printf '%s' "$VERDICT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(v.braveapi_refused||"no results")})')
  AT=$(printf '%s' "$USAGE" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s||"{}");console.log(u[new Date().toISOString().slice(0,10)]||0)})')
  CEIL=$(grep -o "daily_ceiling: int = [0-9]*" scripts/searxng/braveapi_keyfile.py | grep -o "[0-9]*$")
  [ "$AT" -ge "$CEIL" ] && fail s2 "braveapi refused: the daily query ceiling is reached ($AT of $CEIL today, UTC)"
  [ "$WHY" = "no results" ] && fail s2 "braveapi did not run: its start-up failed or it is not registered — most often no key file at /run/secrets/brave_api_key (bash scripts/searxng/run-searxng.sh mounts it; docker logs searxng says which)"
  fail s2 "braveapi refused the control query \"$Q\": $WHY"
fi
echo "s2. the control query \"$Q\" returned $KEYED result(s) through braveapi (today's Brave queries: $USAGE)"
echo "s3. blocked engines, not relied on: $(printf '%s' "$VERDICT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).blocked.join("; ")))')"
echo "GUARD OK"
