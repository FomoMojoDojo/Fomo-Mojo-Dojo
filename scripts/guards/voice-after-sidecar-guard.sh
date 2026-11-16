#!/usr/bin/env bash
# ── VOICE AFTER SIDECAR (S1, 2026-11-16) — analyze-file judges the voice the moment the sidecar exists ──
#
# The browser gave analyze-file 20 s, then called classify-upload-voice. A read slower than that landed
# its sidecar AFTER the browser had asked, the classifier found no document, and five minutes later the
# file was closed voice_not_classified although it had been read. S1 moves the judgement into
# analyze-file, right after the sidecar upload. This guard proves it with NO browser call at all:
#   (v1) analyze-file reads a throwaway PDF and writes its sidecar
#   (v2) a doc_voice_verdicts row exists for the file afterwards — and this guard never calls
#        classify-upload-voice, so only analyze-file can have written it
#   (v3) the verdict is the local classifier's (qwen2.5:14b-instruct), sha-matched to the sidecar's file
#   (v4) the file passes the enqueue sweep's voice pre-filter (its other clauses evaluated as a SELECT;
#        the held-company clause is left out, as ingest-queue-guard q12 does, because this company is held)
# Held throwaway it owns (born held, never deleted — E2). Cleanup (SP-264): only the verdict rows and
# storage objects it created. Plant: drop the classifyAfterSidecar call (and restart the edge runtime) →
# (v2) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d)
CO=51000000-0000-4000-8000-0000000000c0
IN=51000000-0000-4000-8000-0000000000c1
FID=51000000-0000-4000-8000-0000000000d1
NAME="voice-guard-$(date +%s).pdf"
PATHK="zz-throwaway/s1guard/$NAME"
cleanup() {
  psqlq "delete from public.doc_voice_verdicts where input_file_id='$FID';" >/dev/null 2>&1 || true
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
    --data "{\"prefixes\":[\"$PATHK\",\"$PATHK.extracted.txt\"]}" >/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT
[ -n "$SR" ] || { echo "guard: RED could not resolve the service-role key"; exit 1; }

psqlq "insert into public.companies (id, name, created_by, fixture_hold)
         values ('$CO', 'ZZ S1 throwaway voice-after-sidecar guard', (select id from auth.users order by created_at limit 1), 'S1:test_fixture')
         on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold, 'S1:test_fixture');
       insert into public.inputs (id, user_id, input_key, input_label, group_key, group_label, sub_group, completeness, status, score_impact, impact_tier, company_id)
         select '$IN', created_by, 's1-guard', 'S1 guard', 'foundation', 'S1 guard', 'S1 guard', 0, 'not_started', 1.0, 'low', id from public.companies where id='$CO'
         on conflict (id) do nothing;" >/dev/null
psqlq "delete from public.doc_voice_verdicts where input_file_id='$FID';" >/dev/null
psqlq "insert into public.input_files (id, input_id, file_name, file_type, file_path, tags, uploaded_at)
         values ('$FID', '$IN', '$NAME', 'application/pdf', '$PATHK', '{}', now())
         on conflict (id) do update set file_name = excluded.file_name, file_path = excluded.file_path, uploaded_at = now(),
           archived_at = null, extraction_error_code = null;" >/dev/null
[ "$(psqlq "select count(*) from public.companies where id='$CO' and fixture_hold is not null;")" = 1 ] \
  && ok "fixture company is held" || bad "fixture company is not held"
[ "$(psqlq "select count(*) from public.doc_voice_verdicts where input_file_id='$FID';")" = 0 ] \
  && ok "no verdict before the read — (v2) below is not vacuous" || bad "a verdict exists before the read"

node scripts/guards/throwaway-pdf.mjs "$TMP/doc.pdf" 0 2 >/dev/null
curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PATHK" -H "Authorization: Bearer $SR" -H "x-upsert: true" -H "Content-Type: application/pdf" --data-binary "@$TMP/doc.pdf"

echo "── (v1) analyze-file reads it and writes the sidecar ──"
code=$(curl -s -m 300 -o "$TMP/af.json" -w '%{http_code}' -X POST "$API/functions/v1/analyze-file" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
        --data "{\"fileName\":\"$NAME\",\"filePath\":\"$PATHK\",\"fileType\":\"application/pdf\",\"inputAreas\":[]}")
SIDE=$(psqlq "select count(*) from storage.objects where bucket_id='input-files' and name='$PATHK.extracted.txt';")
{ [ "$code" = 200 ] && [ "$SIDE" = 1 ]; } && ok "(v1) analyze-file 200, sidecar written" || bad "(v1) http $code, sidecar=$SIDE — $(head -c 160 "$TMP/af.json")"

echo "── (v2)(v3) the verdict exists, and only analyze-file can have written it ──"
V=$(psqlq "select count(*) from public.doc_voice_verdicts where input_file_id='$FID';")
[ "$V" -ge 1 ] && ok "(v2) $V verdict row(s) for the file, with no classify-upload-voice call made" \
  || bad "(v2) no verdict for the file — analyze-file did not classify after the sidecar"
M=$(psqlq "select string_agg(distinct classifier_model, ',') from public.doc_voice_verdicts where input_file_id='$FID';")
[ "$M" = "qwen2.5:14b-instruct" ] && ok "(v3) judged by the local classifier ($M)" || bad "(v3) classifier_model='$M'"

echo "── (v4) the file now passes the enqueue sweep's voice pre-filter ──"
E=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id
            where f.id='$FID' and f.archived_at is null and coalesce(f.is_interview,false)=false
              and exists (select 1 from storage.objects o where o.bucket_id='input-files' and o.name=f.file_path||'.extracted.txt')
              and exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id)
              and not exists (select 1 from public.file_proposals p where p.file_id=f.id);")
[ "$E" = 1 ] && ok "(v4) stored, extracted and classified — the enqueue would queue it" || bad "(v4) the file does not pass the enqueue pre-filter ($E)"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
