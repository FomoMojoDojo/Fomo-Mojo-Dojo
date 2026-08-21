# Data act — S1/S2 operating-status field + deterministic text classification

**Date:** 2026-08-20
**Companies:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`), Edgewood (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b`)
**Pre-write dump:** `~/backups/pre-s2-20260820.sql` — md5 `f85ff7e00b12d790e050d2ee78b966cb`

## S1 schema (migration `20260820250000_signals_operating_status.sql`)
`signals` gains `operating_status` (open | temporarily_closed | permanently_closed | unknown,
default unknown), `operating_status_as_of` date, `operating_status_source` (text_classifier |
status_probe). Additive, idempotent; ADD COLUMN DEFAULT is catalog-only → CB1 (frozen) rows read
'unknown', untouched (md5 `6cedec9c…` identical, 0 non-unknown).

## S2 classifier (deterministic, no model — `_shared/operatingStatus.ts`)
Phrase rules over claim_text / evidence_excerpt / source_title: reopened→open; "permanently
closed"→permanently_closed; all-caps standalone CLOSED (Yelp/Apple listing marker)→permanently_closed;
"temporarily closed"/"closed temporarily"→temporarily_closed; "under new management"+closed→
temporarily_closed. Conservative — negatives ("closed Mondays", "closed-loop", bare "closed") stay
unknown. Tests `operatingStatus.test.ts` (9, red-then-green incl. negatives).

## Populate (via `classify-operating-status` edge fn)
- **CB2:** examined 481 → **34 changed** (5 permanently_closed, 29 temporarily_closed); 447 unknown.
  Authoritative closures: **yelp.com** ×3 (permanently_closed) + **corner.inc** ×7 (temporarily_closed);
  plus joe.coffee (temporarily) and cafebarra.com analysis/client_voice citing the closure.
- **Edgewood:** examined 373 → **0 changed** (no closure language).
- **CB1:** untouched (0 non-unknown).

## Ledger — every CB2 id changed (status · host · as_of · voice · id)
```
permanently_closed · cafebarra.com · 2026-08-18 · analysis · 59ea4a4c-1706-4fcc-b009-9001d9e4c4e3
permanently_closed · cafebarra.com · 2026-08-18 · analysis · 51062f61-4962-4773-bab8-8cbb6bee1fb5
permanently_closed · yelp.com · 2026-06-12 · market_context · a7f6c85f-b550-4e4e-841d-47d03ac937c5
permanently_closed · yelp.com · 2026-07-01 · outside_voice_about_client · cf8849f6-9165-45df-b6f7-c09e9c8d5200
permanently_closed · yelp.com · 2026-08-18 · outside_voice_about_client · 47cb5081-d819-445e-9c6a-5f54aac672ef
temporarily_closed · cafebarra.com · 2026-08-19 · analysis · 4cd40a82-3cb5-4f8d-bd70-3ad44e30683b
temporarily_closed · cafebarra.com · 2026-08-07 · client_voice · afaf4309-66c4-40d3-90c2-b22959a61e17
temporarily_closed · cafebarra.com · 2026-08-19 · analysis · 2d7161fa-c395-4155-be88-a25fb6d436a8
temporarily_closed · joe.coffee · 2026-08-07 · outside_voice_about_client · b31a1cf8-c11a-42b1-8c2b-e224ac261ec3
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 4d7291db-2145-4ae0-a149-c86d0474b8d7
temporarily_closed · joe.coffee · 2026-08-18 · outside_voice_about_client · e312b6b9-979b-458f-9bde-1c74d7f29c6c
temporarily_closed · joe.coffee · 2026-08-18 · outside_voice_about_client · f3d3b408-4a37-4773-991e-fab21fb666b2
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · ec5f8135-85d9-4d39-8e95-2e2cf6f73e91
temporarily_closed · joe.coffee · 2026-08-18 · outside_voice_about_client · e45172d7-f351-47b3-86b0-76d216bb842e
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · a67bb700-e7b6-4474-9dcb-6cb226ae8c91
temporarily_closed · joe.coffee · 2026-08-07 · outside_voice_about_client · a203d0b2-2f8b-42b6-93a8-a31f07afbe37
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 84f60fef-1af0-418b-903f-042fb884d82a
temporarily_closed · joe.coffee · 2026-08-19 · outside_voice_about_client · 5c3b24d8-0b2b-44d3-b6ca-4f5b6222f9cd
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 858b75de-5f2d-4968-a6b7-b5af45aad928
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 47bbb7cc-6194-4630-b7bd-2638428641b3
temporarily_closed · joe.coffee · 2026-08-19 · outside_voice_about_client · 892c98fa-f2a5-43e0-9c8d-8f9fea172853
temporarily_closed · joe.coffee · 2026-08-07 · outside_voice_about_client · e9a56518-ecc6-4738-8b07-f7aa38611eb4
temporarily_closed · joe.coffee · 2026-08-19 · outside_voice_about_client · f6234fab-cc52-4989-9ed6-dd43d794b12f
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 2db3ec40-c73a-4b7a-86a5-c93f42bd8dba
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · c50cd0c6-9b1a-4a31-9ab5-989b063aa306
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · 90f10528-3d06-44ec-862f-0b18f4ad03f2
temporarily_closed · joe.coffee · 2026-01-30 · outside_voice_about_client · d5d607cb-18d8-4bf2-9fa7-4bcc3a54469e
temporarily_closed · corner.inc · 2026-04-19 · outside_voice_about_client · 1ddf8351-931c-413d-94d1-e0f3c2e33203
temporarily_closed · corner.inc · 2026-08-19 · outside_voice_about_client · a1ed792b-2bd9-441a-800a-16508b8ef75e
temporarily_closed · corner.inc · 2026-04-19 · outside_voice_about_client · 198836ae-3c07-4af8-a70c-695cb7027630
temporarily_closed · corner.inc · 2026-08-18 · outside_voice_about_client · a586f7ab-9f30-41cf-8924-341013ee3189
temporarily_closed · corner.inc · 2026-04-19 · outside_voice_about_client · 83dc8260-92e5-4810-8775-e3eab39f19b2
temporarily_closed · corner.inc · 2026-08-19 · outside_voice_about_client · e7136de8-2d6b-4629-acfc-1b05e1d6fffd
temporarily_closed · corner.inc · 2026-04-19 · outside_voice_about_client · 931fa5dd-bb7d-4429-a888-6bc22c8e66ac
```
