-- RG-2b — the generator EARNS market_options.market_register.
--
-- Since MO-1 the column was NOT NULL DEFAULT 'public_inferred' with ZERO
-- generator assignments: every row carried an UNEARNED register and the MO-1
-- options render passed the RG-1 guard vacuously. This closes that: register is
-- derived from real provenance, the default is dropped (fail-loud on a forgotten
-- stamp), and the value is birth-immutable.
--
-- CORPUS-PROPERTY, per MO-1's own law. Market options are built from the FINDINGS
-- corpus (the substance); odi_market_definitions enter only as knownWho NAMES,
-- not substance. So an option's register follows the register of the evidence
-- that JUSTIFIES its claim — the findings — not a def-name it may echo. Operator
-- ruling: a WHO echoing an internal direction is corroboration between internal
-- direction and public perception, NOT taint.
--
-- The grain is per-company-corpus, not per-option: every option in a run is built
-- from the same evidence, and no per-option provenance signal distinguishes them.
--
-- FAIL-TOWARD-INTERNAL (voice-gate polarity). public_inferred ONLY if the
-- company's finding corpus is entirely public_inferred; ANY non-public or NULL
-- finding taints the whole run's options to internal_inferred (blocked from the
-- outside surface). We cannot prove which findings a given option drew on.

-- ── 1. EARN every banked row from its company's finding corpus ────────────────
-- This is a real corpus CHECK, not a re-assertion of the old default: it yields
-- internal_inferred if the corpus is contaminated. On this all-public fixture it
-- resolves to public_inferred for all 68 rows — because the corpus IS public,
-- not because the column already said so.
UPDATE public.market_options mo
   SET market_register = CASE
     WHEN EXISTS (SELECT 1 FROM public.findings f
                  WHERE f.company_id = mo.company_id
                    AND (f.register IS DISTINCT FROM 'public_inferred'))
       THEN 'internal_inferred'
     WHEN EXISTS (SELECT 1 FROM public.findings f WHERE f.company_id = mo.company_id)
       THEN 'public_inferred'
     ELSE market_register  -- an options-bearing company with no findings is impossible
                           -- (the no_evidence guard); leave untouched rather than guess.
   END;

-- ── 2. DROP the unearned default ─────────────────────────────────────────────
-- The column stays NOT NULL. Options are born entirely inside our pipeline (one
-- inserter), so a missing stamp is a CODE BUG: it now fails loud at insert
-- (NOT NULL violation) instead of silently defaulting. Findings' nullable +
-- NULL-blocks precedent deliberately does NOT apply here — options have no
-- unprovable case.
ALTER TABLE public.market_options ALTER COLUMN market_register DROP DEFAULT;

-- ── 3. BIRTH-IMMUTABLE ───────────────────────────────────────────────────────
-- Register is what the option was built FROM. Recovery, supersession and
-- duplicate-collapse change STATUS, never the evidence corpus, so none is a
-- legitimate register mutation. Mirrors odi_market_register_immutable_guard and
-- findings_register_immutable_guard.
CREATE OR REPLACE FUNCTION public.market_options_register_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.market_register IS DISTINCT FROM NEW.market_register THEN
    RAISE EXCEPTION 'market_options.market_register is birth-immutable (was %, attempted %)',
      OLD.market_register, NEW.market_register;
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER market_options_register_immutable_guard
  BEFORE UPDATE ON public.market_options
  FOR EACH ROW EXECUTE FUNCTION public.market_options_register_immutable();
