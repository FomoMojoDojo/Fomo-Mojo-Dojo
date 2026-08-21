# Data act — R3 supersede the 6 dead-URL CB2 signals

**Date:** 2026-08-20
**Company:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`) — writable

## Schema (migration `20260820240000_signals_superseded_reason.sql`)
`signals` gains `superseded_reason text` (additive, idempotent). No backfill in the migration.

## Data act (by explicit id list — never a blanket UPDATE)
The 14 CB2 signals on the 6 dead (404) product/merchandise URLs are superseded with
`superseded_reason='source_gone'`; `superseded_at = COALESCE(superseded_at, now())` so the 3 that
were already superseded (by a prior act) keep their original timestamp. **Nothing deleted.**

Dead URLs (own-words dry run found them 404): `/merchandise`, `/merchandise/p/cafe-barra-coffee-mug`,
`/merchandise/p/t-shirt-1`, `/merchandise/p/vargas`, `/our-coffees/p/machado-de-assis-brazil`,
`/our-coffees/p/macondo-decaf-colombia` — 14 signals total (11 newly stamped, 3 reason-stamped only).

## Verification
- 14 signals now `superseded_at IS NOT NULL AND superseded_reason='source_gone'`.
- **Referencing claims untouched:** the 2 claims backed by these signals remain `active` (they are
  also backed by live signals; supersession of a source is not a strike of the claim).
- **Nothing deleted:** CB2 signal count unchanged (481).
- **CB1 untouched:** 0 CB1 signals carry `superseded_reason`.
