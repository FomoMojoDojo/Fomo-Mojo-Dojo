#!/usr/bin/env bash
# A CONTRADICTED ATTRIBUTE IS NEVER A STRENGTH (BRIEF-17 commit 2: SP-328..SP-330; 2026-11-13).
#
# THE RULES
#   SP-328  the attribute judge is three-valued (corroborated | self_reported | contradicted), schema-
#           bounded, and `contradicted` shares the claim judge's ONE definition (not a fork).
#   SP-329  a `contradicted` attribute is NOT rendered in the "What makes you different" list on any
#           surface; on the positioning panel it renders under S-POS-1 ("Where outside voices
#           disagree"). An editor that shows only the strengths saves the contradicted items along.
#   SP-330  ComparePanel's differentiators row reads the judged state, not a hard-coded "No outside data".
#
# HOW: (s1) every file under src/views, src/components and src/pages that reads `.unique_attributes`
# must route the list through src/lib/attributeVerdict.ts, or sit on the allowlist below with the reason
# it renders no list; (s2) the render tests mount the surfaces with a contradicted attribute planted and
# assert it is absent from the strengths and present under S-POS-1; (s3) the judge's schema and shared
# definition. No model is called; nothing is written.
#
# Read the printed verdict, not only the exit code (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."
oks=0; fails=0
ok()  { echo "  ok   $*"; oks=$((oks+1)); }
bad() { echo "  FAIL $*"; fails=$((fails+1)); }
J="supabase/functions/_shared/claimProvenance.ts"

# Files that read the list but render no list of it — each with its reason.
ALLOW=(
  "src/views/Opportunities/index.tsx"                       # passes the list as context to checkpoint offers; renders none
  "src/views/Positioning/PositioningInspectPanel.tsx"       # counts presence (length) only
  "src/views/client/workshop/tabs/OutsidePanels.tsx"        # counts presence (length) only
  "src/views/client/firstReadPreview/useFirstReadPreviewData.ts" # the public read's OWN lines, not canvas attributes
)

echo "── (s1) every surface that reads the attribute list filters it ──"
N=0
while read -r f; do
  [ -z "$f" ] && continue
  N=$((N+1))
  skip=0; for a in "${ALLOW[@]}"; do [ "$f" = "$a" ] && skip=1; done
  if [ "$skip" = 1 ]; then ok "(s1) $f — allowlisted, renders no list"; continue; fi
  grep -qE 'strengthAttributes|isContradictedAttribute' "$f" \
    && ok "(s1) $f routes the list through attributeVerdict" \
    || bad "(s1) $f reads unique_attributes and does not filter contradicted attributes (SP-329)"
done < <(grep -rlE '\.unique_attributes\b|unique_attributes\?\.' src/views src/components src/pages | grep -vE '\.test\.tsx?$' | sort)
[ "$N" -ge 9 ] && ok "(s1) $N reader(s) examined — the scan found the known surfaces" || bad "(s1) only $N reader(s) found — the scan is vacuous"
for a in "${ALLOW[@]}"; do
  [ -f "$a" ] || bad "(s1) allowlisted file $a no longer exists — prune the allowlist"
done

echo "── (s2) the surfaces, mounted with a contradicted attribute planted ──"
OUT=$(npx vitest run src/lib/attributeVerdict.test.ts src/views/client/workspace/PositioningPage.contradicted.test.tsx \
  src/views/client/workshop/tabs/ComparePanel.attributes.test.tsx src/views/client/workspace/workspaceStrings.parity.test.ts 2>&1)
echo "$OUT" | grep -qE 'Test Files +4 passed' && echo "$OUT" | grep -qE 'Tests +[0-9]+ passed' && ! echo "$OUT" | grep -qE '[0-9]+ failed' \
  && ok "(s2) strengths filter, workspace page, ComparePanel and S-POS-1 parity: $(echo "$OUT" | grep -E 'Tests +' | tr -s ' ')" \
  || bad "(s2) render tests: $(echo "$OUT" | grep -E 'Tests +|FAIL' | head -5 | tr '\n' ' ')"

echo "── (s3) the judge: three values, bounded, one shared definition ──"
grep -q 'evidence_status: { type: "string", enum: \["corroborated", "self_reported", "contradicted"\] },' "$J" \
  && ok "(s3) the attribute schema offers corroborated | self_reported | contradicted" || bad "(s3) the attribute schema is not three-valued"
[ "$(grep -c 'contradictedDefinition(' "$J")" -ge 3 ] && ! grep -q "independent evidence cuts against the claim's core fact" "$J" \
  && ok "(s3) both judges use the one contradictedDefinition() — no forked wording" || bad "(s3) the contradicted definition is forked or missing"
grep -q 'if (status !== "self_reported" && basis.length === 0) status = "self_reported";' "$J" \
  && ok "(s3) a contradicted verdict with no valid citation downgrades, like corroborated" || bad "(s3) contradicted is not held to the citation rule"
grep -q 'maxItems: 12,' "$J" && ok "(s3) the verdict list is bounded (maxItems 12)" || bad "(s3) the verdict list is unbounded"

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
