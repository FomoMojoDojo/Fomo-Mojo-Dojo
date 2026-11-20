#!/usr/bin/env bash
# ── REVIEW GROUP GUARD (SP-441 / SP-443 / SP-444, operator brief 2026-11-19) ─────────────────────────
#
# The workspace review group is the first surface that shows a customer's own captured words to an
# operator, so it is the first place a reviewer's NAME could leak. `maskReviewerNames`
# (supabase/functions/_shared/leadText.ts) had no production caller at all before this slice.
#
#   r1  the quote path is the ONLY path: src/lib/reviewQuote.ts calls the mask, it is the one producer
#       of a displayable quote, QuoteList.tsx is the one renderer of a quote's text, and no file under
#       src/views/client/workspace/ touches a stored excerpt directly
#   r2  the clip rule lives in that same module and nowhere else — a quote is shown in full or with a
#       visible ellipsis (SP-443), never silently cut
#   r3  live: every pending outside-voice card cites at least one signal, every cited signal belongs to
#       the card's own company, and every one is an outside review-lane signal
#   r4  what the screens SHOW carries no reviewer name: the helper runs over `signals.quote` for every
#       quote the live cards cite and fails on any surviving byline
#   r4b the mask is still live as the SECOND layer: the same helper over the stored fragments
#       (`evidence_excerpt`) must still take names, so the layer cannot rot unnoticed
#   r7  SP-452: the text shown IS the verified quote. The display path reads signals.quote and the page
#       fragment is not a fallback anywhere in it
#   r5  SP-444: Reject marks and keeps. No delete against surface_proposals exists in src/, and
#       fleet-wide every rejected candidate proposal still carries its proposed_state and a reviewer
#   r6  the group is needs-only, operator-gated, and gates Accept on governance.proposal.apply
#
# Plants (injected live, RED, restored md5-identical, GREEN):
#   P1  delete the maskReviewerNames import/call from src/lib/reviewQuote.ts  => r1 FAILED
#   P2  delete the SP-443 byline rules from _shared/leadText.ts               => r4b FAILED (inert mask)
#   P3  read evidence_excerpt instead of quote in useCandidateQueue.ts        => r7 FAILED
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
RQ=src/lib/reviewQuote.ts
LT=supabase/functions/_shared/leadText.ts
QL=src/views/client/workspace/QuoteList.tsx
RG=src/views/client/workspace/reviewGroup.tsx
IP=src/views/client/workspace/InputsPage.tsx
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
fail() { echo "FAIL $1: $2"; echo "guard: RED"; exit 1; }
q() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

# r1 ── one masking authority, one producer, one renderer, and no second way in
grep -q 'maskReviewerNames' "$RQ" || fail r1 "$RQ does not call maskReviewerNames — the quote path does not mask"
grep -q 'maskReviewerNames(' "$RQ" || fail r1 "$RQ imports the mask but never calls it"
CALLERS=$( { grep -rl 'maskReviewerNames' src/ --include='*.ts' --include='*.tsx' || true; } | { grep -v '\.test\.' || true; } | wc -l | tr -d ' ')
[ "$CALLERS" -ge 1 ] || fail r1 "maskReviewerNames has no production caller under src/"
RENDERERS=$( { grep -rl 'fr-ws-quote-text' src/ --include='*.tsx' || true; } | { grep -v '\.test\.' || true; } | wc -l | tr -d ' ')
[ "$RENDERERS" = "1" ] || fail r1 "$RENDERERS files render a quote's text, expected exactly 1 (QuoteList.tsx)"
grep -q 'displayQuotes\|displayQuote' "$QL" || fail r1 "$QL does not go through displayQuote"
LEAKS=$( { grep -rln 'evidence_excerpt' src/views/client/workspace/ src/hooks/useCandidateQueue.ts src/hooks/useBriefNeeds.ts src/lib/reviewQuote.ts --include='*.ts' --include='*.tsx' 2>/dev/null || true; } | { grep -v '\.test\.' || true; } | { xargs -r grep -l "evidence_excerpt" --include='*.ts' --include='*.tsx' 2>/dev/null || true; } | wc -l | tr -d ' ')
# comments may NAME the fragment column (they explain why it is not used); code may not SELECT it
SELECTS=$( { grep -rn 'evidence_excerpt' src/views/client/workspace/ src/hooks/useCandidateQueue.ts src/hooks/useBriefNeeds.ts src/lib/reviewQuote.ts 2>/dev/null || true; } | { grep -v '\.test\.' || true; } | { grep -vE ':\s*(//|\*|/\*)' || true; } | wc -l | tr -d ' ')
[ "$SELECTS" = "0" ] || fail r1 "$SELECTS line(s) of the display path still name evidence_excerpt outside a comment"
echo "r1. the quote path is the only path: $RQ masks, displayQuote is the one producer, $QL the one renderer, and no line of the display path selects the page fragment"

# r2 ── the clip rule, in that same module and nowhere else
grep -q 'QUOTE_MAX_CHARS' "$RQ" || fail r2 "$RQ carries no clip length"
grep -q 'QUOTE_ELLIPSIS' "$RQ" || fail r2 "$RQ clips without a visible ellipsis"
grep -q 'clipped' "$RQ" || fail r2 "$RQ does not report whether a quote was clipped"
OTHER=$( { grep -rl 'QUOTE_MAX_CHARS' src/ --include='*.ts' --include='*.tsx' || true; } | { grep -v '\.test\.' || true; } | { grep -v "^$RQ$" || true; } | wc -l | tr -d ' ')
[ "$OTHER" = "0" ] || fail r2 "$OTHER other file(s) apply the clip length — it must be applied once"
echo "r2. the clip rule is in $RQ alone: a quote is shown in full or ends in a visible ellipsis"

# r3 ── live: what the pending outside-voice cards cite
CARDS=$(q "select count(*) from public.surface_proposals
           where status='pending' and proposed_state->>'origin'='outside_voice_read'")
EMPTY=$(q "select count(*) from public.surface_proposals
           where status='pending' and proposed_state->>'origin'='outside_voice_read'
             and coalesce(jsonb_array_length(proposed_state->'evidence_signal_ids'),0) = 0")
[ "$EMPTY" = "0" ] || fail r3 "$EMPTY pending outside-voice card(s) cite no evidence at all"
WRONGCO=$(q "with c as (select p.company_id, jsonb_array_elements_text(p.proposed_state->'evidence_signal_ids')::uuid sid
               from public.surface_proposals p
               where p.status='pending' and p.proposed_state->>'origin'='outside_voice_read')
             select count(*) from c left join public.signals s on s.id = c.sid
             where s.id is null or s.company_id <> c.company_id")
[ "$WRONGCO" = "0" ] || fail r3 "$WRONGCO cited signal(s) are missing or belong to another company"
NOTOUT=$(q "with c as (select jsonb_array_elements_text(p.proposed_state->'evidence_signal_ids')::uuid sid
              from public.surface_proposals p
              where p.status='pending' and p.proposed_state->>'origin'='outside_voice_read')
            select count(*) from c join public.signals s on s.id = c.sid
            where coalesce(s.signal_band,'') <> 'outside'")
[ "$NOTOUT" = "0" ] || fail r3 "$NOTOUT cited signal(s) are not outside-band — an outside-voice card may cite nothing else"
echo "r3. $CARDS pending outside-voice card(s); every cited signal exists, is its own company's, and is outside-band"

# r4 ── no reviewer name is visible in what the cards SHOW (signals.quote)
CITED="with c as (select jsonb_array_elements_text(p.proposed_state->'evidence_signal_ids')::uuid sid
     from public.surface_proposals p
     where p.status='pending' and p.proposed_state->>'origin'='outside_voice_read')"
q "$CITED select replace(encode(convert_to(coalesce(s.quote,''),'UTF8'),'base64'), chr(10), '')
   from public.signals s join c on c.sid = s.id" > "$TMP/quotes.b64"
R4=$(PATH="$HOME/.deno/bin:$PATH" deno run -A scripts/guards/helpers/reviewQuoteMasking.ts "$TMP/quotes.b64" 2>&1 || true)
case "$R4" in
  R4-OK*) echo "r4. ${R4#R4-OK }" ;;
  *) fail r4 "${R4:-the masking helper did not run}" ;;
esac

# r4b ── the mask is still live as the second layer, against the fragment corpus it was built for
q "$CITED select replace(encode(convert_to(coalesce(s.evidence_excerpt,''),'UTF8'),'base64'), chr(10), '')
   from public.signals s join c on c.sid = s.id" > "$TMP/excerpts.b64"
R4B=$(PATH="$HOME/.deno/bin:$PATH" deno run -A scripts/guards/helpers/reviewQuoteMasking.ts "$TMP/excerpts.b64" --expect-names 2>&1 || true)
case "$R4B" in
  R4-OK*) echo "r4b. ${R4B#R4-OK }" ;;
  *) fail r4b "${R4B:-the masking helper did not run}" ;;
esac

# r5 ── SP-444: Reject marks and KEEPS
DELS=$( { grep -rn 'from("surface_proposals")' src/ --include='*.ts' --include='*.tsx' -A2 || true; } | { grep -c '\.delete(' || true; } | tr -d ' ')
[ "${DELS:-0}" = "0" ] || fail r5 "$DELS delete call(s) against surface_proposals exist in src/ — Reject must mark, never delete"
LOST=$(q "select count(*) from public.surface_proposals
          where status='rejected' and surface_type like 'candidate%'
            and (proposed_state is null or proposed_state = '{}'::jsonb or reviewed_at is null)")
[ "$LOST" = "0" ] || fail r5 "$LOST rejected candidate proposal(s) lost their proposed_state or their reviewer"
REJ=$(q "select count(*) from public.surface_proposals where status='rejected' and surface_type like 'candidate%'")
echo "r5. no delete against surface_proposals in src/; all $REJ rejected candidate row(s) keep their proposed_state and name their reviewer"

# r6 ── the group's own scope and gates
grep -q "candidate_need" "$RG" || fail r6 "$RG does not restrict the group to need cards"
grep -q 'OPERATOR_MARK' "$RG" || fail r6 "$RG carries no operator mark — it would render outside operator context"
grep -q 'canApply && c.canAccept' "$RG" || fail r6 "$RG does not gate Accept on the capability the page reads"
grep -q 'governance.proposal.apply' "$IP" || fail r6 "$IP no longer reads governance.proposal.apply"
grep -q 'ProposedNeedsReview companyId={companyId} canApply={canApply}' "$IP" || fail r6 "$IP does not pass the capability into the group"
grep -q 'gated && companyId ? <ProposedNeedsReview' "$IP" || fail r6 "$IP mounts the group outside the operator gate"
echo "r6. need cards only; operator-marked; Accept gated on governance.proposal.apply, read by the page and passed in"

# r7 ── SP-452: the text shown IS the verified quote
grep -q 'signals.quote' "$RQ" || fail r7 "$RQ does not say which stored field it shows"
grep -q 'row.quote' "$RQ" || fail r7 "$RQ does not read the verified quote"
# Every reader of the quote path, whichever they are — the list is derived, not written down, so a
# new reader cannot be added that selects the page fragment instead.
READERS=$( { grep -rl 'QuoteRow' src/hooks/ --include='*.ts' 2>/dev/null || true; } | { grep -v '\.test\.' || true; } | sort)
[ -n "$READERS" ] || fail r7 "no hook reads the quote path at all"
for f in $READERS; do
  grep -q 'select("id, quote, source_url, event_date")' "$f" || fail r7 "$f reads the quote path but does not select signals.quote"
done
NOQ=$(q "select count(*) from public.signals s
         where s.id in (select distinct signal_id from public.need_evidence)
           and (s.quote is null or btrim(s.quote) = '')")
echo "r7. every quote-path reader selects signals.quote, never the page fragment ($(echo "$READERS" | tr "\n" " ")); $NOQ of the judged signals fleet-wide carry no verified quote"

echo "GUARD OK"
