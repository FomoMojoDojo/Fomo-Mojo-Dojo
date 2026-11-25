#!/usr/bin/env bash
# ── SP-532: A TEST RUN THAT SELECTS ZERO TESTS IS A FAILURE ──────────────────────────────────────
#
# `deno test --filter <no match>` prints "ok | 0 passed | 0 failed | 26 filtered out" and exits 0.
# That is a green light for a run that tested nothing, and it has already been read as a pass three
# times in this slice (2026-11-21: a plant run filtered on "compound", which matches no test name).
#
# This wrapper is the only way tests are run in this slice. It fails when:
#   - deno test itself fails (any non-zero exit), or
#   - the summary reports 0 passed AND 0 failed — nothing was selected, or
#   - no summary line is printed at all (a crash before the runner started).
#
# SP-532 IS ABOUT A VACUOUS RUN, NOT ABOUT A FAILING ONE (fixed 2026-11-21, found by a plant). The
# first version tested `passed -eq 0` before the exit code, so a run that selected ONE test and that
# test FAILED printed "ZERO tests selected or passed — a filter that matches no test name is not a
# pass". It was red, and red was right, but the reason was wrong: the filter had matched. A plant whose
# red is explained by the wrong mechanism proves nothing, so the two cases are now separated by
# reading `failed` as well as `passed`.
#
# It prints ONE verdict line, so a caller can classify on the exit code AND the printed verdict —
# a sweep that keys on either agrees with one that keys on both.
#
#   bash scripts/deno-test-nonvacuous.sh <any deno test args>
set -uo pipefail
export NO_COLOR=1
PATH="$HOME/.deno/bin:$PATH"

if [ "$#" -eq 0 ]; then
  echo "test-guard: FAIL (SP-532) no arguments — a wrapper invoked with no target selects nothing"
  exit 1
fi

out="$(deno test -A "$@" 2>&1)"; rc=$?
echo "$out"

summary="$(printf '%s\n' "$out" | grep -E '[0-9]+ passed' | tail -1)"
if [ -z "$summary" ]; then
  echo "test-guard: FAIL (SP-532) no test summary was printed — the runner never reported a count"
  exit 1
fi

passed="$(printf '%s\n' "$summary" | sed -n 's/.*[^0-9]\([0-9]\{1,\}\) passed.*/\1/p')"
[ -z "$passed" ] && passed=0
filtered="$(printf '%s\n' "$summary" | sed -n 's/.*[^0-9]\([0-9]\{1,\}\) filtered out.*/\1/p')"
[ -z "$filtered" ] && filtered=0
failed="$(printf '%s\n' "$summary" | sed -n 's/.*[^0-9]\([0-9]\{1,\}\) failed.*/\1/p')"
[ -z "$failed" ] && failed=0

# A REAL FAILURE FIRST. A selected test that failed is a failure of the code, never a vacuous run.
if [ "$failed" -ne 0 ] || [ "$rc" -ne 0 ]; then
  echo "test-guard: FAIL ${failed} test(s) failed, ${passed} passed (deno exited ${rc}) — a real failure, not a vacuous one"
  exit 1
fi
# Then the vacuous run: nothing passed AND nothing failed means nothing was selected.
if [ "$passed" -eq 0 ]; then
  echo "test-guard: FAIL (SP-532) ZERO tests selected — ${filtered} filtered out, 0 passed, 0 failed. A filter that matches no test name is not a pass."
  exit 1
fi
echo "test-guard: PASS ${passed} test(s) ran and passed (${filtered} filtered out by the selection)"
