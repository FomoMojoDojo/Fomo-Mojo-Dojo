# Data act — W2 CB2 say-vs-see featured pointer (public pairing)

**Date:** 2026-08-20
**Company:** Cafe Barra #2 (CB2, `fd3f7f63-968b-4698-b946-3d6b6450d79d`) — writable
**Scope:** `first_read_featured_items` theme `say_vs_see` for CB2 only. CB1 (frozen) and Edgewood untouched.

## Pre-write dump
- `~/backups/pre-w2-20260820.sql` — 13M, md5 `243e90789de0b15f3204e9a618cc40e2`

## Code change (W2 ruling)
`selectSayVsSeeDefault` now branches by `pairing_kind`:
- `internal_vs_public` (default): unchanged — only `DECLARED_DIRECTION_TOPICS` qualify.
- `public_vs_public`: topic allowlist does NOT apply; only `divergent` and `echoed` qualify
  (a say-vs-see pointer needs both sides), divergent first (sharpest evidence); zero pairs → null.

`compute-featured-defaults` passes `"public_vs_public"` for the First Read say-vs-see theme.

## Re-run result (compute-featured-defaults, CB2)
- **say_vs_see pointer written:** `6a6641dce3f1968dff1c7233cf454dc6ca8060cef91c9a5630bc3a9bf822ab39`
- **verdict:** `divergent` (CONTRADICTED), `pairing_kind = public_vs_public`
- **declared (client voice):** "Cafe Barra distributes its products locally in Los Angeles and
  Todos Santo and supports direct sales via its website…"
- **public record:** "Le French Rooster US & Cafe Barra listed on Postmates for delivery; menu
  includes espresso…"

This is the same theme that self-healed to EMPTY under the old topic-allowlist selector
(20260820-b2 ledger, FILED). W2 resolves that gap: the pointer is present and public-kind.

CB2 active featured pointers now: findings (`2462517a`), outside_raised (`d940c913`),
say_vs_see (`6a6641dc`).

## Untouched
- **Edgewood** (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b`): findings + outside_raised pointers
  unchanged; no row written in this run; no say_vs_see pointer (its prior state).
- **CB1 (frozen):** not addressed.
