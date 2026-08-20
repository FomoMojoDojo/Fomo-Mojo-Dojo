# Data act — B-2 CB2 public-pairing recompute (First Read)

**Date:** 2026-08-20
**Company:** Cafe Barra #2 (CB2, `fd3f7f63-968b-4698-b946-3d6b6450d79d`) — writable
**Scope:** `pairing_kind = 'public_vs_public'` claim-deltas only. CB1 (frozen) and Edgewood untouched.

## Pre-write dump
- `~/backups/pre-b2-20260820.sql` — 13M, md5 `9bbb44b90805e69665161bfcbddb0ef3`
- Taken before any B-2 write. (Predates the constraint migration below, which is a
  catalog-only change touching no rows.)

## Migration applied — Gate B-1 completion
`supabase/migrations/20260820210000_claim_deltas_pairing_kind_unique.sql`

Gate B-1 (`20260820180000`) added `pairing_kind` and scoped every query, the negative
cache, and the stale-sweep by kind — but left `UNIQUE(company_id, content_identity)`
KIND-BLIND. Because `content_identity` hashes only statement text (no pairing_kind), the
two reads legitimately share identities on the SAME market publics: an unpaired market
public is `internally_silent|<publicStmt>` under BOTH the internal read (declared =
founding claims, 43 such rows) and the public read (declared = client-voice public claims).
The first public finalize collided on the kind-blind constraint
(`duplicate key ... claim_deltas_company_id_content_identity_key`), threw, wrote a
`status=failed` gap-pairs integrity row (id 630), and produced ZERO public
`internally_silent` rows.

**Fix (constraint swap only — no row or identity value changes):**
- `claim_deltas`: `UNIQUE(company_id, content_identity)` → `UNIQUE(company_id, content_identity, pairing_kind)`
- `claim_delta_rejections`: same swap (consistency; every query is already kind-scoped)
- `feed-first-read-corrections/index.ts`: two `claim_deltas` upserts updated
  `onConflict: "company_id,content_identity"` → `"company_id,content_identity,pairing_kind"`
  (both write `internal_vs_public`; semantics unchanged).

The internal_vs_public rows stay byte-identical and the `rejected_pairing` tombstone keeps
its identity. CB1 has zero claim_deltas rows; its `enforce_company_freeze` trigger never fires.

## Recompute result (public_vs_public, CB2)
Scoped chunks (declared = the 10 client-voice public claims) → public finalize.

| delta_type          | count | design band            |
|---------------------|-------|------------------------|
| echoed              | 14    | echoed/divergent ~3–6  |
| divergent           | 3     | (17 pairs total)       |
| publicly_silent     | 6     | market-silent 4–7 ✓    |
| internally_silent   | 29    | channel-silent ≤~40 ✓  |
| **total**           | 52    |                        |

Note: echoed/divergent came in above the ~3–6 estimate (17 pairs). These are
judge-confirmed verdicts over the 10 client-voice public claims × 43 market publics
(347 candidates prefiltered); 330 pairs banked to the negative cache.

## Integrity
- `integrity_runs` `first_read_gap_pairs` row **id 631 = completed** (examined 347, admitted 0).
  The earlier failed row (id 630) is retained as an honest audit record of the first attempt.

## Walls held (post-recompute)
- **WALL 1 — internal_vs_public untouched:** 53 rows; zero written in the B-2 window
  (max internal `computed_at` = 2026-08-19 21:22, the day before). Full-row md5 of the
  internal slice: `6d56228e531d07d78c85fd2a1b8d11ea`.
- **WALL 2 — `rejected_pairing` tombstone intact:** 1 row, identity preserved.
- **WALL 3 — `operator_seen_at` preserved:** 1 row.
- **CB1 claim_deltas:** 0 rows (unchanged).
- **Edgewood claim_deltas:** 47 rows, 0 written in the B-2 window.

## Featured defaults (compute-featured-defaults, public)
- **Cold-open pointer (`outside_raised`):** self-healed to a live/active public claim —
  *"Le French Rooster & Cafe Barra rated 4.7 out of 5 on Restaurant Guru: 512 reviews by
  visitors."* (an `internally_silent` outside observation; correctly market-side).
- **`findings` pointer:** `2462517a…` (frontier), active.
- **`say_vs_see` pointer:** the stale **pre-B-1 `internal_vs_public`** pointer (`be975d1d…`)
  was softRemoved as `provenance_excluded`; no new auto-default selected because none of the
  public-pairing declared claims carries a declared-direction topic (their topics are
  `market` / `distribution channel` / `company owned web` / `company owned`, none in
  `DECLARED_DIRECTION_TOPICS`). Theme is honestly empty. **FILED (needs ruling, not built):**
  whether the say-vs-see featured default should admit public operational claims under the
  public pairing.

## Open questions (generate-open-questions, public)
Anchors: 8 public findings + 6 publicly_silent deltas = 14. Generated via scoped chunks
(gateway ~150s cap forced batches of ≤4), then finalize (run 50).

| source_kind   | count |
|---------------|-------|
| finding       | 7     |
| silent_delta  | 1     |
| **total**     | 8     |

Anchors judged: 8 findings → 7 kept (1 all-candidates-rejected); 6 silent_deltas → 1 kept
(5 rejected by the genuinely-open judge). Finalize (run 50): 0 orphans superseded.

Edgewood open questions unchanged: 13 live (8 finding + 5 silent_delta).

## Render change (Beat 7, held with this act)
`ScoreReveal` (beat 7) now carries the "Mojo now N/100" panel in its `ActHeader`
`right=` slot. Test `beatOrder.test.tsx`: "Mojo now" appears EXACTLY ONCE across all
beats — inside beat 7. (`ActGap` carries no score; `ActMap` is dead/unmounted.)

## Checks
- `tsc -b`: 236 errors = baseline, delta 0; none in touched files.
- `beatOrder.test.tsx`: 7/7 pass.
