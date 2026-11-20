#!/usr/bin/env bash
# ── SP-460 / SP-468: the pattern layer's lane is decided by LINEAGE, and fails closed ─────────────
#
# The rule under test: a call may go to an outside model only when the company has NO client-provided
# material and every input row is public by its own source. One row of material closes the lane.
#
# NON-VACUITY IS THE POINT. A guard that only ever asserts "closed" passes on a predicate that returns
# false unconditionally — which is exactly the bug a fail-closed rule invites. So check (l3) builds a
# THROWAWAY company that is clean by construction and asserts the lane OPENS, and (l4) adds ONE
# client-provided signal to that same company and asserts it CLOSES. The only thing that changed
# between them is the one row.
#
# Everything (l3)/(l4) create is removed in an EXIT trap, pass or fail. Charter is only READ.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=${MOJO_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}
CHARTER=dd40ce2f-ff67-4111-bd3c-67943dde6717
CO=0c900000-0000-4000-8000-0000000c0460
FAIL=0
q()  { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
q1() { q "$1" 2>/dev/null | head -1 | tr -d '\r\n'; }
lane() { deno run -A scripts/guards/helpers/patternLane.ts --company="$1" 2>/dev/null; }
bad() { echo "guard: FAIL $*"; FAIL=1; }
ok()  { echo "ok   $*"; }

cleanup() {
  q "delete from public.intake_responses where company_id='$CO';
     delete from public.need_evidence where company_id='$CO';
     delete from public.odi_needs where company_id='$CO';
     delete from public.signals where company_id='$CO';
     delete from public.companies where id='$CO';" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo "— (l1) the rule is exported from the ONE decision core, and re-exported for the edge runtime"
CORE=src/lib/modelRouter/resolveModel.ts
for sym in lineageAllowsExternal patternRouteProvenance LINEAGE_PUBLIC_NEED_SOURCE_PATHS; do
  grep -q "export \(function\|const\) $sym" "$CORE" || bad "(l1) $sym is not exported from $CORE"
  grep -q "$sym" supabase/functions/_shared/modelRouter.ts || bad "(l1) $sym is not re-exported by _shared/modelRouter.ts"
done
[ "$FAIL" = 0 ] && ok "(l1) both symbols and the allowlist live in $CORE and reach the edge runtime"

echo "— (l2) SP-468 scope: the pattern layer is the rule's only consumer"
# The permitted set is NAMED, not matched by substring. A substring test ("does the path contain
# patternLayer") passed vacuously while scripts/run-need-patterns.ts — the pattern layer's own driver,
# added after this guard was written — sat outside it; the first full sweep caught that, which is the
# argument for naming the files. Anything else that imports the rule is a scope breach by definition.
ALLOWED='src/lib/modelRouter/resolveModel.ts
src/lib/modelRouter/lineage.test.ts
supabase/functions/_shared/modelRouter.ts
supabase/functions/_shared/needPatterns.ts
scripts/run-need-patterns.ts
scripts/guards/helpers/patternLane.ts'
CONSUMERS=$(grep -rln "lineageAllowsExternal\|patternRouteProvenance" --include="*.ts" --include="*.tsx" src supabase scripts 2>/dev/null | sort)
UNEXPECTED=$(comm -23 <(printf '%s\n' "$CONSUMERS") <(printf '%s\n' "$ALLOWED" | sort) || true)
if [ -n "$UNEXPECTED" ]; then
  bad "(l2) the rule reaches a consumer outside the pattern layer:"; echo "$UNEXPECTED" | sed 's/^/        /'
else
  ok "(l2) only the pattern layer consumes it ($(printf '%s\n' "$CONSUMERS" | grep -c .) file(s), all named)"
fi
# NON-VACUITY: the named set must actually be present, or (l2) passes on a rule nobody imports.
MISSING=$(comm -13 <(printf '%s\n' "$CONSUMERS") <(printf '%s\n' "$ALLOWED" | sort) || true)
[ -z "$MISSING" ] && ok "(l2) and every named consumer still imports it" \
  || { bad "(l2) a named consumer no longer imports the rule — the allowlist is stale:"; echo "$MISSING" | sed 's/^/        /'; }

echo "— (l3) NON-VACUITY: a company with no client material and public inputs OPENS the lane"
OWNER=$(q1 "select id from auth.users limit 1")
[ -n "$OWNER" ] || { bad "(l3) no auth.users row to own the throwaway"; echo "guard: RED"; exit 1; }
q "insert into public.companies (id, name, website, created_by, fixture_hold)
   values ('$CO','sp460-throwaway-pattern-lane','sp460.example','$OWNER','SP460:test_fixture')" >/dev/null 2>&1
NEED=$(q1 "insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number, step_label,
        desired_outcome, source_path, provenance_type, evidence_voice, status)
      values ('$CO','$OWNER','need','market','customer',0,'','lane probe need',
        'outside_voice_read','outside_review_derived','outside','active') returning id")
PUB=$(q1 "insert into public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, source_url, event_date)
      values ('$CO','public_baseline_run','outside','outside_voice_about_client','a','LANE public','https://www.trustpilot.com/review/x','2026-10-01') returning id")
q "insert into public.need_evidence (company_id, need_id, signal_id, bears, polarity, brand, rubric_version, rubric_md5, label_source)
   values ('$CO','$NEED','$PUB',true,'not working','spectrum','need-match-rubric-v4','7736a27727323339ac1cb55ca74c5eab','full_read')" >/dev/null 2>&1
OPEN=$(lane "$CO")
echo "        $OPEN"
case "$OPEN" in
  *'"allows_external":true'*) ok "(l3) the clean company's lane is OPEN — the rule can say yes" ;;
  *) bad "(l3) a company with no client material did NOT open the lane — the rule may be vacuous" ;;
esac

echo "— (l4) ONE client-provided row on that same company CLOSES it"
# The row is an INTAKE RESPONSE, deliberately: it is client-provided material but it is NOT one of the
# call's input signals, so the call's own rows stay all-public and the ONLY condition that can close the
# lane is the company's material. An uploaded SIGNAL would close it twice over (material AND source) and
# the check would pass even with the material condition deleted — measured 2026-11-20 against the plant.
q "insert into public.intake_responses (company_id, user_id, notes) values ('$CO','$OWNER','LANE probe')" >/dev/null 2>&1
INTAKE=$(q1 "select count(*) from public.intake_responses where company_id='$CO'")
[ "$INTAKE" = "1" ] || bad "(l4) the intake fixture row was not written (got '$INTAKE') — the check below would be vacuous"
SHUT=$(lane "$CO")
echo "        $SHUT"
case "$SHUT" in
  *'"allows_external":false'*) ok "(l4) one intake row closed the lane, with every input row still public" ;;
  *) bad "(l4) a company WITH client-provided material was allowed an outside call" ;;
esac
# and prove it closed for the RIGHT reason: the inputs must still be all-public
case "$SHUT" in
  *'"signal_source_types":["public_baseline_run"]'*) ok "(l4) the call's own rows are unchanged and all public — only the lineage closed it" ;;
  *) bad "(l4) the call's input rows changed, so (l4) does not isolate the client-material condition" ;;
esac
case "$SHUT" in
  *'"provenance":null'*) ok "(l4) and the provenance handed to resolveModel is null — the router routes it local" ;;
  *) bad "(l4) a closed lane still produced a non-null provenance" ;;
esac

echo "— (l5) Charter, read-only: the live company of this brief routes LOCAL (SP-464)"
LIVE=$(lane "$CHARTER")
echo "        $LIVE"
case "$LIVE" in
  *'"allows_external":false'*) ok "(l5) Charter's lane is closed" ;;
  *) bad "(l5) Charter was allowed an outside call — SP-464 says local" ;;
esac
case "$LIVE" in
  *'"has_client_material":true'*) ok "(l5) because the predicate finds its client-provided material" ;;
  *) bad "(l5) Charter no longer reads as holding client material — re-measure before trusting this" ;;
esac

if [ "$FAIL" = 0 ]; then echo "GUARD OK  pattern-lane-guard: the lane opens only on proven-clean lineage"; exit 0; fi
echo "guard: RED"; exit 1
