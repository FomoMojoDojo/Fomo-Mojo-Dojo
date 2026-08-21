# Data act — Own-words write (R1 rails + frozen-candidate write, ruling B)

**Date:** 2026-08-20
**Companies:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`), Edgewood (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b`)
**Pre-write dump:** `~/backups/pre-ow-write-20260820.sql` — 13M, md5 `abcb1329534005d1c518e14dbc8ddb9d`

## R1 — judge + deterministic rails (no hand-curated lists)
Two rejection criteria added to the judge contract AND as deterministic heuristics in
`ownWordsExtract.ts`:
- **product/SKU description** — tasting notes, roast profiles, format/price copy for a specific item.
- **recruiting/job copy** — hiring calls, benefits lists, role descriptions.
Offering-model statements ("we provide X to Y", "all coffees available in 12oz bags") are KEPT.
The heuristics catch the unambiguous cases model-free; the judge carries both criteria for the rest.
Tests (`ownWordsExtract.test.ts`, 15): planted tasting note rejected, planted recruiting rejected,
offering-model kept — each red-then-green; plus the write-replay determinism + empty-set tests.

## Frozen-candidate write (ruling B) — migration `20260820230000_own_words_candidates.sql`
`own_words_candidates` (INSERT-only, birth-immutable, RLS mirrors snapshots) freezes every generator
candidate + judge verdict per plan run, keyed to (snapshot text_sha256, run_id). **Write mode reads
the LATEST plan run's candidates and re-applies the deterministic rails — it NEVER calls the
generator.** Upsert by content identity with preserve-on-upsert (existing own_words keep birth
provenance; nothing superseded by absence).

Determinism proofs:
- write is a pure function of the frozen cache — a re-run inserts 0 / preserves 23 (idempotent).
- empty cache → **409 refuse** ("no frozen candidates — run a plan first; no silent regeneration").

## Plan-verify (snapshots reused, no re-fetch) — frozen set that shipped
- CB2: run `5a448a50…`, 42 candidates → **23 distinct survivors**; the 5 flagged product/SKU lines
  (#2/#10/#11/#12/#13) absent.
- Edgewood: run `fbfd3a15…`, 38 candidates → **31 distinct survivors**; the 4 recruiting lines
  (#32/#33/#34/#35) absent.

## Write result
- **CB2:** 23 own_words claims inserted + 23 claim_signal_refs (`supports`). integrity id 657
  `completed` (examined 42, admitted 23).
- **Edgewood:** 31 own_words claims inserted + 31 refs. integrity id 658 `completed` (examined 38,
  admitted 31).
- claims: `claim_type='own_words'`, `provenance='public_observed'`, `proof_category='public_answerable'`,
  `status='active'`; `raw_payload` carries content_identity, page_url, verbatim_span, fidelity, read_at.
- **CB1 (frozen) claims byte-identical:** md5 `0b1df6b308d5bc44e22f053f4f93922a` before/after.
- Total: 54 own_words claims, 54 refs. No claim struck or superseded.

## Checks
- `tsc -b`: 236 = baseline, delta 0. `deno check extract-own-words/index.ts`: clean.
- rail tests: 15/15.
