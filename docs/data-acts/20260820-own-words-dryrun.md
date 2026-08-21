# Data act — Own-words extractor OW-1 schema + OW-2 dry run

**Date:** 2026-08-20
**Companies:** CB2 (`fd3f7f63-968b-4698-b946-3d6b6450d79d`), Edgewood (`3dd2cfbb-0792-4bf1-9cd4-15db9646874b`)
**Mode:** plan (DRY RUN) — zero claims written. Snapshots (corpus) + integrity `planned` records only.

## Pre-write dump
- `~/backups/pre-ow1-20260820.sql` — 13M, md5 `991f38a21df1b357184ccdb928ba4478`

## OW-1 schema (migration `20260820220000_own_words_ow1.sql`)
- `claims.claim_type` CHECK now admits `'own_words'` (additive; drop+re-add; no backfill).
- New table `own_words_page_snapshots` { id, company_id, source_url, signal_id, fetched_at,
  clean_text, text_sha256, run_id } — INSERT-only, birth-immutable (trigger
  `own_words_snapshot_immutable_guard` raises on UPDATE and DELETE). RLS mirrors signals
  (admin + company owner/member SELECT; owner/member/admin INSERT).
- `integrity_runs` status CHECK now admits `'planned'` (the dry-run beat record; additive).
- **CB1 (frozen) identical:** claims 43 rows, md5 `0b1df6b308d5bc44e22f053f4f93922a` before and after.
- Immutability verified: UPDATE and DELETE both raise; a test row was inserted and removed via a
  one-time guard-disable (table left empty before the dry run).

## OW-2 extractor (`extract-own-words`, plan mode)
Pipeline per client_voice public page: `fetchAndExtract` (≤12k clean text) → immutable snapshot →
generator (OpenAI **gpt-4.1-mini**, fallback gpt-4.1-nano; local qwen wired, OFF) → judge → honesty
rails (`ownWordsExtract.ts`: channelJunk → self-assertion → keep → DETERMINISTIC verbatim substring
guard → dedup by content identity). **write mode is refused (501) this gate.**

Privacy (Option B): every URL's signal asserted `voice_class='client_voice'` AND public source; a
frozen company is refused (never fetched). Guard-tests below.

## Falsification tests (`ownWordsExtract.test.ts`, 9 tests, red-then-green)
- planted fixture (one self-assertion + one third-party quote + nav) → exactly the self-assertion survives.
- vacuous proof: "Open Menu Close Menu" IS substring-provable, yet rejected (not a self-assertion).
- deterministic guard: a fabricated quote absent from the page is rejected even when the judge is fooled.
- privacy refusal: non-client_voice / non-public (uploaded_file) source throws.

## Dry-run yields
Model: gpt-4.1-mini. Every survivor is `verbatim` (substring-provable against its snapshot);
zero paraphrased, zero judge rejections, **zero guard rejections** on live data — the generator
stayed inside the page, so the deterministic guard never had to fire (it IS exercised red-then-
green in the tests). Snapshots written: CB2 14, Edgewood 11 (25 total). Dedup is PER-PAGE this
gate; the "distinct" column dedups by normalized quote across pages (cross-page/URL repeats — a
homepage tagline on 3 URLs — collapse at claim-write time, a later gate).

### CB2 — 14 pages fetched, 6 URLs 404 (merchandise/product pages gone)
- candidates 42 · verbatim 42 · paraphrased 0 · rejected 0 · guard_rejected 0 · **distinct ≈ 28**
- rich pages: /our-story 9 ("This is the Barra Method.", "Starting a coffee business has been a
  dream of mine for many years."), /our-coffees 8 (+ /our-coffees/quantity 9 = same page),
  /partnerships 4 ("Café Barra can help you turn your coffee into a powerful profit center…"),
  homepage 3 (×3 URLs: cafebarra.com, /, /home), /curiosity-labs 2, instagram 1.
- /our-shops: 0 (store-locator, no prose self-assertion); square.site/cart/get-in-touch/cine-barra: thin.
- /our-shops and /partnerships (A2/B pages) fetched fine; partnerships is the B2B positioning source.

### Edgewood — 11 pages fetched (x.com returned an empty JS body → honest skip)
- candidates 37 · verbatim 37 · paraphrased 0 · rejected 0 · guard_rejected 0 · **distinct 35**
- rich pages: edgewood.org 5 ("We are a leading nonprofit mental healthcare provider…"),
  /about/ 7 ("Edgewood is the oldest children's charity in the Western U.S…"), /partners-providers/
  acute-intensive 5, /outpatient 7, LinkedIn 11 (mission + recruiting copy).
- socials thin as expected: Facebook 0 (34-char body), YouTube 0, Instagram 1 each.

## Integrity records (plan)
`integrity_runs` component `first_read_own_words`, status `planned`:
- id 641 — CB2: examined 42, admitted 42, guard_rejected 0, pages_fetched 14, distinct 28.
- id 642 — Edgewood: examined 37, admitted 37, guard_rejected 0, pages_fetched 11, distinct 35.

(The extractor's own integrity insert initially no-op'd against the pre-existing status CHECK;
the CHECK was extended to admit 'planned', the function's insert is now error-checked, and these
aggregate rows carry the full dry-run counts.)

## Checks
- `tsc -b`: 236 = baseline, delta 0; none in touched files.
- rail tests: 9/9.
- Zero claims rows written (plan mode). CB1 untouched.
