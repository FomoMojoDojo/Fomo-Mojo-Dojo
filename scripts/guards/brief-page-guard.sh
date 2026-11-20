#!/usr/bin/env bash
# ── BRIEF PAGE GUARD (SP-442 / SP-424 / SP-445 / SP-446 / SP-449, operator brief 2026-11-19) ─────────
#
# The Brief is the first page MojoMap builds for a conversation out of its own stored rows, so the
# risks are that a number on it is NOT from a row, that a rule is restated on it and drifts from the
# counting authority, or that a question shown as "live" is history.
#
#   b1  the page reads the ONE open-question list (useFirstReadOpenQuestions) and names no table itself
#   b2  that list is LIVE-ONLY and the superseded counter is its exact complement — the footer's two
#       numbers cannot overlap and cannot both miss a row
#   b3  live, for Charter: live + superseded = every row in the table, so the footer accounts for all
#   b4  no counting rule is restated on the page or in its band module — the merger date and the bar
#       exist only in src/lib/needEvidenceCounting.ts
#   b5  the signed <title> is set, through the one helper, and restored on unmount
#   b6  the route is behind the workspace's admin gate, the tile is operatorOnly, and the page's own
#       default render with no operator context is the absent state
#   b7  the Brief's quotes go through the masked quote path, like the review group's
#   b8  every company-scoped read on the Brief is PAGED and the signal read is CHUNKED. Both were real
#       defects: unpaged, PostgREST's max_rows=1000 turned Charter's 4,950 labels into 3 hotspots and
#       12 thin spots instead of 11 and 4; unchunked, id=in.(330 ids) is a ~12 KB request line and the
#       fetch failed outright. The data check below keeps this NON-VACUOUS — it fails if no company
#       has more than one page, because then the grep would prove nothing
#
# Plants (injected live, RED, restored md5-identical, GREEN):
#   P1  flip the open-question read off status='live'      => b2 FAILED
#   P2  restate COX_MERGER_DATE inside BriefPage.tsx       => b4 FAILED
#   P3  drop fetchAllRows from the need_evidence read      => b8 FAILED
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
CO=dd40ce2f-ff67-4111-bd3c-67943dde6717
BP=src/views/client/workspace/BriefPage.tsx
BS=src/lib/briefSections.ts
QH=src/hooks/useFirstReadOpenQuestions.ts
SH_=src/hooks/useSupersededQuestionCount.ts
NEC=src/lib/needEvidenceCounting.ts
fail() { echo "FAIL $1: $2"; echo "guard: RED"; exit 1; }
q() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

# b1 ── one question list, read through its one reader
grep -q 'useFirstReadOpenQuestions' "$BP" || fail b1 "$BP does not read the one open-question list"
grep -q 'first_read_open_questions' "$BP" && fail b1 "$BP names the questions table itself — it must go through the one reader" || true
echo "b1. the page reads the one open-question list and names no table of its own"

# b2 ── live-only, and the counter is its exact complement
grep -q "eq(\"status\", \"live\")" "$QH" || fail b2 "$QH no longer restricts the list to status='live'"
grep -q "neq(\"status\", \"live\")" "$SH_" || fail b2 "$SH_ does not count exactly the non-live rows"
echo "b2. the list is status='live' and the counter is neq('live') — exact complements"

# b3 ── live: the two numbers account for every row
LIVE=$(q "select count(*) from public.first_read_open_questions where company_id='$CO' and status='live'")
SUP=$(q "select count(*) from public.first_read_open_questions where company_id='$CO' and status<>'live'")
ALL=$(q "select count(*) from public.first_read_open_questions where company_id='$CO'")
[ "$((LIVE + SUP))" = "$ALL" ] || fail b3 "live $LIVE + superseded $SUP != $ALL rows"
echo "b3. Charter: $LIVE live + $SUP superseded = $ALL rows — the footer accounts for every one"

# b4 ── no counting rule is restated outside the counting module
for f in "$BP" "$BS" src/views/client/workspace/briefStrings.ts; do
  grep -q '2026-08-20' "$f" && fail b4 "$f restates the merger date — it lives in $NEC alone" || true
  grep -qE '=== 3|>= 3|=== 2 \|\| |BAR = ' "$f" && fail b4 "$f appears to restate the bar — import BAR_QUOTES / BAR_SITES" || true
done
grep -q 'COX_MERGER_DATE' "$NEC" || fail b4 "$NEC no longer holds the merger date"
grep -q 'BAR_QUOTES' "$BS" || fail b4 "$BS does not import the bar from the counting module"
echo "b4. the merger date and the bar live in $NEC alone; the band module imports them"

# b5 ── the signed title, through the one helper
grep -q 'workspaceDocumentTitle' "$BP" || fail b5 "$BP does not set the signed document title"
grep -q 'document.title = previous' "$BP" || fail b5 "$BP does not restore the previous title on unmount"
grep -q 'export function workspaceDocumentTitle' src/views/client/workspace/workspaceNav.ts \
  || fail b5 "the title helper is not in the register"
echo "b5. <title> is set through workspaceDocumentTitle and restored on unmount"

# b6 ── the gates
grep -q 'path="brief" element={<WorkspaceBriefPage />}' src/App.tsx || fail b6 "the brief route is not mounted in the workspace block"
grep -q 'operatorOnly: true' src/views/client/workspace/workspaceNav.ts || fail b6 "the Brief tile is not operatorOnly"
grep -q 'p.operatorOnly || Boolean(operator)' src/views/client/workspace/WorkspaceChart.tsx || fail b6 "the Tools strip does not apply the operatorOnly filter"
grep -q 'if (!operator)' "$BP" || fail b6 "$BP renders without checking for operator context"
grep -q 'WorkspaceAbsent what="brief"' "$BP" || fail b6 "$BP default render is not the absent state"
grep -q '"brief"' tests/workspace/f-no-operator-nodes.spec.ts tests/workspace/helpers.ts >/dev/null \
  || fail b6 "the brief route is not in the no-operator-node spec's route list"
echo "b6. route behind the workspace admin gate, tile operatorOnly, default render absent, and the route is in the (f) spec's list"

# b7 ── the Brief's quotes take the masked path
grep -q 'QuoteList' "$BP" || fail b7 "$BP does not render its quotes through QuoteList"
grep -q 'evidence_excerpt' "$BP" && fail b7 "$BP touches a stored excerpt directly" || true
echo "b7. the Brief's quotes go through QuoteList, the masked path"

# b8 ── paged and chunked, and the check is non-vacuous
BN=src/hooks/useBriefNeeds.ts
grep -q 'fetchAllRows' "$BN" || fail b8 "$BN does not page its reads — a count on a first page is a fabricated number"
for t in odi_needs need_evidence signals; do
  grep -qF "from(\"$t\")" "$BN" || fail b8 "$BN no longer reads $t"
done
# each read must SIT INSIDE a fetchAllRows call: fetchAllRows appears within the two lines above it
for t in odi_needs need_evidence signals; do
  LN=$(grep -nF "from(\"$t\")" "$BN" | head -1 | cut -d: -f1)
  sed -n "$((LN > 2 ? LN - 2 : 1)),${LN}p" "$BN" | grep -q 'fetchAllRows' \
    || fail b8 "the $t read in $BN is not inside a fetchAllRows call — it would return at most one page"
done
grep -q 'SIGNAL_ID_CHUNK = ' "$BN" || fail b8 "$BN does not chunk the signal id list"
CHUNK=$(grep -oE 'SIGNAL_ID_CHUNK = [0-9]+' "$BN" | grep -oE '[0-9]+')
[ "${CHUNK:-9999}" -le 100 ] || fail b8 "SIGNAL_ID_CHUNK is $CHUNK — too many ids for one request line"
BIG=$(q "select count(*) from (select company_id from public.need_evidence group by company_id having count(*) > 1000) t")
[ "${BIG:-0}" -ge 1 ] || fail b8 "no company has more than one page of need_evidence — this check would prove nothing"
MAXEV=$(q "select max(c) from (select count(*) c from public.need_evidence group by company_id) t")
echo "b8. all three Brief reads page through fetchAllRows and the signal read chunks at $CHUNK; $BIG company/companies exceed one page (largest $MAXEV labels), so the check is not vacuous"

echo "GUARD OK"
