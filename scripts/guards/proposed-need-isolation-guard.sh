#!/usr/bin/env bash
# ── SP-458 / SP-466 / SP-467: a proposed need reaches the Brief, and nowhere else ─────────────────
#
# Three things are under test, and the third is the one that bites:
#
#   (p1) CENSUS, enforced. Every read of odi_needs is ACCOUNTED FOR — it carries the SP-467 exclusion,
#        or filters status itself, or is a by-id lookup reached only from a list that already excluded
#        the row. A new reader cannot be added without landing in one of those three sets, so the
#        census cannot quietly go stale. 65 call sites, 30 of them reads (measured 2026-11-20).
#
#   (p2) A PLANTED proposed need, on a throwaway company, is absent from the Mojo Score's inputs and
#        present in the Brief's. Both are run through the PRODUCTION code — scripts/mojo-score-live.ts
#        issues snapshotMojoScore's own three selects and scores with the one orchestrator.
#        The assertion is on the INPUT COUNT, not the total: measured on Charter 2026-11-20 the total
#        is 10 with the exclusion and 10 without, because its needs feed a contributor that scores
#        zero either way. A guard that watched the total would pass with the exclusion deleted.
#
#   (p3) SP-466: a SECOND Accept of the same card creates NO duplicate need. The plant for this one is
#        named in the report: remove the `select ... into new_id` skip from accept_candidate_proposal
#        and (p3) fails.
#
# Everything the guard creates is removed in an EXIT trap, pass or fail. Charter is never written.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=${MOJO_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}
CO=0c900000-0000-4000-8000-0000000c0467
FAIL=0
q()  { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
q1() { q "$1" 2>/dev/null | head -1 | tr -d '\r\n'; }
bad() { echo "guard: FAIL $*"; FAIL=1; }
ok()  { echo "ok   $*"; }

cleanup() {
  q "delete from public.need_evidence where company_id='$CO';
     delete from public.odi_needs where company_id='$CO';
     delete from public.signals where company_id='$CO';
     delete from public.surface_proposals where company_id='$CO';
     delete from public.companies where id='$CO';" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup

echo "— (p1) every read of odi_needs is accounted for"
# by-id reads: reached only from a surface that has already excluded the row, so they need no filter
BY_ID_OK='useFoundationProvenance.ts|useOpportunityProposalHandlers.ts|claimState/migration/runner.ts:769|useDriftInbox.ts:85|propose-opportunity-changes/index.ts|backfill-canonical-statements/index.ts|evaluate-opportunity-alignment/index.ts'
TOTAL=0; ACCOUNTED=0; UNACCOUNTED=""
while IFS= read -r hit; do
  f="${hit%%:*}"; rest="${hit#*:}"; ln="${rest%%:*}"
  case "$f" in *.test.ts|*.test.tsx) continue ;; esac
  CHAIN=$(sed -n "${ln},$((ln+16))p" "$f")
  # a WRITE is not a read of the map
  echo "$CHAIN" | head -8 | grep -qE '\.(insert|update|delete|upsert)\(' && continue
  TOTAL=$((TOTAL+1))
  if echo "$CHAIN" | head -8 | grep -q '\.neq("status", "proposed")'; then ACCOUNTED=$((ACCOUNTED+1)); continue; fi
  if echo "$CHAIN" | head -8 | grep -qE '\.(eq|in|neq)\(\s*"status"'; then ACCOUNTED=$((ACCOUNTED+1)); continue; fi
  if echo "$f:$ln" | grep -qE "$BY_ID_OK"; then ACCOUNTED=$((ACCOUNTED+1)); continue; fi
  if echo "$CHAIN" | head -8 | grep -qE '\.(eq|in)\(\s*"id"'; then ACCOUNTED=$((ACCOUNTED+1)); continue; fi
  UNACCOUNTED="$UNACCOUNTED
        $f:$ln"
done < <(grep -rn 'from("odi_needs")\|from("needs_in_market")' --include="*.ts" --include="*.tsx" src supabase 2>/dev/null)
if [ -n "$UNACCOUNTED" ]; then
  bad "(p1) $(echo "$UNACCOUNTED" | grep -c .) read(s) of odi_needs neither exclude 'proposed' nor filter status nor read by id:"
  echo "$UNACCOUNTED"
else
  ok "(p1) all $TOTAL read(s) of odi_needs accounted for ($ACCOUNTED)"
fi
EXCL=$(grep -rn '\.neq("status", "proposed")' --include="*.ts" --include="*.tsx" src supabase 2>/dev/null | grep -c .)
[ "$EXCL" -ge 22 ] || bad "(p1) only $EXCL SP-467 exclusions in the tree, expected at least 22 — one was removed"
[ "$EXCL" -ge 22 ] && ok "(p1) $EXCL reader sites carry the exclusion"

# (p1c) THE VIEW. `needs_in_market` is odi_needs joined to its market links, and it is what the LIVE
# score reads (useOdiNeeds -> useLiveMojoScore). The first SP-467 census grepped `from("odi_needs")`
# and so missed it entirely: the 5 materialised needs reached the view through need_markets rows a
# trigger had already written, and the home's own score counted 20 needs where the snapshot counted
# 15. Named here so that mistake cannot be made twice.
VIEW_READS=$(grep -rn 'from("needs_in_market")' --include="*.ts" --include="*.tsx" src supabase 2>/dev/null | grep -vc "\.test\.")
# -A 16, not -A 8: the chain plus the comment that explains why the exclusion is there runs past 8
# lines, and a window too short to reach it reads as a missing exclusion (measured 2026-11-20).
VIEW_EXCL=$(grep -rn -A 16 'from("needs_in_market")' --include="*.ts" --include="*.tsx" src supabase 2>/dev/null | grep -c '\.neq("status", "proposed")')
echo "        needs_in_market reads: $VIEW_READS · carrying the exclusion: $VIEW_EXCL"
[ "$VIEW_READS" -gt 0 ] || bad "(p1c) no reader of needs_in_market found — this check has gone vacuous"
[ "$VIEW_EXCL" -ge "$VIEW_READS" ] && ok "(p1c) every read of the needs_in_market VIEW excludes 'proposed'" \
  || bad "(p1c) $((VIEW_READS - VIEW_EXCL)) read(s) of needs_in_market do NOT exclude 'proposed' — the LIVE score would count them"
grep -q 'in("status", \["active", "proposed"\])' src/hooks/useBriefNeeds.ts \
  || bad "(p1) the Brief no longer reads 'proposed' — then nothing shows a proposed need at all"
grep -q 'in("status", \["active", "proposed"\])' src/hooks/useBriefNeeds.ts && ok "(p1) and the Brief reads both statuses"

echo "— (p1b) the score harness mirrors snapshotMojoScore's own needs select"
# (p2) below scores through scripts/mojo-score-live.ts. That harness is only evidence if it issues the
# SAME needs select the production snapshot does — if it drifted, (p2) would pass while the real score
# moved. So both filters are asserted on both sides, by name.
for pair in "journey_key:journey_key is not null" "proposed:status <> 'proposed'"; do
  want="${pair#*:}"
  grep -q "$(printf '%s' "$want")" scripts/mojo-score-live.ts     || bad "(p1b) scripts/mojo-score-live.ts does not filter \"$want\" — (p2) would be testing a different query"
done
grep -q 'journey_key", "is", null' supabase/functions/_shared/snapshotMojoScore.ts   || bad "(p1b) snapshotMojoScore no longer filters journey_key — the harness and production have diverged"
grep -q '.neq("status", "proposed")' supabase/functions/_shared/snapshotMojoScore.ts   || bad "(p1b) snapshotMojoScore no longer excludes 'proposed' — the Mojo Score can move on an unaccepted need"
[ "$FAIL" = 0 ] && ok "(p1b) harness and production apply the same two filters"

echo "— (p2) a planted proposed need: absent from the score's inputs, present in the Brief's"
OWNER=$(q1 "select id from auth.users limit 1")
[ -n "$OWNER" ] || { bad "(p2) no auth.users row to own the throwaway"; echo "guard: RED"; exit 1; }
q "insert into public.companies (id, name, website, created_by, fixture_hold)
   values ('$CO','sp467-throwaway-proposed-need','sp467.example','$OWNER','SP467:test_fixture')" >/dev/null 2>&1
mk_need() { q1 "insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number,
     step_label, desired_outcome, source_path, provenance_type, evidence_voice, status)
   values ('$CO','$OWNER','need','market','customer',0,'','$1','outside_voice_read','outside_review_derived','outside','$2') returning id"; }
ACT=$(mk_need "isolation probe ACTIVE need" active)
PROP=$(mk_need "isolation probe PROPOSED need" proposed)
[ -n "$ACT" ] && [ -n "$PROP" ] || bad "(p2) the fixture needs were not written — the checks below would be vacuous"

SCORED=$(deno run -A scripts/mojo-score-live.ts --company="$CO" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['inputs']['needs'])")
ALL=$(q1 "select count(*) from public.odi_needs where company_id='$CO' and journey_key is not null")
echo "        needs on the company: $ALL   needs the score read: $SCORED"
if [ "$SCORED" = "1" ] && [ "$ALL" = "2" ]; then
  ok "(p2) the score read 1 of 2 — the proposed need is not in it"
else
  bad "(p2) the score read $SCORED of $ALL needs; it must read exactly the 1 active one"
fi
BRIEF=$(q1 "select count(*) from public.odi_needs where company_id='$CO' and status in ('active','proposed')")
[ "$BRIEF" = "2" ] && ok "(p2) the Brief's own predicate reads both" || bad "(p2) the Brief's predicate read $BRIEF, expected 2"

echo "— (p3) SP-466: a second Accept of the same card creates no duplicate need"
SIG=$(q1 "insert into public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, source_url, event_date)
      values ('$CO','public_baseline_run','outside','outside_voice_about_client','a','DUP probe','https://www.trustpilot.com/review/x','2026-10-01') returning id")
PID=$(q1 "insert into public.surface_proposals (company_id, surface_type, status, proposed_state)
      values ('$CO','candidate_need','pending', jsonb_build_object(
        'item', jsonb_build_object('desired_outcome','duplicate probe need'),
        'evidence_signal_ids', jsonb_build_array('$SIG'::text),
        'evidence_voice','outside','origin','outside_voice_read')) returning id")
[ -n "$PID" ] || bad "(p3) the probe proposal was not written"
# the loader materialises it only above the bar; here we plant the row directly, which is the state
# SP-466 protects against: a row already carrying this proposal's id
MAT=$(q1 "insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number,
     step_label, desired_outcome, source_path, provenance_type, evidence_voice, status, source_proposal_id)
   values ('$CO','$OWNER','need','market','customer',0,'','duplicate probe need','outside_voice_read',
     'outside_review_derived','outside','proposed','$PID') returning id")
BEFORE=$(q1 "select count(*) from public.odi_needs where company_id='$CO' and source_proposal_id='$PID'")
# accept_candidate_proposal is admin-only and reads auth.uid(); call it as the owner
ACCEPT=$(q "set local role authenticated;
  select set_config('request.jwt.claims', json_build_object('sub','$OWNER','role','authenticated')::text, true);
  select public.accept_candidate_proposal('$PID');" 2>&1 | tail -2)
AFTER=$(q1 "select count(*) from public.odi_needs where company_id='$CO' and source_proposal_id='$PID'")
STATUS=$(q1 "select status from public.odi_needs where id='$MAT'")
PSTAT=$(q1 "select status from public.surface_proposals where id='$PID'")
echo "        rows for that proposal: before=$BEFORE after=$AFTER   need status=$STATUS   proposal=$PSTAT"
case "$ACCEPT" in *"admin only"*) bad "(p3) the probe caller is not an admin, so Accept never ran — the check is vacuous";; esac
if [ "$AFTER" = "1" ] && [ "$BEFORE" = "1" ]; then
  ok "(p3) Accept created no second need row"
else
  bad "(p3) Accept took the row count from $BEFORE to $AFTER — a duplicate need was inserted"
fi
[ "$STATUS" = "active" ] && ok "(p3) and it promoted the existing row 'proposed' → 'active'" \
  || bad "(p3) the accepted need is still '$STATUS' — an accepted need must be an ordinary need"
[ "$PSTAT" = "accepted" ] && ok "(p3) the proposal is marked accepted" || bad "(p3) the proposal is '$PSTAT'"

if [ "$FAIL" = 0 ]; then echo "GUARD OK  proposed-need-isolation-guard: the Brief only, and never twice"; exit 0; fi
echo "guard: RED"; exit 1
