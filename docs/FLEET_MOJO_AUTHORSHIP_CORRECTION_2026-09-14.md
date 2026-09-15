# Fleet mojo-analysis authorship correction — record of the data act (2026-09-14)

Operator brief 2026-09-14, rulings 1–5 (mechanism as 329b118; CB2 last; frozen Cafe Barra and CB1 never touched;
analytic claims re-linked not struck; re-minted contradictions retired again as a granularity side effect).
Eight companies changed. Applied by `remint-upload-provenance {proposal_ids}` (supersede `remint_authorship_v3`,
re-ingest at minting_version 3 with origin {us, this_company}) then `retire-proposals {signal_ids}`
(`operator_corrected:fabricated_excerpt`). Every row is readable as history; every operation has a ledger row in
`provenance_remints`. Backup: `backups/pre-fleet-mojo-20260914_172613.sql`.

Dry run (all eight) approved before apply; the seven applied and reported before CB2; second apply on all eight
planned `none` and wrote nothing. Frozen Cafe Barra / CB1: 0 rows touched, 0 ledger rows. CB2's 11 intake rows
byte-identical before/after. Edgewood (corrected at 329b118) untouched; its home baseline diff empty.

| company | proposal(s) | rows superseded → minted | analytic claims re-linked / struck | TEAM before → after | contradictions retired again | score (stored → fresh) |
|---|---|---|---|---|---|---|
| FomoMojoDojo | 661cb94f, b7b91c9e | 13 → 13 | 4 / 0 | 137 → **124** | 3 | 35.00 → 29.00 |
| Ground Up Innovations | 56928d61 | 9 → 9 | 3 / 0 | 9 → **0** | 2 | 19.00 → 20.00 |
| Heart Coffee Roasters | eccfd06c | 5 → 5 | 2 / 0 | 5 → **0** | 1 | 10.00 → 8.00 |
| Indoor Air Quality Management | d7e22ac6 | 8 → 8 | 2 / 0 | 8 → **0** | 2 | 21.00 → 7.00 |
| Lumio | 29fa0e4d | 8 → 8 | 3 / 0 | 8 → **0** | 1 | 15.00 → 8.00 |
| Wasabi Technologies | aa30c08f | 8 → 8 | 2 / 0 | 8 → **0** | 2 | 13.00 → 23.00 |
| whispering.ai | 7f669c38 | 8 → 8 | 2 / 0 | 8 → **0** | 2 | 8.00 → 8.00 |
| Cafe Barra 2 | d918c0e3 | 7 → 7 | 2 / 0 | 52 → **45** | 2 | 21.00 → 21.00 |

The "score stored" column is the last `mojo_scores` snapshot before the run — weeks stale for five companies
(Indoor Air 21 vs live 7, Lumio 15 vs 8, Wasabi 13 vs 23, Heart Coffee 10 vs 8, FomoMojoDojo 35 vs 29); the re-mint
re-snapshots, so the "fresh" column is the honest number. The correction itself moves no score beyond rounding —
analytic claims are outside_view and kept. Heart Coffee was projected to round 8 → 9 on a 7-item freshness
denominator; measured 8. Nothing tuned.

## Ledger ids (provenance_remints)

### FomoMojoDojo
- remint · proposal `b7b91c9e…` · 6 superseded, 6 minted, 0 struck · ledger `e42d361a-cea2-4c7d-985f-363f95d629d2` · 2026-09-15 00:37:04Z
- remint · proposal `661cb94f…` · 7 superseded, 7 minted, 0 struck · ledger `13505c46-2d00-436a-8c2a-50ad2387ac4e` · 2026-09-15 00:37:04Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `b7b91c9e…` · 1 signal · ledger `7ac097e4-441a-499a-af83-985bf0597914` · 2026-09-15 00:37:05Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `661cb94f…` · 1 signal · ledger `b4e5d5b5-3008-4212-a99f-a992b17c966b` · 2026-09-15 00:37:05Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `661cb94f…` · 1 signal · ledger `7dbcceb3-4e05-4491-af9b-825a79529349` · 2026-09-15 00:37:05Z

### Ground Up Innovations
- remint · proposal `56928d61…` · 9 superseded, 9 minted, 0 struck · ledger `e7b726d1-1905-4300-bbae-d9a74b6d6fb5` · 2026-09-15 00:37:24Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `56928d61…` · 1 signal · ledger `7174dc21-b892-4739-8279-60d9af9fc1a1` · 2026-09-15 00:37:25Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `56928d61…` · 1 signal · ledger `ccca625d-fb10-46f7-8c15-459ba03712b4` · 2026-09-15 00:37:25Z

### Heart Coffee Roasters
- remint · proposal `eccfd06c…` · 5 superseded, 5 minted, 0 struck · ledger `97f136fa-a76e-4a4a-866c-ef23884aee67` · 2026-09-15 00:38:02Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `eccfd06c…` · 1 signal · ledger `14fbfcfe-7abc-4b4f-ad0d-0d936c6c7335` · 2026-09-15 00:38:03Z

### Indoor Air Quality Management
- remint · proposal `d7e22ac6…` · 8 superseded, 8 minted, 0 struck · ledger `a4c4dbe9-202e-47d0-b69f-3226f654b777` · 2026-09-15 00:38:04Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `d7e22ac6…` · 1 signal · ledger `5f2d267b-1e0b-4671-b00e-5bd3b291f402` · 2026-09-15 00:38:06Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `d7e22ac6…` · 1 signal · ledger `8df74cbf-acf6-4a56-a4e8-636aded659ad` · 2026-09-15 00:38:06Z

### Lumio
- remint · proposal `29fa0e4d…` · 8 superseded, 8 minted, 0 struck · ledger `e6b78593-1c4e-433a-b99e-caa5a7a1554e` · 2026-09-15 00:38:07Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `29fa0e4d…` · 1 signal · ledger `846e3265-3769-4718-8281-9969924ef968` · 2026-09-15 00:38:08Z

### Wasabi Technologies
- remint · proposal `aa30c08f…` · 8 superseded, 8 minted, 0 struck · ledger `df225e17-e2fb-47db-a0b1-1184d4e56db5` · 2026-09-15 00:38:09Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `aa30c08f…` · 1 signal · ledger `996a6487-5739-4bc8-a802-4baf94235a63` · 2026-09-15 00:38:10Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `aa30c08f…` · 1 signal · ledger `fe2bc243-f8e0-4acf-ac38-96c9c99efdfe` · 2026-09-15 00:38:10Z

### whispering.ai
- remint · proposal `7f669c38…` · 8 superseded, 8 minted, 0 struck · ledger `e83552cf-6a43-444e-8535-d8c14d690dc1` · 2026-09-15 00:38:11Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `7f669c38…` · 1 signal · ledger `f7e431a9-8844-4280-85c3-b9dc0e84dacd` · 2026-09-15 00:38:12Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `7f669c38…` · 1 signal · ledger `454db3a0-c60a-43aa-98a6-e7243dd8d69a` · 2026-09-15 00:38:12Z

### Cafe Barra 2
- remint · proposal `d918c0e3…` · 7 superseded, 7 minted, 0 struck · ledger `3b32ac9d-360c-4303-b32f-c1f9f805c5be` · 2026-09-15 00:38:30Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `d918c0e3…` · 1 signal · ledger `98f288bc-e2fa-414e-b509-31ecbbf06e41` · 2026-09-15 00:38:31Z
- retirement (`operator_corrected:fabricated_excerpt`) · proposal `d918c0e3…` · 1 signal · ledger `7d7cc5fc-2198-43da-a026-c01dfd856b20` · 2026-09-15 00:38:31Z

## Fleet state after
- 56 live `mojo_analysis` signals, all organization band / voice_class `analysis` (excluded from the TEAM read); 71 before,
  15 re-minted contradictions retired again.
- The six zero-TEAM homes now render PUBLIC n · TEAM 0 · CUSTOMERS 0: Ground Up 12·0·0, Lumio 24·0·0, Indoor Air 173·0·0,
  Wasabi 59·0·0, whispering.ai 17·0·0, Heart Coffee 26·0·0. FomoMojoDojo TEAM 124, Cafe Barra 2 TEAM 45, Edgewood TEAM 42.
- Fallback-row queue (bdfda0f census, 18 rows): 15 consumed here (superseded v3, re-minted copies retired);
  0 `[object Object]` rows live anywhere. Remaining: FomoMojoDojo upload findings `42d48272`, `53153164`, `10a66158`
  (the last two sole-back declared claims `b5c6ad1b`, `8c801ff7`).
- Queued, not acted on: stored `mojo_scores` snapshots are untrustworthy fleet-wide unless something has run recently
  (five companies were weeks stale before this run).
