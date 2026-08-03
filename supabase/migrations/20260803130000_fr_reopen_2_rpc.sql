-- FR-REOPEN-2 — reopen_first_read_session RPC (the reopen authority).
--
-- Builds the sole sanctioned path that flips an issued First Read back to 'open',
-- setting the app.fr_reopen_authority GUC the FR-REOPEN-1 transition edge requires.
-- Mirrors resolve_contest's shape: SECURITY INVOKER, admin-only via has_role,
-- reason-required (recorded-decision law), v_actor = auth.uid()::text.
--
-- Rulings honored:
--   R5  only a 'proposal_issued' session reopens — refuse otherwise, naming the status.
--   R8  refuse while ANY contest on the session is unresolved (round-agnostic), with the
--       operator-signed plain-English string (singular/plural).
--   R3  reset the session's live confirmed/corrected/rejected counts to NULL. Do NOT
--       touch mojo_score_at_open, proposal_json, or proposal_issued_at.
--   R9  old-round contests are NEVER written — this RPC only READS claim_contests (the
--       R8 count). Rounds advance purely via reopen_generation; the next feed stamps the
--       new round through the FR-REOPEN-1 trigger.
--   R1  proposals untouched this gate (still unread; generator still writes proposal_json
--       to the session). Supersession is a later gate.
--
-- SCOPE: RPC only. No UI (FR-REOPEN-3). No consumer made round-aware. first_read_
-- responses_freeze / resolve_contest / set_claim_status untouched.

-- ── reopen audit table — mirrors first_read_session_removals ───────────────────
-- A reopen is a recorded operator decision. NO foreign keys on the scoping ids (the
-- audit must survive later session/company teardown, exactly like the removals audit).
-- RLS left off, matching first_read_session_removals.
create table public.first_read_session_reopens (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null,                 -- NO FK: survives teardown
  company_id         uuid not null,                 -- NO FK
  status_at_reopen   text not null,                 -- always 'proposal_issued' (R5), recorded
  generation_after   int  not null,                 -- reopen_generation AFTER the increment
  confirmed_count    int  not null default 0,       -- counts as they stood at reopen (then reset)
  corrected_count    int  not null default 0,
  rejected_count     int  not null default 0,
  reopened_by        text not null,                 -- the admin actor
  reason             text not null,
  reopened_at        timestamptz not null default now()
);
create index idx_first_read_session_reopens_company
  on public.first_read_session_reopens (company_id, reopened_at desc);

-- ── the RPC ───────────────────────────────────────────────────────────────────
create or replace function public.reopen_first_read_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
as $function$
declare
  v_session    record;
  v_actor      text := coalesce(auth.uid()::text, 'system');
  v_unresolved int;
begin
  -- operator/admin only (mirror resolve_contest)
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'reopen_first_read_session is operator-only (admin authority required)';
  end if;
  -- recorded-decision law: a reopen is a decision, and a decision carries a reason
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reopening a session requires a reason (recorded-decision law)';
  end if;

  select * into v_session from public.first_read_sessions where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id;
  end if;

  -- R5: only an issued session reopens — name the actual status
  if v_session.status <> 'proposal_issued' then
    raise exception 'only an issued session can be reopened — session % has status ''%''',
      p_session_id, v_session.status;
  end if;

  -- R8: refuse while any contest on this session is unresolved (round-agnostic).
  -- Operator-signed refusal, singular/plural. Old-round contests are never touched.
  select count(*) into v_unresolved
    from public.claim_contests
    where session_id = p_session_id and resolution is null;
  if v_unresolved > 0 then
    raise exception '%',
      case when v_unresolved = 1
        then 'This session can''t reopen yet — 1 contested finding is still awaiting your judgment. Resolve them on Extracts first.'
        else 'This session can''t reopen yet — ' || v_unresolved || ' contested findings are still awaiting your judgment. Resolve them on Extracts first.'
      end;
  end if;

  -- Authorize the GUC-gated transition edge (FR-REOPEN-1), txn-local. Then flip status,
  -- bump the generation, and reset the live counts (R3) in one update. mojo_score_at_open,
  -- proposal_json, proposal_issued_at are deliberately NOT in the SET list.
  perform set_config('app.fr_reopen_authority', 'on', true);

  update public.first_read_sessions
  set status            = 'open',
      reopen_generation = reopen_generation + 1,
      confirmed_count   = null,
      corrected_count   = null,
      rejected_count    = null
  where id = p_session_id;

  -- Record the decision: snapshot the pre-reset counts + the new generation.
  insert into public.first_read_session_reopens
    (session_id, company_id, status_at_reopen, generation_after,
     confirmed_count, corrected_count, rejected_count, reopened_by, reason)
  values
    (p_session_id, v_session.company_id, v_session.status, v_session.reopen_generation + 1,
     coalesce(v_session.confirmed_count, 0), coalesce(v_session.corrected_count, 0),
     coalesce(v_session.rejected_count, 0), v_actor, p_reason);

  -- Scope the authority down immediately: it is already txn-local (is_local=true), and
  -- this reset means no later statement in the same txn can ride the reopen authority.
  perform set_config('app.fr_reopen_authority', 'off', true);
end;
$function$;
