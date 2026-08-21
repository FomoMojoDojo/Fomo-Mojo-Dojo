-- GATE S1 (operator ruling 2026-08-20): signals gain a business-operating-status field, populated
-- deterministically from text (S2) now and from a live status probe (B4a) in a later gate. The crawl
-- never captured operating status; closure language sat unweighted next to operating mentions.
-- Additive, idempotent. ADD COLUMN ... DEFAULT is catalog-only in PG11+ (no row rewrite, no row
-- trigger fires) — CB1 (frozen) rows read 'unknown' via the stored default, untouched.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS operating_status text NOT NULL DEFAULT 'unknown';
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS operating_status_as_of date;
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS operating_status_source text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signals_operating_status_check') THEN
    ALTER TABLE public.signals ADD CONSTRAINT signals_operating_status_check
      CHECK (operating_status IN ('open', 'temporarily_closed', 'permanently_closed', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signals_operating_status_source_check') THEN
    ALTER TABLE public.signals ADD CONSTRAINT signals_operating_status_source_check
      CHECK (operating_status_source IS NULL OR operating_status_source IN ('text_classifier', 'status_probe'));
  END IF;
END $$;
