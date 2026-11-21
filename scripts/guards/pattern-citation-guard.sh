#!/usr/bin/env bash
# ── SP-465: every quote a pattern cites is a quote that need actually has ─────────────────────────
#
# A pattern is a sentence a model wrote. The only thing that makes it a finding rather than a
# plausible sentence is the quotes under it, so the one invariant that cannot be allowed to bend is:
#
#   every need_pattern_quotes row names a signal that is
#     (c1) of the SAME COMPANY as the pattern,
#     (c2) a BEARING quote of that pattern's own need in need_evidence,
#     (c3) COUNTED under SP-406 — so not an undated Cox review and not a pre-merger Cox one,
#     (c4) LIVE — not superseded and not held,
#   and (c5) every stored pattern has at least one SURVIVING supporting quote (SP-463),
#   and (c6) no live pattern carries a strength outside SP-428's four.
#
# (c1) is structurally impossible — need_pattern_quotes_signal_fk is composite on
# (signal_id, company_id) — and is checked anyway, because a constraint that is never tested is a
# claim about a constraint.
#
# FLEET-WIDE. Every company, not Charter: a guard pinned to one company's data stops guarding the
# moment the pattern layer runs anywhere else.
#
# (c7) NON-VACUITY. A guard over an empty table passes. So it prints the row counts and FAILS if
# there are no live patterns at all — a green that means "nothing to check" is the failure mode this
# whole class of guard has.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB=${MOJO_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}
FAIL=0
q() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
bad() { echo "guard: FAIL $*"; FAIL=1; }
ok()  { echo "ok   $*"; }

# SP-406's merger rule, as the counting module states it. Restated here ONLY because a guard must be
# able to disagree with the application: if this SQL and needEvidenceCounting.ts ever diverge, the
# divergence is the finding. COX_MERGER_DATE = 2026-08-20.
COUNTED="not (e.brand = 'cox' and (s.event_date is null or s.event_date < date '2026-08-20'))"

PAT=$(q "select count(*) from public.need_patterns where superseded_at is null")
PQ=$(q "select count(*) from public.need_pattern_quotes")
CO=$(q "select count(distinct company_id) from public.need_patterns where superseded_at is null")
echo "— live patterns: $PAT · quote rows: $PQ · companies: $CO"
if [ "$PAT" = "0" ]; then
  bad "(c7) there are NO live patterns — this guard would pass on an empty table, which proves nothing"
  echo "guard: RED"; exit 1
fi
ok "(c7) non-vacuous: $PAT live pattern(s) over $CO company/companies"

echo "— (c1) a cited signal belongs to the pattern's own company"
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       join public.signals s on s.id = pq.signal_id
       where s.company_id <> p.company_id or pq.company_id <> p.company_id")
[ "$N" = "0" ] && ok "(c1) 0 cross-company citations" || bad "(c1) $N quote row(s) cite another company's signal"

echo "— (c2) a cited signal is a BEARING quote of that pattern's need"
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where not exists (select 1 from public.need_evidence e
          where e.company_id = p.company_id and e.need_id = p.need_id
            and e.signal_id = pq.signal_id and e.bears)")
if [ "$N" = "0" ]; then ok "(c2) every cited quote bears on its pattern's need"; else
  bad "(c2) $N quote row(s) cite a signal that does not bear on that need"
  q "select p.need_id, pq.signal_id, left(p.name,44) from public.need_pattern_quotes pq
     join public.need_patterns p on p.id = pq.pattern_id
     where not exists (select 1 from public.need_evidence e where e.company_id = p.company_id
       and e.need_id = p.need_id and e.signal_id = pq.signal_id and e.bears) limit 5" | sed 's/^/        /'
fi

echo "— (c3) a cited signal is COUNTED under the SP-406 merger rule"
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       join public.need_evidence e on e.company_id = p.company_id and e.need_id = p.need_id
            and e.signal_id = pq.signal_id and e.bears
       join public.signals s on s.id = pq.signal_id
       where not ($COUNTED)")
[ "$N" = "0" ] && ok "(c3) no pattern rests on an uncounted Cox review" || bad "(c3) $N quote row(s) cite a signal the merger rule does not count"

echo "— (c4) a cited signal is LIVE"
N=$(q "select count(*) from public.need_pattern_quotes pq join public.signals s on s.id = pq.signal_id
       where s.superseded_at is not null or s.held_at is not null")
[ "$N" = "0" ] && ok "(c4) no pattern rests on a superseded or held signal" || bad "(c4) $N quote row(s) cite a superseded or held signal"

echo "— (c5) SP-463: a stored pattern has at least one surviving supporting quote"
N=$(q "select count(*) from public.need_patterns p where p.superseded_at is null
       and not exists (select 1 from public.need_pattern_quotes pq where pq.pattern_id = p.id and pq.bears)")
[ "$N" = "0" ] && ok "(c5) every live pattern has a supporting quote" || bad "(c5) $N live pattern(s) have no surviving supporting quote"

echo "— (c5b) the representative quote is one of the pattern's own supporting quotes"
N=$(q "select count(*) from public.need_patterns p where p.superseded_at is null
       and p.representative_signal_id is not null
       and not exists (select 1 from public.need_pattern_quotes pq
         where pq.pattern_id = p.id and pq.signal_id = p.representative_signal_id and pq.bears)")
[ "$N" = "0" ] && ok "(c5b) every representative quote is a supporting quote of its own pattern" \
  || bad "(c5b) $N live pattern(s) show a representative quote that is not one of their supporting quotes"

echo "— (c5c) SP-470: every live pattern carries ONE polarity, and its quotes carry the same one"
N=$(q "select count(*) from public.need_patterns where superseded_at is null
       and rubric_version = 'need-pattern-rubric-v2' and polarity is null")
[ "$N" = "0" ] && ok "(c5c) every live v2 pattern names its polarity" || bad "(c5c) $N live v2 pattern(s) carry no polarity"
# and the quotes under it agree. A pattern is "the thing that keeps happening" — one that mixes a
# complaint and a compliment is not one thing, which is why SP-470 gives each polarity its own pass.
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       join public.need_evidence e on e.company_id = p.company_id and e.need_id = p.need_id
            and e.signal_id = pq.signal_id and e.bears
       where p.superseded_at is null and p.polarity is not null
         and e.polarity is not null and e.polarity <> p.polarity")
[ "$N" = "0" ] && ok "(c5c) no quote sits under a pattern of a different polarity" \
  || bad "(c5c) $N quote row(s) sit under a pattern whose polarity they do not carry"

echo "— (c5d) SP-475(c): no quote is the representative of two patterns in one need"
N=$(q "select coalesce(sum(c - 1), 0) from (
         select count(*) c from public.need_patterns
          where superseded_at is null and representative_signal_id is not null
          group by company_id, need_id, representative_signal_id having count(*) > 1) d")
[ "$N" = "0" ] && ok "(c5d) every representative is unique within its need" \
  || bad "(c5d) $N duplicate representative(s) — the unique index should have made this impossible"
# NON-VACUITY: the index must exist, or (c5d) is checking a rule nothing enforces.
IDX=$(q "select count(*) from pg_indexes where schemaname='public' and indexname='need_patterns_one_representative'")
[ "$IDX" = "1" ] && ok "(c5d) and the unique index that forbids it is in place" \
  || bad "(c5d) need_patterns_one_representative is MISSING — (c5d) would pass on luck"

echo "— (c6) SP-428: the strength is one of the four"
N=$(q "select count(*) from public.need_patterns where superseded_at is null
       and strength not in ('confirmed rule','likely rule','possible failure','too thin')")
[ "$N" = "0" ] && ok "(c6) no strength outside SP-428's four" || bad "(c6) $N live pattern(s) carry a strength outside SP-428's four"

echo "— (c9) SP-494: every supporting quote's span is VERBATIM and its not-stated list is empty"
# NON-VACUITY FIRST. Every check below is scoped to rubric v2.1, so before any v2.1 row exists they
# all pass on an empty set — the failure mode this guard family keeps being written against. So:
# count the rows, print the count, and fail if there are v2.1 PATTERNS but no v2.1 supporting quotes.
V21P=$(q "select count(*) from public.need_patterns where superseded_at is null and rubric_version='need-pattern-rubric-v2.2'")
V21Q=$(q "select count(*) from public.need_pattern_quotes pq join public.need_patterns p on p.id=pq.pattern_id
          where p.superseded_at is null and p.rubric_version='need-pattern-rubric-v2.2' and pq.bears")
echo "        rubric v2.1: $V21P live pattern(s), $V21Q supporting quote row(s)"
if [ "$V21P" = "0" ]; then
  echo "     -- (c9) SKIPPED: no rubric v2.1 pattern is live yet, so these checks would pass on an empty set"
elif [ "$V21Q" = "0" ]; then
  bad "(c9) $V21P live v2.1 pattern(s) but ZERO supporting quote rows — the checks below would be vacuous"
fi
# The TypeScript gate (parseJudgeOne -> excerptBlanking.verbatimOn) is what enforces this at write
# time. The guard checks the STORED rows, so a row written by some other path — a backfill, a hand
# insert, a future function that forgets the gate — cannot slip past it.
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where p.superseded_at is null and p.rubric_version = 'need-pattern-rubric-v2.2'
         and pq.bears and coalesce(pq.states_span, '') = ''")
[ "$N" = "0" ] && ok "(c9) every supporting quote carries a stored span" || bad "(c9) $N supporting quote(s) carry no span"
# the span must be a substring of the quote, ignoring case and whitespace runs — the same forgiveness
# normalizeForHash gives. Postgres cannot call the TS predicate, so this is the SQL equivalent, and a
# disagreement between the two IS the finding.
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       join public.signals s on s.id = pq.signal_id
       where p.superseded_at is null and p.rubric_version = 'need-pattern-rubric-v2.2'
         and pq.bears and coalesce(pq.states_span,'') <> ''
         and position(lower(regexp_replace(btrim(pq.states_span), '\s+', ' ', 'g'))
                      in lower(regexp_replace(coalesce(s.quote,''), '\s+', ' ', 'g'))) = 0")
[ "$N" = "0" ] && ok "(c9) every stored span is verbatim in its own quote" || bad "(c9) $N span(s) are NOT verbatim in the quote they claim to come from"
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where p.superseded_at is null and p.rubric_version = 'need-pattern-rubric-v2.2'
         and pq.bears and coalesce(jsonb_array_length(pq.not_stated), 0) <> 0")
[ "$N" = "0" ] && ok "(c9) no supporting quote carries a non-empty not-stated list" \
  || bad "(c9) $N supporting quote(s) were kept although the judge named a part they do not state"
# SP-504: the keyword flag was removed. It fired on about two thirds of calls over two full runs and
# never vetoed anything. The COLUMN is left in place, unused, because dropping it is a destructive act
# nobody ruled — so this asserts nothing new is written to it rather than reading it as a signal.
NEWFLAGS=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where p.superseded_at is null and p.rubric_version like 'need-pattern-rubric-v2.2%'
         and pq.keyword_flag is not null")
[ "$NEWFLAGS" = "0" ] && ok "(c9) SP-504: no v2.2 row writes the retired keyword_flag column" \
  || bad "(c9) $NEWFLAGS v2.2 row(s) still write keyword_flag, which SP-504 removed"

echo "— (c8) the rubric is recorded on every live pattern"
N=$(q "select count(*) from public.need_patterns where superseded_at is null
       and (coalesce(rubric_version,'') = '' or coalesce(rubric_md5,'') = '' or coalesce(model_name,'') = '')")
[ "$N" = "0" ] && ok "(c8) every live pattern names its rubric and its model" || bad "(c8) $N live pattern(s) do not name the rubric or model that produced them"

if [ "$FAIL" = 0 ]; then echo "GUARD OK  pattern-citation-guard: $PQ quote row(s) under $PAT pattern(s), all sound"; exit 0; fi
echo "guard: RED"; exit 1
