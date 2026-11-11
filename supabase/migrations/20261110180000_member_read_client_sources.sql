-- MEMBER READ, PART 2 (operator rulings U6-13, U6-14, U6-16, U6-19 .. U6-27, signed 2026-11-10).
--
-- WHAT THIS CLOSES. The U6-10 census found five sources the First Read renders that carried no member
-- read at all, and three places interview text reached a member. The worst was not an empty page: a
-- member on Edgewood would have been shown the signed line "We read the outside record and nothing
-- stood out on its own yet." while 18 open findings existed, because the findings array was blocked by
-- RLS while `findingsIntegrity` (integrity_runs, which DOES carry a member arm) was readable. The page
-- believed it had evidence for an absence it was not allowed to see. 22 companies were in that state.
--
-- WHY FUNCTIONS AND NOT VIEWS (U6-25 was signed as "narrow definer views"). RLS is ROW level: once a
-- row is visible every column is served, and these tables carry operator-only columns —
-- findings.beats holds the facilitation plan ("open" / "observe" / "name_tension"), and the marks
-- tables carry created_by, the acting admin's uuid. Proven under the proposed row policies in a
-- rolled-back transaction on 2026-11-10: a member read beats.name_tension verbatim. A narrow view is
-- the right shape, but it must run as its OWNER to read past the base table's RLS — and
-- scripts/guards/grants-guard.sh check (g6) fails on ANY public view whose security_invoker is not
-- true, for exactly that reason. So the narrow read is a SECURITY DEFINER FUNCTION per source: the
-- same column projection and the same predicate, in an object the standing guard already admits
-- (has_capability and the four first_read_marks RPCs are definer functions today).
--
-- THE PREDICATE LIVES HERE, NOT ON THE PAGE (U6-13). Every held-or-hidden rule the page used to apply
-- in its query is now inside the function: status='open' AND register='public_inferred' for findings,
-- withdrawn_at IS NULL for marks and their notes. A page filter is not a lock; this is.
--
-- THE ONE PLACE THE PREDICATE IS NOT INSIDE (U6-22 deviation, reported before writing).
-- market_candidate_outcomes_client does NOT filter `outcome IN ('rejected_buyer','rejected_solution')`.
-- selectUnstatedRows (src/views/client/firstReadPreview/unstatedSelect.ts:21-36) is VERSION-AWARE: it
-- groups every row by candidate_index and keeps the CURRENT criterion's ruling, and a candidate whose
-- current ruling is an acceptance DROPS OUT even though an older version rejected it. Filtering to
-- rejections in SQL would hide the current acceptance and resurrect the stale rejection — the page
-- would show groups the operator's current criterion has already cleared. The outcome filter
-- therefore stays in the version-aware selector, and what this function locks is the OPERATOR COLUMN:
-- judge_reasons is not in its result, by any path.
--
-- INTERVIEW TEXT, INCLUDING THE NAME (U6-14, U6-16, U6-27). Two tiers. Tier 1 is interview_people:
-- name, role and date for every company member, which also gives isDiagnoseRunning ONE answer for
-- every reader (the files arm no longer has to carry members alone). Tier 2 is interview_text and
-- interview_item_text: the verbatim, and the raw words plus the speaker, only to a caller holding
-- interview.readText on that company. U6-27 treats the speaker's NAME as interview text, so
-- interview_item_text returns it and claims.raw_payload stops carrying it.
--
-- interview_records LOSES ITS MEMBER SELECT ARM. "Users can view company interview_records" admitted a
-- member whenever input_file_id IS NULL and did not exclude retracted rows: measured on Edgewood, a
-- member read 2 retracted records and their verbatim. The policy is dropped WHOLE, author arm
-- included — and the author arm was NOT redundant, which is worth stating plainly because an earlier
-- draft of this header claimed it was.
--
-- U6-28 (signed 2026-11-10). record_interview_finding is SECURITY DEFINER and inserts
-- `created_by = p_user_id` — the caller it was told to act for, which is not necessarily an admin. So
-- `auth.uid() = created_by` really did admit non-admins: it is the arm that let the quote-contribution
-- path read its own record back, and scripts/guards/interview-commit2a-guard.sh check (h) exercises
-- exactly that with the no-membership fixture, which holds no membership anywhere and could therefore
-- have passed through no other arm. One of the 16 records on this stack carries a non-admin
-- created_by today.
--
-- The ruling splits it where tier 1 and tier 2 already split everything else: the AUTHOR may see that
-- their record landed — who and when — through interview_people below, and the TEXT still requires
-- interview.readText. Nothing restores an author arm on the table, so no path returns a full row
-- (verbatim included) to a non-admin; on a multi-speaker transcript that would have handed the author
-- every other speaker's words as well as their own.
--
-- NO SERVICE-ROLE POLICIES, same reasoning as 20261110050000: service_role holds rolbypassrls, so the
-- function fleet is unaffected by everything here. record-interview-upload still creates records.

-- ── U6-25 · the three narrow reads the First Read uses ────────────────────────────────────────────
-- Shape shared by all of them: the three-arm membership test copied from "Members can read company
-- long_runner_runs" (member OR companies.created_by OR admin — the owner arm is not ornamental, 16 of
-- 44 companies carry a non-admin created_by), plus the source's own held/hidden rule.
--
-- NO ORDER BY, deliberately. The page's own query carried none, so rows arrived in scan order and the
-- Findings beat expands the first five of them. An ORDER BY here would quietly re-order what a client
-- has already been shown.

create or replace function public.findings_client(p_company_id uuid)
returns table (id uuid, company_id uuid, body text, created_at timestamptz, origin_signal_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select f.id, f.company_id, f.body, f.created_at, f.origin_signal_id
  from public.findings f
  where f.company_id = p_company_id
    and f.status = 'open'
    and f.register = 'public_inferred'
    and (exists (select 1 from public.company_members cm where cm.company_id = f.company_id and cm.user_id = auth.uid())
      or exists (select 1 from public.companies c where c.id = f.company_id and c.created_by = auth.uid())
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.findings_client(uuid) is
  'The Findings beat''s rows for one company: open + public_inferred only, and only the four columns the page renders. beats, kind, register, tone and origin_run_id are NOT returned — beats carries the facilitation plan (U6-25).';

-- anchor_text_sha256 IS included: the revisit prompt compares that hash to decide whether a marked row
-- still says what it said (src/lib/firstReadMarks/revisit.ts). It is a hash of text the client is
-- already shown, not operator content, and the page cannot work without it.
create or replace function public.first_read_marks_client(p_company_id uuid)
returns table (id uuid, company_id uuid, kind text, beat_key text, anchor_kind text, anchor_key text,
               anchor_text text, anchor_text_sha256 text, created_at timestamptz,
               revisit_resolved_against text, revisit_resolved_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select m.id, m.company_id, m.kind, m.beat_key, m.anchor_kind, m.anchor_key,
         m.anchor_text, m.anchor_text_sha256, m.created_at,
         m.revisit_resolved_against, m.revisit_resolved_at
  from public.first_read_marks m
  where m.company_id = p_company_id
    and m.withdrawn_at is null
    and (exists (select 1 from public.company_members cm where cm.company_id = m.company_id and cm.user_id = auth.uid())
      or exists (select 1 from public.companies c where c.id = m.company_id and c.created_by = auth.uid())
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.first_read_marks_client(uuid) is
  'The live marks for one company, as "What we heard" renders them. withdrawn_at IS NULL is the predicate, so withdraw_reason and withdrawn_by are NULL on every row by the table''s own CHECK; created_by and revisit_resolved_by are not returned (U6-25).';

-- Membership is resolved through the PARENT mark, which is where company_id lives. The parent must
-- also still be live, so a withdrawn mark takes its notes with it.
create or replace function public.first_read_mark_notes_client(p_company_id uuid)
returns table (mark_id uuid, version integer, note text, disposition text)
language sql stable security definer set search_path = public, pg_temp as $$
  select n.mark_id, n.version, n.note, n.disposition
  from public.first_read_mark_notes n
  join public.first_read_marks m on m.id = n.mark_id
  where m.company_id = p_company_id
    and m.withdrawn_at is null
    and (exists (select 1 from public.company_members cm where cm.company_id = m.company_id and cm.user_id = auth.uid())
      or exists (select 1 from public.companies c where c.id = m.company_id and c.created_by = auth.uid())
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.first_read_mark_notes_client(uuid) is
  'The notes behind the live marks of one company — the latest of which renders inside "What we heard". created_by (the acting admin''s uuid) is not returned (U6-25).';

-- ── U6-22 · the unstated-groups read ─────────────────────────────────────────────────────────────
-- Keyed by RUN, as the page is: it reads the newest market_discovery long_runner_run and asks for that
-- run's candidates. Membership is resolved through the run's company. judge_reasons is absent.
create or replace function public.market_candidate_outcomes_client(p_run_id uuid)
returns table (id uuid, candidate_index integer, job_executor text, original_jtbd text,
               original_identity text, relationship_kind text, outcome text,
               reconstructed boolean, criterion_version integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id, o.candidate_index, o.job_executor, o.original_jtbd,
         o.original_identity, o.relationship_kind, o.outcome,
         o.reconstructed, o.criterion_version
  from public.market_candidate_outcomes o
  where o.run_id = p_run_id
    and (exists (select 1 from public.company_members cm where cm.company_id = o.company_id and cm.user_id = auth.uid())
      or exists (select 1 from public.companies c where c.id = o.company_id and c.created_by = auth.uid())
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.market_candidate_outcomes_client(uuid) is
  'One market_discovery run''s candidate rulings, minus judge_reasons (operator-only). The outcome filter stays in selectUnstatedRows because it is version-aware — see the migration header.';

-- ── U6-14 tier 1 · the interview people ──────────────────────────────────────────────────────────
-- Name, role and date — never the text. Takes an ARRAY so the Front Door can ask for the whole fleet
-- in one round trip the way fetchDiagnoseRunning already does; NULL means "every company I may see".
-- retracted_at IS NULL, so a retracted record vanishes here as it does from every other surface.
--
-- FOUR ARMS, not three (U6-28, signed 2026-11-10): member, companies.created_by, admin — and THE
-- RECORD'S OWN AUTHOR. The author arm is what the dropped table policy used to provide to the
-- quote-contribution path (record_interview_finding stamps created_by = p_user_id), and it belongs
-- here rather than on the table: the contributor learns that their record exists and when, and the
-- words stay behind interview.readText. It is the narrowest arm of the four — one row per record,
-- five columns, no text.
--
-- U6-29 is FILED against these doors, not built: interviewee approval for quote use, recorded per
-- interview (with name / without name / none), enforced INSIDE the tier-2 doors. Nothing here or in
-- interview_text / interview_item_text forecloses it — each is a single function body with the
-- record already in hand, so an approval test is one more AND, and tier 1 is unaffected because a
-- name is not a quote.
create or replace function public.interview_people(p_company_ids uuid[] default null)
returns table (id uuid, company_id uuid, person_name text, person_role text, interviewed_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.company_id, r.person_name, r.person_role, r.interviewed_at
  from public.interview_records r
  where r.retracted_at is null
    and (p_company_ids is null or r.company_id = any (p_company_ids))
    and (exists (select 1 from public.company_members cm where cm.company_id = r.company_id and cm.user_id = auth.uid())
      or exists (select 1 from public.companies c where c.id = r.company_id and c.created_by = auth.uid())
      or r.created_by = auth.uid()
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.interview_people(uuid[]) is
  'Tier 1 (U6-14, U6-28): interviewee name, role and date for a company member, the company owner, the RECORD''S AUTHOR, or an admin — any input_file_id. The ONE door W9 and fetchDiagnoseRunning use, so "is Diagnose running" has one answer for every reader. Never returns verbatim.';

-- ── U6-14 tier 2 · the text, and the speaker ─────────────────────────────────────────────────────
-- interview.readText on THAT company, or admin. Liveness is checked the same way tier 1 checks it: a
-- retracted record has no readable text. A caller without the capability gets NO ROW — not an error
-- and not an empty string, so the chip can fall back to the statement without catching anything.
create or replace function public.interview_text(p_record_id uuid)
returns table (verbatim text)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.verbatim
  from public.interview_records r
  where r.id = p_record_id
    and r.retracted_at is null
    and (public.has_capability(auth.uid(), 'interview.readText', r.company_id)
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.interview_text(uuid) is
  'Tier 2 (U6-14): one live record''s verbatim, to a holder of interview.readText on that company (sponsor by role) or an admin. No row for anyone else.';

-- U6-27: the SPEAKER'S NAME is interview text. It travels with the words through this door and nowhere
-- else — record-interview-correction stops writing speaker_label / person_name onto claims.raw_payload,
-- and the existing Edgewood claim has all three keys removed by the data act this migration precedes.
create or replace function public.interview_item_text(p_item_id uuid)
returns table (raw_words text, speaker text)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.raw_words,
         coalesce(nullif(btrim(coalesce(r.person_name, '')), ''), nullif(btrim(coalesce(i.speaker_label, '')), '')) as speaker
  from public.interview_items i
  join public.interview_records r on r.id = i.interview_record_id
  where i.id = p_item_id
    and i.retracted_at is null
    and r.retracted_at is null
    and (public.has_capability(auth.uid(), 'interview.readText', r.company_id)
      or public.has_role(auth.uid(), 'admin'::app_role));
$$;

comment on function public.interview_item_text(uuid) is
  'Tier 2 (U6-27): one live interview item''s raw words AND its speaker, to a holder of interview.readText or an admin. The name resolves the way attestedOrigin used to resolve it: the record''s person_name, else the item''s speaker_label.';

-- ── U6-18 / U6-19 · the capability ───────────────────────────────────────────────────────────────
-- There is no capability TABLE: the role bundle is this function's body, and src/lib/capabilities.ts
-- is its TS mirror (capabilityParity.test.ts proves the two agree for every role). So adding a
-- capability means replacing this function, and the ADMIN branch is an explicit list rather than
-- "every capability" — a cap left out of it is a cap no admin holds.
--
-- SPONSOR ONLY (U6-19). decision_owner holds every capability sponsor holds today; interview.readText
-- is the first one where they diverge, by ruling. Per-user grants are filed with invites (U6-18): for
-- now the operator confers it by setting company_members.role = 'sponsor'.
create or replace function public.has_capability(_user_id uuid, _cap text, _company_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  SELECT CASE
    -- Global admin (user_roles) => Steward => the governance caps + assignRole + interview text.
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN
      _cap IN (
        'governance.proposal.apply',
        'governance.proposal.reject',
        'participation.suggest',
        'workspace.member.assignRole',
        'interview.readText'
      )
    ELSE
      -- Per-company client role bundle. No client role holds assignRole.
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = _company_id
          AND cm.user_id = _user_id
          AND _cap = ANY (
            CASE cm.role
              WHEN 'sponsor'        THEN ARRAY['governance.proposal.apply', 'governance.proposal.reject', 'interview.readText']
              WHEN 'decision_owner' THEN ARRAY['governance.proposal.apply', 'governance.proposal.reject']
              WHEN 'contributor'    THEN ARRAY['participation.suggest']
              WHEN 'participant'    THEN ARRAY['participation.suggest']
              WHEN 'member'         THEN ARRAY['participation.suggest']  -- legacy alias -> Participant
              ELSE                       ARRAY[]::text[]                 -- observer / unknown
            END
          )
      )
  END
$$;

-- ── interview_records loses the member SELECT arm ────────────────────────────────────────────────
drop policy if exists "Users can view company interview_records" on public.interview_records;

-- ── Grants · the second lock (the F1/F2 2026-09-30 discipline) ───────────────────────────────────
-- Per the U6-23 write-path audit. Every relation below grants SELECT, INSERT, UPDATE and DELETE to
-- BOTH authenticated and anon today; RLS is the only thing holding them. anon is revoked everywhere.
-- authenticated keeps ONLY the privileges a real browser write path uses:
--   findings                   — KEEPS UPDATE (useStandingFindings.ts:136 resolves a finding; admin ALL policy guards it)
--   operator_primary_selection — KEEPS INSERT/UPDATE/DELETE (useStandingFindings.ts:128, useChooseJobStepSet.ts:23, chosenJobStepSet.ts:41; admin ALL policy)
--   interview_records          — KEEPS UPDATE (useInterviewUploads.ts:178; admin ALL policy), LOSES INSERT (U6-26)
--   the marks pair             — no direct browser write at all: create/keep/withdraw/append are SECURITY
--                                DEFINER RPCs that raise unless first_read_marks_actor finds an admin
--   market_candidate_outcomes, interview_items, interview_segments — no browser write path of any kind
--
-- U6-26: revoking INSERT on interview_records neutralises "Users can insert company interview_records",
-- the member-armed INSERT policy. No browser path uses it (creation runs through the
-- record-interview-upload edge function on the service role), so the reduced member-write brief is
-- odi_needs alone.
revoke all on public.findings from anon;
revoke all on public.first_read_marks from anon;
revoke all on public.first_read_mark_notes from anon;
revoke all on public.market_candidate_outcomes from anon;
revoke all on public.operator_primary_selection from anon;
revoke all on public.interview_records from anon;
revoke all on public.interview_items from anon;
revoke all on public.interview_segments from anon;
revoke all on public.interview_item_kind_overrides from anon;

-- destructive-ok: these REVOKE the TRUNCATE privilege (grant layer, F1/F2 2026-09-30); nothing is truncated
revoke insert, delete, truncate, references, trigger on public.findings from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.first_read_marks from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.first_read_mark_notes from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.market_candidate_outcomes from authenticated;
revoke truncate, references, trigger on public.operator_primary_selection from authenticated;
-- U6-30 (signed 2026-11-10): DELETE goes too. The U6-23 audit found no browser delete path at all —
-- withdrawal runs through withdraw_interview_upload, a SECURITY DEFINER RPC that raises unless the
-- caller is an admin, and it RETRACTS (sets retracted_at) rather than deleting. A privilege nothing
-- uses is a privilege a future policy mistake could borrow. UPDATE stays: useInterviewUploads.ts:178
-- writes journey_key / market_state / market_basis from the browser, guarded by the admin ALL policy.
revoke insert, delete, truncate, references, trigger on public.interview_records from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.interview_items from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.interview_segments from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.interview_item_kind_overrides from authenticated;

-- ── Function grants ──────────────────────────────────────────────────────────────────────────────
-- A definer function is reachable by anyone who may EXECUTE it, so anon is revoked from every one of
-- them: the membership and capability tests all read auth.uid(), and an anonymous caller would simply
-- match nothing — but a door that cannot be knocked on is better than one that answers "no".
revoke all on function public.findings_client(uuid) from anon, public;
revoke all on function public.first_read_marks_client(uuid) from anon, public;
revoke all on function public.first_read_mark_notes_client(uuid) from anon, public;
revoke all on function public.market_candidate_outcomes_client(uuid) from anon, public;
revoke all on function public.interview_people(uuid[]) from anon, public;
revoke all on function public.interview_text(uuid) from anon, public;
revoke all on function public.interview_item_text(uuid) from anon, public;

grant execute on function public.findings_client(uuid) to authenticated;
grant execute on function public.first_read_marks_client(uuid) to authenticated;
grant execute on function public.first_read_mark_notes_client(uuid) to authenticated;
grant execute on function public.market_candidate_outcomes_client(uuid) to authenticated;
grant execute on function public.interview_people(uuid[]) to authenticated;
grant execute on function public.interview_text(uuid) to authenticated;
grant execute on function public.interview_item_text(uuid) to authenticated;
