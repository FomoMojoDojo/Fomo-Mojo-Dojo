#!/usr/bin/env bash
# INGEST PARTIAL HONESTY — a read that covered part of a document SAYS SO (SP-93, SP-94; 2026-11-13).
#
# WHAT WENT WRONG. The PDF path reads the first 30 pages and stops, and recorded the DOCUMENT's page
# count as `extraction_pages`. A 77-page filing analysed on 30 pages therefore stored "77 pages" and
# every screen said "Analysis ready" — identical, in every particular, to a document read whole.
# Pages 31-77 were never opened and nothing anywhere said so. The reader then draws a conclusion
# about their own document from an analysis that never saw most of it.
#
# WHAT THIS GUARD HOLDS. SP-93 keeps the cap for now (lifting it before chunking exists would turn
# documents that analyse today into documents that fail), so the obligation is honesty, not coverage:
#   (p1) the cap is a NAMED constant citing SP-93, and the bare `pages: doc.numPages` return is gone
#   (p2) the parser SERVING on :8789 is the parser on disk — a stale worker proves nothing (R46)
#   (p3) a 40-page document reports pages_read 30 < pages_total 40, and the text stops where it says
#   (p4) a 5-page document reports a WHOLE read — the guard is not merely asserting the number 30
#   (p5) the one write path carries the pair into the row, and never half of it
#   (p6) the column CHECK refuses a dishonest row: a read past the end, or half a pair
#   (p7) NO BACKFILL — rows written before the columns existed still say nothing
#   (p8) the surfaces render S-ING-1, verbatim and beside the state, never instead of it
#
# D4 (2026-11-07): NOTHING HERE INVOKES dify-analyze-file. That function writes rows and calls a
# model, so it is never a probe. The parser at :8789 is read-only and local — no model, no write, no
# spend — and the write path is established from the code and from the column CHECK instead. (p5) is
# deliberately a static check for that reason, and says so when it passes.
#
# PLANT (what makes this guard a guard): make the parser report pages_total as pages_read —
#   bash scripts/plant.sh save scripts/local-parser-server.mjs
#   (edit extractPdfText: `pagesRead` := `pagesTotal`)
#   kill the parser, restart it, re-run → (p3) RED while (p4) stays green
#   bash scripts/plant.sh restore scripts/local-parser-server.mjs ; restart again
# The restart is not optional: node holds the module it booted with, so a plant run WITHOUT a restart
# exercises the old parser and proves nothing — the same rule R46 states for the edge worker.
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }

PARSER="scripts/local-parser-server.mjs"
PARSER_URL="${LOCAL_PARSER_URL:-http://127.0.0.1:8789/extract}"
DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
psqlx() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1; }
# a statement EXPECTED to be refused: success is the failure
psql_refused() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1 && return 1 || return 0; }
# INSERT ... RETURNING through `psql -At -c` prints the value AND the "INSERT 0 1" status line, so a
# bare capture is two lines and fails as a uuid in the next statement — silently. Wrapping in a CTE
# makes the id the only result row. (The same trap cost three false FAILs in ingest-queue-guard.)
psql_insert_id() { psqlq "with ins as ($1 returning id) select id from ins;"; }

WORK="$(mktemp -d)"
cleanup_work() { rm -rf "$WORK"; }
trap cleanup_work EXIT

echo "── (p1) one cap, 400,000 characters, and nothing written into the text ──"
# The NAME may survive in a comment recording its removal; a live const or use is the failure.
if grep -nE 'PDF_PAGE_CAP' "$PARSER" | grep -vE '^[0-9]+: *(//|\*)' | grep -q .; then
  bad "(p1) PDF_PAGE_CAP is still live in $PARSER — SP-231 removed the page cap"
else
  ok "(p1) no page cap survives in the parser"
fi
if grep -q 'const TEXT_CHAR_CAP = 350_000;' "$PARSER"; then
  ok "(p1) the one remaining cap is 350,000 characters (SP-231, SP-267)"
else
  bad "(p1) TEXT_CHAR_CAP is not 400_000 in $PARSER"
fi
# comment lines are excluded on purpose: the file KEEPS a comment recording what the old return was,
# and a guard that cannot tell code from the note explaining it is a guard that reads its own prose
if grep -nE 'pages:[[:space:]]*doc\.numPages' "$PARSER" | grep -qvE '^[0-9]+: *(//|\*)'; then
  bad "(p1) extractPdfText still returns a bare 'pages: doc.numPages' — the document's count presented as the read's"
else
  ok "(p1) the bare 'pages: doc.numPages' return is gone"
fi
# The marker used to be appended INTO the document body, where it could be windowed and quoted back
# as an evidence excerpt, and where nothing reading the row could see it.
if grep -nE '\[truncated\]' "$PARSER" | grep -vE '^[0-9]+: *(//|\*)' | grep -q .; then
  bad "(p1) the parser still writes [truncated] into the extracted text"
else
  ok "(p1) nothing is appended to the extracted text; the cap is reported on the shape"
fi
if grep -q 'chars_capped: charsCapped' "$PARSER"; then
  ok "(p1) the response shape carries chars_capped as its own fact"
else
  bad "(p1) the parser does not report chars_capped (SP-231)"
fi
if grep -q 'pages_read' "$PARSER" && grep -q 'pages_total' "$PARSER" && grep -q 'chars_total' "$PARSER"; then
  ok "(p1) and still carries pages_read, pages_total and chars_total"
else
  bad "(p1) the parser response shape is missing one of pages_read / pages_total / chars_total"
fi
# SP-231: inferring the cap from the counts is WRONG, because compaction also moves them.
if grep -nE 'chars_total[[:space:]]*>[[:space:]]*chars' "$PARSER" | grep -vE '^[0-9]+: *(//|\*)' | grep -q .; then
  bad "(p1) partiality is inferred from chars_total vs chars — compaction makes that true of nearly every document"
else
  ok "(p1) partiality is never inferred from the character counts"
fi

echo "── (p2) the parser SERVING the port is the parser on disk (R46) ──"
DISK_VERSION=$(sed -n 's/^  server: "\(.*\)",$/\1/p' "$PARSER" | head -1)
LIVE=$(curl -s -m 20 -X POST "$PARSER_URL" -H 'content-type: application/json' \
  -d '{"file_name":"probe.txt","file_type":"text/plain","content_base64":"aGVsbG8="}' 2>/dev/null)
LIVE_VERSION=$(printf '%s' "$LIVE" | sed -n 's/.*"server":"\([^"]*\)".*/\1/p')
if [ -z "$LIVE_VERSION" ]; then
  bad "(p2) no answer from the local parser at $PARSER_URL — start it: node $PARSER"
elif [ "$LIVE_VERSION" != "$DISK_VERSION" ]; then
  bad "(p2) the SERVED parser is '$LIVE_VERSION' but the file says '$DISK_VERSION' — restart it, or every check below reads the old module"
else
  ok "(p2) served parser matches disk ($DISK_VERSION)"
fi

echo "── (p3) a document OVER the character cap says so, and its text stops at the cap ──"
# A text document is the cheapest way to pass the cap: the cap applies to EVERY path, and the text
# path reaches it without building a two-thousand-page PDF.
CAP=350000   # SP-267 lowered the backstop from 400,000; the read cap proper is a window count (SP-271)
node -e '
  const fs = require("node:fs");
  // Markers either side of the cap, so the check is WHERE the text stops and not merely how long it is.
  const unit = "The quick brown fox jumps over the lazy dog. ";
  const want = Number(process.argv[2]) + 50000;
  let s = "HEADMARKER ";
  while (s.length < want) s += unit;
  const at = Number(process.argv[2]) + 1000;
  s = s.slice(0, at) + " TAILMARKER " + s.slice(at);
  fs.writeFileSync(process.argv[1], s, "utf8");
' "$WORK/big.txt" "$CAP" 2>/dev/null
if [ ! -s "$WORK/big.txt" ]; then
  bad "(p3) could not build the over-cap fixture — the checks below would pass on absence"
else
  P3=$(node -e '
    const fs = require("node:fs");
    const b64 = fs.readFileSync(process.argv[1]).toString("base64");
    fetch(process.argv[2], { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_name: "big.txt", file_type: "text/plain", content_base64: b64 }) })
      .then((r) => r.json())
      .then((j) => {
        const t = String(j.text || "");
        console.log([j.chars, j.chars_total, j.chars_capped,
          t.includes("HEADMARKER") ? "yes" : "no", t.includes("TAILMARKER") ? "yes" : "no"].join(" "));
      })
      .catch((e) => console.log("ERR " + e.message));
  ' "$WORK/big.txt" "$PARSER_URL" 2>/dev/null)
  read -r C3 CT3 CAPPED3 HEAD3 TAIL3 <<<"$P3"
  if [ "$CAPPED3" = "true" ]; then
    ok "(p3) an over-cap document reports chars_capped=true (chars=$C3 of chars_total=$CT3)"
  else
    bad "(p3) an over-cap document reported chars_capped=$CAPPED3 — expected true [$P3]"
  fi
  if [ -n "$C3" ] && [ "$C3" -le "$CAP" ] 2>/dev/null && [ "$C3" -gt $((CAP - 200)) ] 2>/dev/null; then
    ok "(p3) the text stops at the cap ($C3 characters, cap $CAP)"
  else
    bad "(p3) the text is $C3 characters against a $CAP cap — the reported cap does not match the text"
  fi
  if [ "$HEAD3" = "yes" ] && [ "$TAIL3" = "no" ]; then
    ok "(p3) the text contains the head marker and NOT the marker past the cap — the cap is a real read"
  else
    bad "(p3) head present=$HEAD3 past-cap marker present=$TAIL3 — the cap is a number in a field, not a read"
  fi
fi

echo "── (p4) a 40-page document is now read WHOLE — the page cap really is gone ──"
# This is also (p3)'s non-vacuity: a guard in which everything is capped proves nothing about capping.
node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/forty.pdf" 40 >/dev/null 2>&1 \
  || bad "(p4) could not build the 40-page fixture"
P4=$(node -e '
  const fs = require("node:fs");
  const b64 = fs.readFileSync(process.argv[1]).toString("base64");
  fetch(process.argv[2], { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_name: "fixture.pdf", file_type: "application/pdf", content_base64: b64 }) })
    .then((r) => r.json())
    .then((j) => {
      const t = String(j.text || "");
      // the fixture marks every page uniquely, so we check WHICH pages were opened, not how many
      console.log([j.pages_read, j.pages_total, j.chars_capped,
        t.includes("P40E") ? "yes" : "no", t.includes("P31E") ? "yes" : "no"].join(" "));
    })
    .catch((e) => console.log("ERR " + e.message));
' "$WORK/forty.pdf" "$PARSER_URL" 2>/dev/null)
read -r R4 T4 CAPPED4 LAST4 PAST30 <<<"$P4"
if [ "$R4" = "40" ] && [ "$T4" = "40" ]; then
  ok "(p4) 40-page document: pages_read=40 pages_total=40 — a whole read, reported whole"
else
  bad "(p4) 40-page document reported pages_read=$R4 pages_total=$T4 — expected 40 and 40 [$P4]"
fi
if [ "$LAST4" = "yes" ] && [ "$PAST30" = "yes" ]; then
  ok "(p4) the text contains page 40 AND page 31 — pages past the old 30-page cap are really opened"
else
  bad "(p4) page-40 present=$LAST4 page-31 present=$PAST30 — the old cap is still cutting the read"
fi
if [ "$CAPPED4" = "false" ]; then
  ok "(p4) and chars_capped is false on it — the flag is not stuck on"
else
  bad "(p4) chars_capped=$CAPPED4 on a 40-page document well under the character cap"
fi

echo "── (p5) the one write path carries the pair (STATIC — D4: this function writes and calls a model) ──"
W="supabase/functions/dify-analyze-file/index.ts"
if grep -q 'pages_read:' "$W" && grep -q 'pages_total:' "$W" && grep -q 'chars_total:' "$W"; then
  ok "(p5) dify-analyze-file writes pages_read, pages_total and chars_total onto the proposal"
else
  bad "(p5) dify-analyze-file does not write all three columns"
fi
if grep -q 'pairKnown' "$W"; then
  ok "(p5) the pair is normalised together — a lone total is stored as nothing, not as a fraction"
else
  bad "(p5) no pair normalisation in dify-analyze-file: a parser answer with only one of the two could be stored"
fi
if [ "$(grep -rlE 'extraction_pages:\s' --include='*.ts' supabase/functions/ | wc -l | tr -d ' ')" = "1" ]; then
  ok "(p5) there is still exactly ONE write path for a proposal's extraction shape"
else
  bad "(p5) more than one function writes extraction_pages — the pair must travel on every one of them"
fi

echo "── (p6) the column CHECK refuses a dishonest row, on a HELD throwaway company ──"
# ── E2 TEARDOWN: the company is NEVER deleted (pattern from outside-call-guard / file-analysis-v2).
# The id is FIXED and reused every run, so the fleet gains ONE accounted-for held company, not one
# per run; the hold is stamped in the SAME statement that creates it, so an abort below can never
# leave one live; each deletable child is removed in its own statement.
IPH="0c900000-0000-4000-8000-00000000c011"
remove_children() {
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.file_proposals where company_id='$IPH';" >/dev/null 2>&1 \
    || echo "  note (p6) file_proposals rows left behind on the held fixture — the company stays HELD"
}
if ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(p6) cannot reach the local database — the storage half was not exercised"
else
  OWNER=""
  if [ -n "${FR_LOGIN_EMAIL:-}" ]; then
    OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
  fi
  if [ -z "$OWNER" ]; then
    # SP-128: the fixture owner is the CC-owned TEST account, never the operator's own login.
    bad "(p6) FR_LOGIN_EMAIL not set or no such account — source backups/fr-login.env; the storage half did not run"
  else
    trap 'remove_children; cleanup_work' EXIT
    remove_children   # an aborted earlier run must never leave its rows behind
    psqlx "insert into public.companies (id, name, created_by, fixture_hold)
           values ('$IPH','iph-throwaway-partial-read','$OWNER','IPH:test_fixture')
           on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'IPH:test_fixture');"
    HELD=$(psqlq "select coalesce(fixture_hold,'') from public.companies where id='$IPH';")
    [ -n "$HELD" ] && ok "(p6) the fixture company is HELD ($HELD) and is never deleted" \
                   || bad "(p6) the fixture company carries no hold — refusing to write to it"

    if [ -n "$HELD" ]; then
      HONEST="4a000000-0000-4000-8000-00000000d001"
      if psqlx "insert into public.file_proposals (id, company_id, pages_read, pages_total, chars_total)
                values ('$HONEST','$IPH',30,40,41000);"; then
        GOT=$(psqlq "select pages_read||'/'||pages_total||'/'||chars_total from public.file_proposals where id='$HONEST';")
        [ "$GOT" = "30/40/41000" ] && ok "(p6) an honest partial row stores and reads back as 30/40/41000" \
                                   || bad "(p6) stored row read back as '$GOT', expected 30/40/41000"
      else
        bad "(p6) an HONEST partial row (30 of 40) was refused — the CHECK is too strict"
      fi

      if psql_refused "insert into public.file_proposals (id, company_id, pages_read, pages_total)
                       values (gen_random_uuid(),'$IPH',80,40);"; then
        ok "(p6) a read PAST THE END (80 of 40) is refused by the column CHECK"
      else
        bad "(p6) a row claiming 80 pages read of a 40-page document was ACCEPTED"
      fi

      if psql_refused "insert into public.file_proposals (id, company_id, pages_read, pages_total)
                       values (gen_random_uuid(),'$IPH',30,null);"; then
        ok "(p6) half a pair (30 of unknown) is refused — no false fraction can be stored"
      else
        bad "(p6) a row carrying pages_read with no pages_total was ACCEPTED"
      fi

      if psqlx "insert into public.file_proposals (id, company_id, pages_read, pages_total)
                values (gen_random_uuid(),'$IPH',null,null);"; then
        ok "(p6) both NULL is still legal — that is the un-recorded past, not a dishonest row"
      else
        bad "(p6) a row with both page columns NULL was refused — existing rows would break"
      fi
    fi

    echo "── (p7) NO BACKFILL: rows written before the columns existed still say nothing ──"
    OLD_FILLED=$(psqlq "select count(*) from public.file_proposals
                        where created_at < '2026-11-13'
                          and (pages_read is not null or pages_total is not null or chars_total is not null);")
    if [ "${OLD_FILLED:-x}" = "0" ]; then
      TOTAL_OLD=$(psqlq "select count(*) from public.file_proposals where created_at < '2026-11-13';")
      ok "(p7) all $TOTAL_OLD pre-existing row(s) carry NULL on all three columns — nothing was guessed"
    else
      bad "(p7) $OLD_FILLED row(s) predating the columns carry a value — a backfill happened (SP-93 forbids it)"
    fi
  fi
fi

echo "── (p8) the surfaces render S-ING-1 .. S-ING-5, verbatim and BESIDE the state ──"
if npx vitest run src/lib/ingest/ingestStrings.parity.test.ts src/views/client/workspace/InputsPage.partialRead.test.tsx >"$WORK/vitest.log" 2>&1; then
  ok "(p8) the string parity test and the render test pass ($(grep -cE '^ *✓' "$WORK/vitest.log") file(s))"
else
  bad "(p8) the string parity or render test FAILED — see $WORK/vitest.log"
  tail -20 "$WORK/vitest.log" | sed 's/^/       /'
fi

echo "── (p9) the info icon: present on a budget-selected row, ABSENT on a one-window row (SP-260) ──"
# WHY THIS CHECK IS HERE AND NOT IN THE PARITY TEST. The parity test asserts the PREDICATE on literal
# numbers. This asserts it on NUMBERS THAT CAME OUT OF THE DATABASE, through the column CHECK, on the
# same held fixture (p6) uses — so a constraint that silently rejected one of the two counts, or a
# column that defaulted, would show up here and nowhere else.
#
# The decision is evaluated by importing the SHARED helper under deno, which reads .ts directly. It is
# the same function the surfaces call; a second copy of the rule here would be the drift the whole
# strings file exists to prevent.
DENO="${DENO_BIN:-$HOME/.deno/bin/deno}"
if [ ! -x "$DENO" ]; then
  bad "(p9) deno not found at $DENO (set DENO_BIN) — the icon decision was not exercised"
elif ! psqlq "select 1" >/dev/null 2>&1 || [ -z "${OWNER:-}" ]; then
  bad "(p9) no database or no FR_LOGIN_EMAIL — the icon decision was not exercised on stored rows"
else
  # A long document: read whole, interpreted in part. The icon's whole subject.
  SEL=$(psql_insert_id "insert into public.file_proposals
    (company_id, file_name, source_type, summary, signal_type, status, processing_state,
     sections_total, sections_ready, sections_failed, items_extracted, items_interpreted)
    values ('$IPH','iph-budget-selected.pdf','uploaded_file','icon fixture','document','pending','ready',
            17, 17, 0, 336, 76)")
  # A one-window document whose extract fitted whole. Nothing to disclose.
  ONE=$(psql_insert_id "insert into public.file_proposals
    (company_id, file_name, source_type, summary, signal_type, status, processing_state,
     sections_total, sections_ready, sections_failed, items_extracted, items_interpreted)
    values ('$IPH','iph-one-window.pdf','uploaded_file','icon fixture','document','pending','ready',
            1, 1, 0, 12, 12)")
  if [ -z "$SEL" ] || [ -z "$ONE" ]; then
    bad "(p9) could not insert both icon fixtures — the checks below would pass on absence"
  else
    read_row() { psqlq "select coalesce(items_extracted::text,'null') || ' ' || coalesce(items_interpreted::text,'null') || ' ' || coalesce(sections_total::text,'null') from public.file_proposals where id='$1';"; }
    decide() {  # <extracted> <interpreted> → true|false, from the SHARED helper
      "$DENO" eval --ext=ts "
        const { isBudgetSelected } = await import('file://$PWD/src/lib/ingest/ingestStrings.ts');
        console.log(String(isBudgetSelected(Number(Deno.args[0]), Number(Deno.args[1]))));
      " "$1" "$2" 2>/dev/null
    }
    read -r SE SI ST <<<"$(read_row "$SEL")"
    read -r OE OI OT <<<"$(read_row "$ONE")"
    if [ "$SE" = "336" ] && [ "$SI" = "76" ] && [ "$ST" = "17" ]; then
      ok "(p9) the budget-selected row stored its counts (17 sections, 76 of 336 items)"
    else
      bad "(p9) the budget-selected row read back as extracted=$SE interpreted=$SI sections=$ST"
    fi
    D1=$(decide "$SE" "$SI")
    if [ "$D1" = "true" ]; then
      ok "(p9) and the icon APPEARS on it — items_interpreted below items_extracted on a ready row"
    else
      bad "(p9) the icon did NOT appear on a budget-selected row (helper said '$D1')"
    fi
    D2=$(decide "$OE" "$OI")
    if [ "$D2" = "false" ]; then
      ok "(p9) the icon is ABSENT on the one-window row ($OI of $OE interpreted) — the negative SP-262 asks for"
    else
      bad "(p9) the icon appeared on a one-window row whose extract fitted whole (helper said '$D2')"
    fi
    # Non-vacuity: the helper must be capable of both answers, and of refusing a half-pair.
    D3=$(decide 336 "null")
    if [ "$D3" = "false" ] && [ "$D1" != "$D2" ]; then
      ok "(p9) the helper gives both answers and refuses half a pair — not a constant"
    else
      bad "(p9) the helper is not discriminating (budget=$D1 one-window=$D2 half-pair=$D3)"
    fi
    # SP-257: the column CHECK must refuse interpreted ABOVE extracted — the icon's premise reversed.
    if psql_refused "insert into public.file_proposals
      (company_id, file_name, source_type, summary, signal_type, status, processing_state,
       items_extracted, items_interpreted)
      values ('$IPH','iph-impossible.pdf','uploaded_file','icon fixture','document','pending','ready', 10, 20);"; then
      ok "(p9) a row claiming it interpreted MORE than it extracted is refused by the column CHECK"
    else
      bad "(p9) a row with items_interpreted > items_extracted was accepted"
    fi
  fi
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
