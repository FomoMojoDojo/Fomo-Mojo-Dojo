#!/usr/bin/env bash
# ── OLD WORD (.doc) IS READ (S5, 2026-11-16) ─────────────────────────────────────────────────────────
#
# Before S5 a .doc upload closed "MojoMap™ cannot read this kind of file yet." The parser now reads it with
# macOS's own textutil and separates paragraphs as mammoth does for a .docx. This guard proves:
#   (d1) the SERVED parser is this build
#   (d2) the board memo saved as .doc reads BYTE-IDENTICAL to the same memo's .docx read
#   (d3) a file named .doc that is neither a Word container nor RTF closes unreadable_corrupt (it is never
#        handed to textutil, which would read its bytes as plain text)
#   (d4) an RTF saved as .doc reads
# Plant: drop the .doc branch → (d2) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
FX=scripts/guards/fixtures/doc
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
extract() { node -e 'const fs=require("fs");const [f]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:require("path").basename(f),file_type:"",content_base64:fs.readFileSync(f).toString("base64")}))' "$1" > "$TMP/req.json"
            curl -s -m 60 -X POST "$PARSER" -H 'content-type: application/json' --data-binary "@$TMP/req.json" > "$TMP/out.json"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?"null":String(v))' "$TMP/out.json" "$1"; }

WANT=$(grep -oE 'server: "local-parser-server-[^"]+"' scripts/local-parser-server.mjs | cut -d'"' -f2)
extract "$FX/board-memo.doc"
[ "$(field versions.server)" = "$WANT" ] && ok "(d1) served $WANT" || bad "(d1) served '$(field versions.server)', the file says '$WANT' — restart the parser"
field text > "$TMP/got.txt"
{ [ "$(field source)" = local_textutil_doc ] && cmp -s "$FX/board-memo-known.txt" "$TMP/got.txt"; } \
  && ok "(d2) the .doc reads byte-identical to its .docx ($(wc -c < "$TMP/got.txt" | tr -d ' ') chars)" \
  || bad "(d2) source=$(field source) code=$(field unreadable.code); differs from the .docx read: $(diff "$FX/board-memo-known.txt" "$TMP/got.txt" 2>/dev/null | head -3 | tr '\n' ' ')"
printf 'garbage that is not a Word file' > "$TMP/broken.doc"; extract "$TMP/broken.doc"
[ "$(field unreadable.code)" = unreadable_corrupt ] && ok "(d3) a non-Word .doc → unreadable_corrupt, never opened" || bad "(d3) code=$(field unreadable.code) text=$(field text | head -c 40)"
printf '{\\rtf1\\ansi Board memo line in RTF.\\par}' > "$TMP/rtf.doc"; extract "$TMP/rtf.doc"
[ "$(field text)" = "Board memo line in RTF." ] && ok "(d4) an RTF saved as .doc reads" || bad "(d4) text='$(field text)' code=$(field unreadable.code)"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
