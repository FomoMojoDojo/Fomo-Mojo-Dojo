-- B2.0 (syndication gate): content-level provenance layer. A third-party host
-- republishing client copy (run-16 bouncewatch case) must not corroborate client claims.
-- syndicated_from_client: NULL = unstamped (lazy-stamped at first judge read),
-- true = substantially client copy (no corroboration rights), false = clean.
-- syndication_score: item-relative shingle-overlap measure, kept for threshold calibration.
-- Additive only; signal_band and voice_class untouched.

alter table public.signals
  add column if not exists syndicated_from_client boolean null,
  add column if not exists syndication_score numeric null;
