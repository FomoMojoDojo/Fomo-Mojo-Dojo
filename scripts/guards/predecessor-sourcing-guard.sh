#!/usr/bin/env bash
# ── R5-P PREDECESSOR SOURCING GUARD (operator ruling 2026-10-22) ─────────────────────────────────────────────────────
#
# probe: scripts/guards/predecessor-sourcing-probe.ts — fixtures only (no live company row), no network, no model.
#
#   p1  a predecessor line whose specifics do not pass R5 against its own cited rows (Spectrum's 43542649 where_to_play
#       shape: "45 states" / "U.S." on rows that read "") is withheld: it reaches neither the prompt's still-sourced block
#       nor the stored still_sourced_lines; a sourced line still does
#   p2  continuity does not demand a withheld line: it is licensed, never a still-sourced drop
#   p3  generate-public-read passes the one withheld set to the prompt block, the stored lines and continuity
#
# Plants (each injected live, RED, restored md5-identical, GREEN):
#   W1  promptablePredecessorLines without the withheld filter   => p1 block_has_withheld true, stored gains where_to_play
#   W2  classifyContinuity without the withheld branch           => p2 dropped 1, still_sourced_drops 1
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
fail() { echo "FAIL step $1: $2"; exit 1; }
J=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/predecessor-sourcing-probe.ts 2>/dev/null | tail -1)
q() { echo "$J" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
[ -n "$J" ] || fail probe "no output"
[ "$(q "d['p1']==dict(withheld=True,sourced_kept=True,block_has_withheld=False,block_has_sourced=True,stored=['winning_aspiration'])")" = True ] || fail p1 "prompt: $(q "d['p1']")"
echo "p1. an R5-failing predecessor line (45 states, U.S.) is withheld from the prompt and the stored lines; a sourced line is shown"
[ "$(q "d['p2']==dict(dropped=0,licensed=1,still_sourced_drops=0)")" = True ] || fail p2 "continuity: $(q "d['p2']")"
echo "p2. continuity licenses the withheld line; no still-sourced drop"
[ "$(q "d['p3']==dict(prompt=True,stored=True,continuity=True,gate=True)")" = True ] || fail p3 "wiring: $(q "d['p3']")"
echo "p3. generate-public-read passes one withheld set to the prompt block, the stored lines and continuity"
echo "GUARD OK"
