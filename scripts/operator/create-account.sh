#!/usr/bin/env bash
# U6-60 — CREATE AN ACCOUNT, ASSIGN A COMPANY, SET A ROLE. One command, three writes.
#
# This exists because U6-58 closed sign-up. Nobody self-registers any more, so the only way an
# account comes into being is an operator running this, and a procedure that lives in somebody's
# shell history is not a procedure. Everything it does is reversible by the retire block printed at
# the end of docs/operator-account-setup.md.
#
# IT USES THE SERVICE-ROLE KEY, NOT A SESSION, and that is the point: company_members' INSERT policy
# is has_capability(auth.uid(), 'workspace.member.assignRole', company_id), which an admin signed in
# as `authenticated` does not satisfy for a company they are not already on. The service role is the
# only caller that can seat the first member of a company.
#
# IT REFUSES TO GUESS. A company id that does not exist, a role outside the CHECK, an email that
# already has an account — each stops the run before anything is written.
set -euo pipefail

usage() {
  cat >&2 <<USAGE
usage: $0 --email <address> --company <uuid> --role <role> [--password <pw>] [--admin]

  --role      sponsor | decision_owner | contributor | participant | observer | member
  --password  omitted → a 32-char random one is generated and printed ONCE
  --admin     also insert a user_roles 'admin' row (an operator account, not a client's)

env: SUPABASE_URL (default http://127.0.0.1:54321)
     SERVICE_ROLE_KEY  the LEGACY JWT one (eyJ…) from \`supabase status --output env\`.
                       The sb_secret_… value is NOT accepted by the gateway.
USAGE
  exit 2
}

EMAIL=""; COMPANY=""; ROLE=""; PASSWORD=""; MAKE_ADMIN=0
while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="${2:-}"; shift 2;;
    --company) COMPANY="${2:-}"; shift 2;;
    --role) ROLE="${2:-}"; shift 2;;
    --password) PASSWORD="${2:-}"; shift 2;;
    --admin) MAKE_ADMIN=1; shift;;
    -h|--help) usage;;
    *) echo "unknown argument: $1" >&2; usage;;
  esac
done
[ -n "$EMAIL" ] && [ -n "$COMPANY" ] && [ -n "$ROLE" ] || usage

URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="${SERVICE_ROLE_KEY:-}"
[ -n "$KEY" ] || { echo "SERVICE_ROLE_KEY not set (the eyJ… one)" >&2; exit 2; }
case "$KEY" in eyJ*) ;; *) echo "SERVICE_ROLE_KEY must be the LEGACY JWT key (eyJ…); sb_secret_… is refused by the gateway" >&2; exit 2;; esac

case "$ROLE" in
  sponsor|decision_owner|contributor|participant|observer|member) ;;
  *) echo "--role must be one of: sponsor decision_owner contributor participant observer member" >&2; exit 2;;
esac

api() { # api <method> <path> [body]
  local m="$1" p="$2" b="${3:-}"
  if [ -n "$b" ]; then
    curl -sS -X "$m" "$URL$p" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$b"
  else
    curl -sS -X "$m" "$URL$p" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
  fi
}
jqp() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# ── 0. the company must exist, and must not be a held fixture ──────────────────────────────────
CO_JSON=$(api GET "/rest/v1/companies?id=eq.$COMPANY&select=id,name,fixture_hold")
CO_N=$(printf '%s' "$CO_JSON" | jqp "len(d)")
[ "$CO_N" = "1" ] || { echo "no company with id $COMPANY" >&2; exit 1; }
CO_NAME=$(printf '%s' "$CO_JSON" | jqp "d[0]['name']")
CO_HOLD=$(printf '%s' "$CO_JSON" | jqp "d[0]['fixture_hold'] or ''")
if [ -n "$CO_HOLD" ]; then
  echo "refusing: $CO_NAME is a HELD fixture (fixture_hold=$CO_HOLD). Seating a real person on a" >&2
  echo "fixture is how a test company becomes a client surface. Pick the real company." >&2
  exit 1
fi

# ── 1. the account ─────────────────────────────────────────────────────────────────────────────
if [ -z "$PASSWORD" ]; then
  # NOT `tr -dc < /dev/urandom | head -c 32`: head closes the pipe, tr takes SIGPIPE, and under
  # `set -o pipefail` the whole script exits 141 before writing anything. python3 is already a hard
  # dependency of this script.
  PASSWORD=$(python3 -c "import secrets,string; print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)))")
  GENERATED=1
else
  GENERATED=0
fi
# email_confirm:true because there is no mail service here and an unconfirmed account cannot sign in.
USER_JSON=$(api POST "/auth/v1/admin/users" "$(python3 - "$EMAIL" "$PASSWORD" <<'PY'
import json,sys
print(json.dumps({"email": sys.argv[1], "password": sys.argv[2], "email_confirm": True}))
PY
)")
USER_ID=$(printf '%s' "$USER_JSON" | jqp "d.get('id') or ''")
if [ -z "$USER_ID" ]; then
  echo "account not created: $USER_JSON" >&2
  exit 1
fi

# ── 2. the membership ──────────────────────────────────────────────────────────────────────────
MEM_JSON=$(api POST "/rest/v1/company_members" "$(python3 - "$COMPANY" "$USER_ID" "$ROLE" <<'PY'
import json,sys
print(json.dumps({"company_id": sys.argv[1], "user_id": sys.argv[2], "role": sys.argv[3]}))
PY
)")
MEM_ID=$(printf '%s' "$MEM_JSON" | jqp "(d[0]['id'] if isinstance(d,list) and d else '')")
if [ -z "$MEM_ID" ]; then
  echo "membership NOT created: $MEM_JSON" >&2
  echo "the account exists — retire it with the block in docs/operator-account-setup.md" >&2
  exit 1
fi

# ── 3. optional: an operator ───────────────────────────────────────────────────────────────────
if [ "$MAKE_ADMIN" = "1" ]; then
  api POST "/rest/v1/user_roles" "$(python3 - "$USER_ID" <<'PY'
import json,sys
print(json.dumps({"user_id": sys.argv[1], "role": "admin"}))
PY
)" >/dev/null
fi

echo "account      $EMAIL"
echo "user_id      $USER_ID"
echo "company      $CO_NAME ($COMPANY)"
echo "role         $ROLE"
echo "admin row    $([ "$MAKE_ADMIN" = 1 ] && echo yes || echo no)"
if [ "$GENERATED" = "1" ]; then
  echo "password     $PASSWORD"
  echo
  echo "That password is printed once and stored nowhere. Give it to the person over a channel you"
  echo "trust and have them change it at /login → Forgot password?."
fi
echo
echo "They sign in at /login and land on their own company. Nothing else is needed."
