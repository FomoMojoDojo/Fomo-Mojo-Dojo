-- DI1.1 — Multi-journey market_definition support
--
-- Drops the UNIQUE(company_id) singleton constraint, adds journey_key column,
-- adds UNIQUE(company_id, journey_key), backfills Cafe Barra's existing partner
-- row, and inserts the missing customer row.
--
-- Cross-company impact:
--   Cafe Barra (58b2b15b) — existing row gets journey_key='partner'; customer row inserted
--   Generic Audit (f3892cd5) — existing row gets default 'customer' (correct)
--   Edgewood, FomoMojoDojo — 0 rows, no impact

BEGIN;

ALTER TABLE public.odi_market_definitions
  ADD COLUMN journey_key TEXT NOT NULL DEFAULT 'customer';

ALTER TABLE public.odi_market_definitions
  DROP CONSTRAINT odi_market_definitions_company_id_key;

UPDATE public.odi_market_definitions
  SET journey_key = 'partner'
  WHERE company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
    AND source_path = 'manual_j3_recovery';

ALTER TABLE public.odi_market_definitions
  ADD CONSTRAINT odi_market_definitions_company_journey_key UNIQUE (company_id, journey_key);

INSERT INTO public.odi_market_definitions
  (company_id, user_id, journey_key, job_executor, chooser, jtbd, source_path, frameworks_used)
VALUES (
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc',
  'fd766480-d2ef-4794-a79a-b849a91df024',
  'customer',
  'Individual specialty coffee buyers discovering and brewing high-quality coffee at home.',
  'The individual buyer or household decision-maker',
  'Discover, evaluate, and source specialty coffee that matches their taste preferences and home brewing setup — building confidence in roast date, origin, and quality consistency until the experience is worth repeating.',
  'manual_di1_restore',
  ARRAY['ODI','JTBD','DI1']
);

COMMIT;
