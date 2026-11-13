#!/usr/bin/env bash
# ── THE GUARD SWEEP — one runner, so the baseline is reproducible (SP-135, 2026-11-12) ───────────
#
# WHY THIS EXISTS. The sweep had no runner in the repo: it was reconstructed by hand each session,
# and the recorded baseline ("43 GREEN / 4 RED of 47") could not be derived from any file count
# anyone could reproduce — the glob, the exclusions and whether `deno` was on PATH all varied, and
# each variation moved the number. A baseline nobody can re-measure is not a baseline.
#
# TWO THINGS A SWEEP MUST GET RIGHT, both learned the hard way:
#
#   1. CLASSIFY ON BOTH SIGNALS. Until 2026-11-11 source-class-guard printed `guard: RED` and exited
#      0, so every exit-code-only sweep counted it GREEN. A guard that cannot go red in the sweep is
#      not a guard, so a run counts GREEN only on a zero exit AND a `GUARD OK` / `guard: PASS` line.
#
#   2. deno MUST BE ON PATH. interview-parser-guard runs `deno test` with a bare `deno`. Without it
#      every plant-based check reports "the proof is not green BEFORE the plant" and the guard reads
#      RED for an environment reason, which looks exactly like a code failure.
#
# SOURCE THE THREE ENV FILES FIRST, or the guards that name a non-admin caller abort rather than
# passing vacuously:
#   source backups/fr-login.env && source backups/fr-nonadmin.env && source backups/fr-member.env \
#     && bash scripts/guards-sweep.sh
#
# BASELINE (re-measured 2026-11-13 after Part B added ingest-partial-honesty-guard): 45 GREEN /
# 4 RED of 49, the four standing REDs being network-guard (n4, wants the read-only pf sudo entry),
# diagnose-data-guard (i), excerpt-blanking-guard (e6) and source-class-guard (c1). It was
# 44 / 4 of 48 with caller-authz-guard and 43 / 4 of 47 before either; the glob picks each new guard
# up with no edit here. NOTE: scripts/guards/fixtures/ holds generators, not guards, and is not
# swept — the glob is one level deep on purpose.
set -uo pipefail
cd "$(dirname "$0")/.."

# interview-parser-guard runs `deno test` bare; without deno on PATH it reads RED for no code reason.
export PATH="$HOME/.deno/bin:$PATH"

# ── EXCLUSIONS, each by name and each with its reason ────────────────────────────────────────────
is_excluded() {
  case "$1" in
    # U6-38: excluded from the session sweep by design; it passes standalone.
    interview-upload-path-guard.sh) return 0 ;;
    # SP-135: a helper that diagnose-data-guard invokes, never an independent sweep member — running
    # it here double-counts that guard's own failure as a second RED.
    diagnose-data-check.sh) return 0 ;;
    *) return 1 ;;
  esac
}

green=0; red=0; reds=""
for g in scripts/guards/*.sh; do
  n=$(basename "$g")
  is_excluded "$n" && continue
  out=$(bash "$g" 2>&1); code=$?
  if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -qE 'GUARD OK|guard: PASS'; then
    green=$((green+1))
  else
    red=$((red+1))
    verdict=$(printf '%s' "$out" | grep -E 'guard: RED|GUARD RED|guard: FAIL|FAIL' | head -1 | sed 's/^[[:space:]]*//')
    reds="$reds
  $n  (exit $code)  $verdict"
  fi
done

echo "GREEN=$green RED=$red TOTAL=$((green+red))"
if [ -n "$reds" ]; then echo "REDS:$reds"; fi
# The sweep itself always exits 0: the standing REDs are known and named above, and a non-zero exit
# here would make every session's ritual look broken. Read the printed verdict.
exit 0
