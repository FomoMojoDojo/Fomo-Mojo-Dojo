#!/usr/bin/env bash
# ── IMAGES ARE READ BY TEXT RECOGNITION (S3, 2026-11-16) ───────────────────────────────────────────
#
# Before S3 a png, jpg or webp upload closed "MojoMap™ cannot read this kind of file yet." The parser now
# sends it straight to the same Vision helper S2 uses for scanned pages. This guard proves:
#   (i1) the SERVED parser is this build
#   (i2) the letter as JPEG, PNG and WebP each reads line for line as the known letter, in one block
#        marked [Image 1 of 1], source local_ocr_image, ocr_pages 1 (so S-ING-7 renders)
#   (i3) a file that is not an image closes unreadable_corrupt
#   (i4) a parser whose helper is missing closes an image ocr_unavailable (spare parser, port 8794, killed on EXIT)
# Plant: drop the image branch → (i2) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
FX=scripts/guards/fixtures/ocr-images
KNOWN=scripts/guards/fixtures/ocr/pledge-letter-known.txt
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d); PID=""
cleanup() { [ -n "$PID" ] && kill "$PID" 2>/dev/null; sleep 1; lsof -tiTCP:8794 -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT
extract() { node -e 'const fs=require("fs");const [f]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:require("path").basename(f),file_type:"",content_base64:fs.readFileSync(f).toString("base64")}))' "$2" > "$TMP/req.json"
            curl -s -m 120 -X POST "$1" -H 'content-type: application/json' --data-binary "@$TMP/req.json" > "$TMP/out.json"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?"null":String(v))' "$TMP/out.json" "$1"; }

echo "── (i1) the served parser is the S3 build ──"
WANT=$(grep -oE 'server: "local-parser-server-[^"]+"' scripts/local-parser-server.mjs | cut -d'"' -f2)
extract "$PARSER" "$FX/letter.png"
[ "$(field versions.server)" = "$WANT" ] && ok "(i1) served $WANT" || bad "(i1) served '$(field versions.server)', the file says '$WANT' — restart the parser"

echo "── (i2) jpg, png and webp read line for line ──"
for f in letter.jpg letter.png letter.webp; do
  extract "$PARSER" "$FX/$f"
  field text > "$TMP/raw.txt"; sed '1s/^\[Image 1 of 1\] //' "$TMP/raw.txt" | awk 1 > "$TMP/got.txt"   # one final newline, as the known file
  { [ "$(head -c 15 "$TMP/raw.txt")" = "[Image 1 of 1] " ] && [ "$(field source)" = local_ocr_image ] && [ "$(field ocr_pages)" = 1 ] && diff -q "$KNOWN" "$TMP/got.txt" >/dev/null; } \
    && ok "(i2) $f: [Image 1 of 1], equal to the known letter line for line, ocr_pages 1" \
    || bad "(i2) $f: source=$(field source) ocr_pages=$(field ocr_pages) code=$(field unreadable.code) — $(diff "$KNOWN" "$TMP/got.txt" 2>/dev/null | head -3 | tr '\n' ' ')"
done

echo "── (i3) a file that is not an image ──"
printf 'not an image' > "$TMP/broken.png"; extract "$PARSER" "$TMP/broken.png"
[ "$(field unreadable.code)" = unreadable_corrupt ] && ok "(i3) unreadable_corrupt" || bad "(i3) code=$(field unreadable.code)"

echo "── (i4) a parser without the helper ──"
VISION_OCR_BIN=/nonexistent LOCAL_PARSER_PORT=8794 node scripts/local-parser-server.mjs > "$TMP/p.log" 2>&1 & PID=$!
for i in $(seq 1 20); do grep -q listening "$TMP/p.log" && break; sleep 0.5; done
extract http://127.0.0.1:8794/extract "$FX/letter.jpg"
[ "$(field unreadable.code)" = ocr_unavailable ] && ok "(i4) helper missing → ocr_unavailable" || bad "(i4) code=$(field unreadable.code)"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
