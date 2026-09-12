-- DURABLE CHECK OUTCOMES BY CONTENT IDENTITY (operator rulings 1–7, 2026-09-12).
--
-- WHY. A check outcome was recorded on the ROW it happened to land on (tests.outcome, a condition's
-- checked_at inside routes.what_would_have_to_be_true). Synthesis re-rolls replace rows: the leg re-roll
-- deletes a leg's tests (remove_tests_for_leg_reroll — whose preservation proofs omitted tests.outcome, so
-- the 09-12 planted failed test was deletable the whole time) and the conditions re-roll rebuilds
-- kept-generated conditions without checked_at. The law already in force for verdicts — content identity
-- is the unit of evidence; verdicts persist by it, never re-roll — applies to check outcomes.
--
-- WHAT. check_outcomes: one row per recorded check, keyed by the CONDITION's content identity
-- (subject_identity = contentIdentity(condition text) — for a leg test, the leg's CARRIED condition,
-- ruling 2), check_kind, and check_version (ruling 4). Company-wide (ruling 1): route_id / route_title /
-- leg_id / test_id are CONTEXT columns with no FK — a check applies to any route carrying the identical
-- condition and outlives the row it was recorded on. Append-only: a later check of the same identity is a
-- NEW row that supersedes the prior one (superseded_by; latest-wins within an identity — ruling 3);
-- 'withdrawn' removes the identity from resolution. tests.outcome and the element's checked_at /
-- satisfied_flag become a DISPLAY CACHE written FROM the live row by the TS layer (resurrection, ruling 7)
-- — never the reverse.
--
-- IDENTITY LAW (ruling 5 / PCT-1, PCT-2). No SQL here computes content identity. subject_identity is
-- stamped by the single TS authority (_shared/contentIdentity.ts). The guards below compare RAW condition
-- text for equality (a stamped element carried verbatim), which is not identity resolution.
--
-- GUARDS (all in this migration): tests_delete_audit and remove_tests_for_leg_reroll gain the
-- tests.outcome proof (passed | failed | inconclusive are all preserved-class, ruling 6); tests.outcome
-- may only be written through the sanctioned cache path (set_test_outcome_cache); route condition arrays
-- that carry stamped elements are replaced only through replace_route_conditions, which refuses to drop
-- a stamped element unless the drop is declared.

begin;

-- ── 1. the durable record ─────────────────────────────────────────────────────────────────────────
create table public.check_outcomes (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  subject_identity    text not null check (subject_identity ~ '^[0-9a-f]{64}$'),
  check_kind          text not null check (check_kind in ('condition_check', 'leg_test')),
  check_version       integer not null default 1 check (check_version >= 1),
  verdict             text not null check (verdict in ('satisfied', 'unsatisfied', 'passed', 'failed', 'inconclusive', 'withdrawn')),
  subject_text        text not null check (length(btrim(subject_text)) > 0),
  -- leg_test detail (never key)
  hypothesis_identity text,
  hypothesis_text     text,
  move_identity       text,
  move_text           text,
  -- CONTEXT — where the check was recorded; NO FKs so the row outlives re-roll and teardown
  route_id            uuid,
  route_title         text,
  leg_id              uuid,
  test_id             uuid,
  evidence_refs       uuid[] not null default '{}',
  note                text,
  recorded_by         uuid,
  recorded_at         timestamptz not null default now(),
  -- DEFERRABLE: supersession sets the prior row's pointer to the NEW row's id before that row is
  -- inserted (so the live-uniqueness index never sees two live rows); the FK is checked at commit.
  -- ON DELETE CASCADE (not SET NULL): deleting a decision must never silently REVIVE the one it
  -- superseded — the chain it closed goes with it (every row audited by the delete trigger) — and a
  -- company teardown cascades in any row order without tripping the set-once rule.
  superseded_by       uuid references public.check_outcomes(id) on delete cascade deferrable initially deferred,
  constraint check_outcomes_kind_verdict check (
    (check_kind = 'condition_check' and verdict in ('satisfied', 'unsatisfied', 'withdrawn'))
    or (check_kind = 'leg_test' and verdict in ('passed', 'failed', 'inconclusive', 'withdrawn'))
  )
);
comment on table public.check_outcomes is
  'Durable check outcomes keyed by the condition''s content identity (TS authority). Append-only; latest row per (company, identity, kind, version) is live; withdrawn removes the identity from resolution.';

-- Exactly one LIVE outcome per (company, identity, kind, version).
create unique index check_outcomes_live_uniq
  on public.check_outcomes (company_id, subject_identity, check_kind, check_version)
  where superseded_by is null;
create index check_outcomes_company_idx on public.check_outcomes (company_id, recorded_at desc);

alter table public.check_outcomes enable row level security;
create policy "members and admins read check outcomes"
  on public.check_outcomes for select to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = check_outcomes.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = check_outcomes.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );
-- No insert / update / delete policies for authenticated: recording goes through record_check_outcome.

-- Immutable-once-decided: any UPDATE may only set superseded_by (from null to a row id).
create or replace function public.check_outcomes_immutable()
returns trigger language plpgsql as $$
begin
  if new.company_id <> old.company_id or new.subject_identity <> old.subject_identity
     or new.check_kind <> old.check_kind or new.check_version <> old.check_version
     or new.verdict <> old.verdict or new.subject_text <> old.subject_text
     or new.hypothesis_identity is distinct from old.hypothesis_identity or new.hypothesis_text is distinct from old.hypothesis_text
     or new.move_identity is distinct from old.move_identity or new.move_text is distinct from old.move_text
     or new.route_id is distinct from old.route_id or new.route_title is distinct from old.route_title
     or new.leg_id is distinct from old.leg_id or new.test_id is distinct from old.test_id
     or new.evidence_refs <> old.evidence_refs or new.note is distinct from old.note
     or new.recorded_by is distinct from old.recorded_by or new.recorded_at <> old.recorded_at then
    raise exception 'check_outcomes is append-only: a recorded check may only be superseded';
  end if;
  if old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by then
    raise exception 'check_outcomes: superseded_by is set once';
  end if;
  return new;
end;
$$;
create trigger check_outcomes_immutable
  before update on public.check_outcomes
  for each row execute function public.check_outcomes_immutable();

-- Delete audit: every delete on ANY path leaves a row.
create table public.check_outcome_removals (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,               -- NO FK: survives teardown + churn
  outcome_id        uuid not null,
  subject_identity  text not null,
  check_kind        text not null,
  check_version     integer not null,
  verdict           text not null,
  subject_text      text not null,
  removal_reason    text not null,               -- txn-local GUC or 'unaudited_direct_delete'
  removed_at        timestamptz not null default now()
);
create index check_outcome_removals_company_idx on public.check_outcome_removals (company_id, removed_at desc);
create or replace function public.check_outcomes_delete_audit()
returns trigger language plpgsql as $$
begin
  insert into public.check_outcome_removals
    (company_id, outcome_id, subject_identity, check_kind, check_version, verdict, subject_text, removal_reason)
  values
    (old.company_id, old.id, old.subject_identity, old.check_kind, old.check_version, old.verdict, old.subject_text,
     coalesce(nullif(btrim(coalesce(current_setting('app.check_outcome_removal_reason', true), '')), ''), 'unaudited_direct_delete'));
  return old;
end;
$$;
create trigger check_outcomes_delete_audit
  before delete on public.check_outcomes
  for each row execute function public.check_outcomes_delete_audit();
create trigger enforce_company_freeze
  before insert or update or delete on public.check_outcomes
  for each row execute function public.enforce_company_freeze();

-- ── 2. the ONE sanctioned recording entry point ──────────────────────────────────────────────────
-- Appends the row and supersedes the prior live row for the same (identity, kind, version).
-- The identity arrives pre-computed from the TS authority; this function never derives it.
create or replace function public.record_check_outcome(
  p_company_id       uuid,
  p_subject_identity text,
  p_check_kind       text,
  p_verdict          text,
  p_subject_text     text,
  p_context          jsonb default '{}'::jsonb,
  p_note             text default null,
  p_evidence_refs    uuid[] default '{}',
  p_check_version    integer default 1,
  p_recorded_by      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_frozen   boolean;
  v_prior_id uuid;
  v_new_id   uuid;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or session_user = 'postgres'
          or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'record_check_outcome: admin only';
  end if;
  select frozen into v_frozen from public.companies where id = p_company_id;
  if v_frozen is null then raise exception 'record_check_outcome: company not found'; end if;
  if v_frozen then raise exception 'This is a frozen reference company — its record is preserved and is not modified.'; end if;

  select id into v_prior_id
    from public.check_outcomes
   where company_id = p_company_id and subject_identity = p_subject_identity
     and check_kind = p_check_kind and check_version = p_check_version
     and superseded_by is null
   for update;

  v_new_id := gen_random_uuid();
  -- Supersede first (the deferred FK is satisfied by the insert below, checked at commit).
  if v_prior_id is not null then
    update public.check_outcomes set superseded_by = v_new_id where id = v_prior_id;
  end if;
  insert into public.check_outcomes
    (id, company_id, subject_identity, check_kind, check_version, verdict, subject_text,
     hypothesis_identity, hypothesis_text, move_identity, move_text,
     route_id, route_title, leg_id, test_id, evidence_refs, note, recorded_by)
  values
    (v_new_id, p_company_id, p_subject_identity, p_check_kind, p_check_version, p_verdict, p_subject_text,
     p_context->>'hypothesis_identity', p_context->>'hypothesis_text', p_context->>'move_identity', p_context->>'move_text',
     nullif(p_context->>'route_id', '')::uuid, p_context->>'route_title', nullif(p_context->>'leg_id', '')::uuid, nullif(p_context->>'test_id', '')::uuid,
     coalesce(p_evidence_refs, '{}'), p_note, p_recorded_by);
  return jsonb_build_object('id', v_new_id, 'superseded_id', v_prior_id);
end;
$$;

-- ── 3. the cache writers (the only paths that may touch the cached outcome / stamped conditions) ─
-- tests.outcome is a cache of the live leg_test row. Direct writes are refused; the TS resurrection
-- writes it through set_test_outcome_cache (txn-local door).
create or replace function public.tests_outcome_cache_guard()
returns trigger language plpgsql as $$
begin
  if current_setting('app.check_outcome_cache_write', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.outcome is not null then
      raise exception 'tests.outcome is a cache of check_outcomes — record the check through record_check_outcome; the cache is written by the resurrection path only';
    end if;
  elsif new.outcome is distinct from old.outcome then
    raise exception 'tests.outcome is a cache of check_outcomes — record the check through record_check_outcome; the cache is written by the resurrection path only';
  end if;
  return new;
end;
$$;
create trigger tests_outcome_cache_guard
  before insert or update on public.tests
  for each row execute function public.tests_outcome_cache_guard();

create or replace function public.set_test_outcome_cache(p_test_id uuid, p_outcome text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  if not (coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'set_test_outcome_cache: admin only';
  end if;
  if p_outcome is not null and p_outcome not in ('passed', 'failed', 'inconclusive') then
    raise exception 'set_test_outcome_cache: bad outcome';
  end if;
  perform set_config('app.check_outcome_cache_write', 'on', true);
  update public.tests set outcome = p_outcome where id = p_test_id and outcome is distinct from p_outcome;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Route condition arrays: the sanctioned replacement path. A STAMPED element (checked_at set) in the
-- current array must reappear in the new array with identical raw condition text and its stamp intact,
-- unless the caller DECLARES the drop (p_declared_drop_reason) — the TS caller records the
-- condition_removals audit with the identity it computed. Raw text equality only: no identity in SQL.
create or replace function public.replace_route_conditions(
  p_route_id             uuid,
  p_conditions           jsonb,
  p_actor                text default null,
  p_declared_drop_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_frozen boolean;
  v_old jsonb;
  v_el jsonb;
  v_txt text;
  v_kept boolean;
  v_dropped text[] := '{}';
begin
  if not (coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' or public.has_role(auth.uid(), 'admin'::app_role)) then
    raise exception 'replace_route_conditions: admin only';
  end if;
  if p_conditions is null or jsonb_typeof(p_conditions) <> 'array' then
    raise exception 'replace_route_conditions: p_conditions must be a json array';
  end if;
  select company_id, coalesce(what_would_have_to_be_true, '[]'::jsonb) into v_company, v_old
    from public.routes where id = p_route_id for update;
  if v_company is null then raise exception 'replace_route_conditions: route not found'; end if;
  select frozen into v_frozen from public.companies where id = v_company;
  if v_frozen then raise exception 'This is a frozen reference company — its record is preserved and is not modified.'; end if;

  for v_el in select value from jsonb_array_elements(v_old) loop
    if nullif(btrim(coalesce(v_el->>'checked_at', '')), '') is null then continue; end if;
    v_txt := v_el->>'condition';
    select exists (
      select 1 from jsonb_array_elements(p_conditions) n
       where n.value->>'condition' = v_txt
         and nullif(btrim(coalesce(n.value->>'checked_at', '')), '') is not null
    ) into v_kept;
    if not v_kept then v_dropped := array_append(v_dropped, v_txt); end if;
  end loop;

  if array_length(v_dropped, 1) is not null and nullif(btrim(coalesce(p_declared_drop_reason, '')), '') is null then
    raise exception 'replace_route_conditions refused: would drop % checked condition(s) [%] — a recorded check is preserved-class (checked_at set); carry the element verbatim or declare the drop (check-outcome preservation law)',
      array_length(v_dropped, 1), array_to_string(v_dropped, ' | ');
  end if;

  update public.routes set what_would_have_to_be_true = p_conditions, updated_at = now() where id = p_route_id;
  return jsonb_build_object('route_id', p_route_id, 'written', jsonb_array_length(p_conditions), 'dropped_checked', to_jsonb(v_dropped), 'actor', p_actor);
end;
$$;

-- ── 4. the existing test-preservation proofs gain tests.outcome (ruling 6: inconclusive too) ──────
create or replace function public.tests_delete_audit()
returns trigger
language plpgsql
as $$
declare
  v_category text := coalesce(nullif(current_setting('app.test_removal_category', true), ''), 'unaudited_direct_delete');
  v_proofs text[] := '{}';
  v_leg_title text;
  v_leg_condition text;
  v_parent_route_title text;
begin
  -- R1: preservation is decided by proof, not provenance.
  if old.source like 'manual\_%' then
    v_proofs := array_append(v_proofs, 'operator-authored (source manual_)');
  end if;
  if old.result is not null then
    v_proofs := array_append(v_proofs, 'a recorded result exists');
  end if;
  if old.outcome is not null then
    v_proofs := array_append(v_proofs, 'a recorded outcome exists (' || old.outcome || ')');
  end if;
  if old.no_test_needed and nullif(btrim(coalesce(old.no_test_needed_reason, '')), '') is not null then
    v_proofs := array_append(v_proofs, 'no-test-needed with an operator-supplied reason');
  end if;

  if array_length(v_proofs, 1) is not null
     and v_category not in ('wrong_entity','excluded_source','fabricated_extraction') then
    raise exception 'test % is PRESERVED-CLASS [%] — preservation is decided by proof, not provenance. Deletes require remove_test with an explicit relevance category (wrong_entity | excluded_source | fabricated_extraction); category % refused — regeneration is the thing preservation exists to survive (test-preservation law)',
      old.id, array_to_string(v_proofs, '; '), v_category;
  end if;

  select l.title, (l.what_would_have_to_be_true->0->>'condition'), r.title
    into v_leg_title, v_leg_condition, v_parent_route_title
    from public.routes l left join public.routes r on r.id = l.parent_id
   where l.id = old.action_id;

  insert into public.test_removals
    (company_id, hypothesis, expected_positive_signal, expected_negative_signal, result, no_test_needed, no_test_needed_reason,
     test_source, action_id, leg_title, leg_condition, parent_route_title, reason_category, actor)
  values
    (old.company_id, old.hypothesis, old.expected_positive_signal, old.expected_negative_signal, old.result, old.no_test_needed, old.no_test_needed_reason,
     old.source, old.action_id, v_leg_title, v_leg_condition, v_parent_route_title, v_category,
     nullif(current_setting('app.test_removal_actor', true), ''));
  return old;
end;
$$;

create or replace function public.remove_tests_for_leg_reroll(
  p_leg_ids uuid[],
  p_actor text default null
) returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if exists (
    select 1 from public.tests t
    where t.action_id = any(p_leg_ids)
      and (t.source like 'manual\_%'
           or t.result is not null
           or t.outcome is not null
           or (t.no_test_needed and nullif(btrim(coalesce(t.no_test_needed_reason, '')), '') is not null))
  ) then
    raise exception 'leg re-roll cannot remove PRESERVED-CLASS tests (operator-authored, recorded result or outcome, or reasoned no-test-needed) — regeneration is the thing preservation exists to survive; resolve them first via remove_test (test-preservation law)';
  end if;
  perform set_config('app.test_removal_category', 'leg_rerolled', true);
  perform set_config('app.test_removal_actor', coalesce(p_actor, ''), true);
  delete from public.tests where action_id = any(p_leg_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

commit;
