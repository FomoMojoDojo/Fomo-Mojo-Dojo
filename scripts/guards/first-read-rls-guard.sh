#!/usr/bin/env bash
# ROW SECURITY on the three first-read tables:
#   first_read_sessions, first_read_responses      — CV3, migration 20260927120000 (2026-09-27)
#   first_read_session_reopens (the reopen audit)  — migration 20260928120000 (2026-09-28)
#   first_read_session_removals (the removal audit) — migration 20260930090000 (2026-09-30)
# Guards against the REAL local database. Every check runs inside ONE ROLLED-BACK
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
#   (h1) row level security is ENABLED on first_read_session_reopens
#   (h2) the reopen RPC wrote its audit row under an admin JWT, and the admin reads it back
#   (h3) member JWT reads 0 audit rows
#   (h4) member JWT INSERT into the audit table is refused
#   (h5) non-admin NON-MEMBER JWT reads 0 audit rows
#   (h6) anon reads nothing from the audit table
#   (h7) anon INSERT into the audit table is refused
#   (h8) TRUNCATE of the audit table is refused for anon
#   (h9) TRUNCATE of the audit table is refused for authenticated
#   (r1) row level security is ENABLED on first_read_session_removals
#   (r2) its policy set is EXACTLY one admin SELECT — no write policy for any role, no member policy,
#        no anon policy. Append-only is a policy fact here, not only a grant fact.
#   (r3) anon holds NO privilege on it at all, and an anon SELECT is refused
#   (r4) authenticated holds SELECT and nothing else — no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
#   (r7) first_read_sessions_delete_audit is SECURITY DEFINER with a fixed search_path. This is what
#        keeps the delete working now that no app role holds INSERT: without it every session delete
#        would fail on the audit insert.
#   -- over PostgREST, with REAL user JWTs, outside the transaction (see the HTTP section at the end):
#   (r5) the member and the non-admin each read 0 rows; the admin reads all of them
#   (r6) admin INSERT, UPDATE and DELETE on the table are all refused (403 / 42501)
#   (r8) an admin DELETE of a throwaway first read session lands EXACTLY ONE removal row for that
#        session id — the end-to-end proof that the DEFINER trigger still writes the audit. The row is
#        removed again as postgres and the count returns to its starting value.
#   (a2) LAST: the policy set equals the spec EXACTLY — SIX policies across the FOUR tables, their
#        commands, their roles, and the normalised text of every USING / WITH CHECK expression. No
#        seventh policy, no anon policy, no member policy on either audit table, and no write policy
#        of any kind on first_read_session_removals.
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
#                        the caller re-checks its md5 afterwards), PLUS a
#                        permissive INSERT policy on first_read_session_reopens.
#                        The second half is required, not padding: since
#                        20260928120000 the audit table is admin-only, so the
#                        RPC's own audit INSERT refuses a member reopen even
#                        with the admin check gone. Without opening that, (c5)
#                        would go green for a reason it is not testing and the
#                        plant would falsify nothing                           ⇒ (c5) red
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
#   PLANT=reopensnowrite the audit table's admin policy narrowed to SELECT, so
#                        the RPC's own audit INSERT is refused and the reopen
#                        raises. (b4)'s second, independent failure mode —
#                        `nobump` breaks the session half, this the audit half  ⇒ (b4) red
#   PLANT=reopensrlsoff  RLS disabled again on first_read_session_reopens       ⇒ (h1) red
#   PLANT=reopensnoread  the audit table's admin policy narrowed to INSERT: the
#                        row still lands, the admin cannot read it back         ⇒ (h2) red
#   PLANT=reopensmemberread    a `USING (true)` SELECT policy on the audit table ⇒ (h3) red
#   PLANT=reopensmemberwrite   a `WITH CHECK (true)` INSERT policy on it        ⇒ (h4) red
#   PLANT=reopensnonmemberread an INVERTED membership predicate — only a caller
#                        with NO company_members row reads. Narrow on purpose,
#                        so (h3) stays green and this lands on (h5)             ⇒ (h5) red
#   PLANT=reopensanonread      SELECT granted to anon + an anon SELECT policy   ⇒ (h6) red
#   PLANT=reopensanoninsert    INSERT granted to anon + an anon INSERT policy   ⇒ (h7) red
#   PLANT=reopenstruncanon     TRUNCATE granted to anon on the audit table      ⇒ (h8) red
#   PLANT=reopenstruncauth     TRUNCATE granted to authenticated on it          ⇒ (h9) red
#   -- first_read_session_removals (20260930090000). In-transaction, undone by the ROLLBACK:
#   PLANT=removalsrlsoff       RLS disabled again on the removal audit          ⇒ (r1) red
#   PLANT=removalsmemberpolicy a member SELECT policy added to it               ⇒ (r2) red
#   PLANT=removalsinsertpolicy an authenticated INSERT policy added to it —
#                              append-only breached at the policy layer         ⇒ (r2) red
#   PLANT=removalsanongrant    SELECT re-granted to anon (grant only, no policy —
#                              a policy would be caught by (r2) first)               ⇒ (r3) red
#   PLANT=removalstruncauth    TRUNCATE granted to authenticated on it          ⇒ (r4) red
#   PLANT=removalsinvoker      the audit trigger reverted to SECURITY INVOKER   ⇒ (r7) red
#   -- COMMITTED plants, for the PostgREST checks. A separate transaction cannot see an uncommitted
#      plant, so these are applied for real and restored by the script's EXIT trap, which also
#      verifies the restore md5-identically. Each names its own inverse; none touches data.
#   PLANT=removalsmemberread   a permissive member SELECT policy, committed     ⇒ (r5) red
#   PLANT=removalsadminupdate  an admin UPDATE policy, committed                ⇒ (r6) red
#   PLANT=removalsinvokerlive  the audit trigger reverted to SECURITY INVOKER,
#                              committed — the delete must then fail outright or
#                              land no removal row                              ⇒ (r8) red
#
# COVERAGE LAW. 40 "ok" lines and 39 plants (a green run prints (g2) twice — once per edge function —
# and (r2) and (b4) each carry two plants, so the two counts are not meant to be equal). Every check
# above has a plant here, and each plant makes its OWN check
# the first failure. A check no plant can break is not a check. (b4) carries two plants because it now
# has two independent failure modes — the session half and the audit half. (z) is the one exception and
# cannot be otherwise: it verifies that the ROLLBACK restored the function AND the three tables' RLS
# flags, policies and grants, so every plant leaves it green by construction — its falsification is the
# documented predicate demonstration (capture the md5, leave a planted object in place, capture again:
# the two differ and the comparison reports FAIL).
#
# Run:  set -a; source backups/fr-login.env; source backups/fr-nonadmin.env; source backups/fr-member.env; set +a
#       bash scripts/guards/first-read-rls-guard.sh
#       PLANT=removalsrlsoff bash scripts/guards/first-read-rls-guard.sh   (any plant, same three env files)
# fr-login.env is needed from 20260930090000 on: the (r5/r6/r8) PostgREST checks mint a REAL admin JWT,
# which the in-transaction request.jwt.claims trick cannot stand in for.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
FUNCTIONS_URL=${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}

NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
MEM=${MEMBER_ID:-}
[ -n "$MEM" ] || { echo "guard: FAIL MEMBER_ID not set (source backups/fr-member.env)"; exit 1; }
MEMCO=${MEMBER_COMPANY_ID:-}
[ -n "$MEMCO" ] || { echo "guard: FAIL MEMBER_COMPANY_ID not set (source backups/fr-member.env)"; exit 1; }
# The (r5/r6/r8) PostgREST checks need real JWTs, so they need passwords as well as ids. Named
# separately so a half-sourced environment says which file is missing rather than skipping a check.
ADMIN_EMAIL=${FR_LOGIN_EMAIL:-}
[ -n "$ADMIN_EMAIL" ] || { echo "guard: FAIL FR_LOGIN_EMAIL not set (source backups/fr-login.env)"; exit 1; }
ADMIN_PW=${FR_LOGIN_PASSWORD:-}
[ -n "$ADMIN_PW" ] || { echo "guard: FAIL FR_LOGIN_PASSWORD not set (source backups/fr-login.env)"; exit 1; }
MEM_EMAIL=${MEMBER_EMAIL:-}
[ -n "$MEM_EMAIL" ] || { echo "guard: FAIL MEMBER_EMAIL not set (source backups/fr-member.env)"; exit 1; }
MEM_PW=${MEMBER_PASSWORD:-}
[ -n "$MEM_PW" ] || { echo "guard: FAIL MEMBER_PASSWORD not set (source backups/fr-member.env)"; exit 1; }
NA_EMAIL=${NONADMIN_EMAIL:-}
[ -n "$NA_EMAIL" ] || { echo "guard: FAIL NONADMIN_EMAIL not set (source backups/fr-nonadmin.env)"; exit 1; }
NA_PW=${NONADMIN_PASSWORD:-}
[ -n "$NA_PW" ] || { echo "guard: FAIL NONADMIN_PASSWORD not set (source backups/fr-nonadmin.env)"; exit 1; }

psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }
reopendef() { psqlq "select pg_get_functiondef('public.reopen_first_read_session'::regproc)"; }
# The audit trigger's full definition — body AND security label AND search_path. PLANT=removalsinvoker
# edits it inside the transaction and PLANT=removalsinvokerlive edits it for real; (z) and the EXIT
# trap respectively prove it came back byte for byte.
auditdef() { psqlq "select pg_get_functiondef('public.first_read_sessions_delete_audit()'::regprocedure)"; }
# (z) also covers the three tables' own shape: RLS flag, every policy expression, every grant. A plant
# that somehow committed instead of rolling back shows up here even if no check above noticed.
tableshape() {
  psqlq "select relname||' rls='||relrowsecurity::text from pg_class where oid in ('first_read_sessions'::regclass,'first_read_responses'::regclass,'first_read_session_reopens'::regclass,'first_read_session_removals'::regclass) order by 1"
  psqlq "select tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'-')||'|'||coalesce(with_check,'-') from pg_policies where schemaname='public' and tablename in ('first_read_sessions','first_read_responses','first_read_session_reopens','first_read_session_removals') order by 1"
  psqlq "select table_name||'|'||grantee||'|'||privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('first_read_sessions','first_read_responses','first_read_session_reopens','first_read_session_removals') order by 1"
}

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
  reopenopen)    P="$(psqlq "select replace(pg_get_functiondef('public.reopen_first_read_session'::regproc), 'if not public.has_role(auth.uid(), ''admin'') then', 'if false then')");
                    create policy \"plant reopens insert for c5\" on public.first_read_session_reopens for insert to authenticated with check (true);";;
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
  reopensnowrite) P="drop policy \"Admins manage all first_read_session_reopens\" on public.first_read_session_reopens;
                    create policy \"Admins manage all first_read_session_reopens\" on public.first_read_session_reopens for select to authenticated using (has_role(auth.uid(), 'admin'::app_role));";;
  reopensrlsoff) P="alter table public.first_read_session_reopens disable row level security;";;
  reopensnoread) P="drop policy \"Admins manage all first_read_session_reopens\" on public.first_read_session_reopens;
                    create policy \"Admins manage all first_read_session_reopens\" on public.first_read_session_reopens for insert to authenticated with check (has_role(auth.uid(), 'admin'::app_role));";;
  reopensmemberread) P="create policy \"plant reopens member read\" on public.first_read_session_reopens for select to authenticated using (true);";;
  reopensmemberwrite) P="create policy \"plant reopens member write\" on public.first_read_session_reopens for insert to authenticated with check (true);";;
  reopensnonmemberread) P="create policy \"plant reopens nonmember read\" on public.first_read_session_reopens for select to authenticated using (not exists (select 1 from public.company_members cm where cm.user_id = auth.uid()));";;
  reopensanonread) P="grant select on public.first_read_session_reopens to anon;
                    create policy \"plant reopens anon read\" on public.first_read_session_reopens for select to anon using (true);";;
  reopensanoninsert) P="grant insert on public.first_read_session_reopens to anon;
                    create policy \"plant reopens anon insert\" on public.first_read_session_reopens for insert to anon with check (true);";;
  reopenstruncanon) P="grant truncate on public.first_read_session_reopens to anon;";;
  reopenstruncauth) P="grant truncate on public.first_read_session_reopens to authenticated;";;
  removalsrlsoff) P="alter table public.first_read_session_removals disable row level security;";;
  removalsmemberpolicy) P="create policy \"plant removals member read\" on public.first_read_session_removals for select to authenticated using (company_id in (select company_id from public.company_members where user_id = auth.uid()));";;
  removalsinsertpolicy) P="grant insert on public.first_read_session_removals to authenticated;
                    create policy \"plant removals insert\" on public.first_read_session_removals for insert to authenticated with check (true);";;
  # GRANT ONLY, deliberately no policy: a policy-shaped plant would be caught by (r2) first and would
  # prove nothing about (r3). With the grant back and still no anon policy, anon's SELECT returns 0
  # rows instead of raising — which (r3) also reports, because a silent 0 is not a refusal.
  removalsanongrant) P="grant select on public.first_read_session_removals to anon;";;
  removalstruncauth) P="grant truncate on public.first_read_session_removals to authenticated;";;
  removalsinvoker) P="$(psqlq "select replace(pg_get_functiondef('public.first_read_sessions_delete_audit()'::regprocedure), 'SECURITY DEFINER', 'SECURITY INVOKER')");";;
  # The three committed plants are applied outside this transaction, in the HTTP section. Named here
  # only so an unknown-PLANT typo still aborts rather than running a silently plant-free guard.
  removalsmemberread|removalsadminupdate|removalsinvokerlive) P="";;
  boot)          P="";;
  "")            P="";;
  *)             echo "guard: FAIL unknown PLANT '${PLANT:-}'"; exit 1;;
esac

# ── (a2) the exact expected policy set. Normalised text, as pg_policies renders it. ───────────────
MD5_REOPEN_BEFORE=$(reopendef | md5)
MD5_AUDIT_BEFORE=$(auditdef | md5)
MD5_SHAPE_BEFORE=$(tableshape | md5)

EXPECT_POLICIES=$(cat <<'EOF'
first_read_responses|Admins manage all first_read_responses|ALL|{authenticated}|has_role(auth.uid(), 'admin'::app_role)|has_role(auth.uid(), 'admin'::app_role)
first_read_responses|Members read own company first_read_responses|SELECT|{authenticated}|(company_id IN ( SELECT company_members.company_id
   FROM company_members
  WHERE (company_members.user_id = auth.uid())))|-
first_read_session_removals|Admins read first_read_session_removals|SELECT|{authenticated}|has_role(auth.uid(), 'admin'::app_role)|-
first_read_session_reopens|Admins manage all first_read_session_reopens|ALL|{authenticated}|has_role(auth.uid(), 'admin'::app_role)|has_role(auth.uid(), 'admin'::app_role)
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

  -- Caught, not bare: the RPC also INSERTs its audit row into first_read_session_reopens, which is
  -- itself under RLS. A refusal there must report as (b4), not as a raw Postgres error.
  v_fired := false;
  BEGIN PERFORM public.reopen_first_read_session(v_new_sess, 'guard check b4');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (b4) admin reopen was REFUSED: %', v_msg;
  END IF;
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

  -- ══ (h) THE REOPEN AUDIT TABLE — first_read_session_reopens ════════════════════════════════
  -- Admin only, deliberately narrower than the other two: `reason` is the operator's own words about
  -- why a client's issued read was pulled back, and `reopened_by` names who decided. Neither has ever
  -- been client-facing. The audit row read here is the one the (b4) reopen wrote, in this transaction.
  SELECT count(*) INTO v_n FROM pg_class
   WHERE oid = 'public.first_read_session_reopens'::regclass AND relrowsecurity;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (h1) row level security is NOT enabled on first_read_session_reopens';
  END IF;
  RAISE NOTICE '  ok   (h1) row level security is enabled on first_read_session_reopens';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO v_n FROM public.first_read_session_reopens WHERE session_id = v_new_sess;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (h2) admin reads % audit rows for the reopened session, expected the 1 the (b4) reopen wrote', v_n;
  END IF;
  RAISE NOTICE '  ok   (h2) the reopen RPC wrote its audit row under an admin JWT and the admin reads it back';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.first_read_session_reopens;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (h3) member read % audit rows, expected 0', v_n;
  END IF;
  RAISE NOTICE '  ok   (h3) member JWT reads 0 audit rows';

  v_fired := false;
  BEGIN
    INSERT INTO public.first_read_session_reopens
      (session_id, company_id, status_at_reopen, generation_after, reopened_by, reason)
      VALUES (v_sessfix, v_memco, 'proposal_issued', 1, v_member, 'guard check h4');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (h4) member INSERT into the audit table SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (h4) member JWT INSERT into the audit table refused (%)', left(v_msg, 55);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nonmember, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_n FROM public.first_read_session_reopens;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (h5) non-member read % audit rows, expected 0', v_n;
  END IF;
  RAISE NOTICE '  ok   (h5) non-admin non-member JWT reads 0 audit rows';

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_mode := '';
  BEGIN
    SELECT count(*) INTO v_n FROM public.first_read_session_reopens;
    v_mode := 'select allowed, rows=' || v_n;
  EXCEPTION WHEN insufficient_privilege THEN v_n := 0; v_mode := 'permission denied';
  END;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (h6) anon read % audit rows', v_n;
  END IF;
  RAISE NOTICE '  ok   (h6) anon reads nothing from the audit table (%)', v_mode;

  v_fired := false;
  BEGIN
    INSERT INTO public.first_read_session_reopens
      (session_id, company_id, status_at_reopen, generation_after, reopened_by, reason)
      VALUES (v_sessfix, v_memco, 'proposal_issued', 1, 'anon', 'guard check h7');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (h7) anon INSERT into the audit table SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (h7) anon INSERT into the audit table refused (%)', left(v_msg, 55);

  -- TRUNCATE is not subject to RLS — only the grant stops it, and it fires no row triggers, so an
  -- emptied audit would leave no trace of having been emptied. anon first: we are already anon here.
  v_fired := false;
  BEGIN TRUNCATE public.first_read_session_reopens;
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (h8) anon TRUNCATE of the audit table SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (h8) TRUNCATE of the audit table refused for anon';

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_fired := false;
  BEGIN TRUNCATE public.first_read_session_reopens;
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (h9) authenticated TRUNCATE of the audit table SUCCEEDED';
  END IF;
  RAISE NOTICE '  ok   (h9) TRUNCATE of the audit table refused for authenticated (%)', left(v_msg, 45);
  PERFORM set_config('role', 'postgres', true);

  -- ══ (r) first_read_session_removals — the REMOVAL audit (20260930090000) ═══════════════════
  -- Admin READ only, and APPEND-ONLY: no write policy for any role, and every write verb revoked from
  -- authenticated. The trigger writes it as its DEFINER owner, so no app role needs INSERT at all.

  -- ── (r1) RLS on ───────────────────────────────────────────────────────────────────────────────
  SELECT relrowsecurity INTO v_fired FROM pg_class WHERE oid='public.first_read_session_removals'::regclass;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (r1) row level security is NOT enabled on first_read_session_removals';
  END IF;
  RAISE NOTICE '  ok   (r1) row level security is enabled on first_read_session_removals';

  -- ── (r2) exactly one admin SELECT policy, and nothing else ────────────────────────────────────
  -- Spelled out here rather than left to (a2) so an added write policy names THIS check. Append-only
  -- must be a policy fact, not only a grant fact: a future GRANT would otherwise re-open writes.
  SELECT string_agg(policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'-')||'|'||coalesce(with_check,'-'), chr(10) ORDER BY policyname)
    INTO v_got FROM pg_policies
   WHERE schemaname='public' AND tablename='first_read_session_removals';
  v_want := 'Admins read first_read_session_removals|SELECT|{authenticated}|has_role(auth.uid(), ''admin''::app_role)|-';
  IF coalesce(v_got,'') IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION E'GUARD-FAIL (r2) the removal audit policy set is not exactly one admin SELECT.\n--- got ---\n%\n--- want ---\n%', coalesce(v_got,'(none)'), v_want;
  END IF;
  RAISE NOTICE '  ok   (r2) exactly one policy on the removal audit: admin SELECT, no write policy for any role, no member or anon policy';

  -- ── (r3) anon holds nothing, and an anon SELECT is refused ────────────────────────────────────
  SELECT count(*) INTO v_n FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='first_read_session_removals' AND grantee='anon';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (r3) anon still holds % privilege(s) on the removal audit', v_n;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  PERFORM set_config('role', 'anon', true);
  v_fired := false;
  BEGIN SELECT count(*) INTO v_n FROM public.first_read_session_removals;
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (r3) anon SELECT on the removal audit SUCCEEDED, returning % rows', v_n;
  END IF;
  RAISE NOTICE '  ok   (r3) anon holds no privilege on the removal audit and its SELECT is refused (%)', left(v_msg, 50);

  -- ── (r4) authenticated holds SELECT and nothing else ──────────────────────────────────────────
  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) INTO v_got
    FROM information_schema.role_table_grants
   WHERE table_schema='public' AND table_name='first_read_session_removals' AND grantee='authenticated';
  IF coalesce(v_got,'(none)') <> 'SELECT' THEN
    RAISE EXCEPTION 'GUARD-FAIL (r4) authenticated holds "%" on the removal audit, expected exactly SELECT', coalesce(v_got,'(none)');
  END IF;
  RAISE NOTICE '  ok   (r4) authenticated holds exactly SELECT on the removal audit — no INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES or TRIGGER';

  -- ── (r7) the audit trigger is SECURITY DEFINER with a fixed search_path ───────────────────────
  -- Not cosmetic: (r4) just revoked INSERT from authenticated, so an INVOKER trigger would make every
  -- session delete fail on the audit insert. DEFINER is what keeps the delete working, and the pinned
  -- search_path is what stops a caller shadowing public.* to steer a postgres-owned function.
  SELECT p.prosecdef INTO v_fired FROM pg_proc p WHERE p.oid='public.first_read_sessions_delete_audit()'::regprocedure;
  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (r7) first_read_sessions_delete_audit is SECURITY INVOKER — with no INSERT grant for authenticated, every session delete now fails on the audit insert';
  END IF;
  SELECT coalesce(array_to_string(p.proconfig, ','), '(none)') INTO v_got
    FROM pg_proc p WHERE p.oid='public.first_read_sessions_delete_audit()'::regprocedure;
  IF v_got NOT LIKE 'search_path=%' THEN
    RAISE EXCEPTION 'GUARD-FAIL (r7) first_read_sessions_delete_audit is SECURITY DEFINER with no pinned search_path (proconfig=%)', v_got;
  END IF;
  SELECT pg_get_userbyid(p.proowner) INTO v_mode FROM pg_proc p WHERE p.oid='public.first_read_sessions_delete_audit()'::regprocedure;
  IF v_mode <> 'postgres' THEN
    RAISE EXCEPTION 'GUARD-FAIL (r7) the audit trigger is owned by % — DEFINER only admits the insert while its owner owns the table', v_mode;
  END IF;
  RAISE NOTICE '  ok   (r7) the audit trigger is SECURITY DEFINER, owner postgres, % ', v_got;

  -- ══ (a2) LAST — the policy set equals the spec exactly ══════════════════════════════════════
  -- Runs last on purpose: it catches every policy-shaped plant, so ahead of the behavioural checks
  -- it would mask them. See the ORDER NOTES in the header.
  SELECT string_agg(line, chr(10) ORDER BY line) INTO v_got FROM (
    SELECT tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||
           coalesce(qual,'-')||'|'||coalesce(with_check,'-') AS line
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename IN ('first_read_sessions','first_read_responses','first_read_session_reopens','first_read_session_removals')
  ) t;
  v_want := \$want\$$EXPECT_POLICIES\$want\$;
  IF coalesce(v_got,'') IS DISTINCT FROM v_want THEN
    RAISE EXCEPTION E'GUARD-FAIL (a2) the policy set does not equal the spec.\n--- got ---\n%\n--- want ---\n%', coalesce(v_got,'(none)'), v_want;
  END IF;
  RAISE NOTICE '  ok   (a2) exactly six policies across the four tables, commands, roles and expressions equal the spec — no seventh policy, no anon policy, no member policy on either audit table, no write policy on the removal audit';

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
MD5_AUDIT_AFTER=$(auditdef | md5)
if [ "$MD5_AUDIT_BEFORE" != "$MD5_AUDIT_AFTER" ]; then
  echo "guard: FAIL (z) first_read_sessions_delete_audit was NOT restored by the ROLLBACK ($MD5_AUDIT_BEFORE -> $MD5_AUDIT_AFTER)"
  exit 1
fi
MD5_SHAPE_AFTER=$(tableshape | md5)
if [ "$MD5_SHAPE_BEFORE" != "$MD5_SHAPE_AFTER" ]; then
  echo "guard: FAIL (z) the four tables' RLS flags, policies or grants were NOT restored by the ROLLBACK ($MD5_SHAPE_BEFORE -> $MD5_SHAPE_AFTER)"
  exit 1
fi
echo "  ok   (z) reopen_first_read_session, first_read_sessions_delete_audit and all four tables' RLS, policies and grants are restored md5-identical after the ROLLBACK"

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

# ── (r5/r6/r8) the removal audit THROUGH PostgREST, with real user JWTs ───────────────────────────
# Why HTTP and not the transaction above: request.jwt.claims + SET role reproduces the policy layer
# faithfully, but it does not reproduce PostgREST — the grant layer as the API applies it, the 403 an
# admin actually receives, or the DELETE path a real session removal travels. These three checks are
# the end-to-end ones, so they run over the API as the three real accounts.
#
# The three plants for this section are COMMITTED: a separate connection cannot see an uncommitted
# one. The EXIT trap below restores whatever was planted and verifies the restore md5-identically
# against the baseline taken before the plant, so an interrupted run cannot leave the plant standing.
REST_URL=${REST_URL:-http://127.0.0.1:54321/rest/v1}
AUTH_URL=${AUTH_URL:-http://127.0.0.1:54321/auth/v1}
ANON_KEY_V=${ANON_KEY:-}
if [ -z "$ANON_KEY_V" ]; then
  ANON_KEY_V=$(cd "$(dirname "$0")/../.." && npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
fi
[ -n "$ANON_KEY_V" ] || { echo "guard: FAIL could not resolve ANON_KEY for the (r5/r6/r8) PostgREST checks"; exit 1; }

mint_jwt() {  # $1 email, $2 password → access_token on stdout, empty on failure
  curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
    -H "apikey: $ANON_KEY_V" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})'
}
JWT_ADMIN=$(mint_jwt "$ADMIN_EMAIL" "$ADMIN_PW")
[ -n "$JWT_ADMIN" ] || { echo "guard: FAIL could not mint an admin JWT for $ADMIN_EMAIL (r5/r6/r8)"; exit 1; }
JWT_MEM=$(mint_jwt "$MEM_EMAIL" "$MEM_PW")
[ -n "$JWT_MEM" ] || { echo "guard: FAIL could not mint a member JWT for $MEM_EMAIL (r5/r6/r8)"; exit 1; }
JWT_NA=$(mint_jwt "$NA_EMAIL" "$NA_PW")
[ -n "$JWT_NA" ] || { echo "guard: FAIL could not mint a non-admin JWT for $NA_EMAIL (r5/r6/r8)"; exit 1; }

rest_rows() {  # $1 jwt, $2 query → row count, or "refused:<code>"
  local body code
  body=$(curl -s -m 30 -w $'\n%{http_code}' "$REST_URL/first_read_session_removals?$2" \
           -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $1")
  code=$(printf '%s' "$body" | tail -1)
  if [ "$code" != "200" ]; then printf 'refused:%s' "$code"; return; fi
  printf '%s' "$body" | sed '$d' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write(String(Array.isArray(j)?j.length:-1))}catch(e){process.stdout.write("-1")}})'
}
rest_code() {  # $1 jwt, $2 method, $3 query, $4 body → http status
  curl -s -m 30 -o /dev/null -w '%{http_code}' -X "$2" "$REST_URL/first_read_session_removals?$3" \
    -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $1" -H 'Content-Type: application/json' \
    ${4:+-d "$4"}
}

# The baseline this section must return to, and the committed plant's inverse.
ROWS_BEFORE=$(psqlq "select count(*) from public.first_read_session_removals")
MD5_ROWS_BEFORE=$(psqlq "select coalesce(md5(string_agg(t::text, chr(10) order by t.id)),'(empty)') from public.first_read_session_removals t")
MD5_SHAPE_PRE_HTTP=$(tableshape | md5)
MD5_AUDIT_PRE_HTTP=$(auditdef | md5)
AUDIT_DEF_SAVED=$(auditdef)
HTTP_CLEAN_SESSION=""

restore_http_plant() {
  case "${PLANT:-}" in
    removalsmemberread)  psqlq "drop policy if exists \"plant live removals member read\" on public.first_read_session_removals" >/dev/null;;
    removalsadminupdate) psqlq "drop policy if exists \"plant live removals admin update\" on public.first_read_session_removals" >/dev/null
                         psqlq "revoke update on public.first_read_session_removals from authenticated" >/dev/null;;
    removalsinvokerlive) printf '%s' "$AUDIT_DEF_SAVED" | docker exec -i "$PGC" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 >/dev/null 2>&1;;
  esac
  # The (r8) throwaway rows, removed as postgres — the only writes this guard commits, and they go.
  # ORDER MATTERS, and getting it wrong is silent: deleting the session FIRES THE AUDIT TRIGGER and
  # writes a fresh removal row. So the session goes first and its removal rows second. (Reversed, a
  # planted run that left the session standing came back with 10 rows instead of 9.)
  [ -n "$HTTP_CLEAN_SESSION" ] && psqlq "delete from public.first_read_sessions where id='$HTTP_CLEAN_SESSION'" >/dev/null
  [ -n "$HTTP_CLEAN_SESSION" ] && psqlq "delete from public.first_read_session_removals where session_id='$HTTP_CLEAN_SESSION'" >/dev/null
  psqlq "delete from public.companies where id='$CO'" >/dev/null 2>&1
  psqlq "notify pgrst, 'reload schema'" >/dev/null 2>&1
}
http_restore_report() {
  local sa aa ra ma
  sa=$(tableshape | md5); aa=$(auditdef | md5)
  ra=$(psqlq "select count(*) from public.first_read_session_removals")
  ma=$(psqlq "select coalesce(md5(string_agg(t::text, chr(10) order by t.id)),'(empty)') from public.first_read_session_removals t")
  [ "$sa" = "$MD5_SHAPE_PRE_HTTP" ] || { echo "  RESTORE-FAIL the four tables' shape did not come back ($MD5_SHAPE_PRE_HTTP -> $sa)"; return 1; }
  [ "$aa" = "$MD5_AUDIT_PRE_HTTP" ] || { echo "  RESTORE-FAIL first_read_sessions_delete_audit did not come back ($MD5_AUDIT_PRE_HTTP -> $aa)"; return 1; }
  [ "$ra" = "$ROWS_BEFORE" ] || { echo "  RESTORE-FAIL the removal audit holds $ra rows, started at $ROWS_BEFORE"; return 1; }
  [ "$ma" = "$MD5_ROWS_BEFORE" ] || { echo "  RESTORE-FAIL the removal audit rows changed ($MD5_ROWS_BEFORE -> $ma)"; return 1; }
  echo "  ok   (restore) the committed plant is gone; shape, audit trigger and all $ra rows are md5-identical to before the HTTP section"
  return 0
}
trap 'restore_http_plant' EXIT

# apply the committed plant, if this run carries one
case "${PLANT:-}" in
  removalsmemberread)
    # USING (true), not a company-scoped predicate: the existing removal rows belong to companies the
    # member fixture is not in, so a scoped policy would be behaviourally INERT and (r5) would stay
    # green while the table was in fact open. The plant has to actually admit rows to test the check.
    psqlq "create policy \"plant live removals member read\" on public.first_read_session_removals for select to authenticated using (true)" >/dev/null;;
  removalsadminupdate)
    psqlq "create policy \"plant live removals admin update\" on public.first_read_session_removals for update to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role))" >/dev/null
    psqlq "grant update on public.first_read_session_removals to authenticated" >/dev/null;;
  removalsinvokerlive)
    psqlq "select replace(pg_get_functiondef('public.first_read_sessions_delete_audit()'::regprocedure), 'SECURITY DEFINER', 'SECURITY INVOKER')" \
      | docker exec -i "$PGC" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 >/dev/null;;
esac
psqlq "notify pgrst, 'reload schema'" >/dev/null 2>&1

r_fail=0

# ── (r5) who reads what, over the API ─────────────────────────────────────────────────────────────
n_admin=$(rest_rows "$JWT_ADMIN" "select=id")
n_mem=$(rest_rows "$JWT_MEM" "select=id")
n_na=$(rest_rows "$JWT_NA" "select=id")
if [ "$n_admin" != "$ROWS_BEFORE" ]; then
  echo "  FAIL (r5) the admin read $n_admin over PostgREST, expected all $ROWS_BEFORE rows"; r_fail=1
elif [ "$n_mem" != "0" ] || [ "$n_na" != "0" ]; then
  echo "  FAIL (r5) a non-admin read the removal audit over PostgREST: member=$n_mem non-admin=$n_na, expected 0 and 0"; r_fail=1
else
  echo "  ok   (r5) over PostgREST the admin reads all $n_admin rows; the member reads 0 and the non-admin reads 0"
fi

# ── (r6) the admin cannot write it, over the API ──────────────────────────────────────────────────
ins=$(rest_code "$JWT_ADMIN" POST "" '{"session_id":"66666666-6666-4666-8666-66666666aa01","company_id":"66666666-6666-4666-8666-66666666aa01","status_at_deletion":"open","confirmed_count":0,"corrected_count":0,"rejected_count":0,"reason":"guard r6 probe"}')
upd=$(rest_code "$JWT_ADMIN" PATCH "reason=eq.__guard_r6_nomatch__" '{"reason":"guard r6 tamper"}')
del=$(rest_code "$JWT_ADMIN" DELETE "reason=eq.__guard_r6_nomatch__" "")
# 403 is the refusal we want (42501, permission denied). 2xx means the write verb is reachable.
bad=""
case "$ins" in 4*) ;; *) bad="$bad INSERT=$ins";; esac
case "$upd" in 4*) ;; *) bad="$bad UPDATE=$upd";; esac
case "$del" in 4*) ;; *) bad="$bad DELETE=$del";; esac
if [ -n "$bad" ]; then
  echo "  FAIL (r6) an admin write verb on the removal audit was NOT refused over PostgREST:$bad (want 4xx on all three)"; r_fail=1
else
  echo "  ok   (r6) over PostgREST the admin's INSERT ($ins), UPDATE ($upd) and DELETE ($del) on the removal audit are all refused"
fi

# ── (r8) an admin session delete still lands exactly one removal row ──────────────────────────────
# On the guard's OWN throwaway company and a session created for this check — never CB1, CB2, or a
# real session. Both rows are removed again by the EXIT trap and the count returns to $ROWS_BEFORE.
psqlq "insert into public.companies (id, name, created_by, frozen) values ('$CO','GUARD first-read-rls throwaway (r8)','$ADMIN',false) on conflict (id) do nothing" >/dev/null
R8_SESS=$(psqlq "select gen_random_uuid()")
HTTP_CLEAN_SESSION="$R8_SESS"
psqlq "insert into public.first_read_sessions (id, company_id, status) values ('$R8_SESS','$CO','open')" >/dev/null
r8_code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' -X DELETE \
  "$REST_URL/first_read_sessions?id=eq.$R8_SESS" -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $JWT_ADMIN")
r8_rows=$(psqlq "select count(*) from public.first_read_session_removals where session_id='$R8_SESS'")
r8_sess_left=$(psqlq "select count(*) from public.first_read_sessions where id='$R8_SESS'")
if [ "$r8_rows" != "1" ]; then
  echo "  FAIL (r8) the admin delete (HTTP $r8_code, session rows left $r8_sess_left) landed $r8_rows removal rows, expected exactly 1 — the DEFINER audit trigger is not writing"; r_fail=1
elif [ "$r8_sess_left" != "0" ]; then
  echo "  FAIL (r8) the removal row landed but the session still exists (HTTP $r8_code) — the delete did not take"; r_fail=1
else
  echo "  ok   (r8) an admin DELETE of a throwaway session over PostgREST (HTTP $r8_code) landed exactly one removal row, with no app role holding INSERT"
fi

trap - EXIT
restore_http_plant
http_restore_report || r_fail=1
[ "$r_fail" = 0 ] || { echo "guard: FAIL (r5/r6/r8 PostgREST checks)"; exit 1; }

echo "guard: PASS"
