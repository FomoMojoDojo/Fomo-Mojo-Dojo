-- OBSERVED CONTEST — OC-3 (RESOLVE). The write-machinery the OC-1 schema deferred:
-- the resolution RPC, the external-strike auto-resolve hook, and the company-teardown
-- refusal while contests await judgment. No schema table changes beyond ONE widened
-- CHECK (operator ruling 2026-07-24, below).
--
-- LAWS ENCODED / HONORED:
--
--  * SOLE STATUS AUTHORITY. A resolution NEVER writes claims.status directly — a strike
--    or a set-aside delegates to the EXISTING set_claim_status authority (strike/minimize
--    law). This RPC is a SECOND resolution writer, never a second status writer.
--
--  * KIND-APPROPRIATE, structurally. The OC-1 CHECK already forbade the cross-kind
--    mismatches (disputed→set_aside, immaterial→strike_resolved). This gate WIDENS it to
--    admit (immaterial, dismissed) per the operator ruling; the two mismatches stay
--    forbidden. The RPC ALSO raises a clean kind-mismatch message before the CHECK bites.
--
--  * OPERATOR/ADMIN ONLY. resolve_contest refuses a non-admin caller (has_role guard,
--    the ratified admin authority), requires a reason (recorded-decision law), and
--    refuses re-resolving an already-resolved contest.
--
--  * AUTO-RESOLVE ON EXTERNAL STRIKE (built here — NOT present in OC-1). When a claim is
--    struck OUTSIDE the contest flow, its OPEN contests become moot and auto-resolve:
--    disputed → strike_resolved (the dispute is upheld by the strike), immaterial →
--    dismissed (the claim already stops counting; minimizing it would contradict the
--    strike). Direction is status→contest only — never contest→status (ruling 1 intact).
--
--  * TEARDOWN REFUSAL (built here — OC-1 cascade+audited open contests silently). A
--    company with OPEN contests cannot be torn down: a BEFORE DELETE trigger on companies
--    raises a plain-English message. Placed on companies (not on the contest delete
--    trigger) so OC-1's direct-delete cascade+audit behavior — and its test — stand.
--
--  * gate-before-artifact; pg_dump taken (backups/pre_oc3_20260724.sql).

begin;

-- ── Ruling amendment (2026-07-24): immaterial → Dismiss is lawful ──────────────
-- "A contest awaits the operator's judgment; a judgment that can only go one way isn't a
-- judgment. Without Dismiss, an immaterial contest forces minimize — the client's word
-- compelling a status change with the operator as rubber stamp, the exact auto-minimize
-- the schema forbids. Dismiss = disagree-and-close: contest resolved, claim untouched,
-- disagreement on record." Widen the CHECK to admit (immaterial, dismissed); the two
-- cross-kind mismatches (disputed→set_aside, immaterial→strike_resolved) STAY forbidden.
alter table public.claim_contests drop constraint claim_contests_resolution_kind;
alter table public.claim_contests add constraint claim_contests_resolution_kind check (
  resolution is null
  or (contest_kind = 'disputed'   and resolution in ('strike_resolved','dismissed'))
  or (contest_kind = 'immaterial' and resolution in ('set_aside','dismissed'))
);

-- ── resolve_contest — the SOLE sanctioned resolution path ──────────────────────
-- Sets the contest's resolution FIRST, then (for strike/set_aside) delegates the status
-- change to set_claim_status. Ordering matters: resolving the contest before the strike
-- means the external-strike hook below finds it already resolved and skips it — no
-- double-write. Dismiss changes no status at all.
create or replace function public.resolve_contest(
  p_contest_id uuid,
  p_resolution text,
  p_reason     text
) returns void
language plpgsql
as $$
declare
  v_contest record;
  v_actor   text := coalesce(auth.uid()::text, 'system');
begin
  -- operator/admin only
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'resolve_contest is operator-only (admin authority required)';
  end if;
  -- recorded-decision law: a resolution is a decision, and a decision carries a reason
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'resolving a contest requires a reason (recorded-decision law)';
  end if;

  select * into v_contest from public.claim_contests where id = p_contest_id;
  if not found then
    raise exception 'contest % not found', p_contest_id;
  end if;
  -- refuse re-resolving — a resolved contest is a closed decision
  if v_contest.resolution is not null then
    raise exception 'contest % is already resolved (%) — re-resolving is refused', p_contest_id, v_contest.resolution;
  end if;

  -- kind-appropriate (clean message before the CHECK backstop bites)
  if v_contest.contest_kind = 'disputed' and p_resolution not in ('strike_resolved','dismissed') then
    raise exception 'a disputed contest resolves only to strike_resolved or dismissed (got %)', p_resolution;
  end if;
  if v_contest.contest_kind = 'immaterial' and p_resolution not in ('set_aside','dismissed') then
    raise exception 'an immaterial contest resolves only to set_aside or dismissed (got %)', p_resolution;
  end if;

  -- write the resolution FIRST (so an ensuing strike's auto-resolve hook skips this row)
  update public.claim_contests
  set resolution = p_resolution,
      resolution_reason = p_reason,
      resolved_at = now(),
      resolved_by = v_actor
  where id = p_contest_id;

  -- delegate the status consequence to the SOLE authority — never a direct status write
  if p_resolution = 'strike_resolved' then
    perform public.set_claim_status(v_contest.claim_id, 'struck', p_reason, v_actor);
  elsif p_resolution = 'set_aside' then
    perform public.set_claim_status(v_contest.claim_id, 'minimized', p_reason, v_actor);
  end if;
  -- 'dismissed' changes no claim status: contest closed, claim untouched.
end;
$$;

-- ── Auto-resolve open contests when a claim is struck OUTSIDE the contest flow ──
-- status→contest ONLY (never the reverse). SECURITY DEFINER so the write lands whoever
-- struck the claim (admin UI, service-role pipeline). Only OPEN contests (resolution is
-- null) are touched — a resolve_contest strike has already resolved its own row.
create or replace function public.claim_contests_auto_resolve_on_strike()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.claim_contests
  set resolution = case when contest_kind = 'disputed' then 'strike_resolved' else 'dismissed' end,
      resolution_reason = 'Auto-resolved: the claim was struck outside the contest flow.',
      resolved_at = now(),
      resolved_by = 'system:external_strike'
  where claim_id = new.id
    and resolution is null;
  return new;
end;
$$;

create trigger claim_contests_auto_resolve_on_strike
  after update of status on public.claims
  for each row
  when (new.status = 'struck' and old.status is distinct from 'struck')
  execute function public.claim_contests_auto_resolve_on_strike();

-- ── Company teardown refusal while OPEN contests exist ─────────────────────────
-- OC-1 cascade-deleted + audited open contests on teardown (silently discarding the
-- client's unresolved verdict). OC-3 refuses: resolve or dismiss them first. On companies
-- (not the contest trigger) so OC-1's audited-cascade of a DIRECT contest delete stands.
create or replace function public.companies_open_contest_guard()
returns trigger
language plpgsql
as $$
declare
  v_open int;
begin
  select count(*) into v_open
  from public.claim_contests
  where company_id = old.id and resolution is null;
  if v_open > 0 then
    raise exception '% open contest(s) await your judgment for this company — resolve or dismiss them (Extracts → Contested) before removing it', v_open;
  end if;
  return old;
end;
$$;

create trigger companies_open_contest_guard
  before delete on public.companies
  for each row
  execute function public.companies_open_contest_guard();

commit;
