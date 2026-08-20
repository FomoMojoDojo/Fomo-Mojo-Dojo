-- GATE B-1 (operator ruling 2026-08-20, option a): pairing_kind separates the two
-- delta reads — internal_vs_public (Diagnose/Extracts founding signal) and
-- public_vs_public (First Read: client-voice public vs third-party public).
--
-- Backfill: ADD COLUMN ... NOT NULL DEFAULT is a catalog-only change in Postgres 11+
-- (no row rewrite, no UPDATE, no row triggers fire) — every existing row reads
-- 'internal_vs_public' via the stored default. CB1 (frozen) rows are untouched by
-- construction; its enforce_company_freeze trigger never fires. Idempotent.

ALTER TABLE public.claim_deltas
  ADD COLUMN IF NOT EXISTS pairing_kind text NOT NULL DEFAULT 'internal_vs_public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_deltas_pairing_kind_check') THEN
    ALTER TABLE public.claim_deltas
      ADD CONSTRAINT claim_deltas_pairing_kind_check
      CHECK (pairing_kind IN ('internal_vs_public', 'public_vs_public'));
  END IF;
END $$;

ALTER TABLE public.claim_delta_rejections
  ADD COLUMN IF NOT EXISTS pairing_kind text NOT NULL DEFAULT 'internal_vs_public';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'claim_delta_rejections_pairing_kind_check') THEN
    ALTER TABLE public.claim_delta_rejections
      ADD CONSTRAINT claim_delta_rejections_pairing_kind_check
      CHECK (pairing_kind IN ('internal_vs_public', 'public_vs_public'));
  END IF;
END $$;
