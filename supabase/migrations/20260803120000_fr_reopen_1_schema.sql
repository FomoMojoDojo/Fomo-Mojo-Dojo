-- FR-REOPEN-1 — schema for operator Reopen of an issued First Read.
--
-- Rulings in force (FR-REOPEN design, operator-signed):
--   R1  proposal artifact: supersede, never delete; old proposal stays 'issued'
--       until the next issuance completes the FK-ordered supersession (no 'reopened').
--   R2  contests: RETIRE, do not delete. This gate provisions the mechanism (a round
--       marker); no row is ever mutated or removed here.
--   R3  tally: issuance-time counts live on the proposal record; the session's live
--       counts get reset by the RPC (not here); mojo_score_at_open is NOT re-snapshotted.
--   R4  freeze flip: via a GUC-gated transition edge ONLY. first_read_responses_freeze
--       is UNTOUCHED.
--   R5  scope: only proposal_issued reopens (accepted/declined get no new edge).
--   R7  provision not_important_count now (the generator already computes it — V2-9).
--   R9  Candidate A (round/generation marker) — chosen because it NEVER writes to a
--       decision-bearing row; old-round contests are simply members of a closed round.
--
-- SCOPE: schema only. NOT the reopen RPC (FR-REOPEN-2), NOT the UI (FR-REOPEN-3). No
-- consumer is made round-aware here. Proposal data is NOT migrated off the session in
-- this gate (the new table is created empty; nothing reads it yet, so leaving
-- proposal_json on the session is inert and creates no correctness problem).
--
-- Whole migration runs in ONE transaction (Supabase default): the constraint swap in
-- step 3 is atomic under the ALTER TABLE ACCESS EXCLUSIVE lock, so no window exists in
-- which a duplicate could land between DROP and ADD.

-- ── 1. session generation counter (R9) ───────────────────────────────────────
-- Monotonic per session; bumped by the reopen RPC (FR-REOPEN-2). Default 0 means every
-- existing and future session starts in round 0 — identical to today until a reopen.
alter table public.first_read_sessions
  add column reopen_generation int not null default 0;

-- ── 2. contest round marker (R9) ─────────────────────────────────────────────
-- NOT NULL DEFAULT 0 backfills every existing contest to round 0 (a closed-form
-- rewrite of a constant — no per-row decision value is touched). The value is
-- authoritative-stamped at birth by the trigger below, from the session's current
-- generation, so the inserting caller (the OC-2 feed) never needs to know about rounds.
alter table public.claim_contests
  add column round int not null default 0;

-- Stamp round from the session's generation at INSERT time. BEFORE INSERT fires before
-- the uniqueness check, so the swapped constraint (step 3) sees the stamped value.
-- Today generation is always 0 → round 0 → identical to the column default, so the
-- current insert path is behavior-identical. After a reopen bumps reopen_generation,
-- new contests auto-belong to the new round with zero change to the feed.
create or replace function public.claim_contests_stamp_round()
returns trigger
language plpgsql
as $$
begin
  select s.reopen_generation into new.round
    from public.first_read_sessions s
    where s.id = new.session_id;
  if new.round is null then
    new.round := 0;  -- session not found (the FK will reject the insert anyway) → safe default
  end if;
  return new;
end;
$$;

create trigger claim_contests_stamp_round
  before insert on public.claim_contests
  for each row execute function public.claim_contests_stamp_round();

-- ── 3. widen uniqueness: (session_id, claim_id) → (session_id, claim_id, round) ─
-- Existing constraint name: claim_contests_session_id_claim_id_key (UNIQUE
-- (session_id, claim_id), from 20260723170000_observed_contest_schema.sql). Because
-- step 2 set round = 0 for all existing rows, the triple (session_id, claim_id, 0) is
-- unique iff the pair was — so the swap never weakens the invariant at commit, and
-- ADD cannot fail on existing data. Atomic within the migration transaction.
alter table public.claim_contests
  drop constraint claim_contests_session_id_claim_id_key;
alter table public.claim_contests
  add constraint claim_contests_session_id_claim_id_round_key
    unique (session_id, claim_id, round);

-- ── 4. first_read_proposals — the persisted issuance record (R1, R3, R7) ──────
-- Provisioned per the FR-REOPEN design §4. Created EMPTY this gate: the generator still
-- writes proposal_json to the session and readers still read it there; repointing is
-- FR-REOPEN-2/3 scope. RLS is LEFT OFF to mirror the parent first_read_sessions
-- (relrowsecurity=f) — proposal_json's access posture today is exactly the session's,
-- and a 1:1 child must not become MORE restrictive than the row it came from.
create table public.first_read_proposals (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.first_read_sessions(id) on delete cascade,
  proposal_json       jsonb not null,
  issued_at           timestamptz not null,
  -- R1: supersede, never delete. No 'reopened' interim value. Old row stays 'issued'
  -- until the next issuance lands and completes the FK-ordered supersession.
  status              text not null default 'issued'
                        check (status in ('issued','superseded')),
  -- FK-ordered supersession: set only AFTER the replacement exists (never dangling).
  superseded_by_id    uuid references public.first_read_proposals(id) on delete set null,
  -- R3: issuance-time snapshot preserved here (the session's live copies are the RPC's
  -- to reset). R7: not_important_count provisioned AND immediately populatable.
  confirmed_count     int,
  corrected_count     int,
  rejected_count      int,
  not_important_count int,
  created_at          timestamptz not null default now()
);
create index first_read_proposals_session_idx on public.first_read_proposals (session_id);

-- ── 5. transition-guard extension: add ONLY proposal_issued→open, GUC-gated (R4,R5) ─
-- Mirrors the ratified claims_status_guard early-return shape: the reopen edge is
-- admitted ONLY when app.fr_reopen_authority = 'on' (set solely by the reopen RPC,
-- FR-REOPEN-2). current_setting(..., true) uses missing_ok so an unset GUC does NOT
-- error; because the check is an explicit-'on' early admit (never a disjunct that could
-- go NULL), an unset/any-other GUC value falls through and the transition is REFUSED —
-- fail CLOSED. All pre-existing edges are unchanged; accepted/declined get no new edge.
-- first_read_responses_freeze is NOT touched.
create or replace function public.first_read_sessions_transition()
returns trigger
language plpgsql
as $$
begin
  if NEW.status is distinct from OLD.status then
    if OLD.status = 'proposal_issued' and NEW.status = 'open'
       and current_setting('app.fr_reopen_authority', true) = 'on' then
      -- admitted reopen (GUC-gated); no timestamp side-effect for the →open edge
      null;
    elsif not (
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
