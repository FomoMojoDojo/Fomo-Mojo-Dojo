#!/usr/bin/env bash
# GUARD — large-file extraction (flat base64 + size guard, 2026-09-12).
#
# Runs against the LOCAL stack with THROWAWAY files it generates itself (never a client document) under
# input-files/zz-throwaway/largefile/, and removes them at the end. Proves, in order:
#   1. over-cap (26 MiB): BOTH analyze-file and dify-analyze-file answer 413 {error:"file_too_large",size,cap}
#      and the storage log shows NO GET of that object (the size came from metadata, nothing was downloaded);
#      dify-analyze-file wrote no file_proposals row;
#   2. in-cap (24 MiB): analyze-file extracts for real (extraction_source local_parser_pdfjs), writes the
#      .extracted.txt sidecar, and the worker logs its memory after extraction — no OOM;
#   3. --with-dify: dify-analyze-file extracts the same 24 MiB file for real on a throwaway company it
#      creates and deletes (cascade) — "extracted file_text length:" logged; the Dify run is left to finish.
# Exit 0 = every proof held. Any failed proof exits 1 with the failing step named.
set -euo pipefail
cd "$(dirname "$0")/../.."
WITH_DIFY=0; [ "${1:-}" = "--with-dify" ] && WITH_DIFY=1
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
API=http://127.0.0.1:54321
DB=supabase_db_dzlgyxcvuwiulgifbmew
EDGE=supabase_edge_runtime_dzlgyxcvuwiulgifbmew
STORAGE=supabase_storage_dzlgyxcvuwiulgifbmew
PREFIX="zz-throwaway/largefile"
TMP=$(mktemp -d)
THROWAWAY_COMPANY="00000000-0000-4000-8000-00000000aaaa"
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
cleanup() {
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
    --data "{\"prefixes\":[\"$PREFIX/guard-24mib.pdf\",\"$PREFIX/guard-24mib.pdf.extracted.txt\",\"$PREFIX/guard-26mib.pdf\",\"$PREFIX/guard-26mib.pdf.extracted.txt\"]}" >/dev/null || true
  if [ "$WITH_DIFY" = 1 ]; then
    psql "delete from long_runner_runs where company_id='$THROWAWAY_COMPANY'; delete from companies where id='$THROWAWAY_COMPANY'; delete from claim_removals where company_id='$THROWAWAY_COMPANY';" >/dev/null || true
  fi
  rm -rf "$TMP"
}
call() { curl -s --max-time 600 -o "$TMP/body" -w '%{http_code}' -X POST "$API/functions/v1/$1" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$2"; }
START_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

node scripts/guards/throwaway-pdf.mjs "$TMP/guard-24mib.pdf" 24 3 >/dev/null
node scripts/guards/throwaway-pdf.mjs "$TMP/guard-26mib.pdf" 26 2 >/dev/null
for f in guard-24mib.pdf guard-26mib.pdf; do
  curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/$f" -H "Authorization: Bearer $SR" -H "Content-Type: application/pdf" -H "x-upsert: true" --data-binary "@$TMP/$f"
done
SIZE26=$(psql "select (metadata->>'size')::bigint from storage.objects where bucket_id='input-files' and name='$PREFIX/guard-26mib.pdf'")
[ "${SIZE26:-0}" -gt 26214400 ] || fail 0 "over-cap object not stored ($SIZE26)"

# 1. over-cap refused by both, no download
code=$(call analyze-file "{\"fileName\":\"guard-26mib.pdf\",\"filePath\":\"$PREFIX/guard-26mib.pdf\",\"fileType\":\"application/pdf\",\"inputAreas\":[]}")
[ "$code" = 413 ] || fail 1a "analyze-file over-cap status $code: $(cat "$TMP/body")"
grep -q "\"error\":\"file_too_large\",\"size\":$SIZE26,\"cap\":26214400" "$TMP/body" || fail 1a "analyze-file body: $(cat "$TMP/body")"
code=$(call dify-analyze-file "{\"fileId\":\"00000000-0000-4000-8000-00000000bbbb\",\"filePath\":\"$PREFIX/guard-26mib.pdf\",\"fileName\":\"guard-26mib.pdf\",\"fileType\":\"application/pdf\",\"companyId\":\"3dd2cfbb-0792-4bf1-9cd4-15db9646874b\",\"sourceType\":\"uploaded_file\"}")
[ "$code" = 413 ] || fail 1b "dify-analyze-file over-cap status $code: $(cat "$TMP/body")"
grep -q "\"error\":\"file_too_large\",\"size\":$SIZE26,\"cap\":26214400" "$TMP/body" || fail 1b "dify-analyze-file body: $(cat "$TMP/body")"
n=$(psql "select count(*) from file_proposals where file_id='00000000-0000-4000-8000-00000000bbbb'")
[ "$n" = 0 ] || fail 1b "dify-analyze-file wrote $n file_proposals row(s) for the refused file"
sleep 1
gets=$(docker logs --since "$START_TS" "$STORAGE" 2>&1 | grep -c "\"method\":\"GET\",\"url\":\"/object/input-files/$PREFIX/guard-26mib.pdf\"" || true)
[ "$gets" = 0 ] || fail 1c "storage log shows $gets GET(s) of the over-cap object — it was downloaded"
echo "1. over-cap: both refused 413 file_too_large size=$SIZE26 cap=26214400; storage GETs of the object: 0; proposals written: 0"

# 2. in-cap extraction through analyze-file
code=$(call analyze-file "{\"fileName\":\"guard-24mib.pdf\",\"filePath\":\"$PREFIX/guard-24mib.pdf\",\"fileType\":\"application/pdf\",\"inputAreas\":[]}")
[ "$code" = 200 ] || fail 2 "analyze-file 24 MiB status $code: $(head -c 300 "$TMP/body")"
grep -q '"extraction_source":"local_parser_pdfjs"' "$TMP/body" || fail 2 "analyze-file did not extract: $(head -c 300 "$TMP/body")"
side=$(psql "select (metadata->>'size')::bigint from storage.objects where bucket_id='input-files' and name='$PREFIX/guard-24mib.pdf.extracted.txt'")
[ "${side:-0}" -gt 1000 ] || fail 2 "sidecar missing or empty ($side)"
mem=$(docker logs --since "$START_TS" "$EDGE" 2>&1 | grep "\[analyze-file\] memory after extraction" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
[ -n "$mem" ] || fail 2 "no memory line logged by analyze-file"
echo "2. in-cap 24 MiB: analyze-file extracted; sidecar $side bytes; $mem"

# 3. optional: the real dify-analyze-file extraction on a throwaway company
if [ "$WITH_DIFY" = 1 ]; then
  psql "insert into companies (id, name, created_by) values ('$THROWAWAY_COMPANY', 'ZZ throwaway largefile guard', (select id from auth.users order by created_at limit 1)) on conflict (id) do nothing" >/dev/null
  code=$(call dify-analyze-file "{\"fileId\":\"00000000-0000-4000-8000-00000000bbbb\",\"filePath\":\"$PREFIX/guard-24mib.pdf\",\"fileName\":\"guard-24mib.pdf\",\"fileType\":\"application/pdf\",\"companyId\":\"$THROWAWAY_COMPANY\",\"sourceType\":\"uploaded_file\"}")
  [ "$code" = 200 ] || fail 3 "dify-analyze-file 24 MiB status $code: $(head -c 300 "$TMP/body")"
  sleep 1
  line=$(docker logs --since "$START_TS" "$EDGE" 2>&1 | grep "\[dify-analyze-file\] extracted file_text length" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
  [ -n "$line" ] || fail 3 "no 'extracted file_text length:' line"
  mem=$(docker logs --since "$START_TS" "$EDGE" 2>&1 | grep "\[dify-analyze-file\] memory after extraction" | tail -1 | sed 's/\x1b\[[0-9;]*m//g')
  echo "3. dify-analyze-file 24 MiB: $line; $mem"
  # let the background Dify run settle before the cascade delete removes its rows
  for i in $(seq 1 60); do st=$(psql "select processing_state from file_proposals where company_id='$THROWAWAY_COMPANY' limit 1"); [ "$st" = ready ] || [ "$st" = failed ] && break; sleep 5; done
  echo "   throwaway proposal processing_state=$st (then deleted with the throwaway company)"
fi
cleanup
echo "GUARD OK"
