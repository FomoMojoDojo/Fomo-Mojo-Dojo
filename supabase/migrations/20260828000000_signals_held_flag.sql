-- ── signals.held_at / held_reason (Gate 3 / J1 step 2) ───────────────────────
--
-- A NEW dedicated hold flag, distinct from superseded_at. superseded_at means the
-- source itself changed/died (a real market change: page blocked/gone, own-domain
-- re-mint, dead URL). held_at means the OPPOSITE: the source is ALIVE and unchanged,
-- but we have not yet VERIFIED the outside excerpt against fetched page text (it is a
-- model paraphrase, not a provable substring). Such a row is kept in the record but
-- held OFF the client surface until the queued re-crawl verifies it — it was never
-- superseded, so it must not wear the superseded semantic.
--
-- Nullable, no default rewrite, no backfill. NOTHING auto-populates these columns:
-- they are operator-only (the fill / recurrence / crawl paths never write them).
alter table public.signals add column if not exists held_at    timestamptz;
alter table public.signals add column if not exists held_reason text;
