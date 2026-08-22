-- GATE 6a (2026-08-22): public-only "Our read". A confirmed, ledgered, judged read of the company's
-- positioning / strategy / promise, computed STRICTLY from public-provenance inputs (outside signals,
-- own-words, public_inferred findings, public_research markets, public_vs_public deltas) — nothing
-- internal/uploaded/intake/internal_declared ever enters. Each row carries the exact input ids it read
-- (input_ledger), the router's model stamp, and the judge verdict. Old canvas/cascade rows are NEVER
-- deleted — a written row points back to the legacy row it supersedes (supersedes_legacy_row) and a
-- newer read supersedes the prior current row (superseded_by + is_current=false). CB1 never written:
-- the enforce_company_freeze trigger (below) refuses any write whose company_id is frozen.

CREATE TABLE IF NOT EXISTS public.public_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  kind text NOT NULL CHECK (kind IN ('positioning', 'strategy', 'promise')),
  payload jsonb NOT NULL,
  input_ledger jsonb NOT NULL,
  model_provider text,
  model_name text,
  judge_verdict jsonb,
  judge_model text,
  is_current boolean NOT NULL DEFAULT true,
  superseded_by uuid REFERENCES public.public_reads(id),
  supersedes_legacy_row uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One current row per (company, kind). A superseded row (is_current=false) is kept forever.
CREATE UNIQUE INDEX IF NOT EXISTS public_reads_current_one
  ON public.public_reads (company_id, kind) WHERE is_current;

CREATE INDEX IF NOT EXISTS public_reads_company_kind
  ON public.public_reads (company_id, kind, created_at DESC);

-- CB1 / any frozen company is never written (same generic guard as the other 80 company_id tables).
DROP TRIGGER IF EXISTS enforce_company_freeze ON public.public_reads;
CREATE TRIGGER enforce_company_freeze
  BEFORE INSERT OR UPDATE OR DELETE ON public.public_reads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_company_freeze();
