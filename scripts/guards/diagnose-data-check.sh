#!/usr/bin/env bash
# DIAGNOSE DATA — the live, READ-ONLY check (step 8 of the signed brief, 2026-10-01).
#
# SELECT ONLY. Every statement here is a SELECT against the local stack. There is no insert, update,
# delete, DDL or function call, and none may be added: this script's whole purpose is to prove the
# pure functions in src/lib/diagnose agree with what the database actually holds. If a figure here
# ever disagrees with the fact report, the CODE IS NOT ADJUSTED TO MATCH — the disagreement is the
# finding, and the run stops.
#
# Checks:
#   (i1) Edgewood claims triad: world 33, team 23, customers 0, and 60 claims with no support.
#   (i2) Edgewood run selection: evidenceRun is the 2026-09-11 run; outageRun is null.
#   (i3) every company holding a search_unavailable run: whether the outage line would show.
#   (i4) the role map is TOTAL — both source columns are CHECK-constrained to the mapped values.
#
# Run:  bash scripts/guards/diagnose-data-check.sh
set -uo pipefail
DB_CONTAINER="${DIAGNOSE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
EDGEWOOD="3dd2cfbb-0792-4bf1-9cd4-15db9646874b"
fails=0
ok()  { printf '  ok   (%s) %s\n' "$1" "$2"; }
bad() { printf '  FAIL (%s) %s\n' "$1" "$2"; fails=$((fails+1)); }

q() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "$1" 2>/dev/null | tr -d ' \r'; }

docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER" || { echo "guard: FAIL db container $DB_CONTAINER not running"; exit 1; }

# ── (i1) Edgewood claims triad — STRUCK CLAIMS EXCLUDED ───────────────────────────────────────────
#
# RULED 2026-10-01: Gate A (2026-09-14) governs. A struck claim stops counting EVERYWHERE, so the
# triad is read over live claims only. Edgewood holds 13 struck of 116; excluding them costs 2 world
# and ELEVEN team. The 33/23 figures carried by the earlier fact report counted struck claims and
# were wrong.
#
# THE PREDICATE MIRRORS THE LOADER, deliberately. loadDiagnoseClaims uses PostgREST .neq("status",
# "struck") — SQL `status <> 'struck'` — so this check uses `<>` too, and tracks the loader if the
# column is ever changed. (`status` is NOT NULL with default 'active', verified 2026-10-01, so `<>`
# and the JS `!== "struck"` of useLiveMojoScore's excludeStruck cannot diverge today; writing `<>`
# here keeps the check honest if that ever stops being true.)
claims_triad() { # claims_triad <extra-where>
  q "select count(*) filter (where outside_support_count>0)||'|'||
            count(*) filter (where organization_support_count>0)||'|'||
            count(*) filter (where customer_support_count>0)||'|'||
            count(*) filter (where coalesce(outside_support_count,0)+coalesce(organization_support_count,0)+coalesce(customer_support_count,0)=0)
     from claims where company_id='$EDGEWOOD' $1;"
}
STRUCK="$(q "select count(*) from claims where company_id='$EDGEWOOD' and status='struck';")"
IFS='|' read -r WORLD TEAM CUST NOSUP <<<"$(claims_triad "and status <> 'struck'")"
if [ "$WORLD" = "31" ] && [ "$TEAM" = "12" ] && [ "$CUST" = "0" ] && [ "$NOSUP" = "60" ]; then
  ok "i1" "Edgewood excluding $STRUCK struck: world 31 · team 12 · customers 0 · no support 60 (Gate A)"
else
  bad "i1" "Edgewood live-claim triad moved: world=$WORLD team=$TEAM customers=$CUST no_support=$NOSUP (expected 31/12/0/60)"
fi

# customers must be its TRUE count including 0 — prove the column is readable and really is zero
CUSTSUM="$(q "select coalesce(sum(customer_support_count),0) from claims where company_id='$EDGEWOOD' and status <> 'struck';")"
if [ "$CUSTSUM" = "0" ]; then
  ok "i1b" "Edgewood customer support sums to 0 — a true zero, not an absent column"
else
  bad "i1b" "Edgewood customer support sum is $CUSTSUM, expected 0"
fi

# ── (i2) Edgewood run selection ───────────────────────────────────────────────────────────────────
EVID="$(q "select to_char(created_at,'YYYY-MM-DD') from public_baseline_runs
           where company_id='$EDGEWOOD' and result_json->>'status'='ok' order by created_at desc limit 1;")"
OUTAGE_N="$(q "select count(*) from public_baseline_runs
               where company_id='$EDGEWOOD' and result_json->>'status'='search_unavailable';")"
if [ "$EVID" = "2026-09-11" ]; then
  ok "i2" "Edgewood evidenceRun is the 2026-09-11 run (newest ok by timestamp)"
else
  bad "i2" "Edgewood evidenceRun date is $EVID, expected 2026-09-11"
fi
if [ "$OUTAGE_N" = "0" ]; then
  ok "i2b" "Edgewood outageRun is null — it holds no search_unavailable run"
else
  bad "i2b" "Edgewood holds $OUTAGE_N search_unavailable run(s), expected 0"
fi

# ── (i3) every company with an outage: would the line show? ───────────────────────────────────────
# The rule: outage shows only when the newest search_unavailable is STRICTLY NEWER than the newest
# ok run (full timestamp, never date). Printed per company for the report.
echo "  --   (i3) companies holding a search_unavailable run:"
OUT_ROWS="$(docker exec "$DB_CONTAINER" psql -U postgres -d postgres -tAc "
  with per as (
    select r.company_id,
           max(r.created_at) filter (where r.result_json->>'status'='ok')                 as newest_ok,
           max(r.created_at) filter (where r.result_json->>'status'='search_unavailable') as newest_out
    from public_baseline_runs r
    where r.company_id in (select company_id from public_baseline_runs where result_json->>'status'='search_unavailable')
    group by 1)
  select c.name||'|'||left(per.company_id::text,8)||'|'||coalesce(to_char(per.newest_ok,'YYYY-MM-DD HH24:MI:SS'),'none')
         ||'|'||to_char(per.newest_out,'YYYY-MM-DD HH24:MI:SS')
         ||'|'||case when per.newest_ok is null or per.newest_out > per.newest_ok then 'SHOWS' else 'hidden' end
  from per join companies c on c.id=per.company_id order by c.name;" 2>/dev/null)"
SHOWN=0; TOTAL=0
while IFS='|' read -r name co nok nout verdict; do
  [ -n "$name" ] || continue
  TOTAL=$((TOTAL+1))
  [ "$verdict" = "SHOWS" ] && SHOWN=$((SHOWN+1))
  printf '       %-30s %s  newest ok: %-19s newest outage: %-19s → %s\n' "$name" "$co" "$nok" "$nout" "$verdict"
done <<< "$OUT_ROWS"
OUT_RUNS="$(q "select count(*) from public_baseline_runs where result_json->>'status'='search_unavailable';")"
if [ "$OUT_RUNS" = "5" ] && [ "$TOTAL" = "2" ]; then
  ok "i3" "5 search_unavailable runs across 2 companies; the outage line would show for $SHOWN of them"
else
  bad "i3" "expected 5 outage runs across 2 companies, found $OUT_RUNS across $TOTAL"
fi

# ── (i4) the role map is total, not merely exhaustive over today's rows ───────────────────────────
ROLE_DEF="$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='interview_records_speaker_role_check';")"
SIDE_DEF="$(q "select pg_get_constraintdef(oid) from pg_constraint where conname='interview_items_speaker_side_check';")"
role_ok=0; side_ok=0
printf '%s' "$ROLE_DEF" | grep -q "client_stakeholder" && printf '%s' "$ROLE_DEF" | grep -q "market_participant" && printf '%s' "$ROLE_DEF" | grep -q "working_session" && role_ok=1
printf '%s' "$SIDE_DEF" | grep -q "'client'" && printf '%s' "$SIDE_DEF" | grep -q "'ours'" && side_ok=1
# and nothing outside the mapped set exists in the data
UNMAPPED="$(q "select (select count(*) from interview_records where speaker_role is null or speaker_role not in ('client_stakeholder','market_participant','working_session'))
                    + (select count(*) from interview_items   where speaker_side is null or speaker_side not in ('client','ours'));")"
if [ "$role_ok" = "1" ] && [ "$side_ok" = "1" ] && [ "$UNMAPPED" = "0" ]; then
  ok "i4" "the role map is TOTAL — both columns CHECK-constrained to the mapped values, 0 unmapped rows"
else
  bad "i4" "role map not provably total (role_check=$role_ok side_check=$side_ok unmapped_rows=$UNMAPPED)"
fi

if [ "$fails" -eq 0 ]; then echo "check: PASS"; else echo "check: FAIL"; fi
[ "$fails" -eq 0 ]
