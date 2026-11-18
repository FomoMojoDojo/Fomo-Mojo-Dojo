#!/usr/bin/env bash
# ── SEARCH-LEAD GUARD — V2 (2026-11-18; the lead store, the Charter voice research ruling 1) ────────────────────────────
#
# WHY. A forum thread the paid page fetch cannot read is kept only as a LEAD: the search engine's summary, labelled
# "search summary, not checked against the page". A lead must never be cited by a verdict or counted toward the
# 3-reviews-from-2-sites bar. Verdicts and evidence pointers cite SIGNALS; so a lead is safe exactly when it can never
# become, or be reached as, one. This guard proves that structurally:
#   l1. no table references search_leads (no foreign key into it) — nothing can cite a lead by id
#   l2. every lead carries the fixed basis and label (constraints present, 0 rows off them)
#   l3. CODE CENSUS: search_leads is named only by its migration, its writer (_shared/reviewHostLaneRun.ts), its module
#       and tests, this guard and the generated types — no verdict, evidence, queue or UI code reads it. (The planted case.)
#   l4. no live signal's excerpt or quote is a lead's snippet, and no signal or proposal payload names a lead id
#   l5. every stored lead's query is "site:<reddit|dslreports>.com <Spectrum|Cox> <fixed topic>" — no company text
#   l6. searchLeads.test.ts passes
#
# Plant (run by hand):
#   bash scripts/plant.sh save src/lib/attributeVerdict.ts
#   # append the line:  // reads search_leads
#   bash scripts/guards/search-lead-guard.sh      # → l3 RED (a verdict module names search_leads)
#   bash scripts/plant.sh restore src/lib/attributeVerdict.ts     # → the next run is GREEN
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "FAIL $1: $2"; echo "guard: FAIL"; exit 1; }

N=$(psql "select count(*) from pg_constraint where contype='f' and confrelid='public.search_leads'::regclass")
[ "$N" = 0 ] || fail l1 "$N foreign key(s) point into search_leads"
echo "l1. no table references search_leads"

[ "$(psql "select count(*) from pg_constraint where conrelid='public.search_leads'::regclass and contype='c' and pg_get_constraintdef(oid) ~ 'search summary, not checked against the page|search_summary_unchecked'")" -ge 2 ] || fail l2 "the basis/label constraints are missing"
N=$(psql "select count(*) from search_leads where basis <> 'search_summary_unchecked' or basis_label <> 'search summary, not checked against the page'")
[ "$N" = 0 ] || fail l2 "$N lead(s) off the fixed basis"
echo "l2. every lead ($(psql "select count(*) from search_leads")) carries the fixed basis and label"

ALLOW='^(supabase/migrations/20261118140000_search_leads\.sql|supabase/functions/_shared/reviewHostLaneRun\.ts|supabase/functions/_shared/searchLeads(\.test)?\.ts|scripts/guards/search-lead-guard\.sh|src/integrations/supabase/types\.ts)$'
HITS=$(git ls-files -co --exclude-standard -- src supabase scripts tests | xargs grep -l "search_leads" 2>/dev/null | grep -v -E "$ALLOW" || true)
[ -z "$HITS" ] || fail l3 "search_leads is named outside its own files: $(echo $HITS)"
echo "l3. search_leads is named only by its own migration, writer, module, tests, guard and types"

N=$(psql "select count(*) from signals s where s.superseded_at is null and exists (select 1 from search_leads l where l.snippet = s.evidence_excerpt or l.snippet = s.quote)")
[ "$N" = 0 ] || fail l4 "$N live signal(s) carry a lead's snippet as their words"
N=$(psql "select count(*) from search_leads l where exists (select 1 from surface_proposals p where p.raw_payload::text like '%' || l.id::text || '%' or p.proposed_state::text like '%' || l.id::text || '%')
          or exists (select 1 from signals s where s.raw_payload::text like '%' || l.id::text || '%')")
[ "$N" = 0 ] || fail l4 "$N lead id(s) are named in a signal or proposal payload"
echo "l4. no signal carries a lead's words, and no signal or proposal names a lead"

N=$(psql "select count(*) from search_leads where query !~ '^site:(reddit|dslreports)\.com (Spectrum|Cox) (billing|price increase|outage|installation|technician|customer service|cancel|mobile|TV)$'")
[ "$N" = 0 ] || fail l5 "$N lead(s) came from a query off the fixed shape"
echo "l5. every lead's query is a brand word and a fixed topic"

(cd supabase/functions && deno test --quiet --allow-read _shared/searchLeads.test.ts >/dev/null 2>&1) || fail l6 "searchLeads.test.ts failed"
echo "l6. searchLeads.test.ts passes"
echo "GUARD OK"
