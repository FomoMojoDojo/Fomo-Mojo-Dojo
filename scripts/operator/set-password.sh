#!/usr/bin/env bash
# U6-79 — SET A PERSON'S PASSWORD, AS AN OPERATOR. One command.
#
# WHY THIS EXISTS AND NOT A RESET LINK. "Forgot password?" works and returns 200, but this stack has
# no outbound mail: GOTRUE_SMTP_HOST is the bundled catcher (Mailpit, http://127.0.0.1:54324), so the
# message is delivered to this machine and nowhere else. Measured 2026-11-11: mailbox empty →
# POST /auth/v1/recover → HTTP 200 → one "Reset Your Password" sitting in Mailpit. Telling a client
# to use that control leaves them waiting for an email that does not exist, so the operator sets the
# password and hands it over.
#
# IT CHANGES ONE FIELD ON ONE ACCOUNT and nothing else — no membership, no role, no company.
set -euo pipefail

usage() {
  cat >&2 <<USAGE
usage: $0 --email <address> [--password <pw>]

  --password  omitted → a 32-char random one is generated and printed ONCE

env: SUPABASE_URL (default http://127.0.0.1:54321)
     SERVICE_ROLE_KEY  the LEGACY JWT one (eyJ…) from \`supabase status --output env\`
USAGE
  exit 2
}

EMAIL=""; PASSWORD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2;;
    --password) PASSWORD="${2:-}"; shift 2;;
    -h|--help) usage;;
    *) echo "unknown argument: $1" >&2; usage;;
  esac
done
[ -n "$EMAIL" ] || usage

URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="${SERVICE_ROLE_KEY:-}"
[ -n "$KEY" ] || { echo "SERVICE_ROLE_KEY not set (the eyJ… one)" >&2; exit 2; }
case "$KEY" in eyJ*) ;; *) echo "SERVICE_ROLE_KEY must be the LEGACY JWT key (eyJ…)" >&2; exit 2;; esac

api() {
  curl -sS -X "$1" "$URL$2" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" ${3:+-d "$3"}
}
jqp() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# The admin list is filtered server-side; find the one account and refuse if it is not exactly one.
USERS=$(api GET "/auth/v1/admin/users?page=1&per_page=1000")
UID_=$(printf '%s' "$USERS" | python3 -c "
import json,sys
d=json.load(sys.stdin)
m=[u for u in d.get('users',[]) if (u.get('email') or '').lower()==sys.argv[1].lower()]
print(m[0]['id'] if len(m)==1 else '')
" "$EMAIL")
[ -n "$UID_" ] || { echo "no single account with email $EMAIL" >&2; exit 1; }

if [ -z "$PASSWORD" ]; then
  PASSWORD=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)))")
  GENERATED=1
else
  GENERATED=0
fi

OUT=$(api PUT "/auth/v1/admin/users/$UID_" "$(python3 - "$PASSWORD" <<'PY'
import json,sys
print(json.dumps({"password": sys.argv[1]}))
PY
)")
OK=$(printf '%s' "$OUT" | jqp "'yes' if d.get('id') else 'no'")
[ "$OK" = "yes" ] || { echo "password NOT set: $OUT" >&2; exit 1; }

echo "account   $EMAIL"
echo "user_id   $UID_"
if [ "$GENERATED" = "1" ]; then
  echo "password  $PASSWORD"
  echo
  echo "Printed once, stored nowhere. Hand it over on a channel you trust."
fi
echo
echo "They sign in at /login with it. Nothing else about the account changed."
