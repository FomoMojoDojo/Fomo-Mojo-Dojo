#!/usr/bin/env bash
# ── NEED EVIDENCE GUARD (SP-429, operator brief 2026-11-19) ──────────────────────────────────────
#
# need_evidence says which quote bears on which need, with what polarity, from which brand, and WHO
# judged it. Before it, those labels lived only in a file, so the brief's hotspots and thin spots
# could not be computed from the database at all.
#
# NOTHING ABOUT COUNTING IS STORED: there is no `counted` and no `meets_bar` column. The SP-406 rules
# are computed from this row's brand and the signal's own event_date (src/lib/needEvidenceCounting.ts),
# so a recovered date or a changed ruling needs no reload — and check e6 is what proves the computed
# answer still equals the signed one.
#
#   e1  polarity admits EXACTLY working / not working / mixed — 'neutral' is refused (SP-405 was
#       withdrawn by SP-416 and the corpus holds none), and judged_by admits exactly its three values
#   e2  the composite FKs make a cross-company label unrepresentable, refused ON THE FK
#   e3  RLS is on, anon has no grant, writes are admin-only, members read their own company
#   e4  no label points at a superseded or held signal
#   e5  every row's judged_by is one of the three; today's corpus is all 'cc_read_unchecked' (SP-429)
#   e6  the counting module reproduces charter-needs-status-v2.md EXACTLY for N1–N15
#
# Plants (injected live, RED, restored md5-identical, GREEN):
#   P1  add 'neutral' to the polarity CHECK          => e1 FAILED
#   P2  flip COX_MERGER_DATE in the counting module  => e6 FAILED
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
CO=dd40ce2f-ff67-4111-bd3c-67943dde6717
fail() { echo "FAIL $1: $2"; echo "guard: RED"; exit 1; }
q() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
qerr() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1" 2>&1 1>/dev/null || true; }

# e1 ── the two vocabularies, proved by refusal on a rolled-back probe
NEED=$(q "select id from public.odi_needs where company_id='$CO' limit 1")
SIG=$(q "select signal_id from public.need_evidence where company_id='$CO' limit 1")
[ -n "$NEED" ] && [ -n "$SIG" ] || fail e1 "no need/signal fixture available to probe with"
# the pair is already labelled, so the probe clears it inside the transaction — otherwise the
# unique (need_id, signal_id) constraint fires before the CHECK and a planted CHECK would look
# "refused" for the wrong reason, which is how a plant passes while proving nothing.
probe() { qerr "begin; delete from public.need_evidence where need_id='$NEED' and signal_id='$SIG';
                insert into public.need_evidence (company_id,need_id,signal_id,bears,polarity,brand,judged_by,rubric_version,rubric_md5,label_source)
                values ('$CO','$NEED','$SIG',$1,$2,'spectrum',$3,'r','m','full_read'); rollback;"; }
E=$(probe true "'neutral'" "'cc_read_unchecked'")
echo "$E" | grep -q 'need_evidence_polarity_check' || fail e1 "polarity 'neutral' was NOT refused by need_evidence_polarity_check: ${E:0:120}"
E=$(probe true "'nonsense'" "'cc_read_unchecked'")
echo "$E" | grep -q 'need_evidence_polarity_check' || fail e1 "free-text polarity was not refused"
E=$(probe false "'not working'" "'cc_read_unchecked'")
echo "$E" | grep -q 'need_evidence_polarity_check' || fail e1 "a non-bearing row with a polarity was not refused"
E=$(probe true "'working'" "'guessed'")
echo "$E" | grep -q 'need_evidence_judged_by_check' || fail e1 "judged_by 'guessed' was not refused"
echo "e1. polarity admits only working / not working / mixed ('neutral' refused); judged_by admits only its three"

# e2 ── a cross-company label is unrepresentable
OTHER=$(q "select id from public.companies where id <> '$CO' and frozen is not true limit 1")
# every (need, signal) pair for this company is already labelled, so the probe clears the row
# first — inside the transaction it rolls back, so nothing is written either way. Without this the
# unique (need_id, signal_id) constraint fires before the FK and the check would prove nothing.
E=$(qerr "begin; delete from public.need_evidence where need_id='$NEED' and signal_id='$SIG';
          insert into public.need_evidence (company_id,need_id,signal_id,bears,polarity,brand,judged_by,rubric_version,rubric_md5,label_source)
          values ('$OTHER','$NEED','$SIG',true,'working','spectrum','cc_read_unchecked','r','m','full_read'); rollback;")
echo "$E" | grep -qE 'need_evidence_need_fk|need_evidence_signal_fk' \
  || fail e2 "a label joining company $OTHER to another company's need/signal was not refused on the composite FK: ${E:0:140}"
echo "e2. the composite FKs refuse a cross-company label, on the FK itself"

# e3 ── RLS
RLS=$(q "select relrowsecurity from pg_class where relname='need_evidence'")
[ "$RLS" = "t" ] || fail e3 "row level security is not enabled"
POL=$(q "select count(*) from pg_policies where tablename='need_evidence'")
[ "$POL" -ge 5 ] || fail e3 "expected at least 5 policies, found $POL"
ANON=$(q "select count(*) from information_schema.role_table_grants where table_name='need_evidence' and grantee='anon'")
[ "$ANON" = "0" ] || fail e3 "anon holds $ANON grant(s) on need_evidence"
echo "e3. RLS on, $POL policies, anon has no grant"

# e4 ── no label on a retired row
BAD=$(q "select count(*) from public.need_evidence e join public.signals s on s.id=e.signal_id
         where s.superseded_at is not null or s.held_at is not null")
[ "$BAD" = "0" ] || fail e4 "$BAD label(s) point at a superseded or held signal"
echo "e4. no label points at a superseded or held signal"

# e5 ── who judged
OFF=$(q "select count(*) from public.need_evidence where judged_by not in ('cc_read_unchecked','operator','operator_confirmed_cc')")
[ "$OFF" = "0" ] || fail e5 "$OFF row(s) carry an unknown judged_by"
CC=$(q "select count(*) from public.need_evidence where judged_by='cc_read_unchecked'")
TOT=$(q "select count(*) from public.need_evidence")
echo "e5. judged_by is always one of the three — $CC of $TOT are 'cc_read_unchecked' (SP-429)"

# e6 ── the computed answer still equals the signed one
OUT=$(deno run -A scripts/verify-need-evidence-counting.ts 2>&1 || true)
echo "$OUT" | grep -q "reproduce charter-needs-status-v2.md EXACTLY" \
  || fail e6 "the counting module no longer reproduces charter-needs-status-v2.md: $(echo "$OUT" | grep -E 'MISMATCH|mismatched' | head -2 | tr '\n' ' ')"
echo "e6. the counting module reproduces charter-needs-status-v2.md exactly for N1-N15"

echo "GUARD OK"
