-- GATE R3 (operator ruling 2026-08-20): signals gain a supersession REASON. A signal whose
-- source page is gone (404) is not deleted — it is superseded with a recorded reason, so the
-- record of what we once read survives. Additive; idempotent. No backfill here (the data act
-- that stamps 'source_gone' on the 14 dead-URL CB2 signals is applied by explicit id list, ledgered
-- separately — never a blanket UPDATE).
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS superseded_reason text;
