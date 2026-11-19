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
#       url, not on its quote_source_text, and not already carrying a backfill stamp; every such row (with ≥1 ok
#       snapshot) is planned; no frozen company
#   e7. after the probes the audit table holds exactly what it held before (rollback proven) and signals' md5 is unchanged
#   e8. (A6, 2026-11-18) CENSUS: a stored search snippet (outside_page_snapshots.structured.basis_kind 'cited_text') is
#       never read as the page. Every file that reads outside_page_snapshots is either a PAGE READER that applies the rule
#       (_shared/snapshotBasis.ts isPageSnapshot / pageSnapshotSql, or the literal SQL predicate) or is named EXEMPT with
#       its reason; a new reader on neither list fails. Plant: drop the predicate from scripts/lib/psqlBlankingStore.ts →
#       the live plan grows back by the 40 snippet-only rows (the real-document check); remove a reader's rule → e8 RED.
#
# e6's SQL (2026-11-18, brief "verify search-cited quotes", slice 2): it mirrors the planner's normalizeForHash
# (lowercase, every whitespace run to one space, trimmed) and tests containment with strpos, not LIKE. The old
# SQL trimmed spaces only — an excerpt ending in a blank line kept a trailing space the page did not have (9
# review-lane rows) — and LIKE read a backslash in the excerpt as its escape character (the two 2026-10-22
# rows of SP-F5). Both were rows the planner rightly left alone. The planner is unchanged.
# A1 (2026-11-18, brief "measure need-to-quote matching"): a review-lane row's excerpt is also verified when it is on a
# page its own stored call fetched (review_lane_calls.response web_fetch results) — the planner's
# loadLaneFetchedPages, mirrored here.
#
# Plants (each injected live, in-place write, confirmed to move a measured value, RED, restored md5-identical):
#   remove the no_plan / not_confirmed refusal (excerptBlanking.ts applyExcerptBlanking)   => e1 red
#   remove the frozen loop in apply                                                        => e2 red (the DB trigger
#                                                                                              then refuses — code error:*, not frozen_company)
#   skip insertAudit in apply                                                              => e3 red
#   skip one row's restore in revert                                                       => e4 red
#   plan every row as 'blanked' (drop the analysis carve-out)                              => e5 + e6 red
#
# THE PROBES RUN ON A THROWAWAY COMPANY (2026-10-16, after the fleet apply). Act b2 was applied — the live plan is
# EMPTY — so a guard that sampled the live plan would have nothing to sample the day after it did its job. The
# guard seeds one throwaway company (one ok snapshot; four paraphrased outside rows, one analysis row, one verified
# row) and scopes every probe to it (--company=); the probes still roll back, and the throwaway is deleted on exit.
# e6 compares the FLEET plan to the SQL set, throwaway included.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
CO="00000000-0000-4000-8000-00000000b2a0"
cleanup() { psql "delete from signals where company_id='$CO'; delete from outside_page_snapshots where company_id='$CO'; delete from companies where id='$CO';" >/dev/null 2>&1 || true; rm -rf "${TMP:-/nonexistent}"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
run() { deno run --allow-all scripts/excerpt-blanking.ts "$@" 2>/dev/null | tail -1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
TMP=$(mktemp -d); trap cleanup EXIT
cleanup; TMP=$(mktemp -d)
PAGE="About us. The roastery opened in 2011 on Magnolia Boulevard and roasts every bean in Burbank, three days a week."
URL="https://b2guard.test/page"
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway excerpt blanking guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into outside_page_snapshots (company_id, source_url, signal_id, clean_text, text_sha256, fetch_status, http_status) values ('$CO','$URL',null,'$PAGE','sha-b2guard','ok',200)" >/dev/null
SIG() { psql "insert into signals (company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, voice_class) values ('$CO', 'run-b2', 'public_baseline_run', 'guard', '$URL', 'outside', 'market_signal', '$1', '$1', 'strategy', 'direct', 'partial', 'extracted', 'directional', 'medium', '{}', '$2') returning id" | head -1; }
for t in "the roastery roasts in Burbank thrice weekly" "a paraphrase the page never says, one" "a paraphrase the page never says, two" "a paraphrase the page never says, three"; do SIG "$t" outside_voice_about_client >/dev/null; done
SIG "Our read: the wholesale emphasis outruns the retail footprint." analysis >/dev/null
SIG "roasts every bean in Burbank" outside_voice_about_client >/dev/null   # verified by the snapshot: never planned
[ "$(run --plan --company=$CO | jq_ "str(d['rows'])+'|'+str(d['blanked'])+'|'+str(d['stamped_only'])")" = "5|4|1" ] || fail seed "throwaway plan is not 5 rows (4 blanked, 1 stamped_only): $(run --plan --company=$CO)"
echo "seed. throwaway company planned: 5 rows (4 blanked, 1 stamped_only); the verified row is not planned"

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
  J=$(run --probe="$p" --company=$CO); echo "$J" | grep -q '"rolled_back":true' || fail e1 "probe $p did not run: $J"
  [ "$(echo "$J" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['audit_rows_after_rollback']==d['audit_rows_before'])")" = "True|$want|True" ] || fail e1 "$p: $(echo "$J" | jq_ "d['refused'],d['code'],d['message']")"
done
echo "e1. apply refused: no plan (no_plan), wrong flag (not_confirmed), struck row (plan_drift); audit count unchanged"

# e2 — frozen row
J=$(run --probe=frozen-row --company=$CO)
[ "$(echo "$J" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['audit_rows_after_rollback']==d['audit_rows_before'])")" = "True|frozen_company|True" ] || fail e2 "frozen row: $(echo "$J" | jq_ "d['refused'],d['code'],d['message']")"
echo "e2. apply refused a frozen company's row before any write (module refusal frozen_company)"

# e3 / e4 / e5 — the 5-row sample, applied and reverted inside one rolled-back transaction
J=$(run --probe=apply-revert-sample:5 --company=$CO); echo "$J" > "$TMP/sample.json"
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
psql "with live as (select s.id, s.company_id, s.source_url, btrim(lower(regexp_replace(s.evidence_excerpt,'\s+',' ','g'))) ex, s.quote_source_text, s.review_lane_call_id from signals s join companies c on c.id=s.company_id where s.signal_band='outside' and s.superseded_at is null and s.held_at is null and nullif(trim(s.evidence_excerpt),'') is not null and nullif(trim(s.source_url),'') is not null and not c.frozen and c.id<>'58b2b15b-bada-4bcd-9c12-b7e66a37d0bc' and coalesce(s.raw_payload->'excerpt_guard'->>'backfill_run_ref','')=''),
 snap as (select company_id, source_url, string_agg(lower(regexp_replace(clean_text,'\s+',' ','g')),' ||| ') t from outside_page_snapshots where fetch_status='ok' and clean_text is not null and coalesce(structured->>'basis_kind','') <> 'cited_text' group by 1,2)
 select l.id from live l join snap on snap.company_id=l.company_id and snap.source_url=l.source_url where strpos(snap.t, l.ex) = 0 and (l.quote_source_text is null or strpos(lower(regexp_replace(l.quote_source_text,'\s+',' ','g')), l.ex) = 0)
   and not exists (select 1 from review_lane_calls c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.response->'content')='array' then c.response->'content' else '[]'::jsonb end) b
                    where c.id = l.review_lane_call_id and b->>'type'='web_fetch_tool_result' and b->'content'->>'type'='web_fetch_result'
                      and strpos(lower(regexp_replace(coalesce(b->'content'->'content'->'source'->>'data',''),'\s+',' ','g')), l.ex) > 0) order by 1" | sort > "$TMP/sql_ids.txt"
sort "$TMP/plan_ids.txt" > "$TMP/plan_ids_sorted.txt"
if ! diff -q "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" >/dev/null; then fail e6 "plan ids ≠ SQL set: only_in_plan=$(comm -23 "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" | wc -l | tr -d ' ') only_in_sql=$(comm -13 "$TMP/plan_ids_sorted.txt" "$TMP/sql_ids.txt" | wc -l | tr -d ' ')"; fi
echo "e6. plan = SQL set by id ($(wc -l < "$TMP/sql_ids.txt" | tr -d ' ') rows); no frozen company planned"

# e7 — nothing survived
[ "$(psql "select count(*) from signal_excerpt_blankings")" = "$AUDIT_N0" ] || fail e7 "audit table changed"
[ "$(psql "select md5(string_agg(id::text||'|'||evidence_excerpt||'|'||claim_text||'|'||coalesce(raw_payload::text,''), ',' order by id)) from signals")" = "$SIG_MD5_0" ] || fail e7 "signals changed"
echo "e7. rollback proven: audit table and signals byte-identical to before the probes"
# e8 — the census
PAGE_READERS="supabase/functions/_shared/excerptBlanking.ts scripts/lib/psqlBlankingStore.ts supabase/functions/verify-excerpts/index.ts supabase/functions/_shared/outsideRegenHandler.ts supabase/functions/_shared/listingRegen.ts scripts/b3-review-decide.ts scripts/first-read-outside-recrawl.ts scripts/guards/excerpt-blanking-guard.sh"
# EXEMPT, each with its reason: writers of snapshots, readers of structure/identity only, and readers that use the text for
# something other than "is this on the page" (registry section spans, own-words spans, the authorship judge's context)
EXEMPT_RE='^(supabase/functions/_shared/snapshotBasis\.ts|supabase/functions/_shared/excerptVerification\.ts|supabase/functions/crawl-outside-pages/index\.ts|supabase/functions/_shared/outsidePageStore\.ts|scripts/r52/apply\.ts|scripts/r52/psqlSweepStore\.ts|scripts/entity-voice-restamp\.ts|src/lib/firstRead/channelAdmission\.ts|src/views/client/firstReadPreview/useFirstReadPreviewData\.ts|supabase/functions/_shared/aggregatorAuthorship\.ts|supabase/functions/_shared/listingDetect\.ts|supabase/functions/_shared/outsideEvidenceRegen\.ts|supabase/functions/_shared/ownHosts\.ts|supabase/functions/_shared/registryClassifier\.ts|supabase/functions/_shared/registryIngest\.ts|supabase/functions/_shared/registryOwnWords\.ts|supabase/functions/extract-own-words/index\.ts|supabase/functions/extract-outside-evidence/index\.ts)$'
for f in $PAGE_READERS; do grep -qE "isPageSnapshot|pageSnapshotSql|basis_kind','') <> 'cited_text'" "$f" || fail e8 "page reader $f does not skip stored search snippets"; done
UNLISTED=$(git ls-files -co --exclude-standard -- supabase/functions scripts src | grep -vE "\.test\.|/migrations/|^scripts/guards/|integrations/supabase/types\.ts$" | xargs grep -l "outside_page_snapshots" 2>/dev/null \
  | while read -r f; do echo " $PAGE_READERS " | grep -q " $f " && continue; echo "$f" | grep -qE "$EXEMPT_RE" && continue; echo "$f"; done)
[ -z "$UNLISTED" ] || fail e8 "outside_page_snapshots is read by a file on neither the page-reader nor the exempt list: $(echo $UNLISTED)"
echo "e8. census: $(echo $PAGE_READERS | wc -w | tr -d ' ') page readers skip stored search snippets; every other reader is named exempt"
echo "GUARD OK"
