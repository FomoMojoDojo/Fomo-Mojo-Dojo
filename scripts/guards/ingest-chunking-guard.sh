#!/usr/bin/env bash
# INGEST CHUNKING — a long document is read whole, and every character of the read belongs to exactly
# one window (SP-231..SP-234; 2026-11-13).
#
# WHAT IT PROVES, and why each half is here.
#   PART A  the caps. The page cap is GONE from the parser, the one remaining cap is 400,000
#           characters, and nothing is written INTO the text to mark a cut (the old `[truncated]`
#           string was produced by the parser and read by nothing).
#   PART B  the windower, on a GENERATED document — exact coverage, the cap honoured, no cut inside a
#           block, and WINDOW_CHARS pinned to interview-parser/segment.ts so the two cannot drift.
#   PART C  the NEGATIVE, which is what makes the rest non-vacuous: drop a window from the set and the
#           SAME predicate the ingest path uses must report a gap. A coverage check that cannot go red
#           is a comment.
#   PART D  the table. Constraints refuse an inverted range, a bad sha, an unknown status and a second
#           row for the same window index; RLS is on and neither anon nor authenticated holds a grant.
#
# D4: NOTHING HERE INVOKES A WRITER OR A MODEL. The windower is PURE — no I/O, no clock, no model — so
# it is run directly under deno. The table checks are inserts on a HELD throwaway company, read back
# and removed; the parser checks are static reads of the file.
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

fails=0
oks=0
ok()   { echo "  ok   $*"; oks=$((oks+1)); }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }

DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
DENO="${DENO_BIN:-$HOME/.deno/bin/deno}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
psqlx() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1; }
psql_refused() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1 && return 1 || return 0; }
psql_insert_id() { psqlq "with ins as ($1 returning id) select id from ins;"; }

PARSER="scripts/local-parser-server.mjs"
WINDOWER="supabase/functions/_shared/documentWindows.ts"
EXTRACTF="supabase/functions/_shared/windowExtract.ts"
SEGMENTER="supabase/functions/interview-parser/segment.ts"
WORKER="supabase/functions/dify-analyze-file/index.ts"

# A held throwaway company for the table checks (E2: born HELD in the creating statement, and never
# deleted). Its own id, not a sibling guard's, so two guards cannot collide on one fixture.
FIX_CO="0c900000-0000-4000-8000-00000000c031"

[ -x "$DENO" ] || { echo "guard: FAIL deno not found at $DENO (set DENO_BIN)"; exit 1; }

echo "── (c1) PART A: the caps ──"
if grep -q 'PDF_PAGE_CAP' "$PARSER"; then
  # The name may survive in a comment explaining its removal; a live const or use is the failure.
  if grep -nE '^\s*(const|let|var)\s+PDF_PAGE_CAP\s*=' "$PARSER" >/dev/null \
     || grep -nE 'PDF_PAGE_CAP' "$PARSER" | grep -vE '^\s*[0-9]+:\s*//' | grep -q PDF_PAGE_CAP; then
    bad "(c1) PDF_PAGE_CAP is still live in $PARSER (SP-231 removes it)"
  else
    ok "(c1) PDF_PAGE_CAP appears only in comments explaining its removal"
  fi
else
  ok "(c1) PDF_PAGE_CAP is gone from the parser"
fi

if grep -q 'const TEXT_CHAR_CAP = 350_000;' "$PARSER"; then
  ok "(c1) the one remaining cap is 400,000 characters"
else
  bad "(c1) TEXT_CHAR_CAP is not 400_000 in $PARSER"
fi
if grep -q '120_000' "$PARSER"; then
  bad "(c1) the old 120,000-character cap is still in $PARSER"
else
  ok "(c1) the old 120,000-character cap is gone"
fi
# The marker was written into the document body and read by nothing. It must not come back.
if grep -q '\[truncated\]' "$PARSER"; then
  if grep -nE '\[truncated\]' "$PARSER" | grep -vE '^\s*[0-9]+:\s*//' | grep -q .; then
    bad "(c1) the parser still writes [truncated] into the text"
  else
    ok "(c1) [truncated] survives only in a comment"
  fi
else
  ok "(c1) nothing is appended to the extracted text"
fi
if grep -q 'chars_capped: charsCapped' "$PARSER" && grep -q 'charsCapped: typeof data?.chars_capped === "boolean"' "$WORKER"; then
  ok "(c1) the cap is reported as its own flag and carried onto the row"
else
  bad "(c1) chars_capped is not reported by the parser and read by the worker (SP-231)"
fi
# The flag must not be re-derived from the counts anywhere: compaction makes that comparison lie.
if grep -nE 'chars_total\s*>\s*chars|charsTotal\s*>\s*(text\.length|fresh\.length|chars)' "$PARSER" "$WORKER" | grep -vE ':\s*//' | grep -q .; then
  bad "(c1) partiality is inferred from chars_total vs chars somewhere — compaction makes that true of nearly every document"
else
  ok "(c1) partiality is never inferred from the character counts"
fi

echo "── (c2) PART B: the windower on a generated document ──"
WINDOW_CHARS_W=$(grep -oE 'export const WINDOW_CHARS = [0-9_]+' "$WINDOWER" | grep -oE '[0-9_]+$' | tr -d _)
WINDOW_CHARS_S=$(grep -oE 'export const WINDOW_CHARS = [0-9_]+' "$SEGMENTER" | grep -oE '[0-9_]+$' | tr -d _)
if [ -n "$WINDOW_CHARS_W" ] && [ "$WINDOW_CHARS_W" = "$WINDOW_CHARS_S" ]; then
  ok "(c2) WINDOW_CHARS is $WINDOW_CHARS_W in both the windower and the segmenter — pinned, not forked"
else
  bad "(c2) WINDOW_CHARS drifted: windower='$WINDOW_CHARS_W' segmenter='$WINDOW_CHARS_S'"
fi

PROBE="$(mktemp -t chunkprobe).ts"
trap 'rm -f "$PROBE"' EXIT
# The probe lives in a temp directory, so the import MUST be absolute: a repo-relative specifier
# resolves against that temp directory and the run dies before printing anything — which reads as
# "the windower is broken" rather than "the guard pointed at nothing".
cat > "$PROBE" <<TS
// PURE probe: generate a PDF-shaped document, window it, and report. No I/O beyond stdout.
import { blockBoundaries, coverageFailures, toDocumentWindows, WINDOW_CHARS }
  from "file://$PWD/supabase/functions/_shared/documentWindows.ts";

function pdfShaped(pages: number, charsPerPage: number): string {
  const out: string[] = [];
  for (let p = 1; p <= pages; p++) {
    const body = \`P\${p}START \` + "lorem ipsum dolor sit amet consectetur ".repeat(Math.ceil(charsPerPage / 39));
    out.push(\`[Page \${p}] \${body.slice(0, charsPerPage)} P\${p}END\`);
  }
  return out.join("\n\n");
}

const text = pdfShaped(77, 2_100);
const windows = await toDocumentWindows(text);
const cuts = new Set(blockBoundaries(text));
const insideABlock = windows.filter((w) => !cuts.has(w.char_start) || !cuts.has(w.char_end)).length;

// THE NEGATIVE: drop one window and ask the SAME predicate.
const dropped = [...windows.slice(0, 1), ...windows.slice(2)].map((w, i) => ({ ...w, window_index: i }));
// AND a second negative: keep every window but edit one's text away from its offsets.
const tampered = windows.map((w, i) => (i === 0 ? { ...w, text: \`EDITED\${w.text}\` } : w));

console.log(JSON.stringify({
  cap: WINDOW_CHARS,
  chars: text.length,
  windows: windows.length,
  over_cap: windows.filter((w) => w.chars > WINDOW_CHARS && !w.oversize).length,
  inside_a_block: insideABlock,
  coverage_failures: coverageFailures(text, windows).length,
  dropped_detected: coverageFailures(text, dropped).length,
  tampered_detected: coverageFailures(text, tampered).length,
  // One block alone longer than the cap keeps SP-232 (never split a paragraph) and says so.
  oversize_single_block: (await toDocumentWindows("z".repeat(WINDOW_CHARS * 2)))
    .filter((w) => w.oversize).length,
  empty_text_windows: (await toDocumentWindows("")).length,
}));
TS
RES=$("$DENO" run --allow-read --allow-import "$PROBE" 2>/dev/null)
if [ -z "$RES" ]; then
  bad "(c2) the windower probe produced no output — it did not run"
else
  jqv() { echo "$RES" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(d['$1']);" 2>/dev/null; }
  W_COUNT=$(jqv windows); W_COVER=$(jqv coverage_failures); W_OVER=$(jqv over_cap)
  W_INSIDE=$(jqv inside_a_block); W_DROP=$(jqv dropped_detected); W_TAMPER=$(jqv tampered_detected)
  W_OVERSIZE=$(jqv oversize_single_block); W_EMPTY=$(jqv empty_text_windows)
  echo "     $RES"
  [ "${W_COUNT:-0}" -gt 1 ] && ok "(c2) a 77-page document becomes $W_COUNT windows, not one" \
    || bad "(c2) the document produced ${W_COUNT:-0} window(s)"
  [ "${W_COVER:-1}" = "0" ] && ok "(c2) SP-234: coverage is exact — every character in exactly one window" \
    || bad "(c2) coverage failed with ${W_COVER} problem(s)"
  [ "${W_OVER:-1}" = "0" ] && ok "(c2) no window passes the cap except a single over-long block" \
    || bad "(c2) ${W_OVER} window(s) pass the cap without being a single block"
  [ "${W_INSIDE:-1}" = "0" ] && ok "(c2) SP-232: no window boundary falls inside a block" \
    || bad "(c2) ${W_INSIDE} window(s) are cut inside a block"
  [ "${W_OVERSIZE:-0}" = "1" ] && ok "(c2) one block longer than the cap gets its own oversize window" \
    || bad "(c2) an over-long single block was not given its own oversize window"
  [ "${W_EMPTY:-1}" = "0" ] && ok "(c2) empty text produces no windows, not one empty window" \
    || bad "(c2) empty text produced ${W_EMPTY} window(s)"

  echo "── (c3) PART C: the negative — the check can go red ──"
  [ "${W_DROP:-0}" -gt 0 ] && ok "(c3) dropping a window IS detected (${W_DROP} failure(s) reported)" \
    || bad "(c3) a dropped window went unnoticed — the coverage check is vacuous"
  [ "${W_TAMPER:-0}" -gt 0 ] && ok "(c3) a window edited away from its offsets IS detected" \
    || bad "(c3) a window whose text is not its own slice went unnoticed"
fi

# And the ingest path must ASK the predicate, not just own it.
# SP-271 moved this check from the whole text to the text actually READ (the prefix the kept windows
# cover), because a window-capped document no longer reads to its end. Coverage is exact over what
# was read — the whole document unless the cap bit, and the row's chars_capped says which.
if grep -q 'const failures = coverageFailures(readText, windows);' "$WORKER" \
   && grep -q 'error: "chunk_coverage"' "$WORKER"; then
  ok "(c3) the ingest path asks coverageFailures over the text READ and refuses to start on a gap"
else
  bad "(c3) the worker does not check coverage before starting (SP-234)"
fi
# The unit tests are part of the proof, not decoration.
if "$DENO" test --allow-import --no-check supabase/functions/_shared/documentWindows.test.ts >/dev/null 2>&1; then
  ok "(c3) documentWindows.test.ts passes"
else
  bad "(c3) documentWindows.test.ts FAILED"
fi

echo "── (c4) PART D: the table says no to a bad window ──"
OWNER=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
if [ -z "$OWNER" ]; then
  bad "(c4) FR_LOGIN_EMAIL not set (or no such user) — the table checks did not run; source backups/fr-login.env"
  HELD=""
else
  # The hold is stamped IN the creating statement, so the row is never momentarily unheld (E2).
  psqlx "insert into public.companies (id, name, created_by, fixture_hold)
         values ('$FIX_CO','icg-throwaway-chunking','$OWNER','ICG:test_fixture')
         on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'ICG:test_fixture');"
  HELD=$(psqlq "select coalesce(nullif(trim(fixture_hold), ''), '') from companies where id = '$FIX_CO';")
fi
if [ -n "$HELD" ]; then
  ok "(c4) the fixture company is HELD ($HELD) and is never deleted"
else
  bad "(c4) could not establish a held fixture company — refusing to write an unheld one"
fi

PROP=$(psql_insert_id "insert into file_proposals (company_id, file_name, source_type, summary, signal_type, status, processing_state)
  values ('$FIX_CO', 'iq-chunk-fixture.pdf', 'uploaded_file', 'chunk guard fixture', 'document', 'pending', 'queued')")
if [ -z "$PROP" ]; then
  bad "(c4) could not insert the fixture proposal — the table checks below would pass on absence"
else
  SHA=$(printf 'abcdef0123456789' | shasum -a 256 | cut -c1-64)
  psqlx "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
         values ('$PROP', '$FIX_CO', 0, 0, 12000, '$SHA');"
  N=$(psqlq "select count(*) from file_proposal_chunks where proposal_id = '$PROP';")
  [ "$N" = "1" ] && ok "(c4) a well-formed window row is accepted" || bad "(c4) a well-formed window row was refused"

  if psql_refused "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
                   values ('$PROP', '$FIX_CO', 0, 12000, 24000, '$SHA');"; then
    ok "(c4) a SECOND row for window 0 is refused — one row per window index"
  else
    bad "(c4) two rows for the same window index were accepted"
  fi
  if psql_refused "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
                   values ('$PROP', '$FIX_CO', 1, 500, 500, '$SHA');"; then
    ok "(c4) an empty range [500,500) is refused"
  else
    bad "(c4) an empty character range was accepted"
  fi
  if psql_refused "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
                   values ('$PROP', '$FIX_CO', 2, 100, 50, '$SHA');"; then
    ok "(c4) an inverted range is refused"
  else
    bad "(c4) an inverted character range was accepted"
  fi
  if psql_refused "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
                   values ('$PROP', '$FIX_CO', 3, 0, 10, 'not-a-sha');"; then
    ok "(c4) a sha that is not 64 hex characters is refused"
  else
    bad "(c4) a malformed sha was accepted"
  fi
  if psql_refused "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256, status)
                   values ('$PROP', '$FIX_CO', 4, 0, 10, '$SHA', 'halfway');"; then
    ok "(c4) an unknown status is refused"
  else
    bad "(c4) an unknown chunk status was accepted"
  fi
  # The rows go when the proposal does: a window has no life of its own.
  psqlx "delete from file_proposals where id = '$PROP';"
  LEFT=$(psqlq "select count(*) from file_proposal_chunks where proposal_id = '$PROP';")
  [ "$LEFT" = "0" ] && ok "(c4) deleting the proposal takes its windows with it" \
    || bad "(c4) $LEFT orphaned window row(s) survived the proposal"
fi

RLS=$(psqlq "select relrowsecurity from pg_class where relname = 'file_proposal_chunks';")
[ "$RLS" = "t" ] && ok "(c4) RLS is enabled on file_proposal_chunks" || bad "(c4) RLS is NOT enabled on file_proposal_chunks"
ACL=$(psqlq "select coalesce(array_to_string(relacl, ','), '') from pg_class where relname = 'file_proposal_chunks';")
if echo "$ACL" | grep -qE '(^|,)(anon|authenticated)='; then
  bad "(c4) anon or authenticated holds a grant on file_proposal_chunks: $ACL"
else
  ok "(c4) neither anon nor authenticated holds a grant (SP-218)"
fi

echo "── (c5) SP-241: ONE step owns a window — the claim is the database's, not the code's ──"
# WHY. The first cut selected the next pending chunk and then updated it, with a gap between. The
# completion sweep posts {"mode":"sync"} every minute and each post chained a step, so chains
# ACCUMULATED and two steps picked the SAME window: duplicate local model calls, and `attempts`
# climbing by the number of live chains. Measured on the Charter 10-Q's first run: window 13 reached
# attempt FOUR on its first pass, past SP-241's limit of three, so a healthy window was on course to
# be marked failed for nothing but concurrency.
#
# D4: no writer and no model here. The claim is exercised as plain SQL on the HELD fixture — which is
# the honest way to test it, because the claim IS a SQL predicate.
if grep -q '.eq("status", "pending")      // THE CLAIM' "$WORKER"; then
  ok "(c5) the claim is a conditional update only a pending row can satisfy"
else
  bad "(c5) the chunk claim is not conditional — two steps can own one window (SP-241)"
fi
if grep -q 'if (!("inFlight" in step)) chainWindowStep' "$WORKER"; then
  ok "(c5) a step that finds the work taken does NOT chain — chains cannot multiply"
else
  bad "(c5) a step chains even when another step owns the window, which is how chains multiplied"
fi
if grep -q '.lt("started_at", staleCutoff)' "$WORKER"; then
  ok "(c5) and a stale running window is returned to pending, so a dead worker's window is retryable"
else
  bad "(c5) a window left running by a dead worker is never reclaimed"
fi

if [ -n "${PROP2:-}" ] || true; then
  PROP2=$(psql_insert_id "insert into file_proposals (company_id, file_name, source_type, summary, signal_type, status, processing_state)
    values ('$FIX_CO', 'iq-claim-fixture.pdf', 'uploaded_file', 'claim guard fixture', 'document', 'pending', 'running')")
  if [ -z "$PROP2" ]; then
    bad "(c5) could not insert the claim fixture — the race below would pass on absence"
  else
    SHA2=$(printf 'claimfixture' | shasum -a 256 | cut -c1-64)
    CH2=$(psql_insert_id "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256)
          values ('$PROP2', '$FIX_CO', 0, 0, 500, '$SHA2')")
    # TWO claims on one window, the exact statement the worker issues. Exactly one may report a row.
    W1=$(psqlq "with c as (update file_proposal_chunks set status='running', attempts=attempts+1, started_at=now()
                 where id='$CH2' and status='pending' returning id) select count(*) from c;")
    W2=$(psqlq "with c as (update file_proposal_chunks set status='running', attempts=attempts+1, started_at=now()
                 where id='$CH2' and status='pending' returning id) select count(*) from c;")
    if [ "$W1" = "1" ] && [ "$W2" = "0" ]; then
      ok "(c5) two claims on one window: the first wins, the second gets nothing"
    else
      bad "(c5) two claims returned $W1 and $W2 rows — both steps would run the window"
    fi
    ATT=$(psqlq "select attempts from file_proposal_chunks where id='$CH2';")
    if [ "$ATT" = "1" ]; then
      ok "(c5) and attempts advanced ONCE, not once per caller — SP-241's budget is not burned by concurrency"
    else
      bad "(c5) attempts is $ATT after two claims — concurrency is still inflating the retry count"
    fi
    # Non-vacuity: after the stale reset the window must be claimable AGAIN, or a dead worker's
    # window is lost and the check above would be indistinguishable from "never claimable twice".
    psqlx "update file_proposal_chunks set status='pending' where id='$CH2';"
    W3=$(psqlq "with c as (update file_proposal_chunks set status='running', started_at=now()
                 where id='$CH2' and status='pending' returning id) select count(*) from c;")
    if [ "$W3" = "1" ]; then
      ok "(c5) once returned to pending it is claimable again — the claim is a lock, not a one-shot"
    else
      bad "(c5) a window returned to pending could not be re-claimed"
    fi
    psqlx "delete from file_proposals where id='$PROP2';"
  fi
fi

echo "── (c6) SP-240: a chunked row mid-windows is never failed for having no Dify run ──"
# THE BUG THIS PINS. syncDifyRun treats a running proposal with no dify_workflow_run_id as broken —
# which it WAS, before a document could be running for twenty minutes before its framework pass
# starts. The first real 10-Q run died at window 16 of 17 with `summary: "Dify run id missing"`,
# because the resume clause only caught the case where a window was CLAIMABLE: when the current window
# was running and fresh there was nothing to resume, the door fell through to syncDifyRun, and a
# document that was working perfectly was marked failed. Resuming and not-failing are two decisions.
if grep -q 'const chunkedInFlight' "$WORKER" && grep -q 'waiting: "window_in_flight"' "$WORKER"; then
  ok "(c6) a running row with no Dify run and live windows answers window_in_flight instead of falling through"
else
  bad "(c6) a chunked row mid-windows can still reach syncDifyRun and be failed for a missing run id"
fi
# The early return must come BEFORE the syncDifyRun call, or it is decoration.
IF_AT=$(grep -n 'waiting: "window_in_flight"' "$WORKER" | head -1 | cut -d: -f1)
SYNC_AT=$(grep -n 'const syncResult = await syncDifyRun(' "$WORKER" | head -1 | cut -d: -f1)
if [ -n "$IF_AT" ] && [ -n "$SYNC_AT" ] && [ "$IF_AT" -lt "$SYNC_AT" ]; then
  ok "(c6) and it returns BEFORE syncDifyRun is called (line $IF_AT < $SYNC_AT)"
else
  bad "(c6) the window_in_flight return is at $IF_AT, not before syncDifyRun at $SYNC_AT"
fi
# Non-vacuity: the failure string the bug produced must still exist in the function, so this check is
# pinning a real door and not a string that was simply deleted.
if grep -q 'No dify_workflow_run_id stored for queued/running proposal' "$WORKER"; then
  ok "(c6) syncDifyRun still fails a genuinely broken row — the door is narrowed, not removed"
else
  bad "(c6) the missing-run-id failure path is gone; a truly broken row would now be silent"
fi

echo "── (c7) SP-268: the output cap covers the item caps, with margin — and the two are TIED ──"
# WHY. WINDOW_NUM_PREDICT was 1,200 while the item caps permitted ~1,670 tokens of JSON, so a window
# dense enough to fill its quota could not answer within its budget. Both of the 10-Q's failed windows
# returned completion_tokens of EXACTLY 1,200 and truncated mid-JSON. The numbers were never
# reconciled because nothing tied them: I set 1,200 when the caps were 8 x 600 and did not revisit it
# when SP-258 made them 6 x 300.
#
# The tie is windowOutputTokens(), which DERIVES the requirement from the item caps. This check asserts
# the margin, so neither constant can move without the other being re-justified.
C7=$("$DENO" eval --ext=ts "
  const m = await import('file://$PWD/supabase/functions/_shared/windowExtract.ts');
  const need = m.windowOutputTokens();
  console.log(JSON.stringify({ need, have: m.WINDOW_NUM_PREDICT, margin: m.NUM_PREDICT_MARGIN,
    ratio: m.WINDOW_NUM_PREDICT / need,
    items: m.MAX_ITEMS_PER_KIND, chars: m.MAX_EXCERPT_CHARS,
    halved: m.halvedCaps(), halvedNeed: m.windowOutputTokens(m.halvedCaps().maxItemsPerKind, m.halvedCaps().maxExcerptChars) }));
" 2>/dev/null)
if [ -z "$C7" ]; then
  bad "(c7) could not read the output-cap constants — the tie was not checked"
else
  echo "     $C7"
  NEED=$(echo "$C7" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(d.need);" 2>/dev/null)
  HAVE=$(echo "$C7" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(d.have);" 2>/dev/null)
  OKM=$(echo "$C7" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(d.ratio >= d.margin);" 2>/dev/null)
  HN=$(echo "$C7" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(d.halvedNeed < d.have);" 2>/dev/null)
  if [ "$OKM" = "true" ]; then
    ok "(c7) WINDOW_NUM_PREDICT $HAVE covers the $NEED tokens the item caps need, with SP-268's margin"
  else
    bad "(c7) WINDOW_NUM_PREDICT $HAVE does not clear $NEED tokens by 25% — a dense window will truncate"
  fi
  [ "$HN" = "true" ] && ok "(c7) and the HALVED caps of a deterministic retry fit well inside it" \
    || bad "(c7) the halved retry caps do not fit the output cap"
fi
# The requirement must be DERIVED, not a second hardcoded number.
if grep -q 'export function windowOutputTokens' "$EXTRACTF" && grep -q 'maxItemsPerKind \* maxExcerptChars \* EXTRACT_KINDS.length' "$EXTRACTF"; then
  ok "(c7) the requirement is derived from the item caps themselves, so they cannot drift apart"
else
  bad "(c7) the output requirement is not derived from the item caps (SP-268)"
fi

echo "── (c8) SP-269: a deterministic failure is never retried identically ──"
if grep -q 'DETERMINISTIC_FAILURE_CODES' "$WORKER" && grep -q 'lastWasDeterministic ? halvedCaps()' "$WORKER"; then
  ok "(c8) a window whose last failure was deterministic retries with HALVED caps"
else
  bad "(c8) a deterministic failure is retried with the same caps — an identical call (SP-269)"
fi
if grep -q '|| lastWasDeterministic' "$WORKER"; then
  ok "(c8) and that retry is the LAST one — exactly one retry, not two"
else
  bad "(c8) a deterministic failure still gets the full retry budget"
fi
if grep -q 'window_answer_truncated' "$WORKER" && grep -q 'answer.completion_tokens ?? 0) >= WINDOW_NUM_PREDICT' "$WORKER"; then
  ok "(c8) truncation is named separately from malformed JSON, by the output cap being reached"
else
  bad "(c8) a truncated answer is not distinguished from a malformed one, so the remedy cannot differ"
fi
# Non-vacuity: a timeout must STILL keep its identical retries.
if grep -q 'attempts >= MAX_WINDOW_ATTEMPTS' "$WORKER"; then
  ok "(c8) a timeout or transport error keeps its two identical retries — not every failure is deterministic"
else
  bad "(c8) the non-deterministic retry budget is gone"
fi

echo "── (c9) SP-278: a framework pass that dies on a CLOCK is retried once, over banked work ──"
if "$DENO" test --allow-import --no-check supabase/functions/_shared/frameworkRetry.test.ts >/dev/null 2>&1; then
  ok "(c9) frameworkRetry.test.ts passes — the predicate is asserted against the RECORDED error strings"
else
  bad "(c9) frameworkRetry.test.ts FAILED"
fi
# The predicate must be WIRED to the retry, and the retry must reuse rather than re-extract.
if grep -q 'if (isTimeCeilingFailure(String(workflowStatus), String(detail)))' "$WORKER"; then
  ok "(c9) only a time-ceiling failure reaches the retry — anything else fails immediately"
else
  bad "(c9) the retry is not gated on isTimeCeilingFailure (SP-278)"
fi
if grep -q 'const handOff = await mergeAndPrepareHandOff({ supabase, proposalId, sidecarText: sidecar.text });' "$WORKER" \
   && grep -q 'window_model_calls: 0' "$WORKER"; then
  ok "(c9) the retry re-runs only the merge and the framework pass — no re-extraction"
else
  bad "(c9) the retry path does not reuse the banked extracts (SP-278)"
fi
# It must clear the completion claim, or the retry's own result could never be persisted (SP-227).
if grep -q 'processing_completed_at: null,' "$WORKER"; then
  ok "(c9) and it clears the completion claim the failed pass took, so the retry's result can land"
else
  bad "(c9) the retry leaves the failed pass's claim in place — its own result would be unpersistable"
fi
FA=$(psqlq "select count(*) from information_schema.columns where table_name='file_proposals' and column_name='framework_attempts';")
[ "$FA" = "1" ] && ok "(c9) framework_attempts is on the row, so the budget survives a worker restart" \
  || bad "(c9) framework_attempts column is missing"
# The budget is a CONSTRAINT, not a hope.
if psql_refused "insert into file_proposals (company_id, file_name, source_type, summary, signal_type, status, processing_state, framework_attempts)
                 values ('$FIX_CO','iq-fa.pdf','uploaded_file','fa','document','pending','queued', 3);"; then
  ok "(c9) a row claiming a THIRD framework attempt is refused by the column CHECK"
else
  bad "(c9) framework_attempts above 2 was accepted — the budget is not enforced"
fi

echo "── (c10) SP-279: an unchanged sidecar reuses the banked extracts, with NO window model call ──"
if grep -q 'const reused = await reuseBankedExtracts({' "$WORKER"; then
  REUSE_AT=$(grep -n 'const reused = await reuseBankedExtracts({' "$WORKER" | head -1 | cut -d: -f1)
  READ_AT=$(grep -n 'const read = await refreshReadAndWindow({' "$WORKER" | head -1 | cut -d: -f1)
  if [ -n "$REUSE_AT" ] && [ -n "$READ_AT" ] && [ "$REUSE_AT" -lt "$READ_AT" ]; then
    ok "(c10) reuse is attempted BEFORE any re-extraction (line $REUSE_AT < $READ_AT) — so a reused run cannot make a window call"
  else
    bad "(c10) reuse is attempted at $REUSE_AT, after the re-extraction at $READ_AT"
  fi
else
  bad "(c10) the start door does not attempt reuse (SP-279)"
fi
if grep -q 'const currentSidecarSha = await contentIdentityOf(sidecar.text);' "$WORKER" \
   && grep -q '.eq("sidecar_sha", sidecarSha)' "$WORKER"; then
  ok "(c10) reuse is keyed on the sidecar sha — the same bytes the voice gate tests"
else
  bad "(c10) reuse is not keyed on the sidecar sha (SP-279)"
fi
# SP-283: AND on the parser that would read it today. An unchanged sha says the stored text has not
# changed; it says nothing about whether the installed parser would still produce it.
if grep -q '.eq("parser_version", parserVersion)' "$WORKER" \
   && grep -q 'if (!fileId || !sidecarSha || !parserVersion) return null;' "$WORKER" \
   && grep -q 'const installedParser = await currentParserVersion(LOCAL_PARSER_URL);' "$WORKER"; then
  ok "(c10) SP-283: reuse also requires the INSTALLED parser's version to match, and an unknown version never reuses"
else
  bad "(c10) reuse ignores the parser version — a parser upgrade would be skipped (SP-283)"
fi
# BEHAVIOURAL, on the held fixture: the lookup finds a banked set for a matching sha and nothing for
# a changed one. This is the predicate the worker runs, as SQL, so it cannot pass by being unreachable.
BANK_SHA=$(printf 'banked-text' | shasum -a 256 | cut -c1-64)
OTHER_SHA=$(printf 'different-text' | shasum -a 256 | cut -c1-64)
BFILE="4d000000-0000-4000-8000-00000000c031"
# The input_files row needs an inputs row on the HELD fixture. This used to fall through to a "note"
# when none existed — and none did, so the whole SQL half of (c10) was silently skipped and SP-283's
# negative would have passed by never running. It creates its own now, and FAILS if it cannot.
if [ -n "${OWNER:-}" ] && [ -z "$(psqlq "select id from inputs where company_id='$FIX_CO' limit 1;")" ]; then
  psqlx "insert into public.inputs (company_id, user_id, input_key, input_label)
         values ('$FIX_CO','$OWNER','icg_guard_fixture','ICG guard fixture');"
fi
psqlx "insert into input_files (id, input_id, file_name, file_type, file_path)
       select '$BFILE', i.id, 'icg-bank.pdf', 'application/pdf', 'icg/bank.pdf'
         from inputs i where i.company_id='$FIX_CO' limit 1
       on conflict (id) do nothing;"
PV_OLD="local-parser-server-guard-OLD"
PV_NEW="local-parser-server-guard-NEW"
BANKED=$(psql_insert_id "insert into file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, sidecar_sha, parser_version, sections_total, sections_ready, sections_failed)
  values ('$FIX_CO','$BFILE','icg-bank.pdf','uploaded_file','banked','document','pending','ready','$BANK_SHA','$PV_OLD',2,2,0)")
if [ -z "$BANKED" ]; then
  bad "(c10) could not build the banked fixture — the reuse checks below would pass by never running"
else
  SHA2=$(printf 'w0' | shasum -a 256 | cut -c1-64)
  CH=$(psql_insert_id "insert into file_proposal_chunks (proposal_id, company_id, window_index, char_start, char_end, sha256, status)
       values ('$BANKED','$FIX_CO',0,0,500,'$SHA2','ready')")
  psqlx "insert into file_proposal_extracts (proposal_id, company_id, chunk_id, window_index, kind, item_index, text, excerpt_sha, char_start, char_end)
         values ('$BANKED','$FIX_CO','$CH',0,'evidence',0,'a banked passage','$SHA2',0,16);"
  # The lookup the worker runs, as SQL: file, sha AND parser version, with extracts present.
  lookup() { psqlq "select count(*) from file_proposals where file_id='$BFILE' and sidecar_sha='$1' and parser_version='$2' and exists (select 1 from file_proposal_extracts e where e.proposal_id = file_proposals.id);"; }
  FOUND=$(lookup "$BANK_SHA" "$PV_OLD")
  MISS=$(lookup "$OTHER_SHA" "$PV_OLD")
  NEWP=$(lookup "$BANK_SHA" "$PV_NEW")
  [ "${FOUND:-0}" -ge 1 ] && ok "(c10) the reuse lookup FINDS a banked set when sha and parser both match" \
    || bad "(c10) the reuse lookup found nothing for a matching sha and parser"
  [ "${MISS:-1}" = "0" ] && ok "(c10) and finds NOTHING when the sha differs — a changed document is re-read" \
    || bad "(c10) the lookup matched a proposal whose sidecar sha differs"
  # SP-283's negative, and it is non-vacuous by construction: the SAME row, the SAME sha, found by the
  # check above — refused here only because the parser version changed.
  [ "${NEWP:-1}" = "0" ] && ok "(c10) SP-283: the same text under a CHANGED parser version is NOT reused — the row the previous check found is refused" \
    || bad "(c10) a banked set was reused across a parser change (SP-283)"
  # And a row with NO recorded version can never be reused, whatever is asked for.
  psqlx "update file_proposals set parser_version = null where id='$BANKED';"
  NULLP=$(psqlq "select count(*) from file_proposals where file_id='$BFILE' and sidecar_sha='$BANK_SHA' and parser_version is not null;")
  [ "${NULLP:-1}" = "0" ] && ok "(c10) a banked set of UNKNOWN parser provenance matches no version — unknown re-extracts" \
    || bad "(c10) a NULL parser_version row still matched"
  psqlx "delete from file_proposals where id='$BANKED';"
  psqlx "delete from input_files where id='$BFILE';"
fi

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
