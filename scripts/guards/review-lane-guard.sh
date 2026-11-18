#!/usr/bin/env bash
# ── REVIEW-LANE GUARD — V1 (2026-11-18; the review-host lane, the Charter voice research plan) ───────────────────────
#
# WHY. The lane records WHICH BRAND a review is about. That is a stored fact only if it comes from the reviewed page
# list (supabase/functions/_shared/reviewPages.ts) — never from the quote's words and never from a model. A citation off
# the list must get no brand ("brand not recorded"), every stored row must trace to its own call's citation, and every
# row is public by source.
#
# Checks:
#   r1. PLANTED CASE — a citation from an unlisted host (and an unlisted page on a listed host) gets NO brand.
#   r2. CONTROL — the same words on a listed page get that page's brand (r1 is not vacuous).
#   r3. fleet-wide: every stored lane row's brand is exactly what its URL's listed page gives.
#   r4. fleet-wide: every lane row is public by source (public_baseline_run), outside voice, band outside, with a
#       non-blank excerpt; a quote only with its source text (signals_quote_verbatim).
#   r5. fleet-wide: every lane row's excerpt is a cited_text of its own stored call (review_lane_calls.response).
#   r7. fleet-wide: every stored quote is word for word on a page fetched in its own call (review_lane_calls.response).
#   r8. a cited span across a rating image / title quotes only the review body; no stored quote begins with markup.
#   r9. the company's own reply ("Please DM us…", "We apologize…") is never a customer quote — planted shape and live rows.
#   r6. inside ONE rolled-back transaction: an about_entity_id of another company's entity is refused; a brand with no
#       page is refused; authenticated cannot write review_lane_calls; the trigger function is not executable by clients.
#
# Plant (run by hand):
#   bash scripts/plant.sh save supabase/functions/_shared/reviewPages.ts
#   # make pageForUrl ignore the path: replace `!p.path.test(u.pathname)` with `false`
#   bash scripts/guards/review-lane-guard.sh      # → r1 RED (the unlisted page on a listed host gets a brand)
#   bash scripts/plant.sh restore supabase/functions/_shared/reviewPages.ts   # → the next run is GREEN
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "FAIL $1: $2"; echo "guard: FAIL"; exit 1; }

JSON=$(psql "select json_build_object(
  'rows', coalesce((select json_agg(json_build_object('id', id, 'company_id', company_id, 'source_url', source_url, 'about_entity_id', about_entity_id,
            'about_entity_page', about_entity_page, 'evidence_excerpt', evidence_excerpt, 'quote', quote, 'review_body', raw_payload->>'review_body', 'live', superseded_at is null, 'review_lane_call_id', review_lane_call_id))
           from signals where review_lane_call_id is not null), '[]'::json),
  'calls', coalesce((select json_agg(json_build_object('id', id, 'response', response)) from review_lane_calls), '[]'::json))")
OUT=$(printf '%s' "$JSON" | deno run --quiet --allow-read scripts/guards/review-lane-check.ts) || fail check "the check script failed: $OUT"
for k in r1 r2 r3 r5 r7 r8 r9; do
  bad=$(echo "$OUT" | grep -E "^FAIL $k:" | head -1 || true)
  [ -z "$bad" ] || fail "$k" "${bad#FAIL $k: }"
  line=$(echo "$OUT" | grep -E "^OK $k:" | head -1 || true)
  [ -n "$line" ] || fail "$k" "no verdict"
  echo "${line#OK }"
done

N=$(psql "select count(*) from signals where review_lane_call_id is not null and (source_type <> 'public_baseline_run' or voice_class <> 'outside_voice_about_client'
          or signal_band <> 'outside' or btrim(coalesce(evidence_excerpt,'')) = '' or (quote is not null and position(quote in coalesce(quote_source_text,'')) = 0))")
[ "$N" = 0 ] || fail r4 "$N lane row(s) are not public outside voice with a verbatim excerpt"
[ "$(psql "select count(*) from pg_constraint where conname='signals_quote_verbatim' and conrelid='public.signals'::regclass")" = 1 ] || fail r4 "signals_quote_verbatim is missing"
echo "r4. every lane row ($(psql "select count(*) from signals where review_lane_call_id is not null")) is public by source, outside voice, with a verbatim excerpt"

OUT=$(docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At 2>&1 <<'SQL' || true
begin;
insert into companies (id, name, website, created_by, fixture_hold)
  values ('00000000-0000-4000-8000-00000000d1a3', 'review-lane-guard (rolled back)', 'https://review-lane-guard.test', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'RL:review-lane-guard');
insert into review_lane_calls (id, company_id, target_key, host, model, response)
  values ('00000000-0000-4000-8000-00000000d1c3', '00000000-0000-4000-8000-00000000d1a3', 'guard', 'trustpilot.com', 'none', '{}');
insert into company_related_entities (id, company_id, name, host, relation, effective_basis, proposed_by, source_url, source_quote, source_verified_at, status, confirmed_by, confirmed_at)
  values ('00000000-0000-4000-8000-00000000d1e3', '00000000-0000-4000-8000-00000000d1a3', 'Guard brand', 'guard-brand.test', 'brand', 'cited', 'review-lane-guard',
          'https://review-lane-guard.test/brand', 'a guard brand', now(), 'confirmed', 'review-lane-guard', now());
do $$ begin
  begin
    insert into signals (company_id, source_type, signal_band, evidence_type, claim_text, voice_class, about_entity_id, about_entity_basis, about_entity_page)
    values ('00000000-0000-4000-8000-00000000d1a3', 'public_baseline_run', 'outside', 'market_signal', 'x', 'outside_voice_about_client',
            (select id from company_related_entities where status='confirmed' and company_id <> '00000000-0000-4000-8000-00000000d1a3' limit 1), 'review_page', 'cox-trustpilot');
    raise exception 'FAIL r6: another company''s entity was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK r6a';
  end;
  begin
    insert into signals (company_id, source_type, signal_band, evidence_type, claim_text, voice_class, about_entity_id, about_entity_basis)
    values ('00000000-0000-4000-8000-00000000d1a3', 'public_baseline_run', 'outside', 'market_signal', 'x', 'outside_voice_about_client',
            '00000000-0000-4000-8000-00000000d1e3', 'review_page');
    raise exception 'FAIL r6: a brand with no page was accepted';
  exception when check_violation then raise notice 'OK r6b';
  end;
end $$;
rollback;
SQL
)
echo "$OUT" | grep -q "OK r6a" || fail r6 "$(echo "$OUT" | grep -E 'FAIL|ERROR' | head -2)"
echo "$OUT" | grep -q "OK r6b" || fail r6 "$(echo "$OUT" | grep -E 'FAIL|ERROR' | head -2)"
[ "$(psql "select has_table_privilege('authenticated','public.review_lane_calls','insert')::text || has_table_privilege('anon','public.review_lane_calls','insert')::text")" = "falsefalse" ] \
  || fail r6 "a client role can insert review_lane_calls"
[ "$(psql "select has_function_privilege('authenticated','public.signals_about_entity_check()','execute')::text || has_function_privilege('anon','public.signals_about_entity_check()','execute')::text")" = "falsefalse" ] \
  || fail r6 "a client role can execute signals_about_entity_check()"
[ "$(psql "select count(*) from companies where id='00000000-0000-4000-8000-00000000d1a3'")" = 0 ] || fail rollback "the guard's company persisted"
echo "r6. another company's entity and a brand with no page are refused; clients cannot write the call ledger or run the trigger"
echo "GUARD OK"
