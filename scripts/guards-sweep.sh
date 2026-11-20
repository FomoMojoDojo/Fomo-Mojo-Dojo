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
# BASELINE (2026-11-20, after SP-460/SP-465/SP-467 added pattern-lane-guard, pattern-citation-guard and
# proposed-need-isolation-guard): 75 GREEN / 3 RED of 78. The THREE standing REDs are network-guard (n4,
# wants the read-only pf sudo entry), diagnose-data-guard (i) and source-class-guard (c1) —
# excerpt-blanking-guard has been GREEN since 2026-11-19 and is no longer one of them.
# Earlier (operator ruling R2, 2026-11-18): 66 GREEN / 4 RED of 70, members listed in
# scripts/guards-sweep.members. Earlier (2026-11-13, after I-1 added ingest-queue-guard): 46 GREEN / 4 RED of 50.
# Part B's ingest-partial-honesty-guard made it 45 / 4 of 49. The four standing REDs are
# network-guard (n4, wants the read-only pf sudo entry),
# diagnose-data-guard (i), excerpt-blanking-guard (e6) and source-class-guard (c1). It was
# 44 / 4 of 48 with caller-authz-guard and 43 / 4 of 47 before either; a new guard must also be added to
# scripts/guards-sweep.members, or the sweep fails on membership. NOTE: scripts/guards/fixtures/ holds generators, not guards, and is not
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
    # SP-185b: the on-demand half of the ingest-queue proof. It uploads real files and lets the
    # server run REAL local analyses on them, one after another, so it takes many minutes and burns
    # local model time — far outside a session sweep's budget. Its fast sibling,
    # ingest-queue-guard.sh, is IN the sweep and covers the static, SQL and caller-gate halves.
    # Run this one by hand:  bash scripts/guards/ingest-queue-ondemand-guard.sh
    ingest-queue-ondemand-guard.sh) return 0 ;;
    *) return 1 ;;
  esac
}

# ── MEMBERSHIP (operator ruling R2, 2026-11-18) ─────────────────────────────────────────────────
# The sweep used to run whatever the glob found and compare the total against nothing, so a deleted guard
# file or a new exclusion silently lowered TOTAL by one. The expected members are committed in
# scripts/guards-sweep.members; the sweep checks the glob against it BEFORE running anything and the
# results against it AFTER, and exits 2 on any difference (missing or extra). Red guards are unchanged:
# they are named below and the sweep still exits 0 for them.
# SWEEP_GUARD_DIR exists for the membership plant only (a copy of the glob set with one name removed).
GUARD_DIR="${SWEEP_GUARD_DIR:-scripts/guards}"
MEMBERS_FILE="scripts/guards-sweep.members"
expected=$(grep -vE '^[[:space:]]*(#|$)' "$MEMBERS_FILE" | LC_ALL=C sort)
found=$( { for g in "$GUARD_DIR"/*.sh; do n=$(basename "$g"); is_excluded "$n" || echo "$n"; done; echo edgewood-unchanged; } | LC_ALL=C sort)
member_diff() {  # $1 = the set to compare against the list; prints "missing: x" / "extra: y", nothing when equal
  { comm -23 <(printf '%s\n' "$expected") <(printf '%s\n' "$1") | sed 's/^/  missing: /'
    comm -13 <(printf '%s\n' "$expected") <(printf '%s\n' "$1") | sed 's/^/  extra: /'; } | grep -v '^  [a-z]*: $' || true
}
pre=$(member_diff "$found")
if [ -n "$pre" ]; then
  echo "MEMBERS: FAIL the guards found differ from $MEMBERS_FILE ($(printf '%s\n' "$expected" | wc -l | tr -d ' ') expected):"
  printf '%s\n' "$pre"
  echo "nothing was run"
  exit 2
fi

green=0; red=0; reds=""; ran=""
# D4 (2026-11-16): Edgewood is a real client and no guard may change it. Snapshot every row it owns
# before the sweep and compare after; the comparison counts as one more sweep member.
EW_SNAP=$(mktemp -t edgewood-sweep)
bash scripts/edgewood-unchanged.sh snapshot "$EW_SNAP" >/dev/null || echo "edgewood-unchanged: snapshot FAILED"
for g in "$GUARD_DIR"/*.sh; do
  n=$(basename "$g")
  is_excluded "$n" && continue
  out=$(bash "$g" 2>&1); code=$?
  ran="$ran
$n"
  if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -qE 'GUARD OK|guard: PASS'; then
    green=$((green+1)); echo "  GREEN  $n"
  else
    echo "  RED    $n  (exit $code)"
    red=$((red+1))
    verdict=$(printf '%s' "$out" | grep -E 'guard: RED|GUARD RED|guard: FAIL|FAIL' | head -1 | sed 's/^[[:space:]]*//')
    reds="$reds
  $n  (exit $code)  $verdict"
  fi
done

ew_out=$(bash scripts/edgewood-unchanged.sh compare "$EW_SNAP" 2>&1); ew_code=$?
# E1: the comparison's own self-test (an added column cannot move it; a changed value does) runs every sweep.
st_out=$(bash scripts/edgewood-unchanged.sh selftest 2>&1); st_code=$?
if [ "$st_code" -ne 0 ]; then ew_code=$st_code; ew_out="$ew_out $st_out"; fi
rm -f "$EW_SNAP"
ran="$ran
edgewood-unchanged"
if [ "$ew_code" -eq 0 ] && printf '%s' "$ew_out" | grep -q 'guard: PASS'; then
  green=$((green+1)); echo "  GREEN  edgewood-unchanged"
else
  echo "  RED    edgewood-unchanged  (exit $ew_code)"
  red=$((red+1))
  reds="$reds
  edgewood-unchanged (sweep before/after)  (exit $ew_code)  $(printf '%s' "$ew_out" | tr '\n' ' ' | head -c 300)"
fi

echo "GREEN=$green RED=$red TOTAL=$((green+red))"
if [ -n "$reds" ]; then echo "REDS:$reds"; fi
post=$(member_diff "$(printf '%s\n' "$ran" | grep -v '^$' | LC_ALL=C sort)")
if [ -n "$post" ]; then
  echo "MEMBERS: FAIL the guards that ran differ from $MEMBERS_FILE:"
  printf '%s\n' "$post"
  exit 2
fi
echo "MEMBERS: OK $((green+red)) of $(printf '%s\n' "$expected" | wc -l | tr -d ' ') ran, as listed in $MEMBERS_FILE"
# A RED guard does not change the exit code: the standing REDs are known and named above, and a non-zero
# exit for them would make every session's ritual look broken. Read the printed verdict. Only a
# membership difference (above) exits non-zero.
exit 0
