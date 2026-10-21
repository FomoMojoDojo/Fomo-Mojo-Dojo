#!/usr/bin/env bash
# ── RELATED-ENTITY GUARD — E1, E2, E4, E5 (operator rulings 2026-10-21): the precision layer ───────────────────────────
#
# probe: scripts/guards/related-entity-probe.ts — every database step inside ONE rolled-back transaction (a throwaway
# company seeded in it), read-only otherwise; no network, no model. The guard ends by proving the related-entity tables
# and the signals count are what they were.
#
#   e1  the table refuses a row with no host, no source_url, an empty source_quote, and a second confirmed row for one
#       company + host (NOT NULL / CHECK / the partial unique index)
#   e2  a PROPOSED entity changes nothing: rejected / retired / proposed rows never load; a URL on a proposed host is
#       decided exactly as with no entity; a confirmed one is own_domain_related
#   e3  the effective-date rule: merged_into 2026-08-20 → own_domain_related at 2026-09-01, extractor_label (stamped
#       before_effective) at 2026-08-01; an undated provisional row → own_domain_related, basis crawl_date_provisional
#   e4  the regen mint stamps raw_payload.entity {id, name, host, relation, basis} on the row the rule decided
#   e5  the signed refusals, on the SEEDED throwaway company (a guard seeds its own subject; no live company's rows are
#       read): iaqm.co.uk on the subject's exclude list (company_excluded_host); Cox Enterprises, Cox Automotive
#       (entity_excluded_host — Cox Communications' exclude list); bare "Cox", "Charter" (bare_short_name); a quote that
#       is a seeded model-written row (model_written_source); Cox Communications itself passes. E1a + the name rule
#       (2026-10-21): a press host, EDGAR under a non-matching CIK, EDGAR under Charter's CIK before Charter is confirmed
#       (source_off_entity); a quote without the entity name (name_not_in_quote); with Charter confirmed as parent, EDGAR
#       CIK 1091667 and corporate.charter.com pass, a press host still refuses
#   e6  only confirmed rows reach the own-host set; competitor discovery refuses a confirmed related host (source)
#   e7  the signed venue strings (probe) and their render after "On your site" (vitest relatedVenue.test.tsx)
#   e8  parity (E5): for every company with no confirmed entity, every live signal URL is own-domain under the set
#       exactly when it is under the single host (disagree 0)
#   e9  the source invariant, fleet-wide: every confirmed related entity has a stored source snapshot with its quote
#       byte-present and a confirm audit row (a seeded confirmed row is inside the set it covers)
#
# Plants (each injected live, the guard RED with the measured value moved, restored md5-identical, GREEN):
#   P3  relatedInEffect ignores the date (always true)            => e3 prior.authority extractor_label → own_domain_related
#   P4  the regen mint drops raw_payload.entity                   => e4 stamped 1 → 0
#   P5a validateSpecs' company exclude-list check removed         => e5 iaqm_co_uk [company_excluded_host] → []
#   P5b validateSpecs' per-entity exclude-list check removed      => e5 cox_enterprises [entity_excluded_host] → []
#   P8  seedHostOf keeps a leading www.                           => e8 disagree 0 → >0
#   P5c E1a back to a warning (source_off_entity not refused)     => e5 press_host [source_off_entity] → []
#   P5d the name-in-quote check removed                           => e5 name_not_in_quote [name_not_in_quote] → []
#   P5e the EDGAR CIK compare ignored (any EDGAR filer accepted)  => e5 edgar_wrong_cik [source_off_entity] → []
#   P9  the seeded snapshot stored without its quote              => e9 violations 0 → 1
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
counts() { psql "select (select count(*) from company_related_entities)||'|'||(select count(*) from company_related_entity_sources)||'|'||(select count(*) from company_related_entity_audit)||'|'||(select count(*) from signals)"; }
C0=$(counts)
J=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/related-entity-probe.ts 2>/dev/null | tail -1)
q() { echo "$J" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
[ -n "$J" ] || fail probe "no output"

[ "$(q "all(v and v.startswith('psql: ERROR') for v in d['e1'].values())")" = True ] || fail e1 "the table accepted an invalid row: $(q "d['e1']")"
echo "e1. refused: no host, no source_url, empty source_quote, a second confirmed row for one company + host"
[ "$(q "d['e2']['loaded_hosts']==['confirmed.test'] and d['e2']['proposed_same_as_none'] and d['e2']['proposed_authority']=='extractor_label' and d['e2']['confirmed_authority']=='own_domain_related'")" = True ] || fail e2 "an unconfirmed entity changed something: $(q "d['e2']")"
echo "e2. proposed / rejected / retired rows never load; a proposed host decides exactly as no entity ($(q "d['e2']['proposed_authority']")); confirmed → $(q "d['e2']['confirmed_authority']")"
[ "$(q "d['e3']['after']['authority']=='own_domain_related' and d['e3']['after']['class']=='client_voice' and d['e3']['after']['basis']=='cited' and d['e3']['prior']['authority']=='extractor_label' and d['e3']['prior']['class']=='outside_voice_about_client' and d['e3']['prior']['basis']=='before_effective' and d['e3']['provisional']['authority']=='own_domain_related' and d['e3']['provisional']['basis']=='crawl_date_provisional'")" = True ] || fail e3 "effective-date rule: $(q "d['e3']")"
echo "e3. merged_into 2026-08-20: 2026-09-01 → own_domain_related (cited); 2026-08-01 → $(q "d['e3']['prior']['authority']") ($(q "d['e3']['prior']['basis']")); undated provisional → own_domain_related (crawl_date_provisional)"
[ "$(q "d['e4']['stamp_ok'] and d['e4']['stamped']==d['e4']['minted']>=1")" = True ] || fail e4 "entity stamp: $(q "d['e4']")"
echo "e4. regen mint: $(q "d['e4']['stamped']")/$(q "d['e4']['minted']") minted rows carry raw_payload.entity $(q "' / '.join(str(d['e4']['entity'][k]) for k in ['name','host','relation','basis'])")"
[ "$(q "d['e5']['iaqm_co_uk']==['company_excluded_host'] and d['e5']['cox_enterprises']==['entity_excluded_host'] and d['e5']['cox_automotive']==['entity_excluded_host'] and d['e5']['bare_cox']==['bare_short_name'] and d['e5']['bare_charter']==['bare_short_name'] and d['e5']['model_written']==['model_written_source'] and d['e5']['cox_communications']==[] and d['e5']['press_host']==['source_off_entity'] and d['e5']['name_not_in_quote']==['name_not_in_quote'] and d['e5']['edgar_wrong_cik']==['source_off_entity'] and d['e5']['edgar_parent_unconfirmed']==['source_off_entity'] and d['e5']['edgar_parent_confirmed']==[] and d['e5']['confirmed_related_host']==[] and d['e5']['press_after_confirm']==['source_off_entity'] and d['e5']['subject']['company']=='ZZ Related Probe' and d['e5']['subject']['existing']==0 and d['e5']['subject']['analysis_rows']==1")" = True ] || fail e5 "refusals: $(q "d['e5']")"
echo "e5. seeded subject $(q "d['e5']['subject']['company']") (0 entity rows, 1 seeded analysis row; never a live company) — refused: iaqm.co.uk (company exclude list); Cox Enterprises, Cox Automotive (Cox Communications' exclude list); bare Cox, Charter; a model-written quote; Cox Communications passes"
echo "e5. E1a: press host, EDGAR under a non-matching CIK, EDGAR before the parent is confirmed → source_off_entity; quote without the name → name_not_in_quote; parent confirmed: EDGAR CIK 1091667 and corporate.charter.com pass, press still refuses"
grep -q 'related-entity item in competitor run' supabase/functions/competitor-discovery/index.ts || fail e6 "competitor discovery does not refuse a related host's items"
grep -q 'confirmed related entity named as a competitor' supabase/functions/competitor-discovery/index.ts || fail e6 "competitor discovery does not refuse a related entity named as a competitor"
grep -q '.eq("company_id", companyId).eq("status", "confirmed")' supabase/functions/_shared/ownHosts.ts || fail e6 "the loader does not filter status = confirmed"
grep -q 'if (r.status !== "confirmed") return false;' supabase/functions/_shared/ownHosts.ts || fail e6 "the resolver admits an unconfirmed row"
echo "e6. only confirmed rows reach the own-host set (loader + resolver); competitor discovery refuses a confirmed related host and a related entity named as a competitor"
[ "$(q "d['e7']['charter']==\"On Charter Communications' site · your parent company\" and d['e7']['cox']==\"On Cox Communications' site · merged with your parent, Aug 2026\" and d['e7']['provisional'].endswith(' · date not confirmed')")" = True ] || fail e7 "venue strings: $(q "d['e7']")"
V=$(npx vitest run src/views/client/firstReadPreview/relatedVenue.test.tsx 2>&1 | sed -e 's/\x1b\[[0-9;]*m//g' | grep -E '^\s+Tests ' || true)
echo "$V" | grep -q 'passed' && ! echo "$V" | grep -q 'failed' || fail e7 "relatedVenue.test.tsx: $V"
echo "e7. venue strings signed byte-for-byte; render: the related venue right after 'On your site' ($(echo "$V" | xargs))"
[ "$(q "d['e8']['disagree']==0 and d['e8']['urls_checked']>0")" = True ] || fail e8 "parity: $(q "d['e8']")"
echo "e8. parity: $(q "d['e8']['urls_checked']") live signal URLs across the $(q "d['e8']['companies']") companies with no confirmed entity — the set and the single host agree on every one ($(q "d['e8']['companies_with_entities']") companies with confirmed entities are outside the invariant; $(q "d['e8']['urls_out_of_invariant']") URLs)"
[ "$(q "d['e9']['violations']==0 and d['e9']['seeded_covered'] and d['e9']['confirmed']>=1")" = True ] || fail e9 "source invariant: $(q "d['e9']")"
echo "e9. every confirmed related entity ($(q "d['e9']['confirmed']") incl. the seeded one) has a stored source snapshot with its quote byte-present and a confirm audit row"
[ "$(q "d['rolled_back']")" = True ] && [ "$(counts)" = "$C0" ] || fail end "the related-entity tables or signals changed across the guard"
echo "end. company_related_entities / sources / audit and signals unchanged ($C0)"
echo "GUARD OK"
