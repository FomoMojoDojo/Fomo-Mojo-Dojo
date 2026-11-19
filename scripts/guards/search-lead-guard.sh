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
#   l7. (A3, 2026-11-18) leads are shown only with reviewer names masked: leadText.test.ts passes, and the one lead export
#       (scripts/review-lane/export-leads.ts, read only) over every company with leads leaves no reviewer-name shape
#       ("Review from <Name> <I>", "author":"<name>", u/<name>, "said by <handle>:", "<handle> : online", a review
#       header's date + handle). Plant: drop a rule from _shared/leadText.ts -> l7 RED.
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

# A3 (2026-11-18): scripts/review-lane/export-leads.ts is the one DISPLAY reader (read only, names masked) — not a verdict
ALLOW='^(supabase/migrations/20261118140000_search_leads\.sql|supabase/functions/_shared/reviewHostLaneRun\.ts|supabase/functions/_shared/searchLeads(\.test)?\.ts|scripts/guards/search-lead-guard\.sh|src/integrations/supabase/types\.ts|scripts/review-lane/export-leads\.ts)$'
HITS=$(git ls-files -co --exclude-standard -- src supabase scripts tests | xargs grep -l "search_leads" 2>/dev/null | grep -v -E "$ALLOW" || true)
[ -z "$HITS" ] || fail l3 "search_leads is named outside its own files: $(echo $HITS)"
echo "l3. search_leads is named only by its own migration, writer, module, tests, guard, types and the masked display export"

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

(cd supabase/functions && deno test --quiet --allow-read _shared/leadText.test.ts >/dev/null 2>&1) || fail l7 "leadText.test.ts failed"
L7=$(mktemp -d); trap 'rm -rf "$L7"' EXIT
COS=$(psql "select string_agg(distinct company_id::text, ' ') from (select company_id from search_leads union select company_id from signals where held_reason='search summary, not checked against the page' and review_lane_call_id is not null) x")
NAMES=0
for co in $COS; do
  deno run --allow-all scripts/review-lane/export-leads.ts --company=$co --out="$L7/$co.json" > "$L7/$co.out" || fail l7 "export-leads failed for $co: $(cat "$L7/$co.out")"
  LEFT=$(python3 - "$L7/$co.json" <<'PY'
import json, re, sys
d = json.load(open(sys.argv[1]))
texts = [h["text"] for h in d["held"]] + [f["title"] + " " + f["snippet"] for f in d["forum"]]
pat = re.compile(r'(?m)Review from [A-Z][a-z]+ [A-Z]\b|"author"\s*:\s*"(?!\[reviewer\])[^"]+"|\bu/(?!\[)[A-Za-z0-9]|said by (?!\[)[^\s:]+:|(?<![\w\]])[A-Za-z][\w.-]* : online|^(?:[-*] )?(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}|\d{1,2}/\d{1,2}/\d{4}|\d{4}/\d{1,2}/\d{1,2}|\d{1,2}月\d{1,2}日) [A-Za-z]+\d+')
print(sum(1 for t in texts if pat.search(t)))
PY
)
  [ "$LEFT" = 0 ] || fail l7 "$LEFT lead text(s) of company $co still show a reviewer name after masking"
  NAMES=$((NAMES + $(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['masked']['names'])" "$L7/$co.json")))
done
echo "l7. leads are exported with reviewer names masked ($NAMES masked across $(echo $COS | wc -w | tr -d ' ') compan(ies)); none left"
echo "GUARD OK"
