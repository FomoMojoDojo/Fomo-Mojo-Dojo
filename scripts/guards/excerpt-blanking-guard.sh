#!/usr/bin/env bash
# GUARD — excerpt blanking, backfill act b2 (operator ruling 2026-10-16). The law: claim_text may be our summary;
# evidence_excerpt is the page's words or absent. _shared/excerptBlanking.ts plans, applies and reverts the stored
# rows; scripts/excerpt-blanking.ts drives it over the audited psql channel. EVERY database probe here runs inside
# BEGIN … ROLLBACK (the runner's --probe modes): nothing this guard does to signals or the audit table survives.
#
# Checks (affirmative, no plant):
#   e0. signal_excerpt_blankings exists with RLS ON; anon holds nothing; authenticated holds SELECT only; the
#       enforce_company_freeze trigger is attached; both FKs cascade; action is constrained
#   e1. apply refuses without a reviewed plan (no_plan), without the flag named in source (not_confirmed), and when
#       the plan differs from a fresh re-plan by id (plan_drift) — each BEFORE any write (audit count unchanged)
#   e2. apply refuses a plan carrying a frozen company's row (frozen_company) BEFORE any write — the module's own
#       refusal, not the DB trigger's
#   e3. on a 5-row sample of the live plan: one audit row per touched signal (audit_rows == blanked + stamped_only),
#       every blanked row loses its excerpt and keeps claim_text, every stamp names reason not_on_retained_page and
#       the run_ref
#   e4. revert restores every sampled row (excerpt, claim_text, raw_payload but for the reverted note) and marks every
#       audit row of the run reverted
#   e5. the analysis row in the sample is stamped (analysis_carve_out) and KEEPS its excerpt; in the fleet plan every
#       analysis row is stamped_only and no non-analysis row is
#   e6. plan invariants against SQL: every planned id is a live outside row whose excerpt is on NO ok snapshot of its
#       url and not on its quote_source_text; every such row (with ≥1 ok snapshot) is planned; no frozen company
#   e7. after the probes the audit table holds exactly what it held before (rollback proven) and signals' md5 is unchanged
#
# Plants (each injected live, in-place write, confirmed to move a measured value, RED, restored md5-identical):
#   remove the no_plan / not_confirmed refusal (excerptBlanking.ts applyExcerptBlanking)   => e1 red
#   remove the frozen loop in apply                                                        => e2 red (the DB trigger
#                                                                                              then refuses — code error:*, not frozen_company)
#   skip insertAudit in apply                                                              => e3 red
#   skip one row's restore in revert                                                       => e4 red
#   plan every row as 'blanked' (drop the analysis carve-out)                              => e5 + e6 red
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
run() { deno run --allow-all scripts/excerpt-blanking.ts "$@" 2>/dev/null | tail -1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# e0 — the table
[ "$(psql "select relrowsecurity from pg_class where oid='public.signal_excerpt_blankings'::regclass")" = t ] || fail e0 "RLS is off"
[ "$(psql "select count(*) from information_schema.role_table_grants where table_schema='public' and table_name='signal_excerpt_blankings' and grantee='anon'")" = 0 ] || fail e0 "anon holds a privilege"
[ "$(psql "select coalesce(string_agg(privilege_type, ',' order by privilege_type),'') from information_schema.role_table_grants where table_schema='public' and table_name='signal_excerpt_blankings' and grantee='authenticated'")" = SELECT ] || fail e0 "authenticated holds more than SELECT"
[ "$(psql "select count(*) from pg_trigger where tgrelid='public.signal_excerpt_blankings'::regclass and tgname='enforce_company_freeze' and tgenabled<>'D'")" = 1 ] || fail e0 "enforce_company_freeze not attached"
[ "$(psql "select count(*) from pg_constraint where conrelid='public.signal_excerpt_blankings'::regclass and contype='f' and confdeltype='c'")" = 2 ] || fail e0 "two cascading FKs expected"
[ "$(psql "select count(*) from pg_constraint where conrelid='public.signal_excerpt_blankings'::regclass and contype='c' and pg_get_constraintdef(oid) like '%blanked%stamped_only%'")" = 1 ] || fail e0 "action check constraint missing"
echo "e0. table: RLS on, anon nothing, authenticated SELECT only, freeze trigger attached, 2 cascading FKs, action constrained"

AUDIT_N0=$(psql "select count(*) from signal_excerpt_blankings")
SIG_MD5_0=$(psql "select md5(string_agg(id::text||'|'||evidence_excerpt||'|'||claim_text||'|'||coalesce(raw_payload::text,''), ',' order by id)) from signals")

# e1 — refusals before any write
for probe in no-plan:no_plan no-flag:not_confirmed struck-row:plan_drift; do
  p=${probe%%:*}; want=${probe#*:}
  J=$(run --probe="$p"); echo "$J" | grep -q '"rolled_back":true' || fail e1 "probe $p did not run: $J"
  [ "$(echo "$J" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['audit_rows_after_rollback']==d['audit_rows_before'])")" = "True|$want|True" ] || fail e1 "$p: $(echo "$J" | jq_ "d['refused'],d['code'],d['message']")"
done
echo "e1. apply refused: no plan (no_plan), wrong flag (not_confirmed), struck row (plan_drift); audit count unchanged"

# e2 — frozen row
J=$(run --probe=frozen-row)
[ "$(echo "$J" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['audit_rows_after_rollback']==d['audit_rows_before'])")" = "True|frozen_company|True" ] || fail e2 "frozen row: $(echo "$J" | jq_ "d['refused'],d['code'],d['message']")"
echo "e2. apply refused a frozen company's row before any write (module refusal frozen_company)"

# e3 / e4 / e5 — the 5-row sample, applied and reverted inside one rolled-back transaction
J=$(run --probe=apply-revert-sample:5); echo "$J" > "$TMP/sample.json"
echo "$J" | grep -q '"rolled_back":true' || fail e3 "sample probe did not run: $J"
[ "$(echo "$J" | jq_ "d['applied']['audit_rows']==d['applied']['blanked']+d['applied']['stamped_only'] and d['audit_rows_written']==d['applied']['audit_rows'] and d['applied']['skipped']==0")" = True ] || fail e3 "audit rows ≠ touched rows: $(echo "$J" | jq_ "d['applied'],d['audit_rows_written']")"
[ "$(echo "$J" | jq_ "all((a['excerpt_empty'] and a['claim_text_kept']) for a in d['after_apply'] if next(s['action'] for s in d['sample'] if s['id']==a['id'])=='blanked')")" = True ] || fail e3 "a blanked sample row kept its excerpt or lost claim_text: $(echo "$J" | jq_ "d['after_apply']")"
[ "$(echo "$J" | jq_ "all(a['stamp_reason']=='not_on_retained_page' and a['run_ref']=='probe-run' for a in d['after_apply'])")" = True ] || fail e3 "a stamp lacks the reason or run_ref: $(echo "$J" | jq_ "d['after_apply']")"
echo "e3. sample of $(echo "$J" | jq_ "len(d['sample'])"): audit rows == touched rows ($(echo "$J" | jq_ "d['applied']['audit_rows']")), blanked rows excerpt-less with claim_text kept, every stamp reason not_on_retained_page + run_ref"
[ "$(echo "$J" | jq_ "d['unrestored']==[] and d['audit_unreverted_after_revert']==0 and d['reverted']==d['applied']['audit_rows']")" = True ] || fail e4 "revert left rows: unrestored=$(echo "$J" | jq_ "d['unrestored']") unreverted_audit=$(echo "$J" | jq_ "d['audit_unreverted_after_revert']") reverted=$(echo "$J" | jq_ "d['reverted']")"
echo "e4. revert restored every sampled row and marked every audit row of the run"
[ "$(echo "$J" | jq_ "any(s['action']=='stamped_only' for s in d['sample'])")" = True ] || fail e5 "the sample carries no analysis row"
[ "$(echo "$J" | jq_ "all((not a['excerpt_empty']) and a['carve_out']==True for a in d['after_apply'] if next(s['action'] for s in d['sample'] if s['id']==a['id'])=='stamped_only')")" = True ] || fail e5 "an analysis row was blanked or not marked analysis_carve_out: $(echo "$J" | jq_ "d['after_apply']")"

# e5 (fleet) + e6 — plan invariants against SQL
run --plan --out="$TMP/plan.json" >/dev/null || fail e6 "plan did not run"
python3 - "$TMP/plan.json" > "$TMP/plan_ids.txt" <<'EOF'
import json,sys; d=json.load(open(sys.argv[1]))
bad=[r for r in d['rows'] if (r['voice_class']=='analysis') != (r['action']=='stamped_only')]
if bad: print("ACTION_MISMATCH", len(bad)); sys.exit(1)
for r in d['rows']: print(r['signal_id'])
EOF
[ $? -eq 0 ] || fail e5 "fleet plan: an analysis row is not stamped_only, or a non-analysis row is"
echo "e5. analysis rows: stamped (analysis_carve_out), excerpt kept in the sample; fleet plan actions match voice_class"
psql "with live as (select s.id, s.company_id, s.source_url, lower(regexp_replace(trim(s.evidence_excerpt),'\s+',' ','g')) ex, s.quote_source_text from signals s join companies c on c.id=s.company_id where s.signal_band='outside' and s.superseded_at is null and s.held_at is null and nullif(trim(s.evidence_excerpt),'') is not null and nullif(trim(s.source_url),'') is not null and not c.frozen and c.id<>'58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'),
 snap as (select company_id, source_url, string_agg(lower(regexp_replace(clean_text,'\s+',' ','g')),' ||| ') t from outside_page_snapshots where fetch_status='ok' and clean_text is not null group by 1,2)
 select l.id from live l join snap on snap.company_id=l.company_id and snap.source_url=l.source_url where snap.t not like '%'||l.ex||'%' and (l.quote_source_text is null or lower(regexp_replace(l.quote_source_text,'\s+',' ','g')) not like '%'||l.ex||'%') order by 1" | sort > "$TMP/sql_ids.txt"
sort "$TMP/plan_ids.txt" > "$TMP/plan_ids_sorted.txt"
if ! diff -q "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" >/dev/null; then fail e6 "plan ids ≠ SQL set: only_in_plan=$(comm -23 "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" | wc -l | tr -d ' ') only_in_sql=$(comm -13 "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" | wc -l | tr -d ' ')"; fi
echo "e6. plan = SQL set by id ($(wc -l < "$TMP/sql_ids.txt" | tr -d ' ') rows); no frozen company planned"

# e7 — nothing survived
[ "$(psql "select count(*) from signal_excerpt_blankings")" = "$AUDIT_N0" ] || fail e7 "audit table changed"
[ "$(psql "select md5(string_agg(id::text||'|'||evidence_excerpt||'|'||claim_text||'|'||coalesce(raw_payload::text,''), ',' order by id)) from signals")" = "$SIG_MD5_0" ] || fail e7 "signals changed"
echo "e7. rollback proven: audit table and signals byte-identical to before the probes"
echo "GUARD OK"
