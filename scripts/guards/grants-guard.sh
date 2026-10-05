#!/usr/bin/env bash
# THE GRANT LAYER on schema public — migration 20260930160000 (rulings F1, F2, 2026-09-30).
#
# WHY THIS GUARD EXISTS. Two of the three holes the census found on 2026-09-30 live in the GRANT layer,
# not the policy layer, so no RLS guard can see them:
#   * TRUNCATE is NOT subject to row level security. Only the grant can stop it, and it fires no row
#     triggers, so a truncated table leaves no audit trace. Every delete-audit trigger in this schema
#     is bypassed by it. REFERENCES and TRIGGER let a caller attach constraints or triggers to a table
#     that is not theirs. All three were held by anon AND authenticated on all 118 public tables.
#   * On the 29 tables that still have RLS off, the grant is the ONLY gate, and anon held everything:
#     an unauthenticated caller with just the publishable key read 40,435 rows across ~21 companies.
#
# Checks (affirmative, PLANT unset):
#   (g1) NO table or view in schema public grants TRUNCATE, REFERENCES or TRIGGER to anon or to
#        authenticated. Catalogue-wide, so a new table that arrives with them is caught.
#   (g2) the DEFAULT privileges for schema public grant none of those three to anon or authenticated,
#        so a table that does not exist yet cannot arrive holding them.
#   (g3) NO public table with RLS OFF grants ANY privilege to anon.
#        THIS CHECK IS MEANT TO FAIL FOR ANY NEW RLS-OFF TABLE. That is the point: a table shipped
#        without RLS is reachable by an anonymous caller unless anon holds nothing on it, and the fleet
#        answer is "anon holds nothing" until that table gets its own RLS brief. If this check goes red
#        on a table you just added, the fix is REVOKE ALL ... FROM anon in that table"s own migration,
#        not an edit here.
#   (g6) every VIEW in schema public has security_invoker = true, resolved from the catalogue, and
#        schema public holds NO materialized view. WHY BOTH: a view created without the flag runs with
#        DEFINER rights as its owner (postgres, which holds bypassrls), so it reads straight past the
#        RLS on its own base tables -- that is V1 (2026-10-05): derived_tensions_structural handed an
#        anonymous caller 11 rows across 3 companies, and relevance_overrides_without_live_pair, being
#        auto-updatable, accepted an anon INSERT against ANY company id. A MATERIALIZED view cannot
#        carry security_invoker at all (it always runs as its owner), so one arriving here needs its
#        own brief rather than a flag; this check goes red on it instead of pretending to cover it.
#        LIKE (g3), THIS IS MEANT TO FAIL FOR ANY NEW VIEW that ships without the flag.
#   (g7) anon holds NO privilege on any view or matview in schema public. The relkind 'v'/'m' mirror
#        of (g3): (g3) filters relkind='r', which is exactly why a view granting SELECT and INSERT to
#        anon passed a green guard on 2026-09-30.
#   (g8) authenticated holds at most SELECT on any view or matview in schema public -- never INSERT,
#        UPDATE or DELETE. A simple single-table view is auto-updatable, so a DML grant on one is a
#        write path into its base table.
#   -- over PostgREST, outside the transaction (the API as callers actually meet it):
#   (g4) with the ANON key and no user token, a GET on each RLS-off table is REFUSED.
#   (g5) with an ADMIN JWT, a GET with count=exact on each RLS-off table returns the TRUE row count.
#        g5 is the counterweight to g4 and g3: it proves this hardening removed anon and nothing else.
#        authenticated deliberately KEEPS SELECT/INSERT/UPDATE/DELETE on these tables until each one
#        gets its own RLS brief (F2), so a change that broke the operator read would show up here.
#   (g9) with the ANON key and no user token, a GET on each public VIEW is REFUSED. The live
#        counterpart to (g6)/(g7): it is the check that reproduces V1 as an anonymous caller actually
#        met it, over the API rather than in the catalogue.
#
# Plants. Every check has one, and each plant must make its OWN check red.
#   PLANT=trunctoanon     GRANT TRUNCATE on one public table TO anon            => (g1) red
#   PLANT=defaulttrunc    ALTER DEFAULT PRIVILEGES FOR ROLE postgres ... GRANT
#                         TRUNCATE ON TABLES TO anon -- i.e. the holder that DOES
#                         govern every table this repo creates                   => (g2) red
#   PLANT=anonselect      GRANT SELECT on claim_removals TO anon                => (g3) red
#   -- COMMITTED plants, for the PostgREST checks. A separate connection cannot see an uncommitted
#      one, so these are applied for real and undone by the EXIT trap, which then re-verifies the whole
#      grant table against an md5 taken before the plant.
#   PLANT=anonselectlive  GRANT SELECT on one RLS-off table TO anon, committed   => (g4) red
#   PLANT=authnoselect    REVOKE SELECT on one RLS-off table FROM authenticated  => (g5) red
#   PLANT=viewdefiner     ALTER VIEW ... RESET (security_invoker) on one view    => (g6) red
#   PLANT=anonviewselect  GRANT SELECT on one public view TO anon                => (g7) red
#   PLANT=authviewwrite   GRANT INSERT on one public view TO authenticated       => (g8) red
#   PLANT=anonviewlive    GRANT SELECT on one public view TO anon, committed     => (g9) red
#
# g1, g2, g3, g6, g7 and g8 run inside ONE ROLLED-BACK transaction, so their plants are undone by
# the ROLLBACK. The EXIT/restore report also re-verifies the view reloptions, so the (g6) plant cannot
# outlive the run unnoticed.
# ZERO rows are read or written in any table under test: every check reads catalogues only, and the
# PostgREST checks issue GET and HEAD.
#
# Run:  set -a; source backups/fr-login.env; source backups/fr-nonadmin.env; source backups/fr-member.env; set +a
#       bash scripts/guards/grants-guard.sh
#       PLANT=trunctoanon bash scripts/guards/grants-guard.sh
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
REST_URL=${REST_URL:-http://127.0.0.1:54321/rest/v1}
AUTH_URL=${AUTH_URL:-http://127.0.0.1:54321/auth/v1}

# fr-login is what (g5) needs; the other two files are required so this guard fails loudly in the same
# environment the rest of the suite runs in, rather than passing in a half-sourced shell.
ADMIN_EMAIL=${FR_LOGIN_EMAIL:-}
[ -n "$ADMIN_EMAIL" ] || { echo "guard: FAIL FR_LOGIN_EMAIL not set (source backups/fr-login.env)"; exit 1; }
ADMIN_PW=${FR_LOGIN_PASSWORD:-}
[ -n "$ADMIN_PW" ] || { echo "guard: FAIL FR_LOGIN_PASSWORD not set (source backups/fr-login.env)"; exit 1; }
[ -n "${NONADMIN_ID:-}" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
[ -n "${MEMBER_ID:-}" ]   || { echo "guard: FAIL MEMBER_ID not set (source backups/fr-member.env)"; exit 1; }

psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1" </dev/null; }

# The whole grant table for schema public, and the default ACLs. The EXIT trap compares against these.
granttable() { psqlq "select table_name||'|'||grantee||'|'||privilege_type from information_schema.role_table_grants where table_schema='public' order by table_name, grantee, privilege_type"; }
defaclrows() { psqlq "select pg_get_userbyid(d.defaclrole)||'|'||d.defaclobjtype::text||'|'||coalesce(d.defaclacl::text,'-') from pg_default_acl d join pg_namespace n on n.oid=d.defaclnamespace where n.nspname='public' order by 1"; }
# The view reloptions, so the (g6) plant -- which touches reloptions, not grants -- is also proved undone.
viewopts() { psqlq "select c.relname||'|'||coalesce(array_to_string(c.reloptions,','),'-') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by 1"; }

MD5_GRANTS_BEFORE=$(granttable | md5)
MD5_DEFACL_BEFORE=$(defaclrows | md5)
MD5_VIEWOPTS_BEFORE=$(viewopts | md5)

# One RLS-off table, resolved from the catalogue rather than hardcoded, for the single-table plants.
ONE_RLSOFF=$(psqlq "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1 limit 1")
[ -n "$ONE_RLSOFF" ] || { echo "guard: FAIL could not resolve an RLS-off table for the plants"; exit 1; }
# A table that is NOT one of the RLS-off set, for the (g1) plant, so (g1) cannot be confused with (g3).
ONE_RLSON=$(psqlq "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity order by 1 limit 1")
[ -n "$ONE_RLSON" ] || { echo "guard: FAIL could not resolve an RLS-on table for the (g1) plant"; exit 1; }
# One public VIEW, resolved from the catalogue rather than hardcoded, for the (g6)-(g9) plants.
ONE_VIEW=$(psqlq "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' order by 1 limit 1")
[ -n "$ONE_VIEW" ] || { echo "guard: FAIL could not resolve a public view for the (g6)-(g9) plants"; exit 1; }

P=""
case "${PLANT:-}" in
  trunctoanon)  P="grant truncate on public.$ONE_RLSON to anon;";;
  defaulttrunc) P="alter default privileges for role postgres in schema public grant truncate on tables to anon;";;
  anonselect)   P="grant select on public.claim_removals to anon;";;
  viewdefiner)    P="alter view public.$ONE_VIEW reset (security_invoker);";;
  anonviewselect) P="grant select on public.$ONE_VIEW to anon;";;
  authviewwrite)  P="grant insert on public.$ONE_VIEW to authenticated;";;
  anonselectlive|authnoselect|anonviewlive) P="";;
  "")           P="";;
  *)            echo "guard: FAIL unknown PLANT ${PLANT:-}"; exit 1;;
esac

OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
DO \$guard\$
DECLARE
  v_n int; v_got text; v_list text;
BEGIN
  -- == (g1) the three privileges are gone, everywhere in schema public =========================
  SELECT count(*), coalesce(string_agg(DISTINCT table_name||':'||grantee||':'||privilege_type, ', '),'-')
    INTO v_n, v_list
    FROM information_schema.role_table_grants
   WHERE table_schema='public'
     AND grantee IN ('anon','authenticated')
     AND privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g1) % grant(s) of TRUNCATE/REFERENCES/TRIGGER to anon or authenticated remain: %', v_n, left(v_list, 300);
  END IF;
  RAISE NOTICE '  ok   (g1) no table or view in schema public grants TRUNCATE, REFERENCES or TRIGGER to anon or authenticated';

  -- == (g2) and a table that does not exist yet cannot arrive holding them ======================
  -- The ACL letters: D=TRUNCATE, x=REFERENCES, t=TRIGGER. Checked per holder role, because more than
  -- one role can hold default privileges for the same schema.
  -- KNOWN, PINNED EXCEPTION: supabase_admin also holds default privileges here and still grants the
  -- three. ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin is refused to postgres (not a superuser,
  -- not a member of that role), and its password is not held in this repo, so 20260930160000 could not
  -- close it. Our migrations create tables AS postgres, so the postgres default is the one that governs
  -- anything this repo ships. The exception is pinned to exactly that role: if a SECOND holder ever
  -- grants the three, or supabase_admin stops being the only one, this check goes red.
  SELECT count(*), coalesce(string_agg(DISTINCT pg_get_userbyid(d.defaclrole)||':'||pg_get_userbyid(a.grantee)||':'||a.privilege_type, ', '),'-')
    INTO v_n, v_list
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE n.nspname='public' AND d.defaclobjtype='r'
     AND pg_get_userbyid(a.grantee) IN ('anon','authenticated')
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
     AND pg_get_userbyid(d.defaclrole) <> 'supabase_admin';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g2) default privileges in schema public still grant TRUNCATE/REFERENCES/TRIGGER outside the pinned supabase_admin exception (% entr(y/ies)): %', v_n, left(v_list, 300);
  END IF;
  -- and the pinned exception must still be exactly one holder, no more
  SELECT count(DISTINCT pg_get_userbyid(d.defaclrole)) INTO v_n
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid=d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
   WHERE n.nspname='public' AND d.defaclobjtype='r'
     AND pg_get_userbyid(a.grantee) IN ('anon','authenticated')
     AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g2) % role(s) hold default privileges granting TRUNCATE/REFERENCES/TRIGGER, expected at most the single pinned supabase_admin exception', v_n;
  END IF;
  RAISE NOTICE '  ok   (g2) no role except the pinned supabase_admin exception grants TRUNCATE, REFERENCES or TRIGGER by default; the postgres default (which governs every table this repo creates) grants none of the three';

  -- == (g3) on every RLS-off table, anon holds NOTHING =========================================
  -- Red for any newly added RLS-off table, on purpose. See the header.
  SELECT count(*), coalesce(string_agg(DISTINCT g.table_name||':'||g.privilege_type, ', '),'-')
    INTO v_n, v_list
    FROM information_schema.role_table_grants g
    JOIN pg_class c ON c.relname=g.table_name
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
   WHERE g.table_schema='public' AND g.grantee='anon'
     AND c.relkind='r' AND NOT c.relrowsecurity;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g3) anon holds % privilege(s) on RLS-off table(s): % -- a table with RLS off is reachable anonymously unless anon holds nothing; REVOKE ALL ... FROM anon in that table own migration', v_n, left(v_list, 300);
  END IF;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  RAISE NOTICE '  ok   (g3) anon holds no privilege on any of the % RLS-off tables in schema public', v_n;

  -- == (g6) every public VIEW runs with INVOKER rights, and there is no matview ================
  -- Red for any newly added view that ships without the flag, on purpose. See the header.
  SELECT count(*), coalesce(string_agg(c.relname, ', ' ORDER BY c.relname),'-')
    INTO v_n, v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='v'
     AND coalesce((SELECT option_value FROM pg_options_to_table(c.reloptions)
                    WHERE option_name='security_invoker'), 'false') <> 'true';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g6) % public view(s) run with DEFINER rights (security_invoker not true): % -- a definer view reads past the RLS on its own base tables as its owner; ALTER VIEW ... SET (security_invoker = true) in that view own migration', v_n, left(v_list, 300);
  END IF;
  SELECT count(*), coalesce(string_agg(c.relname, ', ' ORDER BY c.relname),'-')
    INTO v_n, v_list
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='m';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g6) % materialized view(s) in schema public: % -- a matview cannot carry security_invoker (it always runs as its owner), so it needs its own RLS brief; this check will not pretend to cover it', v_n, left(v_list, 300);
  END IF;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='v';
  RAISE NOTICE '  ok   (g6) all % view(s) in schema public run with invoker rights, and schema public holds no materialized view', v_n;

  -- == (g7) on every public view, anon holds NOTHING ===========================================
  SELECT count(*), coalesce(string_agg(DISTINCT g.table_name||':'||g.privilege_type, ', '),'-')
    INTO v_n, v_list
    FROM information_schema.role_table_grants g
    JOIN pg_class c ON c.relname=g.table_name
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
   WHERE g.table_schema='public' AND g.grantee='anon' AND c.relkind IN ('v','m');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g7) anon holds % privilege(s) on public view(s): % -- REVOKE ALL ... FROM anon in that view own migration', v_n, left(v_list, 300);
  END IF;
  SELECT count(*) INTO v_n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('v','m');
  RAISE NOTICE '  ok   (g7) anon holds no privilege on any of the % view(s) in schema public', v_n;

  -- == (g8) on every public view, authenticated holds at most SELECT ============================
  SELECT count(*), coalesce(string_agg(DISTINCT g.table_name||':'||g.privilege_type, ', '),'-')
    INTO v_n, v_list
    FROM information_schema.role_table_grants g
    JOIN pg_class c ON c.relname=g.table_name
    JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
   WHERE g.table_schema='public' AND g.grantee='authenticated' AND c.relkind IN ('v','m')
     AND g.privilege_type <> 'SELECT';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (g8) authenticated holds % non-SELECT privilege(s) on public view(s): % -- a single-table view is auto-updatable, so a DML grant on one is a write path into its base table', v_n, left(v_list, 300);
  END IF;
  RAISE NOTICE '  ok   (g8) authenticated holds at most SELECT on every view in schema public -- no INSERT, UPDATE or DELETE';

  RAISE NOTICE 'GUARD DB GREEN';
END
\$guard\$;
ROLLBACK;
SQL
)

echo "$OUT" | sed -n 's/^NOTICE:  //p'

MD5_GRANTS_MID=$(granttable | md5)
MD5_DEFACL_MID=$(defaclrows | md5)
if [ "$MD5_GRANTS_BEFORE" != "$MD5_GRANTS_MID" ]; then
  echo "guard: FAIL (z) the grant table was NOT restored by the ROLLBACK ($MD5_GRANTS_BEFORE -> $MD5_GRANTS_MID)"; exit 1
fi
if [ "$MD5_DEFACL_BEFORE" != "$MD5_DEFACL_MID" ]; then
  echo "guard: FAIL (z) the default ACLs were NOT restored by the ROLLBACK ($MD5_DEFACL_BEFORE -> $MD5_DEFACL_MID)"; exit 1
fi
MD5_VIEWOPTS_MID=$(viewopts | md5)
if [ "$MD5_VIEWOPTS_BEFORE" != "$MD5_VIEWOPTS_MID" ]; then
  echo "guard: FAIL (z) the view reloptions were NOT restored by the ROLLBACK ($MD5_VIEWOPTS_BEFORE -> $MD5_VIEWOPTS_MID)"; exit 1
fi
echo "  ok   (z) the grant table, the default ACLs and the view reloptions are md5-identical after the ROLLBACK"

if ! echo "$OUT" | grep -q 'GUARD DB GREEN'; then
  echo "$OUT" | grep -E 'GUARD-FAIL|ERROR|FATAL' | head -10
  echo "guard: FAIL (db checks)"
  exit 1
fi

# -- (g4/g5) the API as callers actually meet it --------------------------------------------------
ANON_KEY_V=${ANON_KEY:-}
if [ -z "$ANON_KEY_V" ]; then
  ANON_KEY_V=$(cd "$(dirname "$0")/../.." && npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
fi
[ -n "$ANON_KEY_V" ] || { echo "guard: FAIL could not resolve ANON_KEY for the (g4/g5) PostgREST checks"; exit 1; }

JWT_ADMIN=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
  -H "apikey: $ANON_KEY_V" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PW\"}" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
[ -n "$JWT_ADMIN" ] || { echo "guard: FAIL could not mint an admin JWT for $ADMIN_EMAIL (g5)"; exit 1; }

restore_live_plant() {
  case "${PLANT:-}" in
    anonselectlive) psqlq "revoke all on table public.$ONE_RLSOFF from anon" >/dev/null;;
    authnoselect)   psqlq "grant select on table public.$ONE_RLSOFF to authenticated" >/dev/null;;
    anonviewlive)   psqlq "revoke all on table public.$ONE_VIEW from anon" >/dev/null;;
  esac
  psqlq "notify pgrst, 'reload schema'" >/dev/null 2>&1
}
live_restore_report() {
  local ga da
  ga=$(granttable | md5); da=$(defaclrows | md5); local vo; vo=$(viewopts | md5)
  [ "$ga" = "$MD5_GRANTS_BEFORE" ] || { echo "  RESTORE-FAIL the grant table did not come back ($MD5_GRANTS_BEFORE -> $ga)"; return 1; }
  [ "$da" = "$MD5_DEFACL_BEFORE" ] || { echo "  RESTORE-FAIL the default ACLs did not come back ($MD5_DEFACL_BEFORE -> $da)"; return 1; }
  [ "$vo" = "$MD5_VIEWOPTS_BEFORE" ] || { echo "  RESTORE-FAIL the view reloptions did not come back ($MD5_VIEWOPTS_BEFORE -> $vo)"; return 1; }
  echo "  ok   (restore) the committed plant is gone; the grant table, the default ACLs and the view reloptions are md5-identical to before the HTTP section"
  return 0
}
trap 'restore_live_plant' EXIT

case "${PLANT:-}" in
  anonselectlive) psqlq "grant select on table public.$ONE_RLSOFF to anon" >/dev/null;;
  authnoselect)   psqlq "revoke select on table public.$ONE_RLSOFF from authenticated" >/dev/null;;
  anonviewlive)   psqlq "grant select on table public.$ONE_VIEW to anon" >/dev/null;;
esac
psqlq "notify pgrst, 'reload schema'" >/dev/null 2>&1

TABLES=$(psqlq "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity order by 1")
N_TABLES=$(printf '%s\n' "$TABLES" | grep -c .)
g_fail=0

# (g4) anon key, no user token. A refusal is 401 or 403; a 2xx means the table is anonymously readable.
g4_bad=""; g4_ok=0
while IFS= read -r t; do
  [ -z "$t" ] && continue
  code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$REST_URL/$t?select=*&limit=1" \
          -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $ANON_KEY_V")
  case "$code" in 401|403) g4_ok=$((g4_ok+1));; *) g4_bad="$g4_bad $t($code)";; esac
done <<< "$TABLES"
if [ -n "$g4_bad" ]; then
  echo "  FAIL (g4) the anon key still reads RLS-off table(s) over PostgREST:$g4_bad (want 401/403 on all $N_TABLES)"; g_fail=1
else
  echo "  ok   (g4) with the anon key and no user token, a GET is refused on all $g4_ok RLS-off tables"
fi

# (g5) admin JWT. The count header must equal the true count, table by table.
g5_bad=""; g5_ok=0; g5_rows=0
while IFS= read -r t; do
  [ -z "$t" ] && continue
  truth=$(psqlq "select count(*) from public.$t")
  hdr=$(curl -s -m 30 -I "$REST_URL/$t?select=*&limit=1" \
        -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $JWT_ADMIN" -H 'Prefer: count=exact' 2>/dev/null)
  code=$(printf '%s' "$hdr" | head -1 | awk '{print $2}')
  seen=$(printf '%s' "$hdr" | grep -i '^content-range:' | tr -d '\r' | awk '{print $2}' | sed 's#.*/##')
  if [ "$seen" = "$truth" ]; then g5_ok=$((g5_ok+1)); g5_rows=$((g5_rows+truth));
  else g5_bad="$g5_bad $t(http=$code saw=${seen:-none} truth=$truth)"; fi
done <<< "$TABLES"
if [ -n "$g5_bad" ]; then
  echo "  FAIL (g5) the admin JWT did not read the true row count on:$g5_bad"; g_fail=1
else
  echo "  ok   (g5) with an admin JWT, count=exact equals the true row count on all $g5_ok RLS-off tables ($g5_rows rows total)"
fi

# (g9) anon key, no user token, on every public VIEW. A refusal is 401 or 403; a 2xx means the view
# is anonymously readable -- which is V1 exactly as an anonymous caller met it.
VIEWS=$(psqlq "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by 1")
N_VIEWS=$(printf '%s\n' "$VIEWS" | grep -c .)
g9_bad=""; g9_ok=0
while IFS= read -r v; do
  [ -z "$v" ] && continue
  code=$(curl -s -m 30 -o /dev/null -w '%{http_code}' "$REST_URL/$v?select=*&limit=1" \
          -H "apikey: $ANON_KEY_V" -H "Authorization: Bearer $ANON_KEY_V")
  case "$code" in 401|403) g9_ok=$((g9_ok+1));; *) g9_bad="$g9_bad $v($code)";; esac
done <<< "$VIEWS"
if [ -n "$g9_bad" ]; then
  echo "  FAIL (g9) the anon key still reads public view(s) over PostgREST:$g9_bad (want 401/403 on all $N_VIEWS)"; g_fail=1
else
  echo "  ok   (g9) with the anon key and no user token, a GET is refused on all $g9_ok public view(s)"
fi

trap - EXIT
restore_live_plant
live_restore_report || g_fail=1
[ "$g_fail" = 0 ] || { echo "guard: FAIL (g4/g5/g9 PostgREST checks)"; exit 1; }

echo "guard: PASS"
