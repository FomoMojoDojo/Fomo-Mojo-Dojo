#!/usr/bin/env bash
# ── FIXTURE-HOLD GUARD — R40 (operator ruling 2026-10-20) ────────────────────────────────────────────
#
# WHY. Heart Coffee Roasters — a gate fixture created by throwaway-srctag-gate@local.test — ran as batch-2 company 1
# because nothing stored said it was a fixture. companies.fixture_hold now does. This guard proves every regen entry
# and the client surface refuse a held company, on a THROWAWAY held company seeded on entry and deleted on exit.
#
# Checks:
#   h1. SERVED — the plan call on the held throwaway answers 403 guard=fixture_held (no transport, one refusal row).
#   h2. SCRIPT — from-snapshots refuses the held throwaway with "fixture_held" before any read of the plan.
#   h3. CLIENT — pickDefaultCompanyId never picks a held company; a held route id renders the existing not-found
#       strings (companyRoute.test.tsx, R40 block); the inventory marks the hold (companiesInventory fixtureHold).
#   h4. MODULE — the handler test: plan AND write on a held company are 403 fixture_held with 0 constructions.
#   h5. SOURCE — every fleet sweep / client reader names the column: outsideRegenHandler, listingRegen, excerptBlanking
#       loadCompanies, the restamp store, useCompany, companiesInventory, from-snapshots, decide, push, voice-expectation.
#   h6. DATA — the three ruled holds carry R39:test_fixture and one fixture_hold audit row each.
# Plant (in place, md5 restore): drop the handler's check → h4 RED (the held company plans).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
CO=00000000-0000-4000-8000-00000000f1a0
cleanup() { psql "delete from integrity_runs where company_id='$CO'; delete from companies where id='$CO';" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
psql "insert into companies (id, name, website, created_by, fixture_hold) values ('$CO', 'Guard Held Fixture', 'https://held.example', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'R39:test_fixture');" >/dev/null
echo "seed. throwaway held company $CO (fixture_hold=R39:test_fixture)"

# h1 — served
KEY=$(npx supabase status --output env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
R=$(curl -s -m 60 -w '\n%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/extract-outside-evidence -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "{\"company_id\":\"$CO\",\"run_id\":\"11111111-1111-4111-8111-111111111111\",\"plan\":true}")
CODE=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[ "$CODE" = "403" ] || fail h1 "plan on the held company answered $CODE: $BODY"
[ "$(echo "$BODY" | jq_ "d.get('guard')")" = "fixture_held" ] || fail h1 "guard not named: $BODY"
[ "$(psql "select count(*) from integrity_runs where company_id='$CO' and excluded_by_rule->>'refused'='fixture_held'")" = "1" ] || fail h1 "no refusal row"
echo "h1. served plan on the held company → 403 guard=fixture_held, one refusal row, no model call"

# h2 — script
OUT=$(npx vite-node scripts/first-read-outside-recrawl.ts -- --company=$CO --from-snapshots --plan=/dev/null 2>&1 || true)
echo "$OUT" | grep -q 'fixture_held' || fail h2 "from-snapshots did not refuse the held company: $(echo "$OUT" | tail -2)"
echo "h2. from-snapshots refuses the held company (fixture_held)"

# h3 — client
T=$(npx vitest run src/views/client/companyRoute.test.tsx 2>&1 | grep -E 'Tests ' | tail -1 || true)
echo "$T" | grep -qE 'Tests +[0-9]+ passed' && ! echo "$T" | grep -q failed || fail h3 "companyRoute tests: $T"
grep -q 'routeCompanyHeld' src/views/client/ClientRefinePreviewCompanyView.tsx || fail h3 "the company route does not refuse a held id"
grep -q 'fixtureHold' src/lib/admin/companiesInventory.ts && grep -q 'fixture-hold' src/components/admin/InventoryTable.tsx || fail h3 "the inventory does not mark the hold"
echo "h3. client: default pick skips held, route refuses held with the existing not-found strings, inventory marks it — $T"

# h4 — module
T=$(NO_COLOR=1 deno test --allow-all --no-check --filter 'R40' supabase/functions/_shared/outsideRegenHandler.test.ts 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
echo "$T" | grep -q '^ok |' || fail h4 "handler R40 test: ${T:-no summary}"
echo "h4. module: $T"

# h5 — source
for f in supabase/functions/_shared/outsideRegenHandler.ts supabase/functions/_shared/listingRegen.ts supabase/functions/_shared/excerptBlanking.ts supabase/functions/_shared/aggregatorAuthorship.ts src/hooks/useCompany.tsx src/lib/admin/companiesInventory.ts scripts/first-read-outside-recrawl.ts scripts/b3-review-decide.ts scripts/b3-review-notion-push.ts scripts/guards/regen-voice-expectation.ts; do
  grep -q 'fixture_hold' "$f" || fail h5 "$f does not read fixture_hold"
done
echo "h5. source: ten readers name the column"

# h6 — data
N=$(psql "select count(*) from companies where fixture_hold='R39:test_fixture' and id in ('dddddddd-0000-4000-8000-000000000001','de40cfd7-e351-44bc-a1e1-d63808e47bb9','a74a0291-6a35-43cc-9544-fd788370a53c')")
A=$(psql "select count(*) from integrity_runs where component='fixture_hold' and company_id in ('dddddddd-0000-4000-8000-000000000001','de40cfd7-e351-44bc-a1e1-d63808e47bb9','a74a0291-6a35-43cc-9544-fd788370a53c')")
[ "$N" = "3" ] && [ "$A" = "3" ] || fail h6 "ruled holds: $N held, $A audit rows (expected 3 and 3)"
echo "h6. data: the three ruled holds carry R39:test_fixture with one fixture_hold audit row each"
echo "GUARD OK"
