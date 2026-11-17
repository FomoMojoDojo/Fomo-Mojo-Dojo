#!/usr/bin/env bash
# ── SCANNED PAGES ARE READ BY TEXT RECOGNITION (S2, 2026-11-16) ─────────────────────────────────────
#
# Before S2 a PDF of scanned pages read as empty and closed "MojoMap™ cannot read this kind of file yet."
# The parser now renders each page that has images and no text layer and reads it with Apple Vision
# (scripts/ocr/vision-ocr.swift, compiled by scripts/ocr/build-vision-ocr.sh). This guard proves:
#   (o1) the SERVED parser is this build, and its versions.ocr names the Vision helper (built and found)
#   (o2) the scanned letter reads LINE FOR LINE as the known letter, marked [Page 1], ocr_pages 1
#   (o3) a blank scan closes unreadable_no_text_after_ocr
#   (o4) a parser whose helper is missing closes the scan ocr_unavailable          (spare parser, port 8796)
#   (o5) the 200-page OCR cap stops the read and says so: pages_read < pages_total (spare parser, cap 1, 8795)
#   (o6) dify-analyze-file carries ocr_pages onto the proposal at birth and on every re-read
# The spare parsers are this repo's parser with one env var changed; both are killed in an EXIT trap and
# the ports re-verified (a guard never leaves a listener running). Fixtures: scripts/guards/fixtures/ocr/.
# Plant: join the recognised lines with spaces instead of line breaks → (o2) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
FX=scripts/guards/fixtures/ocr
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d)
PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null; done
  sleep 1
  for port in 8796 8795; do lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; done
  rm -rf "$TMP"
}
trap cleanup EXIT
# extract <url> <file> → the parser's JSON answer in $TMP/out.json
extract() { node -e 'const fs=require("fs");const [f]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:require("path").basename(f),file_type:"application/pdf",content_base64:fs.readFileSync(f).toString("base64")}))' "$2" > "$TMP/req.json"
            curl -s -m 300 -X POST "$1" -H 'content-type: application/json' --data-binary "@$TMP/req.json" > "$TMP/out.json"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?"null":String(v))' "$TMP/out.json" "$1"; }

echo "── (o1) the served parser is the S2 build, with the Vision helper ──"
WANT=$(grep -oE 'server: "local-parser-server-[^"]+"' scripts/local-parser-server.mjs | cut -d'"' -f2)
extract "$PARSER" "$FX/pledge-letter-scanned.pdf"
SRV=$(field versions.server); OCRV=$(field versions.ocr)
[ "$SRV" = "$WANT" ] && ok "(o1) served $SRV" || bad "(o1) served '$SRV', the file says '$WANT' — restart the parser"
case "$OCRV" in vision-rev*) ok "(o1) versions.ocr = $OCRV" ;; *) bad "(o1) versions.ocr = '$OCRV' — build scripts/ocr/build-vision-ocr.sh and restart" ;; esac

echo "── (o2) the scanned letter reads line for line ──"
[ "$(field ocr_pages)" = 1 ] && [ "$(field source)" = local_parser_pdfjs_ocr ] \
  && ok "(o2) ocr_pages 1, source local_parser_pdfjs_ocr" || bad "(o2) ocr_pages=$(field ocr_pages) source=$(field source)"
field text | sed '1s/^\[Page 1\] //' | awk 1 > "$TMP/got.txt"   # awk 1: end with one newline, as the known file does
if diff -q "$FX/pledge-letter-known.txt" "$TMP/got.txt" >/dev/null; then ok "(o2) $(grep -c . "$FX/pledge-letter-known.txt") lines equal to the known letter, line for line"
else bad "(o2) the text differs from the known letter: $(diff "$FX/pledge-letter-known.txt" "$TMP/got.txt" | head -4 | tr '\n' ' ')"; fi
head -c 9 "$TMP/got.txt" >/dev/null; [ "$(field text | head -c 9)" = "[Page 1] " ] && ok "(o2) the page keeps its [Page 1] marker" || bad "(o2) no [Page 1] marker"

echo "── (o3) a blank scan ──"
extract "$PARSER" "$FX/blank-scan.pdf"
[ "$(field unreadable.code)" = unreadable_no_text_after_ocr ] && ok "(o3) unreadable_no_text_after_ocr" || bad "(o3) code=$(field unreadable.code)"

echo "── (o4)(o5) a parser without the helper, and the page cap ──"
VISION_OCR_BIN=/nonexistent LOCAL_PARSER_PORT=8796 node scripts/local-parser-server.mjs > "$TMP/p8796.log" 2>&1 & PIDS+=($!)
LOCAL_PARSER_OCR_PAGE_CAP=1 LOCAL_PARSER_PORT=8795 node scripts/local-parser-server.mjs > "$TMP/p8795.log" 2>&1 & PIDS+=($!)
for i in $(seq 1 20); do grep -q listening "$TMP/p8796.log" && grep -q listening "$TMP/p8795.log" && break; sleep 0.5; done
extract http://127.0.0.1:8796/extract "$FX/pledge-letter-scanned.pdf"
{ [ "$(field unreadable.code)" = ocr_unavailable ] && [ "$(field versions.ocr)" = unavailable ]; } \
  && ok "(o4) helper missing → ocr_unavailable, versions.ocr unavailable" || bad "(o4) code=$(field unreadable.code) ocr=$(field versions.ocr)"
extract http://127.0.0.1:8795/extract "$FX/two-scanned-pages.pdf"
{ [ "$(field pages_read)" = 1 ] && [ "$(field pages_total)" = 2 ] && [ "$(field ocr_pages)" = 1 ]; } \
  && ok "(o5) cap 1 on two scanned pages → pages_read 1 of 2 (S-ING-1 says so)" || bad "(o5) pages_read=$(field pages_read) pages_total=$(field pages_total) ocr_pages=$(field ocr_pages)"
grep -qE '^const OCR_PAGE_CAP = Number\(process.env.LOCAL_PARSER_OCR_PAGE_CAP \|\| 200\)' scripts/local-parser-server.mjs \
  && ok "(o5) the served cap is 200 pages" || bad "(o5) the cap is not 200"

echo "── (o6) dify-analyze-file stores ocr_pages ──"
N=$(grep -c "ocr_pages: *extraction.ocrPages" supabase/functions/dify-analyze-file/index.ts)
[ "$N" = 2 ] && ok "(o6) written at birth and on re-read (2 sites)" || bad "(o6) ocr_pages written at $N site(s), expected 2"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
