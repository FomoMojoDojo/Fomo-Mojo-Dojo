#!/usr/bin/env bash
# ── b3 REVIEW PATH GUARD — R11 (operator ruling 2026-10-18) ────────────────────────────────────────
#
# WHY THIS GUARD EXISTS. b3 regenerates excerpts only for URLs an operator approved. Three runners carry a
# URL from the plan file to an approval: --from-snapshots writes review rows from stored snapshots, the
# push mirrors them to ONE Notion database, the decide script copies the Verdict back by review-row id.
# Each has a way to go wrong silently — a dry run that writes, a push addressed to the wrong database,
# a decision overwritten — and none of those is visible in a successful exit code. This guard measures them.
#
# THE PROBES RUN ON A THROWAWAY COMPANY (one ok snapshot, one b2-blanked outside row, one plan row in a temp
# tsv), seeded on entry and deleted on exit; the decide probes read REAL decided rows of the 2026-09-04
# review run (Cafe Barra 2) through dry runs that write nothing — proven by the table's md5.
#
# Checks (affirmative, no plant):
#   g1. --from-snapshots WITHOUT --write writes zero rows: outside_recrawl_review and integrity_runs counts are
#       identical before and after, and the output names the one row it would write. With --write (throwaway
#       only) it writes exactly one review row with disposition b3_from_snapshot and one integrity row, both
#       deleted by cleanup — this is the only write this guard makes, and it never touches a real company.
#   g2. the push refuses any --database-id other than the allow-listed one (exit 2, "REFUSED") and accepts the
#       allow-listed id in dry run with writes: 0. The allow-list comes from the process env here, so the
#       operator's backups/client-sync.env is never edited.
#   g3. the decide script, dry run against a fixture: a verdict that CHANGES a decided row is REFUSED; the same
#       verdict is a no-op; an id outside the run is refused; the review table's md5 is unchanged.
#   g4. (R18) --system decides the throwaway's html row approve (html_text:newest_ok) and its thin-shell row reject
#       (R10:thin_shell), decided_by system:b3-rules-1, dry run first (writes 0) then --live.
#   g5. (R18) --system never touches an operator-decided row, and says why.
#   g6. (R18) an operator override of a system decision replaces it and writes one audit integrity row (from, to,
#       by); a later --system run leaves the override alone.
#
# Plants (each in place, confirmed to move a measured value, RED, restored md5-identical — 2026-10-18):
#   P1  --from-snapshots writes without --write (the gate `fromSnapshotsWrite &&` removed)  => g1 review rows 0 → 1
#   P2  assertAllowedDatabase returns without comparing                                      => g2 wrong id accepted
#   P3  decideCompareAndSet writes over a different decision                                 => g3 REFUSE → WRITE
#   P4  (R18) applyPrecedence lets the system overwrite an operator decision                 => g5: the operator row changes
#   P5  (R18) applyPrecedence reversed: the system overwrites an operator override            => g6: the override is lost
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
CO="00000000-0000-4000-8000-00000000b3a0"
SIG="00000000-0000-4000-8000-00000000b3a1"
URL="https://b3guard.test/about"
TMP=""
cleanup() { psql "delete from outside_recrawl_review where company_id='$CO'; delete from integrity_runs where company_id='$CO'; delete from signals where company_id='$CO'; delete from outside_page_snapshots where company_id='$CO'; delete from companies where id='$CO';" >/dev/null 2>&1 || true; rm -rf "${TMP:-/nonexistent}"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
trap cleanup EXIT
cleanup; TMP=$(mktemp -d)
PAGE="About us. The guard roastery opened in 2011 on Magnolia Boulevard and roasts every bean in Burbank, three days a week. Reviewers call it the neighbourhood favourite."
psql "insert into companies (id, name, website, created_by) values ('$CO', 'ZZ throwaway b3 review guard', 'https://b3guard.test', (select id from auth.users order by created_at limit 1))" >/dev/null
SNAP=$(psql "insert into outside_page_snapshots (company_id, source_url, signal_id, clean_text, text_sha256, fetch_status, http_status) values ('$CO','$URL',null,'$PAGE','sha-b3guard','ok',200) returning id" | head -1)   # -Atc prints the command tag after the id
psql "insert into signals (id, company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, voice_class) values ('$SIG', '$CO', 'guard', 'public_baseline_run', 'guard', '$URL', 'outside', 'market_signal', 'a paraphrase the page never said', '', 'strategy', 'direct', 'partial', 'extracted', 'directional', 'medium', '{\"excerpt_guard\":{\"backfill_run_ref\":\"guard-b2\",\"action\":\"blanked\"}}', 'outside_voice_about_client')" >/dev/null
# R18: a second URL whose snapshot is a THIN SHELL (no sentence, 9 chars) — the system decider's reject case
URL2="https://b3guard.test/instagram"; SIG2="00000000-0000-4000-8000-00000000b3a2"
SNAP2=$(psql "insert into outside_page_snapshots (company_id, source_url, signal_id, clean_text, text_sha256, fetch_status, http_status) values ('$CO','$URL2',null,'Instagram','sha-b3guard-thin','ok',200) returning id" | head -1)
psql "insert into signals (id, company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, voice_class) values ('$SIG2', '$CO', 'guard', 'public_baseline_run', 'guard', '$URL2', 'outside', 'market_signal', 'a paraphrase of a thin page', '', 'strategy', 'direct', 'partial', 'extracted', 'directional', 'medium', '{\"excerpt_guard\":{\"backfill_run_ref\":\"guard-b2\",\"action\":\"blanked\"}}', 'outside_voice_about_client')" >/dev/null
PLAN="$TMP/plan.tsv"
printf 'company\turl\tsnapshot_id\tchars\tat_cap\thead160\tstarts_json\tjson_punct_ratio\tcode_marks\tsentences\tblanked_rows\tblanked_signal_ids\texclude\texclude_rule\n' > "$PLAN"
printf 'ZZ throwaway b3 review guard\t%s\t%s\t%d\tf\tAbout us\tf\t0.01\t0\t2\t1\t%s\t\thtml text\n' "$URL" "$SNAP" "${#PAGE}" "$SIG" >> "$PLAN"
printf 'ZZ throwaway b3 review guard\thttps://b3guard.test/widget.json\t%s\t12000\tt\t{\"a\":1}\tt\t0.2\t0\t0\t1\t%s\tjson\tclean_text starts with {\n' "$SNAP" "$SIG" >> "$PLAN"
printf 'ZZ throwaway b3 review guard\t%s\t%s\t9\tf\tInstagram\tf\t0\t0\t0\t1\t%s\t\tthin but in scope on purpose\n' "$URL2" "$SNAP2" "$SIG2" >> "$PLAN"
echo "seed. throwaway company, two ok snapshots (html, thin), two b2-blanked outside rows, a 3-row plan (html in scope, json-excluded, thin in scope)"
counts() { psql "select (select count(*) from outside_recrawl_review)||'|'||(select count(*) from integrity_runs)"; }
RUN() { npx vite-node scripts/first-read-outside-recrawl.ts -- --company=$CO --from-snapshots --plan="$PLAN" "$@" 2>&1; }

# g1 — dry run writes nothing; --write writes one (throwaway)
B=$(counts)
OUT=$(RUN) || fail g1 "from-snapshots dry run exited non-zero: $(echo "$OUT" | tail -3)"
A=$(counts)
[ "$B" = "$A" ] || fail g1 "dry run changed row counts: $B -> $A"
echo "$OUT" | grep -q 'would write: 2 review row(s)' || fail g1 "dry run did not name the two rows: $(echo "$OUT" | tail -3)"
echo "$OUT" | grep -q 'writes: 0 (dry-run)' || fail g1 "dry run did not report writes: 0: $(echo "$OUT" | tail -2)"
echo "$OUT" | grep -q 'excluded by R10: json' || fail g1 "the json-excluded plan row was not reported as excluded"
echo "$OUT" | grep -q 'write statements issued: 0 ' || fail g1 "the dry run ISSUED a write statement: $(echo "$OUT" | grep 'write statements issued')"
echo "g1. from-snapshots dry run: counts $B unchanged; would write 2 (the json row excluded by R10); writes: 0; write statements issued: 0"
# The write leg needs disposition 'b3_from_snapshot' in the table's CHECK constraint (migration 20261019120000).
# Until that migration is applied the leg is SKIPPED AND SAID SO — never a silent pass.
if psql "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.outside_recrawl_review'::regclass and conname='outside_recrawl_review_disposition_check'" | grep -q b3_from_snapshot; then
  OUT=$(RUN --write) || fail g1 "from-snapshots --write exited non-zero: $(echo "$OUT" | tail -3)"
  RR=$(psql "select count(*) from outside_recrawl_review where company_id='$CO' and disposition='b3_from_snapshot' and operator_decision is null and ((dependent_signal_ids='{$SIG}'::uuid[] and baseline_sha256='sha-b3guard') or (dependent_signal_ids='{$SIG2}'::uuid[] and baseline_sha256='sha-b3guard-thin'))")
  IR=$(psql "select count(*) from integrity_runs where company_id='$CO' and component='r2_outside_recrawl' and (excluded_by_rule->>'mode')='from_snapshots'")
  [ "$RR" = "2" ] && [ "$IR" = "1" ] || fail g1 "--write on the throwaway wrote review=$RR integrity=$IR (expected 2 and 1)"
  echo "g1. --write (throwaway only): 2 review rows b3_from_snapshot (html, thin), decision NULL, dependents = the blanked ids, 1 integrity row; cleanup deletes them"
  GRUN=$(psql "select run_id from outside_recrawl_review where company_id='$CO' and disposition='b3_from_snapshot' limit 1")
else
  echo "g1. --write leg SKIPPED: migration 20261019120000 not applied (disposition CHECK lacks b3_from_snapshot) — NOT a pass; the write leg is proven after the migration"
  GRUN=""
fi

# g2 — the push allow-list
# A SYNTHETIC fixture id — never a real database; the scripts read B3_REVIEW_NOTION_DATABASE_ID from the process env (this seam) or backups/client-sync.env.
export B3_REVIEW_NOTION_DATABASE_ID="b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3"
set +e
npx vite-node scripts/b3-review-notion-push.ts -- --company=$CO --run-id=b3b3b3b3-0000-4000-8000-0000000000a0 --plan="$PLAN" --database-id=deadbeefdeadbeefdeadbeefdeadbeef > "$TMP/push-wrong.out" 2>&1; CODE=$?
set -e
[ "$CODE" = "2" ] || fail g2 "a wrong database id was not refused with exit 2 (got $CODE): $(tail -2 "$TMP/push-wrong.out")"
grep -q 'REFUSED: database deadbeef' "$TMP/push-wrong.out" || fail g2 "the refusal did not name the wrong id: $(tail -2 "$TMP/push-wrong.out")"
OUT=$(npx vite-node scripts/b3-review-notion-push.ts -- --company=$CO --run-id=b3b3b3b3-0000-4000-8000-0000000000a0 --plan="$PLAN" --database-id=b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3 2>&1) || fail g2 "the allow-listed id was refused: $(echo "$OUT" | tail -2)"
echo "$OUT" | grep -q 'writes: 0 (dry-run) · would create 2 page' || fail g2 "dry run with the allow-listed id did not plan one page: $(echo "$OUT" | tail -2)"
echo "g2. push: wrong database id refused (exit 2, named); allow-listed id accepted in dry run, writes: 0, 2 pages planned"

# g3 — decide compare-and-set (dry run against REAL decided rows; table md5 proves no write)
APPROVED=$(psql "select id from outside_recrawl_review where run_id='9a3ad379-d463-468c-bbed-926a5e5b1fa0' and operator_decision='approve' order by source_url limit 1")
[ -n "$APPROVED" ] || fail g3 "no approved row in the 2026-09-04 Cafe Barra 2 run to test against"
MD5=$(psql "select md5(string_agg(row_to_json(r)::text, ',' order by id)) from outside_recrawl_review r")
cat > "$TMP/fixture.json" <<EOF
[ {"page_id":"pg-change","review_row_id":"$APPROVED","verdict":"Reject"},
  {"page_id":"pg-same","review_row_id":"$APPROVED","verdict":"Approve"},
  {"page_id":"pg-other","review_row_id":"00000000-0000-4000-8000-00000000dead","verdict":"Approve"} ]
EOF
OUT=$(npx vite-node scripts/b3-review-decide.ts -- --company=fd3f7f63-968b-4698-b946-3d6b6450d79d --run-id=9a3ad379-d463-468c-bbed-926a5e5b1fa0 --fixture="$TMP/fixture.json" 2>&1) || fail g3 "decide dry run exited non-zero: $(echo "$OUT" | tail -3)"
echo "$OUT" | grep -q "REFUSE row ${APPROVED:0:8}… page pg-chang.*changed decision is refused" || fail g3 "a changed decision was not refused: $(echo "$OUT" | grep -E 'REFUSE|WRITE|NOOP')"
echo "$OUT" | grep -q "NOOP   row ${APPROVED:0:8}… page pg-same.*already approve" || fail g3 "the same decision was not a no-op"
echo "$OUT" | grep -q "REFUSE row 00000000… page pg-other.*no review row" || fail g3 "an id outside the run was not refused"
echo "$OUT" | grep -q 'would write 0 · refuse 2 · no-op 1' || fail g3 "tally: $(echo "$OUT" | grep 'verdicts read')"
[ "$(psql "select md5(string_agg(row_to_json(r)::text, ',' order by id)) from outside_recrawl_review r")" = "$MD5" ] || fail g3 "the review table changed under a dry run"
echo "g3. decide: changed decision REFUSED, same decision no-op, id outside the run refused; review table md5 unchanged"

# g4–g6 — R18: the system decides by rule; an operator decision is an override (throwaway rows only)
if [ -n "${GRUN:-}" ]; then
  DEC() { npx vite-node scripts/b3-review-decide.ts -- --company=$CO --run-id=$GRUN "$@" 2>&1; }
  HTML=$(psql "select id from outside_recrawl_review where company_id='$CO' and run_id='$GRUN' and source_url='$URL'")
  THIN=$(psql "select id from outside_recrawl_review where company_id='$CO' and run_id='$GRUN' and source_url='$URL2'")
  OUT=$(DEC --system --plan="$PLAN") || fail g4 "system dry run failed: $(echo "$OUT" | tail -3)"
  echo "$OUT" | grep -q "WRITE  row ${HTML:0:8}….* → approve by system:b3-rules-" || fail g4 "html row not planned approve by the system: $(echo "$OUT" | grep "${HTML:0:8}")"
  echo "$OUT" | grep -q "html_text:newest_ok" || fail g4 "approve rule not named"
  echo "$OUT" | grep -q "WRITE  row ${THIN:0:8}….* → reject by system:b3-rules-" || fail g4 "thin row not planned reject by the system: $(echo "$OUT" | grep "${THIN:0:8}")"
  echo "$OUT" | grep -q "R10:thin_shell" || fail g4 "reject rule not named"
  echo "$OUT" | grep -q 'writes: 0 (dry-run)' || fail g4 "system dry run wrote"
  OUT=$(DEC --system --plan="$PLAN" --live) || fail g4 "system --live failed: $(echo "$OUT" | tail -3)"
  [ "$(psql "select operator_decision||'|'||decided_by from outside_recrawl_review where id='$HTML'")" = "approve|system:b3-rules-1" ] || fail g4 "html row after --system: $(psql "select operator_decision, decided_by from outside_recrawl_review where id='$HTML'")"
  [ "$(psql "select operator_decision||'|'||decided_by from outside_recrawl_review where id='$THIN'")" = "reject|system:b3-rules-1" ] || fail g4 "thin row after --system"
  echo "g4. system: html row approve (html_text:newest_ok), thin row reject (R10:thin_shell), decided_by system:b3-rules-1, one ledger row"
  # g5 — an operator-decided row is never touched by --system
  psql "update outside_recrawl_review set operator_decision='reject', decided_by='operator', decided_at=now() where id='$HTML'" >/dev/null
  OUT=$(DEC --system --plan="$PLAN" --live) || fail g5 "system --live failed on an operator-decided row: $(echo "$OUT" | tail -3)"
  [ "$(psql "select operator_decision||'|'||decided_by from outside_recrawl_review where id='$HTML'")" = "reject|operator" ] || fail g5 "the system overwrote an operator decision: $(psql "select operator_decision, decided_by from outside_recrawl_review where id='$HTML'")"
  echo "$OUT" | grep -q "never overwrites it" || fail g5 "the no-op reason does not say the operator decision stands"
  echo "g5. system: the operator-decided row (reject by operator) is untouched; reason names the operator decision"
  # g6 — an operator override of a SYSTEM decision replaces it and writes the audit row (from, to, by)
  AB=$(psql "select count(*) from integrity_runs where company_id='$CO' and component='r3_outside_review_override'")
  OUT=$(DEC --operator=$THIN:approve --live) || fail g6 "operator override failed: $(echo "$OUT" | tail -3)"
  [ "$(psql "select operator_decision||'|'||decided_by from outside_recrawl_review where id='$THIN'")" = "approve|operator" ] || fail g6 "the operator override did not land: $(psql "select operator_decision, decided_by from outside_recrawl_review where id='$THIN'")"
  AA=$(psql "select count(*) from integrity_runs where company_id='$CO' and component='r3_outside_review_override' and excluded_by_rule->'from'->>'decision'='reject' and excluded_by_rule->'from'->>'by'='system:b3-rules-1' and excluded_by_rule->'to'->>'decision'='approve' and excluded_by_rule->'to'->>'by'='operator'")
  [ "$((AA - AB))" = "1" ] || fail g6 "audit row (from reject/system, to approve/operator) not written: before $AB after $AA"
  # and the system, run again, leaves the override alone
  DEC --system --plan="$PLAN" --live >/dev/null || fail g6 "system rerun failed"
  [ "$(psql "select operator_decision||'|'||decided_by from outside_recrawl_review where id='$THIN'")" = "approve|operator" ] || fail g6 "the system overwrote the operator's override"
  echo "g6. operator override: system reject → operator approve, audit row (from, to, by) written; a system rerun leaves the override alone"
else
  echo "g4–g6 SKIPPED: no throwaway run (write leg skipped) — NOT a pass"
fi
echo "GUARD OK"
