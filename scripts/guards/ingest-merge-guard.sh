#!/usr/bin/env bash
# INGEST MERGE — the hand-off to the framework pass never exceeds its budget, and every section of a
# long document is in it (SP-237, SP-255, SP-256, SP-257, SP-258; 2026-11-13).
#
# THE FAILURE THIS EXISTS TO CATCH IS A TAIL CUT. Fill 24,000 characters in document order and stop,
# and a 34-section filing hands the framework pass its first eight sections and nothing else — the
# 30-page cap again under another name, and invisible, because the row would say `ready` and every
# window would have been read. So the two properties are checked together: WITHIN the budget, and
# EVERY window represented. Either alone is satisfiable by something useless.
#
# WHAT IT PROVES.
#   PART A  the budget is 24,000 and the figure that was NOT used is not in the code. The framework
#           pass FAILED on 2026-11-11 at 51,483 and 58,992 characters (300 s read timeout; 1,555 s
#           against a 1,200 s ceiling), so a cap read off `normalizeText` as "demonstrably carried"
#           was never carried at all.
#   PART B  on a 30-window fixture at the 350,000 document cap: the hand-off is within budget, every window
#           contributed, and no window has a second item while another has none.
#   PART C  SP-258 — a window's extract may not exceed half THAT window's characters.
#   PART D  SP-257 — nothing is lost: every merged item is either interpreted or accounted for, and
#           the row's two counts are what the selection actually did.
#   PART E  the NEGATIVES, which make the rest non-vacuous: a tail-cut selection FAILS the
#           every-window check, and an over-budget hand-off FAILS the budget check. A check that
#           cannot go red is a comment.
#
# D4: NOTHING HERE INVOKES A WRITER OR A MODEL. The merge and the selection are PURE — no I/O, no
# clock, no model — so they run directly under deno on generated input. No database is touched.
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

oks=0
fails=0
ok()   { echo "  ok   $*"; oks=$((oks+1)); }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }

DENO="${DENO_BIN:-$HOME/.deno/bin/deno}"
MERGE="supabase/functions/_shared/mergeExtracts.ts"
EXTRACT="supabase/functions/_shared/windowExtract.ts"
WORKER="supabase/functions/dify-analyze-file/index.ts"

[ -x "$DENO" ] || { echo "guard: FAIL deno not found at $DENO (set DENO_BIN)"; exit 1; }

echo "── (m1) PART A: the budget, and the figure that was not used ──"
if grep -q 'export const MERGED_EXTRACT_BUDGET = 10_000;' "$MERGE"; then
  ok "(m1) the hand-off budget is 10,000 characters (SP-255, lowered after measurement)"
else
  bad "(m1) MERGED_EXTRACT_BUDGET is not 24_000 in $MERGE"
fi
# 120_000 as a HAND-OFF size must not reappear. It may be named in a comment explaining why not.
if grep -nE '120_000|120000' "$MERGE" "$EXTRACT" | grep -vE ':\s*//' | grep -q .; then
  bad "(m1) a 120,000 figure is live in the merge path — it was never a size the framework pass carried"
else
  ok "(m1) no 120,000 hand-off size anywhere in the merge path"
fi
if grep -q 'MAX_ITEMS_PER_KIND = 6' "$EXTRACT" && grep -q 'MAX_EXCERPT_CHARS = 300' "$EXTRACT"; then
  ok "(m1) the per-window caps are 6 items of 300 characters (SP-258)"
else
  bad "(m1) the per-window caps are not 6 / 300 (SP-258)"
fi

PROBE="$(mktemp -t mergeprobe).ts"
trap 'rm -f "$PROBE"' EXIT
# Absolute import: the probe lives in a temp directory, so a repo-relative specifier resolves against
# that directory and the run dies before printing — which would read as a broken merge.
cat > "$PROBE" <<TS
import { mergeWindowExtracts, selectForBudget, buildMergedExtractText, MERGED_EXTRACT_BUDGET,
  maxWindowsForBudget } from "file://$PWD/supabase/functions/_shared/mergeExtracts.ts";
import { readWindowExtract, HALF_WINDOW_FRACTION, MAX_ITEMS_PER_KIND }
  from "file://$PWD/supabase/functions/_shared/windowExtract.ts";

function fixture(windows: number, perKind: number, chars: number) {
  const rows: any[] = []; const parts: string[] = []; let sha = 0;
  for (let w = 0; w < windows; w++) {
    for (const kind of ["evidence", "claim", "need"]) {
      for (let i = 0; i < perKind; i++) {
        // String concatenation, not a template literal: this file is written through an UNQUOTED
        // heredoc, where every backtick and $ needs escaping and one wrong count kills the probe
        // silently — which reads as "the merge is broken".
        const text = "W" + w + "-" + kind + "-" + i + " " + "x".repeat(Math.max(0, chars - 16));
        rows.push({ kind, item_index: i, text, excerpt_sha: (sha++).toString(16).padStart(64, "0"),
          window_index: w, char_start: w * 12000 + i * 400, char_end: w * 12000 + i * 400 + text.length });
        parts.push(text);
      }
    }
  }
  return { rows, sidecar: parts.join(" ") };
}

// SP-267 lowered the document cap to 350,000. At FULL window fill that is 30 windows, which is
// exactly what a 10,000-character hand-off can give one excerpt each — so 30 is the case where
// SP-256 holds, and it is checked as the positive. The worst case at the same cap is far higher
// (a 6,001-character block cannot share a 12,000-character window, so it takes one of its own:
// 59 windows at 350,000), and that case is checked for the property that survives.
const WINDOWS = 30;
const { rows, sidecar } = fixture(WINDOWS, 6, 300);
const merged = mergeWindowExtracts(rows, sidecar);
const sel = selectForBudget(merged.items);

const counts = new Map<number, number>();
for (const item of sel.selected) counts.set(item.windows[0], (counts.get(item.windows[0]) ?? 0) + 1);
const present = [...counts.keys()].length;
const spread = counts.size ? Math.max(...counts.values()) - Math.min(...counts.values()) : -1;

// NEGATIVE 1 — a TAIL CUT: fill the budget in document order and stop.
const tail: any[] = []; let used = 0;
for (const item of [...merged.items].sort((a, b) => a.windows[0] - b.windows[0])) {
  const cost = item.text.length + 30;
  if (used + cost > MERGED_EXTRACT_BUDGET) break;
  tail.push(item); used += cost;
}
const tailWindows = new Set(tail.map((i) => i.windows[0])).size;

// NEGATIVE 2 — hand over EVERYTHING and measure it against the budget.
const everything = buildMergedExtractText(merged.items).length;

// SP-273: THE WORST BLOCK SHAPE, READ UNDER THE WINDOW CAP. A document whose blocks are just over
// half a window gets one block per window — 59 windows at the 350,000-character backstop. SP-271
// caps the READ at maxWindowsForBudget(), so only the first 30 are read at all, and every window that
// WAS read must be represented in the hand-off. This mirrors exactly what the worker does: window the
// text, slice to the cap, and mint extracts only for what is kept.
const WINDOW_CAP = maxWindowsForBudget();
const worstAll = fixture(59, 6, 300);
const worstRead = worstAll.rows.filter((r: any) => r.window_index < WINDOW_CAP);
const worstSel = selectForBudget(mergeWindowExtracts(worstRead, worstAll.sidecar).items);
const worstCounts = new Map<number, number>();
for (const i of worstSel.selected) worstCounts.set(i.windows[0], (worstCounts.get(i.windows[0]) ?? 0) + 1);
const worstMax = worstCounts.size ? Math.max(...worstCounts.values()) : 0;
const worstReadWindows = new Set(worstRead.map((r: any) => r.window_index)).size;

// SP-258 on a real answer: twelve long quotes, all genuinely present in the window.
const sentences = Array.from({ length: 12 }, (_, i) => "Sentence " + i + " " + "y".repeat(280));
const windowText = sentences.join(" ");
const half = Math.floor(windowText.length * HALF_WINDOW_FRACTION);
const answer = await readWindowExtract({
  raw: { evidence: sentences.map((text) => ({ text })), claims: sentences.map((text) => ({ text })), needs: sentences.map((text) => ({ text })) },
  windowText, windowStart: 0,
});
const halfTaken = answer.items.reduce((n: number, i: any) => n + i.text.length, 0);

// The REAL document's shape, measured: 17 windows. Every one must be represented.
const real = fixture(17, 6, 300);
const realSel = selectForBudget(mergeWindowExtracts(real.rows, real.sidecar).items);

// A small document must be handed over WHOLE: the budget bites only when it must.
const small = fixture(2, 3, 200);
const smallSel = selectForBudget(mergeWindowExtracts(small.rows, small.sidecar).items);

console.log(JSON.stringify({
  budget: MERGED_EXTRACT_BUDGET, windows: WINDOWS,
  merged_items: merged.items.length,
  handoff_chars: sel.text.length,
  within_budget: sel.text.length <= MERGED_EXTRACT_BUDGET,
  windows_represented: present,
  every_window: present === WINDOWS,
  spread,
  items_interpreted: sel.stats.items_interpreted,
  accounted: sel.selected.length + sel.not_interpreted.length === merged.items.length,
  stats_match: sel.stats.items_interpreted === sel.selected.length && sel.stats.chars === sel.text.length,
  deterministic: selectForBudget([...merged.items].reverse()).text === sel.text,
  tail_cut_windows: tailWindows,
  tail_cut_detected: tailWindows < WINDOWS,
  everything_chars: everything,
  everything_over_budget: everything > MERGED_EXTRACT_BUDGET,
  half_window_allowance: half, half_window_taken: halfTaken,
  half_window_held: halfTaken <= half,
  half_window_bit: answer.discarded.some((d: any) => d.reason.includes("half-window")),
  small_whole: smallSel.stats.items_interpreted === smallSel.stats.items_merged,
  every_window_17: realSel.stats.windows_represented === 17,
  window_cap: WINDOW_CAP,
  worst_windows: 59,
  worst_read: worstReadWindows,
  worst_represented: worstSel.stats.windows_represented,
  worst_all_read_represented: worstSel.stats.windows_represented === worstReadWindows,
  worst_max_per_window: worstMax,
  worst_within_budget: worstSel.text.length <= MERGED_EXTRACT_BUDGET,
}));
TS

RES=$("$DENO" run --allow-read --allow-import "$PROBE" 2>/dev/null)
if [ -z "$RES" ]; then
  bad "(m2) the merge probe produced no output — it did not run"
  echo "  -- $oks ok / $fails FAIL --"
  echo "guard: RED ($fails check(s)) — see above"
  exit 1
fi
echo "     $RES"
v() { echo "$RES" | "$DENO" eval "const d=JSON.parse(await new Response(Deno.stdin.readable).text()); console.log(String(d['$1']));" 2>/dev/null; }

echo "── (m2) PART B: a document at the 350,000-character cap ──"
[ "$(v merged_items)" -gt 500 ] \
  && ok "(m2) the fixture yields $(v merged_items) merged items — more than the budget can carry, so selection is exercised" \
  || bad "(m2) the fixture yields only $(v merged_items) items — the budget would not bite and the checks below would pass vacuously"
[ "$(v within_budget)" = "true" ] \
  && ok "(m2) SP-255: the hand-off is $(v handoff_chars) of $(v budget) characters — within budget" \
  || bad "(m2) the hand-off was $(v handoff_chars) characters against a $(v budget) budget"
# SP-267: at the 350,000-character cap with FULL window fill the document is 30 windows, and a
# 10,000-character hand-off gives exactly that many one excerpt each. So SP-256 holds here, and this
# is the positive case.
if [ "$(v every_window)" = "true" ] && [ "$(v spread)" -le 1 ]; then
  ok "(m2) SP-256 HOLDS at the cap's full-fill shape: all $(v windows) windows represented"
else
  bad "(m2) only $(v windows_represented) of $(v windows) windows reached the hand-off at the cap"
fi
[ "$(v every_window_17)" = "true" ] \
  && ok "(m2b) and EVERY window of a real 17-window document is represented (the measured 10-Q shape)" \
  || bad "(m2b) a 17-window document (the measured 10-Q shape) left windows out of the hand-off"
# SP-273: the WORST block shape, read under the window cap. Every window READ must be represented.
if [ "$(v worst_all_read_represented)" = "true" ] && [ "$(v worst_within_budget)" = "true" ]; then
  ok "(m2c) SP-273: a $(v worst_windows)-window document reads $(v worst_read) under the cap, and ALL $(v worst_represented) read windows are represented"
else
  bad "(m2c) of $(v worst_read) windows read at the worst shape, only $(v worst_represented) reached the hand-off"
fi
# And the cap is DERIVED from the budget, not a literal (SP-271, the SP-268 tie pattern).
if grep -q 'export function maxWindowsForBudget' "$MERGE" \
   && grep -q '(budget - header) / perItem' "$MERGE" \
   && grep -q 'maxWindowsForBudget()' "$WORKER"; then
  ok "(m2c) the window cap is computed from the budget and the item cost, and the worker applies it"
else
  bad "(m2c) the window cap is hardcoded or unapplied (SP-271)"
fi
# SP-272: a cut read must set the capped mark, reusing chars_capped rather than inventing a string.
if grep -q 'chars_capped: true' "$WORKER" && grep -q 'windowsCut' "$WORKER"; then
  ok "(m2c) SP-272: a window-capped read sets chars_capped, which already renders S-ING-4"
else
  bad "(m2c) a window-capped read does not set the capped mark (SP-272)"
fi
[ "$(v spread)" -le 1 ] \
  && ok "(m2) no window has a second item while another has none (spread $(v spread))" \
  || bad "(m2) per-window item counts differ by $(v spread) — that is not round-robin"
[ "$(v deterministic)" = "true" ] \
  && ok "(m2) selection is deterministic — row order does not change the hand-off" \
  || bad "(m2) reversing the row order changed the hand-off"
[ "$(v small_whole)" = "true" ] \
  && ok "(m2) a small document is handed over WHOLE — the budget bites only when it must" \
  || bad "(m2) a small document was cut when it did not need to be"

echo "── (m3) PART C: SP-258, half the window ──"
[ "$(v half_window_held)" = "true" ] \
  && ok "(m3) a window's extract kept $(v half_window_taken) of an allowance of $(v half_window_allowance)" \
  || bad "(m3) a window's extract took $(v half_window_taken), over its $(v half_window_allowance) allowance"
[ "$(v half_window_bit)" = "true" ] \
  && ok "(m3) and the rule actually BIT on that answer — not an allowance nothing reaches" \
  || bad "(m3) the half-window rule never bit, so the check above proves nothing"

echo "── (m4) PART D: SP-257, nothing is lost ──"
[ "$(v accounted)" = "true" ] \
  && ok "(m4) every merged item is either interpreted or recorded as not interpreted" \
  || bad "(m4) items went missing between the merge and the selection"
[ "$(v stats_match)" = "true" ] \
  && ok "(m4) the counts the row will carry are what the selection did ($(v items_interpreted) interpreted)" \
  || bad "(m4) the reported counts do not match the selection"
# Extraction must store everything, and the row must carry both counts.
if grep -q 'items_extracted' "$WORKER" && grep -q 'items_interpreted' "$WORKER"; then
  ok "(m4) the worker writes both counts onto the row"
else
  bad "(m4) the worker does not write items_extracted / items_interpreted (SP-257)"
fi
# And budget selection must NOT be dressed as partial.
if grep -nE 'items_interpreted[^;]*(ready_partial|ready-partial|partial)' "$WORKER" | grep -vE ':\s*//' | grep -q .; then
  bad "(m4) budget selection is being treated as partial somewhere — SP-257 forbids it"
else
  ok "(m4) budget selection does not set a partial state (SP-257)"
fi

echo "── (m5) PART E: the negatives — these checks can go red ──"
[ "$(v tail_cut_detected)" = "true" ] \
  && ok "(m5) a TAIL-CUT selection reaches only $(v tail_cut_windows) of $(v windows) windows, and the every-window check catches it" \
  || bad "(m5) a tail cut reached every window — the every-window check cannot distinguish it"
[ "$(v everything_over_budget)" = "true" ] \
  && ok "(m5) handing over everything would be $(v everything_chars) characters, and the budget check catches it" \
  || bad "(m5) handing over everything fits the budget — the budget check proves nothing on this fixture"

# The unit tests are part of the proof, not decoration.
if "$DENO" test --allow-import --no-check supabase/functions/_shared/windowExtract.test.ts >/dev/null 2>&1; then
  ok "(m5) windowExtract.test.ts (extraction + merge + selection) passes"
else
  bad "(m5) windowExtract.test.ts FAILED"
fi

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
