#!/usr/bin/env bash
# THE DIAGNOSE DATA LAYER — DF2 / DF7 / CV4 (signed 2026-10-01).
#
# WHY THIS GUARD EXISTS. This module has no screen, so nothing about it is visible. Everything that
# can go wrong is a quiet substitution: the model's own prose counted as a source, our interviewer
# counted as the client, voice_class quietly classing instead of excluding, the quality-picked run
# creeping back in, the unclassed count dropped because it looked untidy, or the signed outage
# string copied instead of imported and then drifting. Each is a check below, each shown RED under a
# named plant and GREEN after, with the restore proven by md5.
#
# Checks:
#   (a) an 'analysis' signal is never counted as a source.
#   (b) a speaker_side 'ours' item is never counted (excluded, and NOT as unclassed).
#   (c) voice_class is read for nothing except excluding 'analysis'.
#   (d) preferredRun / pickPreferredRun / usePublicBaseline never imported in src/lib/diagnose.
#   (e) mojo_scores / mojoScore/projections never imported in src/lib/diagnose.
#   (f) OutsideEmptyState never imported, and the text "none found" never present, in src/lib/diagnose.
#   (g) the outage string is IMPORTED from workspaceNav, never copied.
#   (h) the unclassed count is never dropped when it is above 0.
#   (i) the live Edgewood figures (scripts/guards/diagnose-data-check.sh).
#
# Plants (each undone by the EXIT trap, which then re-verifies by md5):
#   PLANT=analysiscounts   'analysis' counted instead of excluded                  => (a) red
#   PLANT=ourscounts       speaker_side 'ours' counted as team                     => (b) red
#   PLANT=voiceclasses     voice_class used to class client_voice as team          => (c) red
#   PLANT=preferredrun     loaders imports preferredRun                            => (d) red
#   PLANT=mojoscores       loaders imports mojoScore/projections                   => (e) red
#   PLANT=nonefound        the "none found" sentence appears in the module         => (f) red
#   PLANT=copiedstring     outageLine hard-codes the signed string                 => (g) red
#   PLANT=dropunclassed    the unclassed count is zeroed out                       => (h) red
#   PLANT=figuredrift      the Edgewood expected figure is changed                 => (i) red
#   PLANT=struckcounted    the check stops excluding struck claims                 => (i) red
#
# Run:  bash scripts/guards/diagnose-data-guard.sh
#       PLANT=ourscounts bash scripts/guards/diagnose-data-guard.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="$HERE/src/lib/diagnose"
SRC="$DIR/sourceClass.ts"
RUN="$DIR/latestRun.ts"
OUT="$DIR/outageLine.ts"
LOAD="$DIR/loaders.ts"
CHECK="$HERE/scripts/guards/diagnose-data-check.sh"
PLANT="${PLANT:-}"
fails=0
ok()  { printf '  ok   (%s) %s\n' "$1" "$2"; }
bad() { printf '  FAIL (%s) %s\n' "$1" "$2"; fails=$((fails+1)); }

for f in "$SRC" "$RUN" "$OUT" "$LOAD" "$CHECK"; do
  [ -f "$f" ] || { echo "guard: FAIL missing $f"; exit 1; }
done

md5_of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }
MANIFEST="$(mktemp -t diagnose-data-guard)"
TOUCHED=""
for f in "$DIR"/*.ts "$CHECK"; do printf '%s  %s\n' "$(md5_of "$f")" "$f" >> "$MANIFEST"; done

restore() {
  printf '%s\n' "$TOUCHED" | while IFS= read -r f; do
    [ -n "$f" ] && [ -f "$f.guardbak" ] && mv -f "$f.guardbak" "$f"
  done
  local drift=0
  while read -r want path; do
    [ -n "$path" ] || continue
    [ "$(md5_of "$path")" = "$want" ] || drift=1
  done < "$MANIFEST"
  local strays; strays="$(ls "$DIR"/*.guardbak "$HERE/scripts/guards"/*.guardbak 2>/dev/null | wc -l | tr -d ' ')"
  rm -f "$MANIFEST"
  if [ "$drift" = 0 ] && [ "$strays" = 0 ]; then
    ok "restore" "every file in the manifest is md5-identical to the start of the run; no .guardbak left behind"
  else
    bad "restore" "a plant outlived the run (md5 drift=$drift strays=$strays) — FIX BY HAND"
  fi
}
trap restore EXIT

plant() { cp -p "$1" "$1.guardbak"; TOUCHED="$TOUCHED
$1"; perl -0777 -pi -e "$2" "$1"; }

case "$PLANT" in
  analysiscounts) plant "$SRC" 's{if \(String\(s\.voice_class \?\? ""\) === "analysis"\) continue; // not a source}{/* plant: analysis counted */}' ;;
  ourscounts)     plant "$SRC" 's{if \(side === "ours"\) return EMPTY_SOURCE_COUNTS;}{if (side === "ours") return { ...EMPTY_SOURCE_COUNTS, team: 1 };}' ;;
  voiceclasses)   plant "$SRC" 's{(let unclassed = 0;)}{$1\n  let team = 0;}; s{(    unclassed \+= 1;)}{    if (String(s.voice_class ?? "") === "client_voice") { team += 1; continue; }\n$1}' ;;
  preferredrun)   plant "$LOAD" 's{(import \{ supabase \} from "\@/integrations/supabase/client";)}{$1\nimport { usePublicBaseline } from "\@/hooks/usePublicBaseline";}' ;;
  mojoscores)     plant "$LOAD" 's{(import \{ supabase \} from "\@/integrations/supabase/client";)}{$1\nimport { computeReachableScore } from "\@/lib/mojoScore/projections";}' ;;
  nonefound)      plant "$OUT"  's{(export function diagnoseOutageLine)}{export const EMPTY_NOTE = "Scanned — none found.";\n$1}' ;;
  copiedstring)   plant "$OUT"  's{return searchUnavailableLine\(outageRun\.created_at\);}{return "Search couldn\x27t be reached — nothing was checked · " + outageRun.created_at;}' ;;
  dropunclassed)  plant "$SRC" 's{(export function addSourceCounts\(a: SourceCounts, b: SourceCounts\): SourceCounts \{\n  return \{)}{$1\n    __dropped: 0,}; s{    unclassed: a\.unclassed \+ b\.unclassed,}{    unclassed: 0,}' ;;
  figuredrift)    plant "$CHECK" 's{\[ "\$WORLD" = "31" \]}{[ "$WORLD" = "99" ]}' ;;
  # Gate A in one line: drop the struck exclusion from the live query and the triad reads 33/23
  # instead of 31/12 — eleven team sources that a withdrawn claim should not be contributing.
  struckcounted)  plant "$CHECK" "s{and status <> 'struck'}{}g" ;;
  "") : ;;
  *) echo "guard: FAIL unknown PLANT=$PLANT"; exit 1 ;;
esac

# ── behaviour, proven by running the rule's own unit test ─────────────────────────────────────────
# There is no tsx in this project, and a grep cannot prove a rule HOLDS — only that a token is
# present. So each behavioural check runs the one unit test that states the rule, by name. A plant
# that breaks the rule turns its own test red, which is the proof.
rule() { # rule <letter> <test-name-substring> <sentence>
  if npx vitest run "$DIR" -t "$2" --reporter=dot --silent > /tmp/dg.$$ 2>&1 && ! grep -qiE 'No test files found|Tests +0 passed' /tmp/dg.$$; then
    ok "$1" "$3"
  else
    bad "$1" "$3 — the rule's own test fails: $(grep -oE '[0-9]+ failed' /tmp/dg.$$ | head -1)"
  fi
  rm -f /tmp/dg.$$
}
rule a "ANALYSIS-ONLY FINDING HAS NO SOURCES" "an analysis-only item has NO sources — 'analysis' is excluded, not counted"
rule b "ours' ITEM IS EXCLUDED, NOT UNCLASSED" "a speaker_side 'ours' item counts as nothing — excluded, and not as unclassed"
rule c "voice_class NEVER classes"            "voice_class classes nothing — it is read only to exclude 'analysis'"
rule h "keeps unclassed separate"             "the unclassed count survives a roll-up — never dropped when above 0"

# ── CODE, not prose. These files deliberately NAME what they must not use, in their headers. A bare
# grep would fire on that documentation, so every token check below runs on comment-stripped source
# and on module files only (a test may legitimately quote a forbidden name in an assertion). ──────
code_of() { # code_of <file...> -> source with // and /* */ comments removed
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g' "$@"
}
MODULES="$(ls "$DIR"/*.ts | grep -v '\.test\.ts$')"
# shellcheck disable=SC2086
CODE="$(code_of $MODULES)"

hit() { printf '%s' "$CODE" | grep -qE "$1"; }

# ── (c2) voice_class never reaches the selection or wording modules ───────────────────────────────
if code_of "$RUN" "$OUT" | grep -q 'voice_class'; then
  bad "c2" "voice_class leaked into latestRun.ts or outageLine.ts"
else
  ok "c2" "voice_class appears in no selection or wording module"
fi

# ── (d) the quality pick never returns ────────────────────────────────────────────────────────────
if hit 'preferredRun|pickPreferredRun|usePublicBaseline'; then
  bad "d" "src/lib/diagnose CODE references the quality-picked run"
else
  ok "d" "no preferredRun / pickPreferredRun / usePublicBaseline in src/lib/diagnose code"
fi

# ── (e) no stored score, no existing projections ──────────────────────────────────────────────────
if hit 'mojo_scores|mojoScore/projections'; then
  bad "e" "src/lib/diagnose CODE reaches for mojo_scores or projections.ts"
else
  ok "e" "no mojo_scores and no mojoScore/projections in src/lib/diagnose code"
fi

# ── (f) the empty-state component and its sentence stay out ───────────────────────────────────────
if hit 'OutsideEmptyState' || hit 'none found'; then
  bad "f" "OutsideEmptyState or the 'none found' sentence is present in src/lib/diagnose code"
else
  ok "f" "no OutsideEmptyState and no 'none found' sentence in src/lib/diagnose code"
fi

# ── (g) the signed string is imported, never copied ───────────────────────────────────────────────
imported=0; copied=0
grep -q 'searchUnavailableLine' "$OUT" && grep -q 'from "@/views/client/workspace/workspaceNav"' "$OUT" && imported=1
code_of "$OUT" | grep -q "nothing was checked" && copied=1
if [ "$imported" = "1" ] && [ "$copied" = "0" ]; then
  ok "g" "the outage line is imported from workspaceNav; the signed string is not copied into the code"
else
  bad "g" "outage string imported=$imported copied=$copied — it must be imported, never copied"
fi

# ── (i) the live Edgewood figures ─────────────────────────────────────────────────────────────────
if bash "$CHECK" > /tmp/diagnose-data-check.$$ 2>&1; then
  ok "i" "the live read-only check passes (Edgewood figures, run selection, outage verdicts, role map)"
else
  bad "i" "the live read-only check FAILED:"
  sed 's/^/        /' /tmp/diagnose-data-check.$$
fi
rm -f /tmp/diagnose-data-check.$$

if [ "$fails" -eq 0 ]; then echo "guard: PASS"; else echo "guard: FAIL"; fi
[ "$fails" -eq 0 ]
