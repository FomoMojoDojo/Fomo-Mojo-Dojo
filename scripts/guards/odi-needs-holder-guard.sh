#!/usr/bin/env bash
# ── 4f-6 GUARD — a need's holder (ruling F9 of 2026-09-24) ───────────────────────────────────────
#
# Three plants, each shown RED (the plant is accepted / the leak appears) then GREEN (restored):
#   (i)   the paired CHECK odi_needs_holder_market_key dropped
#             -> a MARKET need with a NULL journey_key is accepted
#   (ii)  a fixed reader's `.not("journey_key","is",null)` removed
#             -> the planted company-held need appears on a market surface
#   (iii) the holder DEFAULT removed
#             -> an existing-row insert path (one that never names holder) fails
#
# Read-only against real data: every DB act runs inside BEGIN/ROLLBACK, and the source plants are
# made on a byte-checked copy and restored md5-identical. No company's rows are changed.
#
# Usage: bash scripts/guards/odi-needs-holder-guard.sh
set -uo pipefail
cd "$(dirname "$0")/../.."

DB_CONTAINER="${DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -t -A -F'|' 2>&1; }

PASS=0; FAIL=0
OUT=$(mktemp)                       # every probe writes here; chk reads it in THIS shell, never a
trap 'rm -f "$OUT"' EXIT            # pipeline subshell, or the counters are lost.
chk() { # chk <name> <expected-substring>   — asserts against $OUT
  local name="$1" want="$2"
  if grep -qF -- "$want" "$OUT"; then printf '  ok   %s\n' "$name"; PASS=$((PASS+1));
  else printf '  FAIL %s\n         wanted: %s\n         got:    %s\n' "$name" "$want" "$(head -c 400 "$OUT" | tr '\n' ' ')"; FAIL=$((FAIL+1)); fi
}
sql() { docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -t -A -F'|' >"$OUT" 2>&1; }

CO=$(psqlq <<<"SELECT id FROM public.companies WHERE frozen IS NOT TRUE ORDER BY created_at LIMIT 1;" | head -1)
US=$(psqlq <<<"SELECT created_by FROM public.companies WHERE id='$CO';" | head -1)
[ -n "$CO" ] || { echo "guard: FAIL no unfrozen company to test against"; exit 1; }

NEED_COLS="company_id,user_id,tier,desired_outcome,journey_key,step_number,step_label,importance,satisfaction,opportunity_score,service_state,source_path,frameworks_used,sort_order,dependency_state,validation_state,evidence_state,provenance_type,status"
need_vals() { # need_vals <journey_key-sql> <label>
  echo "'$CO','$US','need',$2,$1,0,'',0,0,0,'served','',ARRAY[]::text[],0,'fresh','unvalidated','partial','internal_declared','active'"
}

echo "── A. the shape, as shipped ─────────────────────────────────────────────────"

sql <<SQL
SELECT column_name||'|'||is_nullable||'|'||column_default FROM information_schema.columns
 WHERE table_name='odi_needs' AND column_name='holder';
SQL
chk "(a1) holder exists, NOT NULL, DEFAULT 'market'" "holder|NO|'market'::text"
sql <<SQL
SELECT column_name||'|'||is_nullable FROM information_schema.columns
 WHERE table_name='odi_needs' AND column_name='journey_key';
SQL
chk "(a2) journey_key is nullable" "journey_key|YES"
sql <<SQL
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='odi_needs_holder_market_key';
SQL
chk "(a3) the paired CHECK is present" "holder = 'market'"
sql <<SQL
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='odi_needs_holder_check';
SQL
chk "(a4) holder is confined to market|company" "'market'::text, 'company'::text"
sql <<SQL
SELECT 'COUNT='||count(*) FROM public.odi_needs WHERE holder<>'market' OR journey_key IS NULL;
SQL
chk "(a5) every pre-4f-6 row is a market need" "COUNT=0"
echo "── B. the paired CHECK, both directions ────────────────────────────────────"

sql <<SQL
BEGIN; INSERT INTO public.odi_needs ($NEED_COLS) VALUES ($(need_vals NULL "'guard b1'")); ROLLBACK;
SQL
chk "(b1) a market need with a NULL key is REFUSED" "odi_needs_holder_market_key"
sql <<SQL
BEGIN; INSERT INTO public.odi_needs (holder,$NEED_COLS) VALUES ('company',$(need_vals "'customer'" "'guard b2'")); ROLLBACK;
SQL
chk "(b2) a company need WITH a key is REFUSED" "odi_needs_holder_market_key"
sql <<SQL
BEGIN; INSERT INTO public.odi_needs (holder,$NEED_COLS) VALUES ('team',$(need_vals NULL "'guard b3'")); ROLLBACK;
SQL
chk "(b3) an unknown holder is REFUSED" "odi_needs_holder_check"
sql <<SQL
BEGIN; INSERT INTO public.odi_needs (holder,$NEED_COLS) VALUES ('company',$(need_vals NULL "'guard b4'")); ROLLBACK;
SQL
chk "(b4) a LEGAL company-held need is accepted" "INSERT 0 1"
echo "── C. PLANT (i): drop the paired CHECK -> RED, restore -> GREEN ─────────────"

sql <<SQL
BEGIN;
ALTER TABLE public.odi_needs DROP CONSTRAINT odi_needs_holder_market_key;
INSERT INTO public.odi_needs ($NEED_COLS) VALUES ($(need_vals NULL "'guard plant-i'"));
ROLLBACK;
SQL
chk "(i) RED  — with the CHECK dropped, a market need with NULL key is ACCEPTED" "INSERT 0 1"
sql <<SQL
BEGIN; INSERT INTO public.odi_needs ($NEED_COLS) VALUES ($(need_vals NULL "'guard plant-i'")); ROLLBACK;
SQL
chk "(i) GREEN — the CHECK back in place, the same insert is REFUSED" "odi_needs_holder_market_key"
echo "── D. PLANT (ii): remove a fixed reader's filter -> RED, restore -> GREEN ───"
# The reader is useOdiNeeds' no-key branch: the one the census names and the one every unscoped
# consumer (home, shell, score, Opportunities, Needs panel) reads through.
READER=src/hooks/useOdiNeeds.ts
BEFORE_MD5=$(md5 -q "$READER")
cp "$READER" /tmp/odi-guard-reader.bak

perl -0pi -e 's/\n\s*\.not\("journey_key", "is", null\)//' "$READER"
if grep -q '.not("journey_key", "is", null)' "$READER"; then
  printf '  FAIL (ii) the plant did not apply\n'; FAIL=$((FAIL+1))
else
  npx vitest run src/lib/odiNeeds/ --reporter=default >"$OUT" 2>&1
  chk "(ii) RED  — the census names the unguarded reader" "useOdiNeeds.ts"
  chk "(ii) RED  — and the run fails" "1 failed"
fi

cp /tmp/odi-guard-reader.bak "$READER"; rm -f /tmp/odi-guard-reader.bak
AFTER_MD5=$(md5 -q "$READER")
if [ "$BEFORE_MD5" = "$AFTER_MD5" ]; then printf '  ok   (ii) the reader is restored md5-identical\n'; PASS=$((PASS+1));
else printf '  FAIL (ii) the reader was NOT restored (%s -> %s)\n' "$BEFORE_MD5" "$AFTER_MD5"; FAIL=$((FAIL+1)); fi

npx vitest run src/lib/odiNeeds/ --reporter=default >"$OUT" 2>&1
chk "(ii) GREEN — with the filter back, both 4f-6 test files pass" "2 passed"

echo "── E. PLANT (iii): drop the holder DEFAULT -> RED, restore -> GREEN ─────────"
# Every INSERT in the estate names its columns and none names holder. The DEFAULT is what makes
# 4f-6 additive; without it those insert paths fail on a NOT NULL column.

sql <<SQL
BEGIN;
ALTER TABLE public.odi_needs ALTER COLUMN holder DROP DEFAULT;
INSERT INTO public.odi_needs ($NEED_COLS) VALUES ($(need_vals "'customer'" "'guard plant-iii'"));
ROLLBACK;
SQL
chk "(iii) RED  — with the DEFAULT dropped, an existing insert path FAILS" 'null value in column "holder"'

sql <<SQL
BEGIN;
INSERT INTO public.odi_needs ($NEED_COLS) VALUES ($(need_vals "'customer'" "'guard plant-iii'"));
SELECT holder FROM public.odi_needs WHERE desired_outcome='guard plant-iii';
ROLLBACK;
SQL
chk "(iii) GREEN — with the DEFAULT restored, the same insert succeeds as 'market'" "market"
echo "── F. no row was changed ───────────────────────────────────────────────────"
sql <<SQL
SELECT 'COUNT='||count(*) FROM public.odi_needs WHERE desired_outcome LIKE 'guard %';
SQL
chk "(f1) no guard row survives" "COUNT=0"
sql <<SQL
SELECT 'COUNT='||count(*) FROM public.odi_needs WHERE holder<>'market' OR journey_key IS NULL;
SQL
chk "(f2) the estate is still all-market" "COUNT=0"
echo
echo "guard: checks=$((PASS+FAIL)) passed=$PASS failed=$FAIL"
[ "$FAIL" -eq 0 ] && { echo "guard: PASS"; exit 0; } || { echo "guard: FAIL"; exit 1; }
