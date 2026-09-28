#!/usr/bin/env bash
# CV3 (2026-09-27) — ROW SECURITY on first_read_sessions and first_read_responses (migration
# 20260927120000). Guards against the REAL local database. Every check runs inside ONE ROLLED-BACK
# transaction; the only rows read or written belong to THROWAWAY companies. Edgewood's first-read rows
# are READ in exactly one check — c6, which asserts a member sees ZERO of them — and are never written.
# Prints "guard: PASS" or "guard: FAIL …".
#
# Checks (affirmative, PLANT unset):
#   (a1) row level security is ENABLED on both tables
#   (b1) admin JWT reads both tables, for a company it is NOT a member of
#   (b2) admin JWT inserts a session and a response on a throwaway company
#   (b3) admin JWT updates the session (open -> proposal_issued, the lawful edge)
#   (b4) admin JWT reopens it through reopen_first_read_session
#   (c1) member JWT reads its OWN company's rows — one session, one response
#   (c2) member JWT INSERT is refused, on both tables
#   (c3) member JWT UPDATE touches 0 rows, on both tables
#   (c4) member JWT DELETE touches 0 rows, on both tables
#   (c5) member JWT reopen is refused
#   (c6) member JWT reads ZERO Edgewood rows, on both tables — the cross-tenant boundary
#   (d1) non-admin NON-MEMBER JWT reads 0 rows, on both tables
#   (d2) non-admin NON-MEMBER JWT INSERT is refused
#   (e1) anon reads nothing, on both tables (permission denied, or 0 rows)
#   (e2) anon INSERT is refused
#   (f1) TRUNCATE is refused for authenticated, on both tables
#   (f2) TRUNCATE is refused for anon, on both tables
#   (g1) service_role still reads the throwaway session with RLS on and no service_role policy
#        (rolbypassrls) — the five edge-function access sites are untouched
#   (g2) generate-first-read-proposal and feed-first-read-corrections still boot ({} -> 400, their own
#        validation — 404 means the name is wrong, 503 means the module did not load) — run over HTTP,
#        outside the transaction
#   (a2) LAST: the policy set equals the spec EXACTLY — four policies, their commands, their roles, and
#        the normalised text of every USING / WITH CHECK expression. No fifth policy, no anon policy.
#
# ORDER NOTES. The checks abort on the first failure, so the order is chosen to make each plant below
# report against its OWN target:
#   * (a1) runs first: RLS disabled would otherwise be reported by a behavioural check.
#   * (a2) runs LAST, because it catches every policy-shaped plant. Ahead of the behavioural checks it
#     would mask all of them; behind them it is falsified only by a policy change that is behaviourally
#     INERT — which is exactly what PLANT=extrapolicy is.
#   * c6 is checked before d1: any over-broad read policy shows up as a cross-tenant read first.
#
# Plants (each applied INSIDE the guard transaction, undone by its ROLLBACK, except `boot` which
# touches nothing). Every plant must make this guard FAIL, at the check named:
#   PLANT=rlsoff         RLS disabled again on first_read_responses            ⇒ (a1) red
#   PLANT=extrapolicy    a fifth policy that is behaviourally INERT — a
#                        redundant admin-only SELECT policy on sessions, which
#                        grants nothing the ALL policy does not already grant.
#                        Every behavioural check stays green; only the spec
#                        equality can see it                                   ⇒ (a2) red
#   PLANT=noadmin        the admin ALL policy dropped from both tables         ⇒ (b1) red
#   PLANT=nomember       the member SELECT policy dropped from both tables     ⇒ (c1) red
#   PLANT=reopenopen     the has_role admin check stripped from
#                        reopen_first_read_session (restored by the ROLLBACK;
#                        the caller re-checks its md5 afterwards)              ⇒ (c5) red
#   PLANT=memberwrite    member INSERT/UPDATE/DELETE policies added to both    ⇒ (c2) red
#   PLANT=memberwide     the member SELECT policy on first_read_responses
#                        reverted to the RLS-1 tautology (cm.company_id =
#                        cm.company_id) ⇒ a member reads EVERY company         ⇒ (c6) red
#   PLANT=nonmemberopen  an INVERTED membership predicate on sessions — a
#                        caller with NO company_members row sees everything.
#                        Narrow on purpose: a plain `USING (true)` would open
#                        the member's cross-tenant read too and be caught by
#                        (c6) first, so it would not falsify (d1)              ⇒ (d1) red
#   PLANT=anonopen       SELECT/INSERT re-granted to anon + an anon policy     ⇒ (e1) red
#   PLANT=truncok        TRUNCATE re-granted to authenticated                  ⇒ (f1) red
#   PLANT=svcgrant       SELECT revoked from service_role on both tables       ⇒ (g1) red
#   PLANT=boot           the HTTP probe aimed at an absent function name       ⇒ (g2) red
#                        (a self-test of the probe: if this is not red, (g2) is not testing boot)
#   PLANT=adminreadonly  the admin policy on sessions narrowed to SELECT       ⇒ (b2) red
#   PLANT=adminnoupdate  the admin policy on sessions split into SELECT and a
#                        separate INSERT — everything but UPDATE               ⇒ (b3) red
#   PLANT=nobump         reopen_first_read_session stops bumping
#                        reopen_generation (+ 1 becomes + 0): the reopen
#                        "succeeds" and records nothing                        ⇒ (b4) red
#   PLANT=memberupdate   a member UPDATE policy on sessions only — narrow on
#                        purpose, so (c2) stays green and this lands on (c3)   ⇒ (c3) red
#   PLANT=memberdelete   a member DELETE policy on responses only              ⇒ (c4) red
#   PLANT=nonmemberinsert  an INSERT policy admitting only callers with NO
#                        company_members row: the member is still refused, so
#                        (c2) stays green                                      ⇒ (d2) red
#   PLANT=anoninsert     INSERT granted to anon + an anon INSERT policy. No
#                        SELECT grant, so (e1) stays green                     ⇒ (e2) red
#   PLANT=anontrunc      TRUNCATE granted to anon on both tables               ⇒ (f2) red
#
# COVERAGE LAW. Every one of the 22 checks above has a plant here, and each plant makes its OWN check
# the first failure. A check no plant can break is not a check. (z) is the one exception and cannot be
# otherwise: it verifies that the ROLLBACK restored the function, so every plant leaves it green by
# construction — its falsification is the documented predicate demonstration (capture the def's md5,
# leave a planted function in place, capture again: the two differ and the comparison reports FAIL).
#
# Run:  source backups/fr-nonadmin.env && source backups/fr-member.env && bash scripts/guards/first-read-rls-guard.sh
#       PLANT=memberwide source backups/fr-nonadmin.env && source backups/fr-member.env && bash scripts/guards/first-read-rls-guard.sh
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
FUNCTIONS_URL=${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}

NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
MEM=${MEMBER_ID:-}
[ -n "$MEM" ] || { echo "guard: FAIL MEMBER_ID not set (source backups/fr-member.env)"; exit 1; }
MEMCO=${MEMBER_COMPANY_ID:-}
[ -n "$MEMCO" ] || { echo "guard: FAIL MEMBER_COMPANY_ID not set (source backups/fr-member.env)"; exit 1; }

psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }
reopendef() { psqlq "select pg_get_functiondef('public.reopen_first_read_session'::regproc)"; }

ADMIN=$(psqlq "select user_id from user_roles where role='admin' order by user_id limit 1")
[ -n "$ADMIN" ] || { echo "guard: FAIL no user_roles admin row"; exit 1; }

# The member fixture must be exactly that: no admin row, membership on the member company only.
MEM_ROLES=$(psqlq "select count(*) from user_roles where user_id='$MEM'")
MEM_CO_N=$(psqlq "select count(*) from company_members where user_id='$MEM'")
[ "$MEM_ROLES" = "0" ] || { echo "guard: FAIL member fixture $MEM has a user_roles row"; exit 1; }
[ "$MEM_CO_N" = "1" ] || { echo "guard: FAIL member fixture $MEM has $MEM_CO_N memberships, expected 1"; exit 1; }
NA_CO_N=$(psqlq "select count(*) from company_members where user_id='$NA'")
NA_ROLES=$(psqlq "select count(*) from user_roles where user_id='$NA'")
[ "$NA_ROLES" = "0" ] || { echo "guard: FAIL non-member fixture $NA has a user_roles row"; exit 1; }
[ "$NA_CO_N" = "0" ] || { echo "guard: FAIL non-member fixture $NA has $NA_CO_N memberships, expected 0"; exit 1; }

EDGEWOOD=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
CO=66666666-6666-4666-8666-6666666666f1   # throwaway company for the admin write checks
SESS_FIX=66666666-6666-4666-8666-6666666666a1  # kept fixture session on the member company

# ── the plant, applied inside the guard transaction and undone by its ROLLBACK ────────────────────
P=""
case "${PLANT:-}" in
  rlsoff)        P="alter table public.first_read_responses disable row level security;";;
  extrapolicy)   P="create policy \"plant redundant admin select s\" on public.first_read_sessions for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));";;
  noadmin)       P="drop policy \"Admins manage all first_read_sessions\" on public.first_read_sessions; drop policy \"Admins manage all first_read_responses\" on public.first_read_responses;";;
  nomember)      P="drop policy \"Members read own company first_read_sessions\" on public.first_read_sessions; drop policy \"Members read own company first_read_responses\" on public.first_read_responses;";;
  reopenopen)    P="$(psqlq "select replace(pg_get_functiondef('public.reopen_first_read_session'::regproc), 'if not public.has_role(auth.uid(), ''admin'') then', 'if false then')");";;
  memberwrite)   P="create policy \"plant member insert s\" on public.first_read_sessions for insert to authenticated with check (true);
                    create policy \"plant member update s\" on public.first_read_sessions for update to authenticated using (true) with check (true);
                    create policy \"plant member delete s\" on public.first_read_sessions for delete to authenticated using (true);
                    create policy \"plant member insert r\" on public.first_read_responses for insert to authenticated with check (true);
                    create policy \"plant member update r\" on public.first_read_responses for update to authenticated using (true) with check (true);
                    create policy \"plant member delete r\" on public.first_read_responses for delete to authenticated using (true);";;
  memberwide)    P="drop policy \"Members read own company first_read_responses\" on public.first_read_responses;
                    create policy \"Members read own company first_read_responses\" on public.first_read_responses for select to authenticated using (exists (select 1 from public.company_members cm where cm.company_id = cm.company_id and cm.user_id = auth.uid()));";;
  nonmemberopen) P="create policy \"plant nonmember select s\" on public.first_read_sessions for select to authenticated using (not exists (select 1 from public.company_members cm where cm.user_id = auth.uid()));";;
  anonopen)      P="grant select, insert on public.first_read_sessions to anon; grant select, insert on public.first_read_responses to anon;
                    create policy \"plant anon s\" on public.first_read_sessions for all to anon using (true) with check (true);
                    create policy \"plant anon r\" on public.first_read_responses for all to anon using (true) with check (true);";;
  truncok)       P="grant truncate on public.first_read_sessions to authenticated; grant truncate on public.first_read_responses to authenticated;";;
  svcgrant)      P="revoke select on public.first_read_sessions from service_role; revoke select on public.first_read_responses from service_role;";;
  adminreadonly) P="drop policy \"Admins manage all first_read_sessions\" on public.first_read_sessions;
                    create policy \"Admins manage all first_read_sessions\" on public.first_read_sessions for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));";;
  adminnoupdate) P="drop policy \"Admins manage all first_read_sessions\" on public.first_read_sessions;
                    create policy \"Admins manage all first_read_sessions\" on public.first_read_sessions for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));
                    create policy \"plant admin insert s\" on public.first_read_sessions for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));";;
  nobump)        P="$(psqlq "select replace(pg_get_functiondef('public.reopen_first_read_session'::regproc), 'reopen_generation = reopen_generation + 1', 'reopen_generation = reopen_generation + 0')");";;
  memberupdate)  P="create policy \"plant member update s\" on public.first_read_sessions for update to authenticated using (company_id in (select company_id from public.company_members where user_id = auth.uid())) with check (company_id in (select company_id from public.company_members where user_id = auth.uid()));";;
  memberdelete)  P="create policy \"plant member delete r\" on public.first_read_responses for delete to authenticated using (company_id in (select company_id from public.company_members where user_id = auth.uid()));";;
  nonmemberinsert) P="create policy \"plant nonmember insert s\" on public.first_read_sessions for insert to authenticated with check (not exists (select 1 from public.company_members cm where cm.user_id = auth.uid()));";;
  anoninsert)    P="grant insert on public.first_read_sessions to anon;
                    create policy \"plant anon insert s\" on public.first_read_sessions for insert to anon with check (true);";;
  anontrunc)     P="grant truncate on public.first_read_sessions to anon; grant truncate on public.first_read_responses to anon;";;
  boot)          P="";;
  "")            P="";;
  *)             echo "guard: FAIL unknown PLANT '${PLANT:-}'"; exit 1;;
esac

# ── (a2) the exact expected policy set. Normalised text, as pg_policies renders it. ───────────────
MD5_REOPEN_BEFORE=$(reopendef | md5)

EXPECT_POLICIES=$(cat <<'EOF'
first_read_responses|Admins manage all first_read_responses|ALL|{authenticated}|has_role(auth.uid(), 'admin'::app_role)|has_role(auth.uid(), 'admin'::app_role)
first_read_responses|Members read own company first_read_responses|SELECT|{authenticated}|(company_id IN ( SELECT company_members.company_id
   FROM company_members
  WHERE (company_members.user_id = auth.uid())))|-
first_read_sessions|Admins manage all first_read_sessions|ALL|{authenticated}|has_role(auth.uid(), 'admin'::app_role)|has_role(auth.uid(), 'admin'::app_role)
first_read_sessions|Members read own company first_read_sessions|SELECT|{authenticated}|(company_id IN ( SELECT company_members.company_id
   FROM company_members
  WHERE (company_members.user_id = auth.uid())))|-
EOF
)

OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
-- throwaway company for the admin write checks. Never a live company.
INSERT INTO public.companies (id, name, created_by, frozen)
  VALUES ('$CO', 'GUARD first-read-rls throwaway', '$ADMIN', false);

DO \$guard\$
DECLARE
  v_admin     text := '$ADMIN';
  v_member    text := '$MEM';
  v_nonmember text := '$NA';
  v_co        uuid := '$CO';
  v_memco     uuid := '$MEMCO';
  v_edge      uuid := '$EDGEWOOD';
  v_sessfix   uuid := '$SESS_FIX';
  v_new_sess  uuid := gen_random_uuid();
  v_new_resp  uuid := gen_random_uuid();
  v_n         int;
  v_n2        int;
  v_fired     boolean;
  v_msg       text;
  v_got       text;
  v_want      text;
  v_mode      text;
BEGIN
  -- ══ (a1) RLS enabled on both ════════════════════════════════════════════════════════════════
  SELECT count(*) INTO v_n FROM pg_class
   WHERE oid IN ('public.first_read_sessions'::regclass, 'public.first_read_responses'::regclass)
     AND relrowsecurity;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'GUARD-FAIL (a1) row level security is enabled on % of 2 tables', v_n;
  END IF;
  RAISE NOTICE '  ok   (a1) row level security is enabled on both tables';

  -- ══ (b) ADMIN JWT ══════════════════════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  -- Read the MEMBER company's rows deliberately: the admin holds no company_members row there, so
  -- only the admin policy can admit them. Reading "any rows at all" would pass through the member
  -- policy on the admin's own two memberships and would not test the admin policy.
  SELECT count(*) INTO v_n  FROM public.first_read_sessions  WHERE company_id = v_memco;
  SELECT count(*) INTO v_n2 FROM public.first_read_responses WHERE company_id = v_memco;
  IF v_n = 0 OR v_n2 = 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b1) admin read of a company it is NOT a member of: sessions=%, responses=% — the admin policy is not admitting rows', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (b1) admin JWT reads both tables for a company it is not a member of (sessions=%, responses=%)', v_n, v_n2;

  -- Caught, not bare: a REFUSED admin insert must report itself as (b2). Left bare, an RLS refusal
  -- propagates as a raw Postgres error and the run names no check at all.
  v_fired := false;
  BEGIN
    INSERT INTO public.first_read_sessions (id, company_id, status) VALUES (v_new_sess, v_co, 'open');
    INSERT INTO public.first_read_responses (id, session_id, company_id, item_kind, item_identity, item_text, verdict)
      VALUES (v_new_resp, v_new_sess, v_co, 'finding', 'guard-admin-insert', 'guard admin insert', 'confirmed');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (b2) admin insert was REFUSED: %', v_msg;
  END IF;
  SELECT count(*) INTO v_n FROM public.first_read_sessions  WHERE id = v_new_sess;
  SELECT count(*) INTO v_n2 FROM public.first_read_responses WHERE id = v_new_resp;
  IF v_n <> 1 OR v_n2 <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b2) admin insert did not land: session=%, response=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (b2) admin JWT inserts a session and a response on a throwaway company';

  UPDATE public.first_read_sessions SET status='proposal_issued' WHERE id = v_new_sess;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b3) admin update touched % rows, expected 1', v_n;
  END IF;
  RAISE NOTICE '  ok   (b3) admin JWT updates the session over the lawful edge (open -> proposal_issued)';

  PERFORM public.reopen_first_read_session(v_new_sess, 'guard check b4');
  SELECT count(*) INTO v_n FROM public.first_read_sessions
   WHERE id = v_new_sess AND status='open' AND reopen_generation = 1;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b4) admin reopen did not take effect';
  END IF;
  RAISE NOTICE '  ok   (b4) admin JWT reopens the session through reopen_first_read_session';

  -- ══ (c) MEMBER JWT — non-admin, member of v_memco only ═════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_n  FROM public.first_read_sessions  WHERE company_id = v_memco;
  SELECT count(*) INTO v_n2 FROM public.first_read_responses WHERE company_id = v_memco;
  IF v_n < 1 OR v_n2 < 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (c1) member cannot read its OWN company: sessions=%, responses=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (c1) member JWT reads its own company (sessions=%, responses=%)', v_n, v_n2;

  v_fired := false;
  BEGIN
    INSERT INTO public.first_read_sessions (company_id, status) VALUES (v_memco, 'open');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (c2) member INSERT into first_read_sessions SUCCEEDED';
  END IF;
  v_fired := false;
  BEGIN
    INSERT INTO public.first_read_responses (session_id, company_id, item_kind, item_identity, item_text, verdict)
      VALUES (v_sessfix, v_memco, 'finding', 'guard-member-insert', 'guard member insert', 'confirmed');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (c2) member INSERT into first_read_responses SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (c2) member JWT INSERT refused on both tables (last: %)', left(v_msg, 70);

  UPDATE public.first_read_sessions SET presenter='plant' WHERE company_id = v_memco;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE public.first_read_responses SET verdict='rejected' WHERE company_id = v_memco;
  GET DIAGNOSTICS v_n2 = ROW_COUNT;
  IF v_n <> 0 OR v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (c3) member UPDATE touched rows: sessions=%, responses=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (c3) member JWT UPDATE touches 0 rows on both tables';

  DELETE FROM public.first_read_responses WHERE company_id = v_memco;
  GET DIAGNOSTICS v_n2 = ROW_COUNT;
  DELETE FROM public.first_read_sessions WHERE company_id = v_memco;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 OR v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (c4) member DELETE touched rows: sessions=%, responses=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (c4) member JWT DELETE touches 0 rows on both tables';

  -- The fixture session must be reopenable-shaped for this to test anything: an 'open' session is
  -- refused by the status rule before authority is ever reached. Move it as ADMIN first, then attempt
  -- the reopen as the MEMBER.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  UPDATE public.first_read_sessions SET status='proposal_issued' WHERE id = v_sessfix;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);

  v_fired := false;
  BEGIN PERFORM public.reopen_first_read_session(v_sessfix, 'guard check c5');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  -- Two independent properties: the call was refused, AND it had no effect.
  PERFORM set_config('role', 'postgres', true);
  SELECT count(*) INTO v_n FROM public.first_read_sessions
   WHERE id = v_sessfix AND status = 'proposal_issued' AND reopen_generation = 0;
  SELECT count(*) INTO v_n2 FROM public.first_read_session_reopens WHERE session_id = v_sessfix;
  PERFORM set_config('role', 'authenticated', true);
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (c5) member reopen was NOT refused (session unchanged=%, reopen rows=%)', v_n, v_n2;
  END IF;
  IF v_n <> 1 OR v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (c5) member reopen had an EFFECT: session still proposal_issued/gen 0 = %, reopen rows written = %', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (c5) member JWT reopen refused, and had no effect (%)', left(v_msg, 55);

  SELECT count(*) INTO v_n  FROM public.first_read_sessions  WHERE company_id = v_edge;
  SELECT count(*) INTO v_n2 FROM public.first_read_responses WHERE company_id = v_edge;
  IF v_n <> 0 OR v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (c6) member read ACROSS tenants: Edgewood sessions=%, responses=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (c6) member JWT reads ZERO Edgewood rows on both tables';

  -- ══ (d) NON-ADMIN NON-MEMBER JWT ═══════════════════════════════════════════════════════════
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nonmember, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n  FROM public.first_read_sessions;
  SELECT count(*) INTO v_n2 FROM public.first_read_responses;
  IF v_n <> 0 OR v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (d1) non-member read rows: sessions=%, responses=%', v_n, v_n2;
  END IF;
  RAISE NOTICE '  ok   (d1) non-admin non-member JWT reads 0 rows on both tables';

  v_fired := false;
  BEGIN INSERT INTO public.first_read_sessions (company_id, status) VALUES (v_co, 'open');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (d2) non-member INSERT SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (d2) non-admin non-member JWT INSERT refused';

  -- ══ (e) ANON ═══════════════════════════════════════════════════════════════════════════════
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  PERFORM set_config('role', 'anon', true);

  v_mode := '';
  BEGIN
    SELECT count(*) INTO v_n FROM public.first_read_sessions;
    v_mode := 'select allowed, rows=' || v_n;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; v_mode := 'permission denied';
  END;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (e1) anon read % session rows', v_n;
  END IF;
  BEGIN
    SELECT count(*) INTO v_n2 FROM public.first_read_responses;
  EXCEPTION WHEN insufficient_privilege THEN v_n2 := 0;
  END;
  IF v_n2 <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (e1) anon read % response rows', v_n2;
  END IF;
  RAISE NOTICE '  ok   (e1) anon reads nothing on both tables (%)', v_mode;

  v_fired := false;
  BEGIN INSERT INTO public.first_read_sessions (company_id, status) VALUES (v_co, 'open');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (e2) anon INSERT SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (e2) anon INSERT refused (%)', left(v_msg, 50);

  -- ══ (f) TRUNCATE — not subject to RLS, only to the grant ═══════════════════════════════════
  v_fired := false;
  BEGIN TRUNCATE public.first_read_responses;
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (f2) anon TRUNCATE of first_read_responses SUCCEEDED'; END IF;
  v_fired := false;
  BEGIN TRUNCATE public.first_read_sessions;
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (f2) anon TRUNCATE of first_read_sessions SUCCEEDED'; END IF;

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_fired := false;
  BEGIN TRUNCATE public.first_read_responses;
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (f1) authenticated TRUNCATE of first_read_responses SUCCEEDED'; END IF;
  v_fired := false;
  BEGIN TRUNCATE public.first_read_sessions;
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (f1) authenticated TRUNCATE of first_read_sessions SUCCEEDED'; END IF;
  RAISE NOTICE '  ok   (f1) TRUNCATE refused for authenticated on both tables (%)', left(v_msg, 50);
  RAISE NOTICE '  ok   (f2) TRUNCATE refused for anon on both tables';

  -- ══ (g1) service_role is untouched — rolbypassrls, no policy needed ════════════════════════
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'service_role', true);
  BEGIN
    SELECT count(*) INTO v_n  FROM public.first_read_sessions  WHERE id = v_sessfix;
    SELECT count(*) INTO v_n2 FROM public.first_read_responses WHERE company_id = v_memco;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'GUARD-FAIL (g1) service_role could not read the throwaway rows: %', SQLERRM;
  END;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g1) service_role read % rows for the throwaway session, expected 1', v_n;
  END IF;
  IF v_n2 < 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g1) service_role read % throwaway response rows, expected at least 1', v_n2;
  END IF;
  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE '  ok   (g1) service_role reads the throwaway session and response with RLS on and no service_role policy';

  -- ══ (a2) LAST — the policy set equals the spec exactly ══════════════════════════════════════
  -- Runs last on purpose: it catches every policy-shaped plant, so ahead of the behavioural checks
  -- it would mask them. See the ORDER NOTES in the header.
  SELECT string_agg(line, chr(10) ORDER BY line) INTO v_got FROM (
    SELECT tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||
           coalesce(qual,'-')||'|'||coalesce(with_check,'-') AS line
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('first_read_sessions','first_read_responses')
  ) t;
  v_want := \$want\$$EXPECT_POLICIES\$want\$;
  IF coalesce(v_got,'') IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION E'GUARD-FAIL (a2) the policy set does not equal the spec.\n--- got ---\n%\n--- want ---\n%', coalesce(v_got,'(none)'), v_want;
  END IF;
  RAISE NOTICE '  ok   (a2) exactly four policies, commands, roles and expressions equal the spec — no fifth policy, no anon policy';

  RAISE NOTICE 'GUARD DB GREEN';
END
\$guard\$;
ROLLBACK;
SQL
)

echo "$OUT" | sed -n 's/^NOTICE:  //p'

# (z) the ROLLBACK restored reopen_first_read_session byte for byte — PLANT=reopenopen edits it, and
# every plant must leave the real system exactly as it found it.
MD5_REOPEN_AFTER=$(reopendef | md5)
if [ "$MD5_REOPEN_BEFORE" != "$MD5_REOPEN_AFTER" ]; then
  echo "guard: FAIL (z) reopen_first_read_session was NOT restored by the ROLLBACK ($MD5_REOPEN_BEFORE -> $MD5_REOPEN_AFTER)"
  exit 1
fi
echo "  ok   (z) reopen_first_read_session is restored md5-identical after the ROLLBACK"

if ! echo "$OUT" | grep -q 'GUARD DB GREEN'; then
  echo "$OUT" | grep -E 'GUARD-FAIL|ERROR|FATAL' | head -20
  echo "guard: FAIL (db checks)"
  exit 1
fi

# ── (g2) the two service-role edge functions still boot. HTTP, outside the transaction. ───────────
SRK=$(docker exec "$PGC" psql -U postgres -At -c "select 1" >/dev/null 2>&1 && echo "${SERVICE_ROLE_KEY:-}")
if [ -z "$SRK" ]; then
  SRK=$(cd "$(dirname "$0")/../.." && npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
fi
[ -n "$SRK" ] || { echo "guard: FAIL could not resolve SERVICE_ROLE_KEY for the (g2) boot probe"; exit 1; }

g2_fail=0
for fn in generate-first-read-proposal feed-first-read-corrections; do
  target="$fn"
  [ "${PLANT:-}" = "boot" ] && target="${fn}-absent"
  code=$(curl -s -m 40 -o /dev/null -w '%{http_code}' -X POST "$FUNCTIONS_URL/$target" \
          -H "Authorization: Bearer $SRK" -H 'Content-Type: application/json' -d '{}')
  # EXACTLY 400 — its own body validation. 404 means the name did not resolve (so the probe proved
  # nothing about boot); 503 means the module failed to load.
  case "$code" in
    400) echo "  ok   (g2) $target boots — {} answered 400 from its own validation";;
    404) echo "  FAIL (g2) $target answered 404 — the name did not resolve, so nothing about boot was tested"; g2_fail=1;;
    503) echo "  FAIL (g2) $target answered 503 — the module did not load"; g2_fail=1;;
    *)   echo "  FAIL (g2) $target answered $code — expected 400 from its own validation"; g2_fail=1;;
  esac
done
[ "$g2_fail" = 0 ] || { echo "guard: FAIL (g2 boot probe)"; exit 1; }

echo "guard: PASS"
