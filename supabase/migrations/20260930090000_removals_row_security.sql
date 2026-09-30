-- ROW SECURITY on first_read_session_removals — the session-removal audit table (2026-09-30).
--
-- WHY. This is the last first-read table with RLS off. 20260928120000 closed first_read_session_reopens
-- and said in terms that this table "still carries the same shape and is NOT touched here — it is its
-- own brief". This is that brief. Until now: RLS disabled, zero policies, and `anon` plus
-- `authenticated` each holding SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER. The
-- row that records WHICH first read was pulled back, by what reason, and with what verdict counts at
-- the moment of deletion was readable, rewritable, deletable and TRUNCATE-able by any signed-in
-- caller — or an anonymous one.
--
-- ADMIN READ ONLY, and APPEND-ONLY. Deliberately narrower than both CV3 (20260927120000, which gave
-- company members a company-scoped read) and the reopens table (20260928120000, whose admin policy is
-- FOR ALL):
--   * `reason` is the operator's own words about why a client's issued read was pulled back, and the
--     row carries confirmed/corrected/rejected counts frozen at deletion. Nothing has ever rendered
--     any of it client-facing; a member SELECT policy would be the first thing to make that possible
--     by accident. So no member policy and no anon policy.
--   * The only lawful writer is the BEFORE DELETE trigger on first_read_sessions. Nothing should ever
--     amend or remove an audit row afterwards, so there is NO INSERT, UPDATE or DELETE policy — not
--     even for admins. An admin reads the audit; an admin does not edit it.
--
-- THE TRIGGER MUST OUTLIVE THE REVOKE. first_read_sessions_delete_audit was SECURITY INVOKER, so its
-- INSERT ran under the deleting caller's privileges and policies. It worked only because
-- `authenticated` held a blanket INSERT on this table. Revoking that INSERT — which this migration
-- does — would have broken every session delete, admin ones included: the audit insert would be
-- refused and the delete would roll back with it. So the function becomes SECURITY DEFINER, owned by
-- postgres, which owns this table and carries rolbypassrls: its insert is admitted with zero INSERT
-- policies present, and no app role needs INSERT at all. That is the point — the ONLY way a row
-- reaches this table is through the trigger.
--
-- SECURITY DEFINER is pinned with SET search_path = public, pg_temp so a caller cannot shadow
-- `public.first_read_responses` or `public.first_read_session_removals` with a temp-schema object and
-- steer a postgres-owned function. The function BODY is otherwise byte-identical to the birth
-- definition (20260723160000): same reason GUC, same refusal for a resolved session deleted without a
-- reason, same verdict counts read before the FK cascade, same insert. Only the security label and the
-- search_path change.
--
-- WHAT THIS DOES NOT DO:
--   * NO DML. The 9 existing rows are not read, rewritten, or backfilled; this migration leaves them
--     byte-identical.
--   * NO change to first_read_sessions or first_read_responses policies (CV3 stands).
--   * NO change to first_read_session_reopens. Its admin policy is still FOR ALL, not append-only;
--     aligning it is its own brief, not a side effect of this one.
--   * NO change to remove_first_read_session. It stays SECURITY INVOKER, so the DELETE it issues is
--     still gated by first_read_sessions' own policies — a member and a non-member delete 0 rows and
--     anon is refused outright, all three proven before this migration was written.
--   * NO foreign keys added. Their absence is deliberate and documented at birth: the audit must
--     survive later session and company teardown.
--   * NO change to the enforce_company_freeze trigger on this table, and none to service_role, which
--     carries rolbypassrls and is unaffected by everything here.

ALTER TABLE public.first_read_session_removals ENABLE ROW LEVEL SECURITY;

-- Admins READ. No write policy of any kind, for any role — append-only, and the trigger below is the
-- only writer.
DROP POLICY IF EXISTS "Admins read first_read_session_removals" ON public.first_read_session_removals;
CREATE POLICY "Admins read first_read_session_removals" ON public.first_read_session_removals
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- anon gets nothing at all. RLS with no anon policy already refuses SELECT, but the grants go too: a
-- later policy written for `public` rather than `authenticated` would otherwise silently re-open the
-- table, and TRUNCATE is not subject to row level security at any time.
REVOKE ALL ON TABLE public.first_read_session_removals FROM anon;

-- authenticated keeps SELECT and nothing else. The admin policy above decides who that SELECT actually
-- admits; every write verb is gone at the grant layer as well as the policy layer.
--   * INSERT: the trigger inserts as its DEFINER owner, so no app role needs it.
--   * UPDATE / DELETE: append-only (RM3). Refused by grant AND by absent policy, independently.
--   * TRUNCATE: NOT subject to row level security — only the grant can stop it, and it fires no row
--     triggers, so it would leave no trace of having emptied the audit.
--   * REFERENCES / TRIGGER: no app role has business attaching constraints or triggers to an audit table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.first_read_session_removals FROM authenticated;

-- The trigger function: SECURITY DEFINER with a pinned search_path. Body byte-identical to birth.
-- CREATE OR REPLACE keeps the function's oid, so the existing BEFORE DELETE trigger on
-- first_read_sessions stays bound to it — the trigger is not dropped or recreated here.
create or replace function public.first_read_sessions_delete_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := nullif(btrim(coalesce(current_setting('app.fr_session_removal_reason', true), '')), '');
  v_confirmed integer; v_corrected integer; v_rejected integer;
begin
  if old.status <> 'open' and v_reason is null then
    raise exception 'first_read_session % is % — a recorded decision cannot be deleted without an explicit reason (set app.fr_session_removal_reason, e.g. via remove_first_read_session)', old.id, old.status;
  end if;

  select count(*) filter (where verdict = 'confirmed'),
         count(*) filter (where verdict = 'corrected'),
         count(*) filter (where verdict = 'rejected')
    into v_confirmed, v_corrected, v_rejected
  from public.first_read_responses where session_id = old.id;

  insert into public.first_read_session_removals
    (session_id, company_id, status_at_deletion, confirmed_count, corrected_count, rejected_count, reason)
  values
    (old.id, old.company_id, old.status,
     coalesce(v_confirmed, 0), coalesce(v_corrected, 0), coalesce(v_rejected, 0),
     coalesce(v_reason, 'unaudited_direct_delete'));
  return old;
end;
$$;

ALTER FUNCTION public.first_read_sessions_delete_audit() OWNER TO postgres;
