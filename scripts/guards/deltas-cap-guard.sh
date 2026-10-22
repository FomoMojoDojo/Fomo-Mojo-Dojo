#!/usr/bin/env bash
# ── CLAIM-DELTAS SPEND CAP + PAGE-WORDS PAIRING GUARD (operator brief 2026-10-22) ────────────────────────────────────
#
# Fixtures only (an in-memory fake db and a fake ledger): no network, no model, no live company row.
#
#   c1  the cap guard refuses when ledgered + projected > cap, flushes pending ledger writes first, and refuses after a
#       failed ledger write (deltaSpendCap.test.ts)
#   c2  the core counts a cap refusal instead of throwing: completed integrity row naming pairs judged / refused by cap,
#       no row and no silence for the refused pair, no further paid call; a non-cap error still throws
#   c3  page words: each admission rule refuses on its own, a clean pair is admitted
#   c4  wiring: generate-claim-deltas wires the guard as beforeExternal with DELTA_MAX_OUTPUT_TOKENS sent as max_tokens,
#       ledgers each call as it returns on a capped run, and passes page_words_only to the core
#
# Plant (injected live, RED, restored md5-identical, GREEN):
#   K1  makeLedgeredCapGuard without assertSpendable (the cap ignored)   => c1 FAILED
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
fail() { echo "FAIL step $1: $2"; exit 1; }
T=$(NO_COLOR=1 deno test -A --no-check supabase/functions/_shared/deltaSpendCap.test.ts 2>&1 || true)
echo "$T" | grep -q '^ok | 7 passed | 0 failed' || fail c1-c3 "$(echo "$T" | grep -E 'FAILED|error' | head -5)"
echo "c1. cap guard: ledgered + projected > cap refuses; pending ledger flushed first; a failed ledger write refuses"
echo "c2. core: a cap refusal is counted, the run completes (integrity completed, pairs judged / refused named), nothing written for it"
echo "c3. page words: verbatim / own host / kept row / held backing; live, non-blank, verified backing"
F=supabase/functions/generate-claim-deltas/index.ts
grep -qF 'beforeExternal: makeLedgeredCapGuard(spendCap, pendingLedger, { site: "generate-claim-deltas", maxOutputTokens: DELTA_MAX_OUTPUT_TOKENS }),' $F || fail c4 "guard not wired as beforeExternal"
grep -qF 'externalMaxTokens: DELTA_MAX_OUTPUT_TOKENS,' $F || fail c4 "max_tokens not sent"
grep -qF 'if (spendCap) pendingLedger.push(recordModelCall(' $F || fail c4 "per-call ledger missing"
grep -qF 'pageWordsOnly: page_words_only === true,' $F || fail c4 "page_words_only not passed"
grep -qF '...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),' supabase/functions/_shared/modelRouter.ts || fail c4 "max_tokens not in the request body"
echo "c4. wiring: guard as beforeExternal, max_tokens sent, per-call ledger on a capped run, page_words_only passed"
echo "GUARD OK"
