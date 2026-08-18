-- Own-domain deep-read seam (design gate 2026-08-18, ruling 1):
-- URL-identity supersession for site_crawl-minted signals. Additive only —
-- existing rows untouched, no backfill. "Current" = superseded_at IS NULL.
-- Supersession NEVER deletes: the old row stays as the readable prior state,
-- and (old → superseded_by → new) pairs are the "what changed on their site"
-- report the pre-meeting freshness pass reads.
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS superseded_at timestamptz NULL;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS superseded_by uuid NULL REFERENCES public.signals(id);
COMMENT ON COLUMN public.signals.superseded_at IS 'site_crawl supersession: when a re-crawl of the same URL replaced this row''s text (NULL = current)';
COMMENT ON COLUMN public.signals.superseded_by IS 'site_crawl supersession: the newer signal row that replaced this one';
