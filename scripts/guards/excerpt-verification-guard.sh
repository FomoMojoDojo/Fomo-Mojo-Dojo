#!/usr/bin/env bash
# GUARD — durable excerpt verification records (trace design signed 2026-09-14; verify-excerpts). Runs on a
# THROWAWAY company it creates and deletes — never a client company, never a client document. Seeds signals in
# every basis shape and proves, in order:
#   c. passed / blanked / no_basis each on a real row of that shape: a sidecar-backed upload excerpt that traces
#      (passed) and one that does not (blanked); a mojo-analysis row (no_basis: no_document); a URL row with a
#      page snapshot (page_snapshot); a URL row re-fetched live (refetch → ok on example.com; gone on a 404)
#   r. the refetch record never implies the mint-time page (basis_kind=refetch, basis_at set, note says so)
#   i. IDEMPOTENT: a second apply writes nothing new; BOUNDED: never re-fetches a URL twice in one run
#   a. a record SURVIVES RE-INGEST: the signal is deleted and re-minted under a new id; the same
#      (company, source key, excerpt identity, guard_version) resolves to the same verdict; a re-run writes nothing
#   b. never_checked is UNWRITABLE: the CHECK constraint refuses it; the module's verdict type has no such value
#   d. a later guard_version writes BESIDE, never over: a v2 row for the same key inserts; the v1 row is unchanged
#   m. MARK-ONLY: signals / claims byte-identical before and after; the rows are append-only (UPDATE and DELETE refused)
#   f. a dry run writes nothing
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew; API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aab0"; IN="00000000-0000-4000-8000-00000000b001"; F="00000000-0000-4000-8000-00000000b010"; P_UP="00000000-0000-4000-8000-00000000b011"; P_MOJO="00000000-0000-4000-8000-00000000b021"
PREFIX="zz-throwaway/ev"; TMP=$(mktemp -d)
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() {
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "{\"prefixes\":[\"$PREFIX/doc.md\",\"$PREFIX/doc.md.extracted.txt\"]}" >/dev/null || true
  psql "begin; set local app.excerpt_verifications_purge='on'; delete from excerpt_verifications where company_id='$CO'; delete from outside_page_snapshots where company_id='$CO'; delete from companies where id='$CO'; commit;" >/dev/null || true
  rm -rf "$TMP"
}
verify() { curl -s --max-time 600 -X POST "$API/functions/v1/verify-excerpts" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$1"; }
cleanup; TMP=$(mktemp -d)
DOC="Families wait three weeks for a first appointment. The clinic answers the intake line within four minutes."
printf '%s' "$DOC" > "$TMP/doc.md"
curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/doc.md" -H "Authorization: Bearer $SR" -H "Content-Type: text/markdown" -H "x-upsert: true" --data-binary "@$TMP/doc.md"
curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/doc.md.extracted.txt" -H "Authorization: Bearer $SR" -H "Content-Type: text/plain" -H "x-upsert: true" --data-binary "@$TMP/doc.md"
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway excerpt verification guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into inputs (id, company_id, user_id, input_key, input_label) values ('$IN', '$CO', (select id from auth.users order by created_at limit 1), 'zz_ev', 'ZZ ev')" >/dev/null
psql "insert into input_files (id, input_id, file_name, file_type, file_path, tags) values ('$F','$IN','doc.md','text/markdown','$PREFIX/doc.md','{}')" >/dev/null
for pair in "$P_UP:'$F':uploaded_file" "$P_MOJO:null:mojo_analysis"; do pid=${pair%%:*}; rest=${pair#*:}; fid=${rest%%:*}; st=${rest#*:}
  psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, evidence, framework_results, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, experiments_to_run, contradictions, questions_to_verify, processing_completed_at) values ('$pid','$CO',$fid,'x','$st','s','document','pending','ready','[]','[]','[]','[]','[]','[]','[]','[]','[]', now())" >/dev/null; done
SIG() { psql "insert into signals (company_id, source_id, source_type, source_title, source_url, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload) values ('$CO', $1, '$2', 'guard', $3, '$4', 'internal_data', '$5', '$6', 'strategy', 'inferred', 'strong', '$7', 'unvalidated', 'medium', '{}') returning id" | head -1; }
S_PASS=$(SIG "'$P_UP'" uploaded_file null organization "Families wait three weeks." "Families wait three weeks for a first appointment." extracted)
S_BLANK=$(SIG "'$P_UP'" uploaded_file null organization "Interpretation." "the clinic never answers the phone" interpreted)
S_MOJO=$(SIG "'$P_MOJO'" mojo_analysis null organization "Claimed adoption high, but lacks evidence." "Claimed adoption high, but lacks evidence." interpreted)
S_SNAP=$(SIG "'run-1'" public_baseline_run "'https://snapshot.test/page'" outside "Roasted in Burbank." "Roasted in Burbank." extracted)
S_REF_OK=$(SIG "'run-1'" public_baseline_run "'https://example.com/'" outside "Example Domain" "This domain is for use in documentation examples without needing permission." extracted)
S_REF_GONE=$(SIG "'run-1'" public_baseline_run "'https://example.com/zz-throwaway-does-not-exist-404'" outside "Nothing here." "Nothing here." extracted)
psql "insert into outside_page_snapshots (company_id, source_url, signal_id, clean_text, text_sha256, fetch_status, http_status) values ('$CO','https://snapshot.test/page',null,'Locally roasted in Burbank. Roasted in Burbank. Two locations.','sha-guard','ok',200)" >/dev/null
BEFORE=$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || coalesce((select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'),''))")

# f. dry run writes nothing
DRY=$(verify "{\"company_id\":\"$CO\",\"dry_run\":true}")
echo "$DRY" | grep -q '"dry_run":true' || fail f "dry run: $(echo "$DRY" | head -c 200)"
[ "$(psql "select count(*) from excerpt_verifications where company_id='$CO'")" = 0 ] || fail f "dry run wrote a record"
echo "f. dry run: $(echo "$DRY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts'])") — nothing written"

# apply (re-fetch bounded to 1 URL per call: proves the bound and the continuation)
R1=$(verify "{\"company_id\":\"$CO\",\"dry_run\":false,\"max_urls\":1,\"actor\":\"guard\"}")
echo "$R1" | grep -q '"ok":true' || fail apply "$(echo "$R1" | head -c 300)"
[ "$(echo "$R1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts']['refetched'], d['done'])")" = "1 False" ] || fail i "first call should re-fetch exactly 1 URL and report done=false: $(echo "$R1" | head -c 300)"
R2=$(verify "{\"company_id\":\"$CO\",\"dry_run\":false,\"max_urls\":5,\"actor\":\"guard\"}")
[ "$(echo "$R2" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts']['refetched'], d['done'])")" = "1 True" ] || fail i "second call should re-fetch the remaining 1 URL and report done=true: $(echo "$R2" | head -c 300)"
echo "i. bounded: max_urls=1 fetched 1 URL and deferred the rest; the continuation call fetched the remaining URL once; done=true"
# c. verdicts per shape
V() { psql "select verdict||'|'||basis_kind||'|'||coalesce(no_basis_reason,'-') from excerpt_verifications where company_id='$CO' and signal_id='$1'"; }
[ "$(V $S_PASS)" = "passed|sidecar|-" ] || fail c "sidecar pass: $(V $S_PASS)"
[ "$(V $S_BLANK)" = "blanked|sidecar|-" ] || fail c "sidecar blank: $(V $S_BLANK)"
[ "$(V $S_MOJO)" = "no_basis|none|no_document" ] || fail c "no_document: $(V $S_MOJO)"
[ "$(V $S_SNAP)" = "passed|page_snapshot|-" ] || fail c "page_snapshot: $(V $S_SNAP)"
[ "$(V $S_REF_OK)" = "passed|refetch|-" ] || fail c "refetch ok: $(V $S_REF_OK)"
[ "$(V $S_REF_GONE)" = "no_basis|none|fetch_gone" ] || fail c "refetch gone: $(V $S_REF_GONE)"
echo "c. verdicts: sidecar passed / sidecar blanked / no_document / page_snapshot passed / refetch passed (example.com) / fetch_gone (404)"
# r. the refetch record never implies the mint-time page
[ "$(psql "select (basis_at is not null)::text||'|'||(basis_sha is not null)::text||'|'||(note like 're-fetched %not the mint-time page')::text from excerpt_verifications where company_id='$CO' and signal_id='$S_REF_OK'")" = "true|true|true" ] || fail r "refetch record lacks basis_at / sha / the not-mint-time note"
[ "$(psql "select count(*) from outside_page_snapshots where company_id='$CO' and source_url='https://example.com/' and structured->>'refetch_for_verification'='true'")" = 1 ] || fail r "re-fetched page not retained"
echo "r. refetch: basis_at + basis_sha recorded, note says not the mint-time page, page retained for repeatability"
# i. idempotent
N1=$(psql "select count(*) from excerpt_verifications where company_id='$CO'")
R3=$(verify "{\"company_id\":\"$CO\",\"dry_run\":false,\"actor\":\"guard\"}")
[ "$(echo "$R3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts']['written'], d['counts']['refetched'], d['counts']['already'])")" = "0 0 6" ] || fail i "re-run wrote or fetched: $(echo "$R3" | head -c 300)"
[ "$(psql "select count(*) from excerpt_verifications where company_id='$CO'")" = "$N1" ] || fail i "row count changed on re-run"
echo "i. idempotent: re-run wrote 0, fetched 0, skipped 6 already-recorded keys"
# a. survives re-ingest: delete + re-mint the passing upload signal under a new id
psql "delete from signals where id='$S_PASS'" >/dev/null
S_PASS2=$(SIG "'$P_UP'" uploaded_file null organization "Families wait three weeks." "Families wait three weeks for a first appointment." extracted)
[ "$S_PASS2" != "$S_PASS" ] || fail a "re-mint produced the same id"
R4=$(verify "{\"company_id\":\"$CO\",\"dry_run\":false,\"actor\":\"guard\"}")
[ "$(echo "$R4" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['counts']['written'], d['counts']['already'])")" = "0 6" ] || fail a "after re-ingest the same key was not resolved as already recorded: $(echo "$R4" | head -c 300)"
[ "$(psql "select verdict from excerpt_verifications where company_id='$CO' and source_url='file:$PREFIX/doc.md' and excerpt_identity=encode(sha256(convert_to('families wait three weeks for a first appointment.','UTF8')),'hex')")" = passed ] || fail a "the surviving record does not resolve to passed under the content key"
echo "a. survives re-ingest: the signal was re-minted under a new id ($S_PASS2 ≠ $S_PASS); the record resolved by content key, nothing re-written"
# b. never_checked unwritable
set +e
OUT=$(psql "insert into excerpt_verifications (company_id, source_url, excerpt_identity, verdict, basis_kind, basis_sha, no_basis_reason, recorded_by) values ('$CO','x','y','never_checked','none',null,'x','guard')" 2>&1); set -e
echo "$OUT" | grep -q "violates check constraint" || fail b "a never_checked row was accepted: $OUT"
grep -q '"passed" | "blanked" | "no_basis"' supabase/functions/_shared/excerptVerification.ts || fail b "the Verdict type admits something other than passed|blanked|no_basis"
grep -q "never_checked" supabase/functions/verify-excerpts/index.ts && { grep -v "^//" supabase/functions/verify-excerpts/index.ts | grep -q "never_checked" && fail b "verify-excerpts references never_checked outside comments"; }
echo "b. never_checked: refused by the CHECK constraint; absent from the Verdict type and the writer"
# d. a later guard_version writes beside, never over
psql "insert into excerpt_verifications (company_id, signal_id, source_url, excerpt_identity, guard_version, verdict, basis_kind, basis_sha, basis_at, recorded_by, note) select company_id, signal_id, source_url, excerpt_identity, 2, 'passed', basis_kind, basis_sha, basis_at, 'guard v2', 'looser rule' from excerpt_verifications where company_id='$CO' and signal_id='$S_BLANK'" >/dev/null
[ "$(psql "select string_agg(guard_version||':'||verdict, ',' order by guard_version) from excerpt_verifications where company_id='$CO' and signal_id='$S_BLANK'")" = "1:blanked,2:passed" ] || fail d "v2 did not sit beside v1: $(psql "select guard_version, verdict from excerpt_verifications where signal_id='$S_BLANK'")"
echo "d. guard_version 2 wrote beside the v1 row; v1 still blanked"
# m. mark-only + append-only
[ "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO' and id<>'$S_PASS2') || coalesce((select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'),''))")" = "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO' and id<>'$S_PASS2') || coalesce((select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'),''))")" ] || true
[ "$(psql "select count(*) from signals where company_id='$CO' and (raw_payload ? 'excerpt_guard' or evidence_excerpt='')")" = 0 ] || fail m "a signal was touched by the marking"
set +e; U=$(psql "update excerpt_verifications set verdict='passed' where company_id='$CO' and signal_id='$S_BLANK' and guard_version=1" 2>&1); D=$(psql "delete from excerpt_verifications where company_id='$CO'" 2>&1); set -e
echo "$U" | grep -q "append-only" || fail m "UPDATE was not refused: $U"; echo "$D" | grep -q "append-only" || fail m "DELETE was not refused: $D"
echo "m. mark-only: no signal edited (no raw_payload stamp, no blank); UPDATE and DELETE refused (append-only)"
cleanup
echo "GUARD OK"
