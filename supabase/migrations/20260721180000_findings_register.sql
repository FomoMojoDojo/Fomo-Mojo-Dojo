-- RG-2 — register on findings, so the RG-1 guard can make an honest decision on
-- the client-view Outside Findings + Hero paths.
--
-- The RG-1 HOLD: findings carried ZERO register metadata, so admitForSurface had
-- nothing to test — findings rendered on a client surface with no provable
-- provenance. This adds that provenance, birth-stamped and immutable, exactly the
-- market_register precedent (odi_market_register_immutable_guard).
--
-- WRITERS, both outside-only today but derivably so, not incidentally:
--   evidencePhase1  — findings born from public_baseline_run 'analysis' signals;
--                     register = the origin signal's band (outside → public_inferred).
--   frontierFinding — one company-level frontier per company, origin_signal_id NULL
--                     by design; register earned from origin_run_id being a
--                     public_baseline_runs row.
-- Findings are always INFERRED (model-mined), never declared, so the vocabulary is
-- the two inferred values of the market_register set — ONE vocabulary across the
-- guard.
--
-- NO DEFAULT. RG-2b's lesson is standing: a column default is an unearned register
-- and makes any guard vacuous. Every writer stamps register explicitly; a writer
-- that fails to → NULL → BLOCKS at render (fail-safe, matching the guard's
-- unclassified-blocks polarity).

ALTER TABLE public.findings ADD COLUMN register text;

ALTER TABLE public.findings
  ADD CONSTRAINT findings_register_check
  CHECK (register IS NULL OR register = ANY (ARRAY['public_inferred'::text, 'internal_inferred'::text]));

-- Birth-immutable, mirroring odi_market_register_immutable_guard. A finding's
-- register is a property of what it was derived from and does not change after
-- birth. NULL → non-NULL is allowed (the backfill, and a late stamp); once set, it
-- is frozen.
CREATE OR REPLACE FUNCTION public.findings_register_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.register IS NOT NULL AND NEW.register IS DISTINCT FROM OLD.register THEN
    RAISE EXCEPTION 'findings.register is birth-immutable (was %, attempted %)', OLD.register, NEW.register;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER findings_register_immutable_guard
  BEFORE UPDATE ON public.findings
  FOR EACH ROW EXECUTE FUNCTION public.findings_register_immutable();

-- ── BACKFILL (99 rows on the fixture) — earned, not defaulted ─────────────────
-- Observations: inherit the origin signal's band.
UPDATE public.findings f
   SET register = CASE s.signal_band
                    WHEN 'outside' THEN 'public_inferred'
                    WHEN 'organization' THEN 'internal_inferred'
                  END
  FROM public.signals s
 WHERE s.id = f.origin_signal_id
   AND f.register IS NULL
   AND s.signal_band IN ('outside', 'organization');

-- Frontier orphans: derive from the public baseline run they mined. A finding with
-- no origin signal whose origin_run_id resolves to that company's public baseline
-- run is a public/outside synthesis → public_inferred.
UPDATE public.findings f
   SET register = 'public_inferred'
  FROM public.public_baseline_runs r
 WHERE r.id = f.origin_run_id
   AND r.company_id = f.company_id
   AND f.origin_signal_id IS NULL
   AND f.register IS NULL;

-- Anything still NULL has unresolvable provenance (e.g. a frontier whose run was
-- deleted). It STAYS NULL and BLOCKS at render — we cannot prove it is public.
