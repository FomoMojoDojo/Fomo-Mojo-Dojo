#!/usr/bin/env bash
# ── R5 SOURCING GUARD (operator rulings 2026-10-16 / built 2026-10-22) ──────────────────────────────────────────────────
#
# probe: scripts/guards/r5-sourcing-probe.ts — fixtures only (no live company row), no network, no model.
#
#   r1  only verified page words source a specific: a figure stated only in a signal's claim_text (the shape of
#       Spectrum's 492bda10, whose cited text the search tool cut off) is unsourced; what the excerpt states sources; an
#       unverified excerpt reads as nothing; every builder of row text (pool, re-read, PASS 2 candidates, slots) reads
#       through rowTextOf with the verification mark
#   r2  the gap beat says when the comparison has not run: Spectrum's shape is not_compared (vitest
#       gapNotCompared.test.tsx), the hook derives the state through gapIntegrityState, the signed string renders
#   r3  matching folds case, possessives and punctuation-only differences; word boundaries still hold
#   r4  N1o (2026-10-22): a name opening the line or a sentence is also tested with its first word removed; it passes
#       only if that shortened name is in a cited row ('Provide Anytime Upgrade' on 950e6c89); otherwise still refused
#
# Plants (each injected live, RED with the measured value moved, restored md5-identical, GREEN):
#   U1  ROW_TEXT_COLUMNS.signal back to [claim_text, evidence_excerpt]   => r1 unsourced ["37","45"] → []
#   U2  gapIntegrityState's not_compared branch removed                 => r2 vitest: Spectrum's shape renders looked-none
#   U3  sourcedIn without the fold (a raw substring test)               => r3 possessive / case_only / name_case → false
#   O1  the N1o filter removed from unsourcedNames                     => r4 opener_verb_passes false
#   O2  openerShortenedSourced passes any opener (negative plant)        => r4 negative_refused ''
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
fail() { echo "FAIL step $1: $2"; exit 1; }
J=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/r5-sourcing-probe.ts 2>/dev/null | tail -1)
q() { echo "$J" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
[ -n "$J" ] || fail probe "no output"
[ "$(q "d['r1']==dict(columns=['evidence_excerpt'],claim_in_text=False,unsourced=['37','45'],excerpt_sources=True,unverified_reads_nothing=True,wired=True)")" = True ] || fail r1 "R5 sourcing: $(q "d['r1']")"
echo "r1. a figure only in claim_text is unsourced (45, 37); the excerpt's own words source; an unverified excerpt reads as nothing; every builder wired"
V=$(npx vitest run src/views/client/firstReadPreview/gapNotCompared.test.tsx 2>&1 | sed -e 's/\x1b\[[0-9;]*m//g' | grep -E '^\s+Tests ' || true)
echo "$V" | grep -q 'passed' && ! echo "$V" | grep -q 'failed' || fail r2 "gapNotCompared.test.tsx: $V"
[ "$(q "d['r2']==dict(hook_uses_state=True,string_signed=True,branch=True)")" = True ] || fail r2 "gap wiring: $(q "d['r2']")"
echo "r2. gap beat: Spectrum's shape is not_compared and renders the signed string ($(echo "$V" | xargs)); the hook derives it"
[ "$(q "d['r3']==dict(possessive=True,case_only=True,punct=True,boundary=True,figure_in_token=True,name_case=True)")" = True ] || fail r3 "fold: $(q "d['r3']")"
echo "r3. matching folds case, possessives and punctuation; a name keeps word boundaries; a figure inside a token (5G) still counts"
[ "$(q "d['r4']==dict(opener_verb_passes=True,negative_refused='Provide Turbo Upgrade',mid_sentence_refused='Provide Anytime Upgrade')")" = True ] || fail r4 "N1o: $(q "d['r4']")"
echo "r4. N1o: 'Provide Anytime Upgrade' passes on a row stating 'Anytime Upgrade'; 'Provide Turbo Upgrade' and a mid-sentence run stay refused"
echo "GUARD OK"
