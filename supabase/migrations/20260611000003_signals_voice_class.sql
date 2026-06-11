-- B1 (outside-run expansion): four-class voice taxonomy storage.
-- voice_class ∈ client_voice | outside_voice_about_client | competitor_voice | market_context.
-- Additive only: NULL for legacy rows (read through the documented binary fallback in
-- _shared/claimProvenance.ts classifyVoice). signal_band is deliberately untouched —
-- claim-state gates depend on its outside/organization/customer semantics (gates.ts:91-191),
-- and voice_class does NOT enter gate semantics (council 2026-06-10).

alter table public.signals
  add column if not exists voice_class text null;
