# Data act — OW-4 CB2 public recompute on OWN WORDS (declared-side rewire)

**Date:** 2026-08-20
**Company:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`) — writable
**Pre-write dump:** `~/backups/pre-ow4-20260820.sql` — md5 `092b8c2a743de1c8cb3fe4da867f79b8`

## OW-4 code (claimDeltaSynthesis.ts)
- **Declared-side preference:** for `public_vs_public`, the declared side now PREFERS
  `claim_type='own_words'` (the company's verbatim self-assertions) when present, falling back to
  the client-voice INFERENCE claims when the extractor hasn't run. Never both — own words replace
  the inference, mirroring beat 3's lead/demote.
- **Robustness fixes needed to complete the recompute** (all correctness, surfaced by the rewire):
  - rejection banking is idempotent — a duplicate on the kind-scoped unique key is a no-op, not a
    fatal throw (safe under resume/concurrency).
  - the end-of-run silence insert dedups WITHIN its fresh batch — duplicate public statements
    produce the same `internally_silent` identity, which would otherwise abort the finalize.
  - the stale-delete and the rejection orphan-prune batch their `.in(id)` deletes (100/batch) —
    a large id list overran PostgREST's URI limit (the cache had grown to 562 rows).

## Reset (recomputable derived data; 0 operator-dispositioned rows)
The recompute inherited a mixed state from interrupted runs (stale inference-declared deltas +
old silences). Deleted the 52 non-own-words public deltas, keeping only the 11 valid
own_words-echoed rows. Internal_vs_public (53) untouched; CB1 never addressed.

## Recompute result (public_vs_public, own_words declared)
Finalize (declared 23 own_words × 43 publics, 285 candidates):

| delta_type          | count | vs B-2 (inference declared) |
|---------------------|-------|-----------------------------|
| echoed              | 11    | 14                          |
| divergent           | 0     | 3                           |
| publicly_silent     | 20    | 6                           |
| internally_silent   | 35    | 29                          |
| **total**           | 66    |                             |

Reading: own words are brand/positioning voice, so they DIVERGE from the operational market
record far less (0 divergent) and go UNECHOED more (20 publicly_silent) than the inference
claims did — the record confirms 11 of the company's own statements. integrity_runs
`first_read_gap_pairs` id 664 `completed` (examined 285). rejections pruned 330.

## Featured say-vs-see (compute-featured-defaults, public; W2 divergent-first)
- No divergent pairs exist → the selector falls to echoed (W2 order).
- **new pointer `047f1f1d…`** (echoed own-words): own words *"In this way our business
  relationships are be mutually beneficial…"* echoed by the record *"Le French Rooster's website
  and Instagram publicly name Cafe Barra as…"*. The prior W2 pointer `6a6641dc` (inference-based
  divergent) was replaced.

## Walls
- internal_vs_public: 53 rows untouched. CB1: 0 rows (untouched).
- `tsc -b` 236 (delta 0); synthesis test 57/57; `deno check` clean.
