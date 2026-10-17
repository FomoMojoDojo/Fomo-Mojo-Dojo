-- EXCERPT BLANKING AUDIT (operator ruling 2026-10-16, backfill act b2) — signal_excerpt_blankings.
--
-- THE LAW (signed 2026-10-16): claim_text may be our summary; evidence_excerpt is the page's words or
-- absent. 714 live outside rows carry an evidence_excerpt that is NOT on any ok snapshot of their url and
-- not on their quote_source_text — our summary standing as the page's words. Act b2 blanks those excerpts
-- (claim_text stays; the text moves to raw_payload.excerpt_guard.unverified_excerpt) and stamps the 64
-- analysis rows among them without blanking (the 2026-09-02 carve-out). This table is the audit: ONE row
-- here per touched signal, written BEFORE the signal is touched (preserve + audit law; never a delete).
-- Shaped like signal_voice_restamps (migration 20260903150000), the restamp precedent.
--
-- SEMANTICS
--   run_ref            — the apply run (uuid string) — the unit of REVERSAL (revert by run_ref).
--   action             — 'blanked' (excerpt emptied, text stashed) | 'stamped_only' (analysis row: stamp, keep).
--   old_evidence_excerpt — what the signal carried before. Restored verbatim on revert.
--   old_excerpt_guard  — raw_payload.excerpt_guard before (NULL when the row carried none). Restored on
--                        revert; NULL ⇒ the key is removed again.
--   new_excerpt_guard  — the stamp written: { basis:'page_snapshot', traced:false,
--                        reason:'not_on_retained_page', basis_sha, basis_at, guard_version, unverified_excerpt?,
--                        analysis_carve_out?, backfill_run_ref }.
--   basis_sha / basis_at — the newest ok snapshot of the url the excerpt was tested against (the planner
--                        tests EVERY ok snapshot of the url; the newest names the record).
--   reverted_at        — set by the revert path when the row was restored. The audit row itself is never
--                        deleted.
--
-- ACCESS. RLS on. service_role full. Admin READ ONLY for authenticated (has_role admin) — no member read,
-- no app-role write: this is operator audit, not client-facing record. anon holds nothing. The restamps
-- table left anon and authenticated holding INSERT/UPDATE/DELETE under RLS; this one revokes them at the
-- grant layer too, so the policy is not the only gate (grants-guard g1/g3 posture).
--
-- APPEND-ONLY by convention (the runner only inserts and sets reverted_at).

begin;

create table public.signal_excerpt_blankings (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  signal_id             uuid not null references public.signals(id) on delete cascade,
  run_ref               text not null,
  action                text not null check (action in ('blanked','stamped_only')),
  old_evidence_excerpt  text not null,
  old_excerpt_guard     jsonb,
  new_excerpt_guard     jsonb not null,
  basis_kind            text not null check (basis_kind in ('page_snapshot')),
  basis_sha             text not null,
  basis_at              timestamptz,
  source_url            text,
  voice_class           text,
  applied_at            timestamptz not null default now(),
  reverted_at           timestamptz
);

create index signal_excerpt_blankings_company_idx on public.signal_excerpt_blankings (company_id, applied_at desc);
create index signal_excerpt_blankings_run_ref_idx on public.signal_excerpt_blankings (run_ref);
create index signal_excerpt_blankings_signal_idx  on public.signal_excerpt_blankings (signal_id);

alter table public.signal_excerpt_blankings enable row level security;

create policy "service role full access on signal_excerpt_blankings"
  on public.signal_excerpt_blankings
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "admins can read signal_excerpt_blankings"
  on public.signal_excerpt_blankings for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- GRANT LAYER: anon nothing; authenticated SELECT only (the admin policy decides which rows); no app-role
-- write path exists at either layer.
revoke all on public.signal_excerpt_blankings from anon;
revoke all on public.signal_excerpt_blankings from authenticated;
grant select on public.signal_excerpt_blankings to authenticated;

-- FREEZE: migration 20260810120000 attached enforce_company_freeze to the company_id-bearing tables that
-- existed AT ITS RUN TIME; a new table must attach explicitly so a frozen company (CB1) can never receive
-- an audit row either.
create trigger enforce_company_freeze
  before insert or update or delete on public.signal_excerpt_blankings
  for each row execute function public.enforce_company_freeze();

commit;
