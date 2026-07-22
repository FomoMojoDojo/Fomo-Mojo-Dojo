-- First Read — GATE 1 (SCHEMA). The presenter-driven five-act first-meeting
-- flow's two tables. Migration only: no UI, no edge functions, no generator.
--
-- Session lifecycle (operator ruling): a session is NOT closed at meeting end.
-- Verdicts freeze when the PROPOSAL IS ISSUED; the session then awaits the
-- prospect's answer and resolves on accept (they become a client) or decline.
--   open → proposal_issued → accepted | declined
--
-- Laws in force:
--   * content identity is computed in TS (sha256(normalizeForHash(text))) and
--     inserted as item_identity — NEVER reimplemented in SQL here.
--   * provenance rows carry NO FK to the rows they reference (item_ref): ids
--     self-heal, identity survives regen. (session_id/company_id DO carry FKs —
--     those are ownership, not provenance.)
--   * gate-before-artifact; pg_dump taken before this write.

begin;

-- ── first_read_sessions — one row per first-meeting engagement ────────────────
create table public.first_read_sessions (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  presenter           text,
  status              text not null default 'open'
                        check (status in ('open','proposal_issued','accepted','declined')),
  started_at          timestamptz not null default now(),
  proposal_issued_at  timestamptz,
  resolved_at         timestamptz,
  mojo_score_at_open  integer,
  -- flywheel fact — cached at proposal issuance (later gate populates these):
  confirmed_count     integer,
  corrected_count     integer,
  rejected_count      integer,
  -- intake: pre-meeting, per-session, UNVERIFIED operator notes. Deliberately
  -- on the session (not companies): meeting-scoped context, never confused with
  -- observed or client-attested evidence.
  trigger_event       text,
  room_roles          jsonb,
  legal_name          text,
  domains             text[],
  landmines           text
);

create index first_read_sessions_company_idx on public.first_read_sessions (company_id);

-- ── first_read_responses — per-item client verdict (evidence-layer shaped) ────
-- insert/upsert while the session is open; frozen forever once the proposal is
-- issued (freeze trigger below). One final verdict per item per meeting.
create table public.first_read_responses (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.first_read_sessions(id) on delete cascade,
  company_id       uuid not null,                    -- denormalized: cross-session aggregation without a join
  item_kind        text not null check (item_kind in ('finding','market','differentiator')),
  item_ref         uuid,                             -- source row id; PROVENANCE ONLY, no FK (ids self-heal)
  item_identity    text not null,                    -- sha256(normalizeForHash(item_text)); computed in TS
  item_text        text not null,                    -- verbatim text shown to the client, frozen at capture
  verdict          text not null check (verdict in ('confirmed','corrected','rejected')),
  correction_text  text,
  source           text not null default 'client_attested'
                     check (source in ('client_attested')),  -- the client-attested provenance origin
  captured_at      timestamptz not null default now(),
  constraint corrected_requires_text
    check (verdict <> 'corrected'
           or (correction_text is not null and length(trim(correction_text)) > 0)),
  unique (session_id, item_identity)
);

create index first_read_responses_company_idx on public.first_read_responses (company_id);

-- ── Verdict-freeze enforcement (in-schema, not app-side) ─────────────────────
-- Refuses INSERT/UPDATE/DELETE on a response when the parent session is not
-- 'open'. From proposal_issued onward the ledger is immutable.
--
-- Cascade carve-out: an FK ON DELETE CASCADE runs as an AFTER referential
-- action, so by the time a response's BEFORE DELETE fires during a session (or
-- company) cascade, the parent session row is already gone → the lookup finds
-- nothing → we ALLOW it. That distinguishes legitimate record removal from
-- direct ledger tampering on a still-present frozen session, which we REFUSE.
create or replace function public.first_read_responses_freeze()
returns trigger
language plpgsql
as $$
declare
  v_session_id uuid;
  v_status     text;
begin
  v_session_id := coalesce(NEW.session_id, OLD.session_id);
  select status into v_status from public.first_read_sessions where id = v_session_id;
  if not found then
    -- session already gone (cascade) or FK will reject the insert — not tampering
    return coalesce(NEW, OLD);
  end if;
  if v_status <> 'open' then
    raise exception
      'first_read_responses is frozen: session % has status ''%'' — verdicts are immutable once the proposal is issued',
      v_session_id, v_status;
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger first_read_responses_freeze
  before insert or update or delete on public.first_read_responses
  for each row execute function public.first_read_responses_freeze();

-- ── Status-transition guard ──────────────────────────────────────────────────
-- Only open→proposal_issued, proposal_issued→accepted, proposal_issued→declined.
-- Stamps proposal_issued_at / resolved_at on the respective transitions when the
-- caller did not supply them.
create or replace function public.first_read_sessions_transition()
returns trigger
language plpgsql
as $$
begin
  if NEW.status is distinct from OLD.status then
    if not (
      (OLD.status = 'open'            and NEW.status = 'proposal_issued') or
      (OLD.status = 'proposal_issued' and NEW.status in ('accepted','declined'))
    ) then
      raise exception
        'illegal first_read_sessions transition: ''%'' -> ''%'' (allowed: open->proposal_issued, proposal_issued->accepted, proposal_issued->declined)',
        OLD.status, NEW.status;
    end if;

    if NEW.status = 'proposal_issued' and NEW.proposal_issued_at is null then
      NEW.proposal_issued_at := now();
    end if;
    if NEW.status in ('accepted','declined') and NEW.resolved_at is null then
      NEW.resolved_at := now();
    end if;
  end if;
  return NEW;
end;
$$;

create trigger first_read_sessions_transition
  before update on public.first_read_sessions
  for each row execute function public.first_read_sessions_transition();

commit;
