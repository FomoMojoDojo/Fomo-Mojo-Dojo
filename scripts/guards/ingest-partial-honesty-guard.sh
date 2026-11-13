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

WORK="$(mktemp -d)"
cleanup_work() { rm -rf "$WORK"; }
trap cleanup_work EXIT

echo "── (p1) the cap is named, and the document's count is no longer returned as the read's ──"
if grep -qE '^const PDF_PAGE_CAP = [0-9]+;' "$PARSER" && grep -q 'SP-93' "$PARSER"; then
  ok "(p1) PDF_PAGE_CAP is a named constant and the file cites SP-93"
else
  bad "(p1) the 30-page cap is not a named constant citing SP-93 in $PARSER"
fi
# comment lines are excluded on purpose: the file KEEPS a comment recording what the old return was,
# and a guard that cannot tell code from the note explaining it is a guard that reads its own prose
if grep -nE 'pages:[[:space:]]*doc\.numPages' "$PARSER" | grep -qvE '^[0-9]+: *(//|\*)'; then
  bad "(p1) extractPdfText still returns a bare 'pages: doc.numPages' — the document's count presented as the read's"
else
  ok "(p1) the bare 'pages: doc.numPages' return is gone"
fi
if grep -q 'pages_read' "$PARSER" && grep -q 'pages_total' "$PARSER" && grep -q 'chars_total' "$PARSER"; then
  ok "(p1) the response shape carries pages_read, pages_total and chars_total"
else
  bad "(p1) the parser response shape is missing one of pages_read / pages_total / chars_total"
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

echo "── (p3) a capped read reports the cap, and the text stops where it says it stopped ──"
node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/forty.pdf" 40 >/dev/null 2>&1 \
  || bad "(p3) could not build the 40-page fixture"
probe_pdf() {  # <path> → one line: pages_read pages_total chars_total has_last_read has_first_unread
  node -e '
    const fs = require("node:fs");
    const b64 = fs.readFileSync(process.argv[1]).toString("base64");
    const url = process.argv[2], cap = Number(process.argv[3]), total = Number(process.argv[4]);
    fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_name: "fixture.pdf", file_type: "application/pdf", content_base64: b64 }) })
      .then((r) => r.json())
      .then((j) => {
        const t = String(j.text || "");
        // the fixture marks every page uniquely, so we check WHICH pages were opened, not how many
        console.log([j.pages_read, j.pages_total, j.chars_total,
          t.includes(`P${cap}E`) ? "yes" : "no",
          cap < total ? (t.includes(`P${cap + 1}E`) ? "yes" : "no") : "n/a"].join(" "));
      })
      .catch((e) => { console.log("ERR " + e.message); });
  ' "$1" "$PARSER_URL" "$2" "$3" 2>/dev/null
}
P3=$(probe_pdf "$WORK/forty.pdf" 30 40)
read -r R3 T3 C3 LAST3 NEXT3 <<<"$P3"
if [ "$R3" = "30" ] && [ "$T3" = "40" ]; then
  ok "(p3) 40-page document: pages_read=30 pages_total=40 (chars_total=$C3)"
else
  bad "(p3) 40-page document reported pages_read=$R3 pages_total=$T3 — expected 30 and 40 [$P3]"
fi
if [ "$LAST3" = "yes" ] && [ "$NEXT3" = "no" ]; then
  ok "(p3) the text contains page 30 and NOT page 31 — the cap is real, not a number in a field"
else
  bad "(p3) page-30 present=$LAST3 page-31 present=$NEXT3 — the reported cap does not match the text"
fi
if [ -n "$C3" ] && [ "$C3" -gt 0 ] 2>/dev/null; then
  ok "(p3) chars_total is recorded ($C3)"
else
  bad "(p3) chars_total missing or zero on a document that yielded text"
fi

echo "── (p4) a WHOLE read says so — the guard is not just asserting the number 30 ──"
node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/five.pdf" 5 >/dev/null 2>&1
P4=$(probe_pdf "$WORK/five.pdf" 5 5)
read -r R4 T4 _C4 LAST4 _N4 <<<"$P4"
if [ "$R4" = "5" ] && [ "$T4" = "5" ] && [ "$LAST4" = "yes" ]; then
  ok "(p4) 5-page document: pages_read=5 pages_total=5, page 5 present — a whole read, reported whole"
else
  bad "(p4) 5-page document reported pages_read=$R4 pages_total=$T4 page5=$LAST4 — expected a whole read [$P4]"
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

echo "── (p8) the surfaces render S-ING-1, verbatim and BESIDE the state ──"
if npx vitest run src/lib/ingest/ingestStrings.parity.test.ts src/views/client/workspace/InputsPage.partialRead.test.tsx >"$WORK/vitest.log" 2>&1; then
  ok "(p8) the S-ING-1 parity test and the render test pass ($(grep -cE '^ *✓' "$WORK/vitest.log") file(s))"
else
  bad "(p8) the S-ING-1 parity or render test FAILED — see $WORK/vitest.log"
  tail -20 "$WORK/vitest.log" | sed 's/^/       /'
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
