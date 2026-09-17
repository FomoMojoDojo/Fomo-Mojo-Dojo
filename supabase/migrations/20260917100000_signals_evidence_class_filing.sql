-- FILING EVIDENCE CLASS (operator ruling 2026-09-17, C1 registry classifier). Registry pages (ProPublica
-- Nonprofit Explorer, GuideStar/Candid, Charity Navigator) carry FILING-CLASS text — Form 990 data and the
-- organization's own self-reported profile sections — which is the company speaking through a registry, not the
-- outside speaking about it. Such rows keep evidence value for corroboration and recurrence AS CLIENT VOICE
-- (excluded like own-domain) and never render on a record surface. Ratings, derived metrics and journalism on the
-- same hosts stay prose / outside voice. The class is stamped deterministically by _shared/registryClassifier.ts
-- (host × path × stored-page markers; no model) and recorded per row in raw_payload.registry.
-- Additive: evidence_class gains 'filing' (a filing row carries no listing block). Nothing rewritten.
-- Applied with psql -f (repo convention).
alter table public.signals drop constraint signals_evidence_class_check;
alter table public.signals add constraint signals_evidence_class_check check (evidence_class in ('prose','listing','filing'));
alter table public.signals drop constraint signals_listing_shape_check;
alter table public.signals add constraint signals_listing_shape_check check (
  (evidence_class in ('prose','filing') and listing is null)
  or (evidence_class = 'listing' and listing is not null and listing ? 'product_name' and listing ? 'listing_url')
);
