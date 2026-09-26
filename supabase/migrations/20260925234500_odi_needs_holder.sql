-- ── 4f-6: A NEED'S HOLDER (operator ruling F9 of 2026-09-24, with D2 of the same day) ────────────
--
-- Until now every odi_needs row was a MARKET need: journey_key NOT NULL, and the key was the market
-- the need belonged to. D2 says needs are captured from ANY meeting, and a first-read review or an
-- internal working session yields needs the COMPANY holds — not needs of a market. Those have no
-- journey_key, and F9 is explicit that the empty market is a NULL and never a sentinel: a magic
-- string like 'company' or '' in journey_key would be silently joined against by every market-keyed
-- surface in the estate, which is exactly the bug the NULL makes impossible.
--
-- WHY A HOLDER COLUMN AND NOT "journey_key IS NULL" ALONE. A nullable column carries no intent: a
-- NULL could equally be a market need whose key was lost. holder states the fact, the paired CHECK
-- binds the two so they can never disagree, and a reader that forgets the NULL still cannot find a
-- market need without a key.
--
-- NO WRITER IN THIS COMMIT. Nothing creates a company-held need here; 4f-5 is the first. This commit
-- makes the shape legal and makes every existing reader safe for it, in that order.
--
-- REVERSAL. Drop the paired CHECK, restore NOT NULL on journey_key, drop holder. Safe while no
-- company-held row exists — and none can exist until 4f-5.

BEGIN;

-- ── 1. holder, defaulted so every existing write path keeps working untouched ────────────────────
-- DEFAULT 'market' is load-bearing, not convenience: record_interview_finding and every other
-- INSERT in the estate names its columns explicitly and does not name holder. Without the default
-- they would all fail on a NOT NULL column. The default is what makes this commit additive.
ALTER TABLE public.odi_needs
  ADD COLUMN holder text NOT NULL DEFAULT 'market';

-- The backfill is a no-op against the DEFAULT above (ADD COLUMN ... DEFAULT already wrote every
-- existing row), and is stated anyway so the intent survives a reader of this file: every row that
-- existed before 4f-6 is a market need.
UPDATE public.odi_needs SET holder = 'market' WHERE holder IS DISTINCT FROM 'market';

ALTER TABLE public.odi_needs
  ADD CONSTRAINT odi_needs_holder_check
  CHECK (holder IN ('market', 'company'));

-- ── 2. journey_key becomes nullable ─────────────────────────────────────────────────────────────
ALTER TABLE public.odi_needs
  ALTER COLUMN journey_key DROP NOT NULL;

-- ── 3. the pairing — the whole point of the commit ──────────────────────────────────────────────
-- A market need HAS a key; a company need has NONE. Both directions, one constraint. This is what
-- makes "journey_key IS NULL" a reliable test for "not of any market" and vice versa.
ALTER TABLE public.odi_needs
  ADD CONSTRAINT odi_needs_holder_market_key
  CHECK ((holder = 'market') = (journey_key IS NOT NULL));

COMMENT ON COLUMN public.odi_needs.holder IS
  '4f-6 (ruling F9): who holds this need — the market named by journey_key, or the company itself. A company-held need has journey_key NULL; odi_needs_holder_market_key binds the pair. No sentinel journey_key value is ever used for the empty market.';

COMMENT ON COLUMN public.odi_needs.journey_key IS
  '4f-6: the market this need belongs to, NULL for a company-held need (holder = ''company''). Every market-keyed surface must filter journey_key IS NOT NULL or scope by an exact key; a NULL must never render under a market.';

COMMIT;
