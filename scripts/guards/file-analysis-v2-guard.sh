#!/usr/bin/env bash
# GUARD — file analysis methodology v2 (operator rulings 2026-09-14; commit "dify: frameworks read the file;
# absence cannot attest"). Runs REAL Dify analyses on a THROWAWAY company it creates and deletes — never a
# client company, never a client document. Two throwaway documents:
#   THIN  — an image-borne docx (two sentences + 3 embedded PNGs; scripts/guards/throwaway-docx.py)
#   FULL  — a substantive markdown with a MARKER sentence no summary would carry verbatim
# Proves:
#   a. THIN: no live signal of the proposal carries an untraceable excerpt — every non-empty evidence_excerpt is
#      a normalizeForHash-substring of the sidecar (raw_payload.excerpt_guard.traced=true); absence cannot attest
#   b. FULL: the five framework nodes CONSUMED THE FILE — their rendered prompts (Dify's stored node executions)
#      contain the marker sentence; none of them contains Grounding's missing_information list
#   c. the guard blanks an untraceable excerpt and keeps the interpretation (claim_text + raw_payload.excerpt_guard
#      .blanked_excerpt) when one occurs, and passes traceable ones verbatim — at least one traced on FULL
#   d. extraction shape: THIN → chars=<text length>, images=3, pages=null, source=local_parser_mammoth;
#      a throwaway PDF → pages=N, source=local_parser_pdfjs (via the parser; persisted on the proposal)
#   e. PRIORS UNTOUCHED: Edgewood's proposals/signals are byte-identical before and after (analysis_version 1)
#   v. the stamp: both proposals analysis_version=2, analysis_workflow_id = the LIVE published workflow; every
#      minted signal raw_payload.analysis_version=2
# Needs: local stack, Dify (docker-api-1 / docker-db_postgres-1), Ollama. ~5–10 min (two qwen runs).
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aaae"; IN="00000000-0000-4000-8000-00000000ae01"
F_THIN="00000000-0000-4000-8000-00000000ae10"; F_FULL="00000000-0000-4000-8000-00000000ae20"
PREFIX="zz-throwaway/v2"; TMP=$(mktemp -d)  # recreated after the initial cleanup below
EDGEWOOD="3dd2cfbb-0792-4bf1-9cd4-15db9646874b"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
dify() { docker exec -i docker-db_postgres-1 psql -U postgres -d dify -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() {
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "{\"prefixes\":[\"$PREFIX/thin.docx\",\"$PREFIX/thin.docx.extracted.txt\",\"$PREFIX/full.md\",\"$PREFIX/full.md.extracted.txt\",\"$PREFIX/shape.pdf\",\"$PREFIX/shape.pdf.extracted.txt\"]}" >/dev/null || true
  psql "select set_claim_status(id, 'active', 'guard cleanup', 'guard') from claims where company_id='$CO' and status='struck'" >/dev/null 2>&1 || true
  psql "begin; set local app.remint_ledger_purge='on'; delete from provenance_remints where company_id='$CO'; delete from long_runner_runs where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO'; commit;" >/dev/null || true
  rm -rf "$TMP"
}
call() { curl -s --max-time 600 -o "$TMP/body" -w '%{http_code}' -X POST "$API/functions/v1/$1" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$2"; }
upload() { curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/$1" -H "Authorization: Bearer $SR" -H "Content-Type: $2" -H "x-upsert: true" --data-binary "@$3"; }
snapshot_edgewood() { psql "select md5((select string_agg(row_to_json(p)::text, ',' order by id) from file_proposals p where company_id='$EDGEWOOD') || (select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$EDGEWOOD'))"; }
wait_ready() { local pid=$1; for i in $(seq 1 180); do st=$(psql "select processing_state from file_proposals where id='$pid'"); [ "$st" = ready ] && return 0; [ "$st" = failed ] && { echo "proposal $pid failed: $(psql "select processing_error from file_proposals where id='$pid'")"; return 1; }; sleep 5; done; echo "timeout waiting for $pid"; return 1; }

cleanup; TMP=$(mktemp -d)
BEFORE=$(snapshot_edgewood)
LIVE_WF=$(dify "select workflow_id from apps where id='2b694256-d03d-4e2f-a0ae-8a0e666f3c38'")
THIN_TEXT="We are the heart of guard-town youth services. We strive to be a beacon for every family we serve."
MARKER="The intake desk logs every referral in the amber ledger before the nurse named Orrin Vasque returns the call within four minutes."
python3 scripts/guards/throwaway-docx.py "$TMP/thin.docx" "$THIN_TEXT" 3 >/dev/null
cat > "$TMP/full.md" <<MD
# Guard-town Youth Services — operating notes

## Who we serve
Families in guard-town bring their children to us when school counsellors run out of options. Parents tell us the hardest part is the wait: three weeks for a first appointment, and nobody calling back in between.

## How intake works today
$MARKER
After the call, the family receives a written plan within two days. Clinicians review every plan at the Thursday huddle.

## What families ask for
Parents ask for one person to call. They ask to know where their child is on the list. They ask for evening appointments because they cannot leave work.

## What we are trying
We run a pilot with two evening clinics per week and measure whether the three-week wait shortens.
MD
node scripts/guards/throwaway-pdf.mjs "$TMP/shape.pdf" 0 4 >/dev/null
upload thin.docx application/vnd.openxmlformats-officedocument.wordprocessingml.document "$TMP/thin.docx"
upload full.md text/markdown "$TMP/full.md"
upload shape.pdf application/pdf "$TMP/shape.pdf"
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway v2 guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into inputs (id, company_id, user_id, input_key, input_label) values ('$IN', '$CO', (select id from auth.users order by created_at limit 1), 'zz_v2', 'ZZ v2')" >/dev/null
psql "insert into input_files (id, input_id, file_name, file_type, file_path, tags) values ('$F_THIN','$IN','thin.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','$PREFIX/thin.docx','{}'), ('$F_FULL','$IN','full.md','text/markdown','$PREFIX/full.md','{}')" >/dev/null
# sidecars (analyze-file writes these at upload; the guard writes them directly — the guard basis, ruling 5)
printf '%s' "$THIN_TEXT" > "$TMP/thin.txt"; upload thin.docx.extracted.txt text/plain "$TMP/thin.txt"; upload full.md.extracted.txt text/plain "$TMP/full.md"
# verdict rows so the classifier is never called: both client / this_company
SHA_THIN=$(python3 -c "import hashlib,sys,re; t=open(sys.argv[1]).read(); print(hashlib.sha256(re.sub(r'\s+',' ',t.lower()).strip().encode()).hexdigest())" "$TMP/thin.txt")
SHA_FULL=$(python3 -c "import hashlib,sys,re; t=open(sys.argv[1]).read(); print(hashlib.sha256(re.sub(r'\s+',' ',t.lower()).strip().encode()).hexdigest())" "$TMP/full.md")
psql "insert into doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, basis, classifier_model, authorship, subject, classifier_version) values ('$F_THIN','$CO','$SHA_THIN','client_voice','guard','guard','client','this_company',2), ('$F_FULL','$CO','$SHA_FULL','client_voice','guard','guard','client','this_company',2)" >/dev/null

# ── start both analyses (background Dify runs; the completion sweep / monitor finishes them) ──
code=$(call dify-analyze-file "{\"fileId\":\"$F_THIN\",\"filePath\":\"$PREFIX/thin.docx\",\"fileName\":\"thin.docx\",\"fileType\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\",\"companyId\":\"$CO\",\"sourceType\":\"uploaded_file\"}")
[ "$code" = 200 ] || [ "$code" = 202 ] || fail start "thin: $code $(head -c 300 "$TMP/body")"
P_THIN=$(psql "select id from file_proposals where company_id='$CO' and file_id='$F_THIN' order by created_at desc limit 1")
code=$(call dify-analyze-file "{\"fileId\":\"$F_FULL\",\"filePath\":\"$PREFIX/full.md\",\"fileName\":\"full.md\",\"fileType\":\"text/markdown\",\"companyId\":\"$CO\",\"sourceType\":\"uploaded_file\"}")
[ "$code" = 200 ] || [ "$code" = 202 ] || fail start "full: $code $(head -c 300 "$TMP/body")"
P_FULL=$(psql "select id from file_proposals where company_id='$CO' and file_id='$F_FULL' order by created_at desc limit 1")
# d. extraction shape is stamped at insert, before Dify answers
[ "$(psql "select extraction_chars||'|'||extraction_images||'|'||coalesce(extraction_pages::text,'null')||'|'||extraction_source||'|'||analysis_version from file_proposals where id='$P_THIN'")" = "${#THIN_TEXT}|3|null|local_parser_mammoth|2" ] || fail d "thin shape: $(psql "select extraction_chars, extraction_images, extraction_pages, extraction_source, analysis_version from file_proposals where id='$P_THIN'")"
[ "$(psql "select extraction_images||'|'||coalesce(extraction_pages::text,'null')||'|'||extraction_source||'|'||analysis_version from file_proposals where id='$P_FULL'")" = "0|null|local_text_reader|2" ] || fail d "full shape: $(psql "select extraction_chars, extraction_images, extraction_pages, extraction_source from file_proposals where id='$P_FULL'")"
# a PDF through the parser itself (pages + source) — no Dify run needed for the shape
PDF_SHAPE=$(python3 - "$TMP/shape.pdf" <<'PY'
import sys,json,base64,urllib.request
b=open(sys.argv[1],'rb').read()
body=json.dumps({"file_name":"shape.pdf","file_type":"application/pdf","content_base64":base64.b64encode(b).decode()}).encode()
d=json.load(urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8789/extract",data=body,headers={"Content-Type":"application/json"}),timeout=120))
print(f"{d['source']}|{d['pages']}|{d['images']}|{d['chars']>0}")
PY
)
[ "$PDF_SHAPE" = "local_parser_pdfjs|4|0|True" ] || fail d "pdf shape via parser: $PDF_SHAPE"
echo "d. extraction shape: thin docx = ${#THIN_TEXT} chars · 3 images not read · mammoth; full.md = text reader; shape.pdf = pdfjs · 4 pages · 0 images"

echo "   waiting for the two Dify runs (qwen2.5:14b, local)…"
wait_ready "$P_THIN" || fail run "thin"
wait_ready "$P_FULL" || fail run "full"

# v. the stamp
for pid in $P_THIN $P_FULL; do
  [ "$(psql "select analysis_version||'|'||coalesce(analysis_workflow_id,'∅') from file_proposals where id='$pid'")" = "2|$LIVE_WF" ] || fail v "proposal $pid stamp: $(psql "select analysis_version, analysis_workflow_id from file_proposals where id='$pid'") (live $LIVE_WF)"
  n=$(psql "select count(*) from signals where source_id='$pid'"); m=$(psql "select count(*) from signals where source_id='$pid' and raw_payload->>'analysis_version'='2'")
  [ "$n" -gt 0 ] && [ "$n" = "$m" ] || fail v "proposal $pid: $m of $n signals carry analysis_version 2"
done
echo "v. stamp: both proposals analysis_version=2, analysis_workflow_id=$LIVE_WF; every minted signal raw_payload.analysis_version=2"

# a. THIN: absence cannot attest — every non-empty excerpt traces to the sidecar
python3 - "$(psql "select json_agg(json_build_object('excerpt', evidence_excerpt, 'claim', claim_text, 'rp', raw_payload, 'level', structure_level)) from signals where source_id='$P_THIN'")" "$THIN_TEXT" <<'PY' || fail a "thin: untraceable excerpt survived (see above)"
import json,sys,re
rows=json.loads(sys.argv[1]) or []; doc=re.sub(r'\s+',' ',sys.argv[2].lower()).strip()
bad=[r for r in rows if r['excerpt'] and re.sub(r'\s+',' ',r['excerpt'].lower()).strip() not in doc]
absent=[r for r in rows if r['excerpt'] and re.match(r'(?i)^(missing_information|not stated|no mention)', r['excerpt'])]
blanked=[r for r in rows if not r['excerpt'] and (r['rp'] or {}).get('excerpt_guard',{}).get('traced') is False]
kept=[r for r in blanked if r['claim']]
print(f"a. thin docx: {len(rows)} signals; untraceable excerpts live: {len(bad)}; absence-as-evidence live: {len(absent)}; blanked by the guard: {len(blanked)} (interpretation kept on {len(kept)})")
if bad or absent: print(json.dumps(bad[:3]+absent[:3],indent=1)); sys.exit(1)
PY

# b. FULL: the frameworks consumed the file (Dify's stored node executions)
RUN=$(psql "select dify_workflow_run_id from file_proposals where id='$P_FULL'")
python3 - "$(dify "select json_agg(json_build_object('title', title, 'prompts', process_data::jsonb->'prompts', 'out', outputs::jsonb->>'text')) from workflow_node_executions where workflow_run_id='$RUN' and node_type='llm'")" "$MARKER" <<'PY' || fail b "frameworks did not consume the file (see above)"
import json,sys
nodes=json.loads(sys.argv[1]) or []; marker=sys.argv[2].lower()
by={n['title']:n for n in nodes}
g=by['Grounding']; gout=(g['out'] or '')
try: missing=json.loads(gout).get('missing_information',[])
except Exception: missing=[]
ok=True
for t in ['April Dunford','JTBD','ODI','Strategy Cascade','Teresa Torres']:
    user=next(m['text'] for m in by[t]['prompts'] if m['role']=='user')
    has_marker = marker in user.lower()
    has_missing = any(str(x).lower() in user.lower() for x in missing if x) and bool(missing)
    print(f"   {t:16} file_text in prompt: {has_marker}  missing_information in prompt: {has_missing}  finding quotes marker: {marker[:40] in (by[t]['out'] or '').lower()}")
    ok = ok and has_marker and not has_missing
print(f"b. Grounding missing_information: {missing} | marker in Grounding output: {marker[:40] in gout.lower()}")
sys.exit(0 if ok else 1)
PY

# c. the guard on FULL: at least one traced excerpt; any blanked one keeps its interpretation
python3 - "$(psql "select json_agg(json_build_object('excerpt', evidence_excerpt, 'claim', claim_text, 'rp', raw_payload)) from signals where source_id='$P_FULL'")" <<'PY' || fail c "guard evidence on full.md (see above)"
import json,sys
rows=json.loads(sys.argv[1]) or []
traced=[r for r in rows if (r['rp'] or {}).get('excerpt_guard',{}).get('traced') is True and r['excerpt']]
blanked=[r for r in rows if (r['rp'] or {}).get('excerpt_guard',{}).get('traced') is False]
nogate=[r for r in rows if 'excerpt_guard' not in (r['rp'] or {}) and r['excerpt']]
print(f"c. full.md: {len(rows)} signals; traced verbatim: {len(traced)}; blanked (interpretation kept: {sum(1 for r in blanked if r['claim'] and r['rp']['excerpt_guard'].get('blanked_excerpt'))}/{len(blanked)}); ungated with excerpt: {len(nogate)}")
assert traced, "no traced excerpt on a substantive document"
assert not nogate, "a signal with an excerpt was not gated"
assert all(r['claim'] and r['rp']['excerpt_guard'].get('blanked_excerpt') for r in blanked), "a blanked signal lost its interpretation"
PY

# e. priors untouched
[ "$(snapshot_edgewood)" = "$BEFORE" ] || fail e "Edgewood proposals/signals changed"
[ "$(psql "select count(*) from file_proposals where company_id='$EDGEWOOD' and analysis_version<>1")" = 0 ] || fail e "an Edgewood proposal is not analysis_version 1"
echo "e. priors untouched: Edgewood proposals + signals byte-identical; all analysis_version 1"
cleanup
echo "GUARD OK"
