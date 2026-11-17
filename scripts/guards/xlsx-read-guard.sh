#!/usr/bin/env bash
# ── EXCEL (.xlsx) IS READ, AND PERSONAL COLUMNS NEVER REACH THE SIDECAR (S4, 2026-11-16) ────────────────
#
# Before S4 a .xlsx closed "MojoMap™ cannot read this kind of file yet." The parser now reads every sheet as
# "Header: value" rows — cached formula values, dates as ISO, hidden sheets read and labelled — and WITHHOLDS
# personal columns (scripts/parser/xlsxWithhold.mjs, operator-signed) before anything is written:
#   (x1) the SERVED parser is this build
#   (x2) the roster fixture reads exactly as its known text: 5 personal columns withheld (name, email, date of
#        birth, SSN by header; "Contacto" by the value net), Volunteer ID / Age / Joined kept, Joined as ISO,
#        a cached formula value, "(formula, no saved value)", the hidden sheet labelled; page_unit sheet, 3 of 3
#   (x3) NOT ONE withheld value appears anywhere in the text — names, emails, birth dates, SSNs, phones
#   (x4) the rehearsal sheet hlya-donor-giving-summary-fy25.xlsx reads, nothing withheld
#   (x5) a 5,005-row sheet stops at 5,000 rows and says which sheet (rows_capped), in 70-row blocks
#   (x6) a 51-sheet workbook reads 50 of 51 sheets
#   (x7) the windower cuts before every [Sheet …] marker (deno test)
#   (x8) dify-analyze-file writes columns_withheld and rows_capped at birth and on re-read
# Plant: drop the withholding (every column kept) → (x2)(x3) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
FX=scripts/guards/fixtures/xlsx
PARSER=${LOCAL_PARSER_CHECK_URL:-http://127.0.0.1:8789/extract}
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
extract() { node -e 'const fs=require("fs");const [f]=process.argv.slice(1);process.stdout.write(JSON.stringify({file_name:require("path").basename(f),file_type:"",content_base64:fs.readFileSync(f).toString("base64")}))' "$1" > "$TMP/req.json"
            curl -s -m 120 -X POST "$PARSER" -H 'content-type: application/json' --data-binary "@$TMP/req.json" > "$TMP/out.json"; }
field() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const v=process.argv[2].split(".").reduce((o,k)=>o==null?o:o[k],j);process.stdout.write(v==null?"null":typeof v==="object"?JSON.stringify(v):String(v))' "$TMP/out.json" "$1"; }

WANT=$(grep -oE 'server: "local-parser-server-[^"]+"' scripts/local-parser-server.mjs | cut -d'"' -f2)
extract "$FX/hlya-volunteer-roster.xlsx"
[ "$(field versions.server)" = "$WANT" ] && ok "(x1) served $WANT" || bad "(x1) served '$(field versions.server)', the file says '$WANT' — restart the parser"

field text > "$TMP/got.txt"
{ [ "$(field source)" = local_parser_xlsx ] && cmp -s "$FX/hlya-volunteer-roster-known.txt" "$TMP/got.txt"; } \
  && ok "(x2) the roster reads exactly as its known text" || bad "(x2) source=$(field source): $(diff "$FX/hlya-volunteer-roster-known.txt" "$TMP/got.txt" 2>/dev/null | head -4 | tr '\n' ' ')"
W=$(field withheld_columns | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);process.stdout.write(a.map(x=>x.header+"="+x.reason).join(","))})')
[ "$W" = "Volunteer name=name,Email=email,Date of birth=date_of_birth,SSN=government_id,Contacto=phone_values" ] \
  && ok "(x2) withheld: $W" || bad "(x2) withheld: $W"
grep -q "^Row 2: Volunteer ID: V-101 | Age: 41 | .* | Joined: 2023-10-01$" "$TMP/got.txt" && ok "(x2) ID, age and the ISO date are kept" || bad "(x2) kept columns or the ISO date are wrong"
grep -q "Value: (formula, no saved value)" "$TMP/got.txt" && grep -q "Total hours: 136" "$TMP/got.txt" && ok "(x2) cached formula values, and a formula with none says so" || bad "(x2) formula handling"
grep -q '^\[Sheet 3 of 3: Lookups (hidden)\]' "$TMP/got.txt" && ok "(x2) the hidden sheet is read and labelled" || bad "(x2) no hidden-sheet label"
{ [ "$(field page_unit)" = sheet ] && [ "$(field pages_read)" = 3 ] && [ "$(field pages_total)" = 3 ]; } && ok "(x2) 3 of 3 sheets, page_unit sheet" || bad "(x2) pages $(field pages_read)/$(field pages_total) unit $(field page_unit)"

LEAK=$(for w in "Marisol" "Quintero" "Okonkwo" "Sørensen" "Nakamura" "mq.volunteer" "@example" "123-45-6789" "234-56-7890" "201-3344" "202 4455" "203.5566" "1985-03-14" "31120"; do grep -q -- "$w" "$TMP/got.txt" && echo "$w"; done)
[ -z "$LEAK" ] && ok "(x3) no withheld value appears in the text" || bad "(x3) withheld values in the text: $(echo $LEAK)"

extract "$FX/hlya-donor-giving-summary-fy25.xlsx"
{ [ "$(field source)" = local_parser_xlsx ] && [ "$(field withheld_columns)" = "[]" ] && grep -q "Donor segment: individual monthly donors" <(field text); } \
  && ok "(x4) the rehearsal donor sheet reads, nothing withheld" || bad "(x4) source=$(field source) withheld=$(field withheld_columns) code=$(field unreadable.code)"

python3 -I - "$TMP" <<'PY'
import sys, zipfile
t = sys.argv[1]
def book(path, sheets):
    NS='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    R="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(path,"w",zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>')
        z.writestr("xl/workbook.xml",f'<?xml version="1.0"?><workbook {NS}><sheets>'+"".join(f'<sheet name="S{i}" sheetId="{i}" r:id="rId{i}"/>' for i in range(1,len(sheets)+1))+'</sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels",'<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+"".join(f'<Relationship Id="rId{i}" Type="{R}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1,len(sheets)+1))+'</Relationships>')
        for i,rows in enumerate(sheets,1):
            z.writestr(f"xl/worksheets/sheet{i}.xml",f'<?xml version="1.0"?><worksheet {NS}><sheetData>'+"".join(f'<row r="{r}">'+"".join(f'<c r="{chr(65+c)}{r}" t="inlineStr"><is><t>{v}</t></is></c>' for c,v in enumerate(row))+'</row>' for r,row in enumerate(rows,1))+'</sheetData></worksheet>')
book(f"{t}/rows.xlsx",[[["Segment","Count"]]+[[f"segment {r}",str(r)] for r in range(1,5006)]])
book(f"{t}/sheets.xlsx",[[["Segment","Count"],["a","1"]] for _ in range(51)])
PY
extract "$TMP/rows.xlsx"
{ [ "$(field rows_capped)" = '[{"sheet":"S1","read":5000,"total":5005}]' ] && grep -q '^\[Sheet 1 of 1: S1, rows 2-71\]$' <(field text) && ! grep -q "segment 5001" <(field text); } \
  && ok "(x5) 5,005 rows → 5,000 read, rows_capped names the sheet, 70-row blocks" || bad "(x5) rows_capped=$(field rows_capped)"
extract "$TMP/sheets.xlsx"
{ [ "$(field pages_read)" = 50 ] && [ "$(field pages_total)" = 51 ] && [ "$(field page_unit)" = sheet ]; } \
  && ok "(x6) 51 sheets → 50 of 51 read" || bad "(x6) pages $(field pages_read)/$(field pages_total) unit $(field page_unit)"

if deno test --allow-read supabase/functions/_shared/documentWindows.test.ts > "$TMP/deno.log" 2>&1; then ok "(x7) windower tests pass, sheet markers included"
else bad "(x7) windower tests failed: $(grep -E 'FAILED|error' "$TMP/deno.log" | head -2 | tr '\n' ' ')"; fi
N1=$(grep -c "columns_withheld: *extraction.columnsWithheld" supabase/functions/dify-analyze-file/index.ts); N2=$(grep -c "rows_capped: *extraction.rowsCapped" supabase/functions/dify-analyze-file/index.ts)
{ [ "$N1" = 2 ] && [ "$N2" = 2 ]; } && ok "(x8) columns_withheld and rows_capped written at both sites" || bad "(x8) columns_withheld at $N1, rows_capped at $N2 site(s), expected 2 each"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
