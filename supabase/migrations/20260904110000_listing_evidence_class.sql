-- LISTING EVIDENCE CLASS (operator ruling 2026-09-04, shape signed in full). A third-party product listing
-- (title / price / brand attribution) is admissible evidence in its own class — never rendered as speech.
-- (a) signals.evidence_class prose|listing (default prose: every existing row is prose), signals.listing jsonb
--     {product_name, price, currency, attribution_text, listing_url, detected_from}; source_type gains
--     outside_listing_regen (no CHECK on source_type today — documented here); partial index on listing rows.
--     outside_page_snapshots.structured jsonb: the raw structured block (JSON-LD / og product meta / vendor)
--     captured from the raw HTML BEFORE extractTextBasic, so listing regeneration reads a STORED basis.
-- Additive. Nothing rewritten. Applied with psql -f (repo convention).
alter table public.signals
  add column evidence_class text not null default 'prose',
  add column listing jsonb,
  add constraint signals_evidence_class_check check (evidence_class in ('prose','listing')),
  add constraint signals_listing_shape_check check (
    (evidence_class = 'prose' and listing is null)
    or (evidence_class = 'listing' and listing is not null and listing ? 'product_name' and listing ? 'listing_url')
  );
create index signals_listing_idx on public.signals (company_id) where evidence_class = 'listing';
alter table public.outside_page_snapshots add column structured jsonb;
