#!/usr/bin/env bash
# FOCUS MARKETS (F-1, 2026-11-17; Proposal A, decisions 1/3/6) — a company's focus markets are an ORDERED
# SET of its own live markets, signed by an admin through ONE write path, and nothing else writes them.
#
#   (f1) the domain CHECK admits focus_market_NN (two digits) and refuses any other spelling; a focus row
#        must carry both the market id and its journey key
#   (f2) an admin signs TWO markets in order → two rows, ranks 01/02, one 'set' audit row each
#   (f3) re-signing a different order rewrites the set and audits every rank that changed or fell away
#   (f4) refused: a market of another company, a retracted market, a repeat, a non-admin, no session
#   (f5) focus_market_options offers EVERY live market of the company (decision 3) — zero-evidence ones
#        included, retracted ones not — with the signed rank on the signed ones
#   (f6) unsigning (an empty list) leaves no focus row
#   (f7) FLEET: every focus_market row on any company has a 'set' audit row naming its domain and key —
#        nothing writes these rows except the signing function
#   (f8) STATIC: no source file outside the migration and src/lib/focusMarkets.ts writes a focus domain
#
# D4: no writer of the product is invoked and no model is called. Every write is on a HELD throwaway
# company (born held in the creating statement, never deleted), inside a transaction that ROLLS BACK.
# Needs FR_LOGIN_EMAIL (an admin) and NONADMIN_ID (backups/fr-login.env, backups/fr-nonadmin.env).
# Read the printed verdict, not only the exit code (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."
DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
fails=0; oks=0
ok()  { echo "  ok   $*"; oks=$((oks+1)); }
bad() { echo "  FAIL $*"; fails=$((fails+1)); }

FIX_CO="0c900000-0000-4000-8000-00000000f0c1"
OTHER_CO="0c900000-0000-4000-8000-00000000f0c2"
ADMIN=""; [ -n "${FR_LOGIN_EMAIL:-}" ] && ADMIN=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
[ -n "$ADMIN" ] || { echo "guard: FAIL FR_LOGIN_EMAIL not set (or no such user) — source backups/fr-login.env"; exit 1; }
[ -n "${NONADMIN_ID:-}" ] || { echo "guard: FAIL NONADMIN_ID not set — source backups/fr-nonadmin.env"; exit 1; }

# The two throwaways exist outside the rolled-back block so the hold is permanent (E2).
for pair in "$FIX_CO:fmg-throwaway-focus" "$OTHER_CO:fmg-throwaway-focus-other"; do
  id=${pair%%:*}; nm=${pair#*:}
  docker exec -i "$DB" psql -U postgres -q -v ON_ERROR_STOP=1 -c "insert into public.companies (id, name, created_by, fixture_hold)
    values ('$id','$nm','$ADMIN','FMG:test_fixture')
    on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'FMG:test_fixture');" >/dev/null 2>&1
done
for id in "$FIX_CO" "$OTHER_CO"; do
  [ -n "$(psqlq "select nullif(trim(fixture_hold),'') from companies where id='$id'")" ] || { echo "guard: FAIL fixture $id is not held — refusing to write"; exit 1; }
done

OUT=$(docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1 2>&1 <<SQL
begin;
do \$\$
declare
  co uuid := '$FIX_CO'; other uuid := '$OTHER_CO'; adm uuid := '$ADMIN'; non uuid := '${NONADMIN_ID}';
  m_a uuid := gen_random_uuid(); m_b uuid := gen_random_uuid(); m_c uuid := gen_random_uuid();
  m_ret uuid := gen_random_uuid(); m_oth uuid := gen_random_uuid();
  r jsonb; n int; fired boolean; msg text;
begin
  insert into public.odi_market_definitions (id, company_id, user_id, job_executor, journey_key, market_register) values
    (m_a, co, adm, 'fmg donors', 'fmg-donors', 'public_inferred'),
    (m_b, co, adm, 'fmg families', 'fmg-families', 'internal_inferred'),
    (m_c, co, adm, 'fmg schools (no evidence)', 'fmg-schools', 'internal_inferred'),
    (m_ret, co, adm, 'fmg retracted', 'fmg-retracted', 'internal_inferred'),
    (m_oth, other, adm, 'fmg other company', 'fmg-other', 'internal_inferred');
  update public.odi_market_definitions set retracted_at = now() where id = m_ret;

  -- (f1)
  begin insert into public.operator_primary_selection (company_id, domain, item_id, item_key) values (co, 'focus_market_1', m_a, 'fmg-donors');
        raise notice 'FAIL (f1) a one-digit focus domain was accepted';
  exception when check_violation then raise notice 'ok (f1) a one-digit focus domain is refused'; end;
  begin insert into public.operator_primary_selection (company_id, domain, item_id, item_key) values (co, 'focus_market_09', null, 'fmg-donors');
        raise notice 'FAIL (f1) a focus row without its market id was accepted';
  exception when check_violation then raise notice 'ok (f1) a focus row without its market id is refused'; end;

  -- act as the admin
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'email', 'fmg-guard@local')::text, true);
  perform set_config('role', 'authenticated', true);

  -- (f2)
  r := public.sign_focus_markets(co, array[m_a, m_b]);
  if jsonb_array_length(r) = 2 and r->0->>'market_definition_id' = m_a::text and (r->0->>'rank')::int = 1 and r->1->>'market_definition_id' = m_b::text
    then raise notice 'ok (f2) two markets signed in order: rank 1 = donors, rank 2 = families';
    else raise notice 'FAIL (f2) the signed set read back as %', r; end if;
  select count(*) into n from public.operator_primary_selection_audit where company_id = co and action = 'set';
  if n = 2 then raise notice 'ok (f2) one set audit row per signed rank'; else raise notice 'FAIL (f2) % set audit rows, expected 2', n; end if;

  -- (f3)
  r := public.sign_focus_markets(co, array[m_b]);
  select count(*) into n from public.operator_primary_selection_audit where company_id = co and action = 'cleared_operator';
  if jsonb_array_length(r) = 1 and r->0->>'market_definition_id' = m_b::text and n = 2
    then raise notice 'ok (f3) re-signing rewrote the set (families at rank 1) and audited both ranks that changed';
    else raise notice 'FAIL (f3) set % with % cleared audit rows', r, n; end if;

  -- (f4)
  fired := false; begin perform public.sign_focus_markets(co, array[m_oth]); exception when others then fired := true; msg := sqlerrm; end;
  if fired and msg like '%live market of this company%' then raise notice 'ok (f4) a market of another company is refused'; else raise notice 'FAIL (f4) another company''s market: fired=% %', fired, msg; end if;
  fired := false; begin perform public.sign_focus_markets(co, array[m_ret]); exception when others then fired := true; msg := sqlerrm; end;
  if fired then raise notice 'ok (f4) a retracted market is refused'; else raise notice 'FAIL (f4) a retracted market was signed'; end if;
  fired := false; begin perform public.sign_focus_markets(co, array[m_a, m_a]); exception when others then fired := true; msg := sqlerrm; end;
  if fired and msg like '%more than once%' then raise notice 'ok (f4) a repeated market is refused'; else raise notice 'FAIL (f4) repeat: fired=% %', fired, msg; end if;

  -- (f5) as the admin
  select count(*) into n from public.focus_market_options(co);
  if n = 3 then raise notice 'ok (f5) every live market is offered (3 of 3, the no-evidence one included; the retracted one is not)'; else raise notice 'FAIL (f5) % markets offered, expected 3', n; end if;
  select count(*) into n from public.focus_market_options(co) where signed_rank = 1 and market_definition_id = m_b;
  if n = 1 then raise notice 'ok (f5) the signed market carries its rank'; else raise notice 'FAIL (f5) signed rank not shown'; end if;

  -- (f6)
  r := public.sign_focus_markets(co, '{}'::uuid[]);
  select count(*) into n from public.operator_primary_selection where company_id = co and domain ~ '^focus_market_';
  if n = 0 and jsonb_array_length(r) = 0 then raise notice 'ok (f6) an empty list unsigns every focus market'; else raise notice 'FAIL (f6) % focus rows remain', n; end if;

  -- (f4) non-admin and no session
  perform set_config('request.jwt.claims', json_build_object('sub', non, 'role', 'authenticated')::text, true);
  fired := false; begin perform public.sign_focus_markets(co, array[m_a]); exception when insufficient_privilege then fired := true; end;
  if fired then raise notice 'ok (f4) a non-admin is refused (42501)'; else raise notice 'FAIL (f4) a non-admin signed'; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  fired := false; begin perform public.sign_focus_markets(co, array[m_a]); exception when insufficient_privilege then fired := true; end;
  if fired then raise notice 'ok (f4) no session is refused'; else raise notice 'FAIL (f4) a call with no user signed'; end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end \$\$;
rollback;
SQL
)
echo "── (f1)–(f6) on the held throwaway, rolled back ──"
while IFS= read -r line; do
  case "$line" in
    *"NOTICE:  ok "*) ok "${line#*NOTICE:  ok }";;
    *"NOTICE:  FAIL "*) bad "${line#*NOTICE:  FAIL }";;
    *ERROR*) bad "the block raised: $line";;
  esac
done <<<"$OUT"

echo "── (f7) fleet: every focus row was written by the signing function ──"
ORPHANS=$(psqlq "select count(*) from public.operator_primary_selection s where s.domain ~ '^focus_market_'
  and not exists (select 1 from public.operator_primary_selection_audit a where a.company_id = s.company_id and a.domain = s.domain
                   and a.item_key = s.item_key and a.action = 'set' and a.reason = 'market:' || s.item_id)")
FOCUSED=$(psqlq "select count(distinct company_id) from public.operator_primary_selection where domain ~ '^focus_market_'")
if [ "$ORPHANS" = "0" ]; then ok "(f7) 0 focus rows without their signing audit row (companies with a focus: $FOCUSED)"; else bad "(f7) $ORPHANS focus row(s) carry no signing audit row — something other than sign_focus_markets wrote them"; fi

echo "── (f8) static: one write path ──"
HITS=$(grep -rlE "focus_market_[0-9]|focus_market_\\$|'focus_market_'|\"focus_market_\"" src supabase/functions scripts --include='*.ts' --include='*.tsx' --include='*.mjs' 2>/dev/null \
  | grep -vE '\.test\.|src/lib/focusMarkets\.ts$|scripts/guards/' || true)
WRITES=""
for f in $HITS; do grep -qE "\.(insert|upsert|update)\(" "$f" && grep -qE "operator_primary_selection" "$f" && WRITES="$WRITES $f"; done
if [ -z "$WRITES" ]; then ok "(f8) no source file outside the migration and focusMarkets.ts writes a focus domain"; else bad "(f8) focus domains written outside the one path:$WRITES"; fi

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" -eq 0 ]; then echo "guard: PASS"; exit 0; else echo "guard: RED ($fails check(s)) — see above"; exit 1; fi
