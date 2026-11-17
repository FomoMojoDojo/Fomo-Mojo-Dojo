#!/usr/bin/env bash
# ── POWERPOINT (.pptx) IS READ (S6, 2026-11-16) ─────────────────────────────────────────────────────
#
# Before S6 a .pptx upload closed "MojoMap™ cannot read this kind of file yet." The parser now reads the
# deck slide by slide in the deck's own order, with speaker notes, and hidden slides read and marked
# (operator ruling). This guard proves:
#   (p1) the SERVED parser is this build
#   (p2) the fixture deck (4 slides, notes on 3, slide 3 hidden) reads exactly as its known text:
#        [Slide n of m] markers, [Slide 3 of 4, hidden], [Slide n of m, notes]; pages 4 of 4, page_unit slide
#   (p3) a deck whose third slide will not parse stops there: pages_read 2 of 4 — so "Only the first 2 of 4
#        slides were read." is literally true
#   (p4) a .pptx that is an encrypted Office container closes unreadable_password; a broken zip unreadable_corrupt
#   (p5) the windower cuts before every slide marker and tiles a deck with nothing dropped (deno test)
#   (p6) dify-analyze-file carries page_unit onto the proposal at birth and on every re-read
# Plant: drop the .pptx branch → (p2) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
FX=scripts/guards/fixtures/pptx
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
extract() { node -e 'const fs=require("fs");const [f]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:require("path").basename(f),file_type:"",content_base64:fs.readFileSync(f).toString("base64")}))' "$1" > "$TMP/req.json"
            curl -s -m 60 -X POST "$PARSER" -H 'content-type: application/json' --data-binary "@$TMP/req.json" > "$TMP/out.json"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?"null":String(v))' "$TMP/out.json" "$1"; }

WANT=$(grep -oE 'server: "local-parser-server-[^"]+"' scripts/local-parser-server.mjs | cut -d'"' -f2)
extract "$FX/hlya-board-briefing.pptx"
[ "$(field versions.server)" = "$WANT" ] && ok "(p1) served $WANT" || bad "(p1) served '$(field versions.server)', the file says '$WANT' — restart the parser"
field text > "$TMP/got.txt"
{ [ "$(field source)" = local_parser_pptx ] && cmp -s "$FX/hlya-board-briefing-known.txt" "$TMP/got.txt"; } \
  && ok "(p2) the deck reads exactly as its known text" || bad "(p2) source=$(field source) code=$(field unreadable.code): $(diff "$FX/hlya-board-briefing-known.txt" "$TMP/got.txt" 2>/dev/null | head -3 | tr '\n' ' ')"
grep -q '^\[Slide 3 of 4, hidden\] ' "$TMP/got.txt" && grep -q '^\[Slide 3 of 4, notes\] ' "$TMP/got.txt" \
  && ok "(p2) the hidden slide is read and marked, with its notes" || bad "(p2) no hidden-slide or notes marker"
{ [ "$(field pages_read)" = 4 ] && [ "$(field pages_total)" = 4 ] && [ "$(field page_unit)" = slide ]; } \
  && ok "(p2) 4 of 4 slides, page_unit slide" || bad "(p2) pages $(field pages_read)/$(field pages_total) unit $(field page_unit)"

python3 -I -c "
import zipfile,sys
with zipfile.ZipFile(sys.argv[1]) as a, zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as b:
  for i in a.infolist(): b.writestr(i, b'<<< not xml' if i.filename=='ppt/slides/slide3.xml' else a.read(i.filename))" "$FX/hlya-board-briefing.pptx" "$TMP/broken-slide3.pptx"
extract "$TMP/broken-slide3.pptx"
{ [ "$(field pages_read)" = 2 ] && [ "$(field pages_total)" = 4 ]; } \
  && ok "(p3) a broken third slide stops the read: 2 of 4" || bad "(p3) pages $(field pages_read)/$(field pages_total)"

{ printf '\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'; head -c 1500 /dev/zero; } > "$TMP/encrypted.pptx"; extract "$TMP/encrypted.pptx"
[ "$(field unreadable.code)" = unreadable_password ] && ok "(p4) an encrypted deck → unreadable_password" || bad "(p4) code=$(field unreadable.code)"
printf 'PK\x03\x04 broken' > "$TMP/broken.pptx"; extract "$TMP/broken.pptx"
[ "$(field unreadable.code)" = unreadable_corrupt ] && ok "(p4) a broken zip → unreadable_corrupt" || bad "(p4) code=$(field unreadable.code)"

if deno test --allow-read supabase/functions/_shared/documentWindows.test.ts > "$TMP/deno.log" 2>&1; then ok "(p5) windower tests pass, slide markers included"
else bad "(p5) windower tests failed: $(grep -E 'FAILED|error' "$TMP/deno.log" | head -2 | tr '\n' ' ')"; fi

N=$(grep -c "page_unit: *extraction.pageUnit" supabase/functions/dify-analyze-file/index.ts)
[ "$N" = 2 ] && ok "(p6) page_unit written at birth and on re-read (2 sites)" || bad "(p6) page_unit written at $N site(s), expected 2"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
