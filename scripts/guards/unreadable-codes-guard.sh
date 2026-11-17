#!/usr/bin/env bash
# ── UNREADABLE CODES (S0, 2026-11-16) — a file with no sidecar is never labeled voice_not_classified ──
#
# Before S0 every file the parser could not read was closed 'voice_not_classified' with no reason, so a
# password-protected, damaged, empty or not-yet-supported file looked like a voice problem. This guard
# proves the honest path end to end, on a HELD throwaway it owns (born held, never deleted — E2) and on
# throwaway files it generates itself (never a client document):
#   (u1) the SERVED parser answers each unreadable case with its code, and reads a real PDF
#   (u2) analyze-file records that code on the file (input_files.extraction_error_code), returns it, and
#        clears it on a file that reads
#   (u3) public.unread_file_close_code: sidecar ⇒ voice_not_classified; no sidecar + code ⇒ the code;
#        no sidecar, no code ⇒ no_text_extracted — THE HEADLINE: no sidecar is never voice_not_classified
#   (u4) public.close_unread_file writes failed / <code> / processing_error NULL (the reason is rendered
#        from the code, never stored)
#   (u5) the live sweep closes through close_unread_file and carries no literal voice_not_classified
#   (u6) fleet-wide, since S0 was applied: no voice_not_classified proposal on a file without a sidecar
# Cleanup (SP-264): only the file_proposals rows and storage objects this guard created. Prints
# "guard: PASS" or "guard: RED". Plant: drop the sidecar branch from unread_file_close_code → (u3) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
API=http://127.0.0.1:54321
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
S0_APPLIED_AT="2026-11-16 18:09:13+00"
# </dev/null: `docker exec -i` would otherwise swallow the stdin of any `while read` loop around it.
psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 -c "$1" </dev/null; }
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d)
PREFIX="zz-throwaway/s0guard"
CO=50000000-0000-4000-8000-0000000000c0
IN=50000000-0000-4000-8000-0000000000c1
# file ids and names: id|name|content-kind
FILES="50000000-0000-4000-8000-0000000000d1|has-sidecar.pdf|-
50000000-0000-4000-8000-0000000000d2|coded-no-sidecar.xlsx|-
50000000-0000-4000-8000-0000000000d3|nothing-no-sidecar.pdf|-
50000000-0000-4000-8000-0000000000d4|empty-file.pdf|empty
50000000-0000-4000-8000-0000000000d5|encrypted.docx|cfb
50000000-0000-4000-8000-0000000000d6|truncated.pdf|truncated
50000000-0000-4000-8000-0000000000d7|sheet.xls|cfb
50000000-0000-4000-8000-0000000000d8|readable.pdf|pdf"
ids_sql=$(printf '%s\n' "$FILES" | cut -d'|' -f1 | sed "s/.*/'&'/" | paste -sd, -)
cleanup() {
  psqlq "delete from public.file_proposals where file_id in ($ids_sql);" >/dev/null 2>&1 || true
  local names=""; while IFS='|' read -r _ n _; do names="$names\"$PREFIX/$n\",\"$PREFIX/$n.extracted.txt\","; done <<< "$FILES"
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
    --data "{\"prefixes\":[${names%,}]}" >/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT
[ -n "$SR" ] || { echo "guard: RED could not resolve the service-role key"; exit 1; }

# ── fixture: held company, one input, the file rows ──────────────────────────────────────────────
psqlq "insert into public.companies (id, name, created_by, fixture_hold)
         values ('$CO', 'ZZ S0 throwaway unreadable-codes guard', (select id from auth.users order by created_at limit 1), 'S0:test_fixture')
         on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold, 'S0:test_fixture');
       insert into public.inputs (id, user_id, input_key, input_label, group_key, group_label, sub_group, completeness, status, score_impact, impact_tier, company_id)
         select '$IN', created_by, 's0-guard', 'S0 guard', 'foundation', 'S0 guard', 'S0 guard', 0, 'not_started', 1.0, 'low', id from public.companies where id='$CO'
         on conflict (id) do nothing;" >/dev/null
while IFS='|' read -r id n _; do
  psqlq "insert into public.input_files (id, input_id, file_name, file_type, file_path, tags, uploaded_at, extraction_error_code)
           values ('$id', '$IN', '$n', '', '$PREFIX/$n', '{}', now(), null)
           on conflict (id) do update set extraction_error_code = null, archived_at = null,
             file_name = excluded.file_name, file_path = excluded.file_path;  -- the guard's own rows: a renamed fixture (S4) takes effect" >/dev/null
done <<< "$FILES"
psqlq "delete from public.file_proposals where file_id in ($ids_sql);" >/dev/null
[ "$(psqlq "select count(*) from public.companies where id='$CO' and fixture_hold is not null;")" = 1 ] \
  && ok "fixture company is held" || bad "fixture company is not held"

# ── the throwaway files ──────────────────────────────────────────────────────────────────────────
node scripts/guards/throwaway-pdf.mjs "$TMP/readable.pdf" 0 2 >/dev/null
: > "$TMP/empty-file.pdf"
head -c 600 "$TMP/readable.pdf" > "$TMP/truncated.pdf"
{ printf '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'; head -c 1500 /dev/zero; } > "$TMP/encrypted.docx"
# S4 (2026-11-16): .xlsx is read now, so a broken one is unreadable_corrupt. The format case is an old
# binary .xls, which stays unsupported (out of S4's scope).
{ printf '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'; printf ' not a real xls workbook'; } > "$TMP/sheet.xls"
up() { curl -s -o /dev/null -w '%{http_code}' -X POST "$API/storage/v1/object/input-files/$PREFIX/$1" -H "Authorization: Bearer $SR" -H "x-upsert: true" -H "Content-Type: application/octet-stream" --data-binary "@$2"; }
for n in empty-file.pdf encrypted.docx truncated.pdf sheet.xls readable.pdf; do up "$n" "$TMP/$n" >/dev/null; done
printf 'sidecar text for the guard' > "$TMP/side.txt"; up "has-sidecar.pdf.extracted.txt" "$TMP/side.txt" >/dev/null

echo "── (u1) the served parser names each unreadable case ──"
parse() { node -e 'const fs=require("fs");const [f,n]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:n,file_type:"",content_base64:fs.readFileSync(f).toString("base64")}))' "$1" "$2" > "$TMP/req.json"
          curl -s -m 60 -X POST "$PARSER" -H 'content-type: application/json' --data-binary "@$TMP/req.json" \
            | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.unreadable&&j.unreadable.code)||(j.chars>0?"read":"none"))}catch{process.stdout.write("bad-json")}})'; }
for pair in "empty-file.pdf:unreadable_empty" "encrypted.docx:unreadable_password" "truncated.pdf:unreadable_corrupt" "sheet.xls:unreadable_format" "readable.pdf:read"; do
  n=${pair%%:*}; want=${pair#*:}; got=$(parse "$TMP/$n" "$n")
  [ "$got" = "$want" ] && ok "(u1) $n → $got" || bad "(u1) $n → $got, expected $want (is the parser restarted on the S0 build?)"
done

echo "── (u2) analyze-file records the code on the file, and clears it on a read ──"
for pair in "50000000-0000-4000-8000-0000000000d4|empty-file.pdf|unreadable_empty" "50000000-0000-4000-8000-0000000000d5|encrypted.docx|unreadable_password" "50000000-0000-4000-8000-0000000000d6|truncated.pdf|unreadable_corrupt" "50000000-0000-4000-8000-0000000000d7|sheet.xls|unreadable_format" "50000000-0000-4000-8000-0000000000d8|readable.pdf|"; do
  IFS='|' read -r id n want <<< "$pair"
  code=$(curl -s -m 300 -o "$TMP/af.json" -w '%{http_code}' -X POST "$API/functions/v1/analyze-file" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' \
          --data "{\"fileName\":\"$n\",\"filePath\":\"$PREFIX/$n\",\"fileType\":\"\",\"inputAreas\":[]}")
  ret=$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(j.unreadable_code==null?"":String(j.unreadable_code))}catch{process.stdout.write("bad-json")}' "$TMP/af.json")
  row=$(psqlq "select coalesce(extraction_error_code,'') from public.input_files where id='$id';")
  { [ "$code" = 200 ] && [ "$ret" = "$want" ] && [ "$row" = "$want" ]; } \
    && ok "(u2) $n: returned '${ret:-null}', recorded '${row:-null}'" \
    || bad "(u2) $n: http $code returned '$ret' recorded '$row', expected '${want:-null}' — $(head -c 160 "$TMP/af.json")"
done
SIDE_OK=$(psqlq "select count(*) from storage.objects where bucket_id='input-files' and name='$PREFIX/readable.pdf.extracted.txt';")
[ "$SIDE_OK" = 1 ] && ok "(u2) the readable file got its sidecar" || bad "(u2) the readable file has no sidecar"

echo "── (u3) the close decision: no sidecar is never voice_not_classified ──"
psqlq "update public.input_files set extraction_error_code='unreadable_format' where id='50000000-0000-4000-8000-0000000000d2';" >/dev/null
for pair in "50000000-0000-4000-8000-0000000000d1|voice_not_classified|sidecar, no verdict" "50000000-0000-4000-8000-0000000000d2|unreadable_format|no sidecar, recorded code" "50000000-0000-4000-8000-0000000000d3|no_text_extracted|no sidecar, no code"; do
  IFS='|' read -r id want what <<< "$pair"
  got=$(psqlq "select public.unread_file_close_code('$id');")
  [ "$got" = "$want" ] && ok "(u3) $what → $got" || bad "(u3) $what → $got, expected $want"
done

echo "── (u4) close_unread_file writes the code and stores no reason ──"
for id in 50000000-0000-4000-8000-0000000000d2 50000000-0000-4000-8000-0000000000d4 50000000-0000-4000-8000-0000000000d3; do
  psqlq "select public.close_unread_file('$id');" >/dev/null
done
ROWS=$(psqlq "select f.file_name||':'||p.processing_state||':'||p.processing_error_code||':'||coalesce(p.processing_error,'<null>')
                from public.file_proposals p join public.input_files f on f.id=p.file_id
               where p.file_id in ($ids_sql) order by f.file_name;" | paste -sd' ' -)
[ "$ROWS" = "coded-no-sidecar.xlsx:failed:unreadable_format:<null> empty-file.pdf:failed:unreadable_empty:<null> nothing-no-sidecar.pdf:failed:no_text_extracted:<null>" ] \
  && ok "(u4) three closed rows: failed with their code, processing_error NULL" || bad "(u4) closed rows read: $ROWS"

echo "── (u5) the live sweep closes through close_unread_file ──"
DEF=$(psqlq "select pg_get_functiondef('public.sweep_file_proposal_enqueue'::regproc);")
echo "$DEF" | grep -q "perform public.close_unread_file(rec.file_id)" && ok "(u5) the SP-205 loop calls close_unread_file" || bad "(u5) the SP-205 loop does not call close_unread_file"
[ "$(echo "$DEF" | grep -v '^[[:space:]]*--' | grep -c "'voice_not_classified'")" = 0 ] && ok "(u5) the sweep writes no literal voice_not_classified" || bad "(u5) the sweep still writes a literal voice_not_classified"

echo "── (u6) fleet-wide since S0: no voice_not_classified on a file without a sidecar ──"
N6=$(psqlq "select count(*) from public.file_proposals p join public.input_files f on f.id=p.file_id
             where p.processing_error_code='voice_not_classified' and p.created_at > '$S0_APPLIED_AT'
               and p.processing_state='failed'
               and not exists (select 1 from storage.objects o where o.bucket_id='input-files' and o.name=f.file_path||'.extracted.txt');")
[ "$N6" = 0 ] && ok "(u6) 0 such rows" || bad "(u6) $N6 voice_not_classified row(s) on files with no sidecar since S0"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
