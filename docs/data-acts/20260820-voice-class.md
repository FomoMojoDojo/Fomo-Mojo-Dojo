# Data act — voice_class corrections (2026-08-20)

Operator-ruled data act (2026-08-20). No signals audit table exists (audit coverage:
tests/claims/conditions/contests/rejections only), so this ledger is the audit record,
per the gate brief. Introducing commit = the commit that adds this file (see git log).

- Branch: `strategic-object-graph` (work base `2ada663`)
- Backup BEFORE any write: `~/backups/pre-data-acts-20260820.sql` — 12 MB,
  md5 `680587b7a13ed661def724272f324e45`
- CB1 (58b2b15b, FROZEN) baseline before writes: 216 signal rows,
  md5(id||voice_class ordered) = `99c9fe54d349ced7fca4a82ddd8bf03b` — verified identical after.
- Method: one transaction per act; UPDATE by explicit id list only (never a host predicate);
  guarded `AND voice_class IS NULL` (DA-1) / `AND voice_class='market_context'` (DA-2).

## DA-1 — legacy NULL voice_class on the company's own domain → `client_voice` (34 rows)

Reason: these outside-band rows predate the B1 voice overlay. Under the shared own-domain
rule (`isOwnDomainUrl`, one definition shared by the baseline stamping guard and the Act-1
classifier since `f361aab`), a signal on the company's own domain is the company speaking —
`client_voice`. The fix makes the data match what the display already resolves via the
host fallback; Act-1 render is unchanged by construction.

Before: `voice_class = NULL` · After: `voice_class = 'client_voice'` for each id below.

### CB2 (fd3f7f63-968b-4698-b946-3d6b6450d79d) — 13 rows, all host `cafebarra.com`

- 02b56ada-f0dd-4630-b009-7262d00a62a3
- 0496753e-0c42-47a0-ae1f-bceceea34153
- 0d47a4ef-bfb9-492c-a7bf-b8555d3b2b6d
- 1949070e-f846-46a4-b0cd-9bfefac6df16
- 39a07f40-13c1-4166-8a96-bfd6cecc27ad
- 3f01af11-fe44-451b-98ee-6aa5baca3386
- 48e472e8-93bb-4d5a-961a-91e87f6f2792
- 6a79ad57-ab65-4a83-b741-b110622214d3
- 88ca8e36-c2fa-46c7-a3c8-6dc0654bf08b
- afaf4309-66c4-40d3-90c2-b22959a61e17
- cb2cd466-a030-4d54-9b18-634222c1832e
- cd7fb3a9-83cf-41da-af28-1ce049e4b71c
- e283f66a-a0b6-466b-9528-9c978147b9ff

### Edgewood (3dd2cfbb-0792-4bf1-9cd4-15db9646874b) — 21 rows, all host `edgewood.org`

- 14917f9e-49ce-4e6d-b39d-886f6b7b073c
- 2d5f8a02-d95a-4c8e-8654-7ee35c9a210d
- 387b7bd1-f3f3-414e-a0cf-e9406e67594e
- 3f047dcc-55b4-4854-8af3-4815e88c1d92
- 400d66c5-bfb5-46ed-bc9c-7460224992e3
- 6572499b-6cc0-415f-9f76-177329b76851
- 6a04480b-5d62-4a60-8eb1-c6ebeb64ea40
- 6abdeead-5647-41a8-82d3-2fb0bebe6858
- 7091df4d-7ec8-4bc2-8dd4-64bf64b33068
- 718da20e-643e-457e-9b2c-424f5ff1632b
- 792b29df-572e-496a-a12f-a461127f1718
- 89e4dfc1-5eef-43eb-856a-3746663576af
- 9a09a4cf-c911-4481-a850-2780d7ca80c4
- a0e339e9-de6d-470c-9590-978a6faa35bc
- ab9fe3c1-8dc5-4403-8c08-8764a60f9b6d
- c2b34555-87cb-4ccc-9b7d-1028e5fa2c3f
- ccfd6973-3c42-4603-a206-4036fa6e0e3e
- e51251cb-2a71-450a-963a-705dc450db16
- f2f4a2ad-83f7-405a-b687-40a7d9c01af4
- f30fbc5b-62c4-480f-8ce7-2d9acfdccc2b
- fd0c3a0d-6a5b-4b47-afd4-4d7f6028631b

### Held out (stay NULL) — operator ruling

These three Edgewood "Public Research" rows carry NO source_url, so they fail the
own-domain rule and cannot be classed by it. They remain `voice_class = NULL`
(invisible to voice-filtered reads, as before):

- 6bc22c8b-d75e-4aa7-8122-ccec551256e5
- a7e9f792-22c1-47d8-9fab-46d0cdecc1b9
- fbf2454c-ff97-4322-bcaf-d57f49796363

## DA-2 — one CB2 Yelp row mis-classed `market_context` → `outside_voice_about_client` (1 row)

The diagnostic's original 8-row candidate set was refuted by preflight content review:
5 rows are competitor/category listings (correctly `market_context`, untouched) and 2 are
absence-attestations that the operator ruled STAY `market_context` — absence-of-echo is a
market-side fact:

- 967d9907-9be5-432a-ac4e-8fd075c509d3 — "Yelp's top 10 … does not include Cafe Barra" — STAYS
- b51298f4-e4c9-4a73-8e67-5260ee43cc35 — "top-10 omits Cafe Barra entirely" — STAYS
- 471b6ca5 (Belli Fratelli), a7f6c85f (Brothers Coffee LA), b407a630 (Picaresca),
  67078da9 (top-10 list), ea33da6c (top-10 list) — competitor/category rows — STAY

Updated row (a genuine third party speaking about this company):

- 12ba93cd-137d-4204-a3a3-4975a890d05a — host `yelp.com` — "Le French Rooster is teaming
  up with Cafe Barra, a local coffee roaster…"
  Before: `voice_class = 'market_context'` · After: `voice_class = 'outside_voice_about_client'`

## Out of scope (untouched, standing)

- lefrenchrooster.com rows (22) — operator classification pending.
- CB1 (58b2b15b) — frozen; zero rows touched (before/after identity verified below).
