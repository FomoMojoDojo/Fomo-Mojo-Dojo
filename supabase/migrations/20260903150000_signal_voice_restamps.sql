-- AUTHORSHIP RESTAMP AUDIT (operator ruling 2026-09-03, B) — signal_voice_restamps.
--
-- The outside ingest path stamped signals.voice_class by HOST; aggregator company-profile pages
-- (Glassdoor /Overview/, LinkedIn /company/, Crunchbase /organization/, …) carry the company's own
-- boilerplate and were labeled outside_voice_about_client — self-voice scoring as market confirmation
-- (CHANNEL ≠ VOICE). The forward path now judges AUTHORSHIP (_shared/aggregatorAuthorship.ts); the
-- stored rows are re-stamped by restamp-aggregator-self-voice, which writes ONE row here per changed
-- signal BEFORE it touches the signal (preserve + audit law; never a delete).
--
-- SEMANTICS
--   run_ref          — the apply run (uuid string) — the unit of REVERSAL (revert_run_ref).
--   ledger_run_id    — the per-company long_runner_runs row (run_kind='selfvoice_restamp').
--   old_voice_class  — what the signal carried before (NULL for a legacy-null row).
--   new_voice_class  — what was written: client_voice (the subject company speaking) or
--                      competitor_voice (another named entity speaking). Never anything else —
--                      the judge can only DEMOTE a host stamp toward a named voice.
--   judge_*          — the local judge's verbatim verdict / named entity / reason / model.
--   reverted_at      — set by the revert path when old_voice_class was restored. The audit row
--                      itself is never deleted.
--
-- APPEND-ONLY by convention (the edge fn only inserts + sets reverted_at).

begin;

create table public.signal_voice_restamps (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  signal_id        uuid not null references public.signals(id) on delete cascade,
  run_ref          text not null,
  ledger_run_id    uuid references public.long_runner_runs(id) on delete set null,
  old_voice_class  text,
  new_voice_class  text not null check (new_voice_class in ('client_voice','competitor_voice')),
  judge_verdict    text not null,
  judge_entity     text,
  judge_reason     text not null,
  judge_model      text not null,
  source_url       text,
  applied_at       timestamptz not null default now(),
  reverted_at      timestamptz
);

create index signal_voice_restamps_company_idx on public.signal_voice_restamps (company_id, applied_at desc);
create index signal_voice_restamps_run_ref_idx on public.signal_voice_restamps (run_ref);
create index signal_voice_restamps_signal_idx  on public.signal_voice_restamps (signal_id);

alter table public.signal_voice_restamps enable row level security;

create policy "service role full access on signal_voice_restamps"
  on public.signal_voice_restamps
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "members can read company signal_voice_restamps"
  on public.signal_voice_restamps for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = signal_voice_restamps.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = signal_voice_restamps.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );

-- FREEZE: migration 20260810120000 attached enforce_company_freeze to the company_id-bearing tables
-- that existed AT ITS RUN TIME; a new table must attach explicitly so a frozen company (CB1) can never
-- receive an audit row either.
create trigger enforce_company_freeze
  before insert or update or delete on public.signal_voice_restamps
  for each row execute function public.enforce_company_freeze();

commit;
