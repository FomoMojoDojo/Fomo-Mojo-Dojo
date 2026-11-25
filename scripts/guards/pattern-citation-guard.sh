#!/usr/bin/env bash
# ── SP-465: every quote a pattern cites is a quote that need actually has ─────────────────────────
#
# A pattern is a sentence a model wrote. The only thing that makes it a finding rather than a
# plausible sentence is the quotes under it, so the one invariant that cannot be allowed to bend is:
#
#   every need_pattern_quotes row names a signal that is
#     (c1) of the SAME COMPANY as the pattern,
#     (c2) a BEARING quote of that pattern's own need in need_evidence — checked on LIVE patterns
#          only (SP-604): a superseded pattern is a record,
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

echo "— (c2) a cited signal is a BEARING quote of that pattern's need (LIVE patterns only, SP-604)"
# SP-604 (2026-11-23): c2 reads LIVE patterns only. A superseded pattern is a RECORD of what was once
# proposed from the links as they then stood; when a need's links are later re-read (SP-602, N13) its
# old citations are history, not a claim the app makes today. Until this ruling c2 counted them, so a
# link update left a red that no pattern run could ever clear.
# ONE predicate for the count and the listing, on one line, so scripts/patternCitationC2.test.ts runs
# exactly the SQL this guard runs.
C2_FROM="from public.need_pattern_quotes pq join public.need_patterns p on p.id = pq.pattern_id where p.superseded_at is null and not exists (select 1 from public.need_evidence e where e.company_id = p.company_id and e.need_id = p.need_id and e.signal_id = pq.signal_id and e.bears)"
N=$(q "select count(*) $C2_FROM")
if [ "$N" = "0" ]; then ok "(c2) every quote cited by a live pattern bears on its pattern's need"; else
  bad "(c2) $N quote row(s) under a LIVE pattern cite a signal that does not bear on that need"
  q "select p.need_id, pq.signal_id, left(p.name,44) $C2_FROM order by p.name, pq.signal_id limit 20" | sed 's/^/        /'
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
# Scoped to v2 AND LATER: a v1 row genuinely has no polarity (SP-470 postdates it), so including it
# would make this permanently red for a reason nobody can fix.
N=$(q "select count(*) from public.need_patterns where superseded_at is null
       and rubric_version <> 'need-pattern-rubric-v1' and polarity is null")
[ "$N" = "0" ] && ok "(c5c) every live post-v1 pattern names its polarity" || bad "(c5c) $N live post-v1 pattern(s) carry no polarity"
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
RUBRIC=need-pattern-rubric-v3
V3P=$(q "select count(*) from public.need_patterns where superseded_at is null and rubric_version='$RUBRIC'")
V3Q=$(q "select count(*) from public.need_pattern_quotes pq join public.need_patterns p on p.id=pq.pattern_id
          where p.superseded_at is null and p.rubric_version='$RUBRIC' and pq.bears")
echo "        $RUBRIC: $V3P live pattern(s), $V3Q supporting quote row(s)"
SKIP_V3=0
if [ "$V3P" = "0" ]; then
  echo "     -- (c9) SKIPPED: no $RUBRIC pattern is live yet, so these checks would pass on an empty set"
  SKIP_V3=1
elif [ "$V3Q" = "0" ]; then
  bad "(c9) $V3P live $RUBRIC pattern(s) but ZERO supporting quote rows — the checks below would be vacuous"
fi
# The TypeScript gate (parseJudgeOne -> excerptBlanking.verbatimOn) is what enforces this at write
# time. The guard checks the STORED rows, so a row written by some other path — a backfill, a hand
# insert, a future function that forgets the gate — cannot slip past it.
#
# GATED ON SKIP_V3. Until this was wrapped, the block printed "(c9) SKIPPED" and then ran its three
# checks anyway, printing three ok lines over an empty set: the announcement said the checks were not
# meaningful and the output said they passed. That is precisely the shape (c7) exists to refuse.
if [ "$SKIP_V3" = "0" ]; then
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where p.superseded_at is null and p.rubric_version = '$RUBRIC'
         and pq.bears and coalesce(pq.states_span, '') = ''")
[ "$N" = "0" ] && ok "(c9) every supporting quote carries a stored span" || bad "(c9) $N supporting quote(s) carry no span"
# the span must be a substring of the quote, ignoring case and whitespace runs — the same forgiveness
# normalizeForHash gives. Postgres cannot call the TS predicate, so this is the SQL equivalent, and a
# disagreement between the two IS the finding.
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       join public.signals s on s.id = pq.signal_id
       where p.superseded_at is null and p.rubric_version = '$RUBRIC'
         and pq.bears and coalesce(pq.states_span,'') <> ''
         and position(lower(regexp_replace(btrim(pq.states_span), '\s+', ' ', 'g'))
                      in lower(regexp_replace(coalesce(s.quote,''), '\s+', ' ', 'g'))) = 0")
[ "$N" = "0" ] && ok "(c9) every stored span is verbatim in its own quote" || bad "(c9) $N span(s) are NOT verbatim in the quote they claim to come from"
N=$(q "select count(*) from public.need_pattern_quotes pq
       join public.need_patterns p on p.id = pq.pattern_id
       where p.superseded_at is null and p.rubric_version = '$RUBRIC'
         and pq.bears and coalesce(jsonb_array_length(pq.not_stated), 0) <> 0")
[ "$N" = "0" ] && ok "(c9) no supporting quote carries a non-empty not-stated list" \
  || bad "(c9) $N supporting quote(s) were kept although the judge named a part they do not state"
fi
# SP-504 retired the keyword flag and SP-506 dropped the column in the v3 migration. The check is now
# that the COLUMN IS GONE: while it existed, "nothing writes it" was the most that could be asserted,
# and a column nothing writes is a column someone will eventually read.
KF=$(q "select count(*) from information_schema.columns
        where table_schema='public' and table_name='need_pattern_quotes' and column_name='keyword_flag'")
[ "$KF" = "0" ] && ok "(c9) SP-506: the retired keyword_flag column is gone" \
  || bad "(c9) need_pattern_quotes.keyword_flag still exists — SP-506 said the v3 migration drops it"

# ── (c10) SP-502: THE PARTS, and the per-part verdicts the judge gave ───────────────────────────
# v3's whole claim is that a pattern is a claim plus 1–3 predicates and that `bears` is OUR arithmetic
# over the per-part verdicts. That arithmetic is done in TypeScript, so these check the STORED rows:
# a row written by any other path — a backfill, a hand insert, a future function — cannot slip past.
echo "— (c10) SP-502: every live v3 pattern has 1 to 3 parts, and every verdict names a real part"
if [ "$SKIP_V3" = "1" ]; then
  echo "     -- (c10) SKIPPED with (c9): no $RUBRIC pattern is live yet"
else
  PARTS=$(q "select count(*) from public.need_pattern_parts pp join public.need_patterns p on p.id=pp.pattern_id
             where p.superseded_at is null and p.rubric_version='$RUBRIC'")
  QP=$(q "select count(*) from public.need_pattern_quote_parts")
  echo "        part rows: $PARTS · per-part verdict rows: $QP"
  if [ "$PARTS" = "0" ]; then
    bad "(c10) $V3P live $RUBRIC pattern(s) but ZERO part rows — a v3 pattern with no parts was judged on nothing"
  fi

  N=$(q "select count(*) from (select p.id from public.need_patterns p
           left join public.need_pattern_parts pp on pp.pattern_id = p.id
           where p.superseded_at is null and p.rubric_version='$RUBRIC'
           group by p.id having count(pp.id) not between 1 and 3) d")
  [ "$N" = "0" ] && ok "(c10a) every live v3 pattern carries between 1 and 3 parts" \
    || bad "(c10a) $N live v3 pattern(s) carry no parts or more than 3"

  # (c10b) A COUNT, NOT A CHECK (SP-659, 2026-11-24). This used to FAIL the guard on any stored part
  # that opens with a subject ("the customer …"), as SP-501 asked. SP-525 (2026-11-21) removed that
  # test from the code — measured, it refused every part of the two billing needs, where "the customer
  # is charged for the full month" IS the predicate — so the parse gate this comment once cited no
  # longer exists, and the guard follows the code. The count and the parts are still PRINTED, so a
  # reader can see how many stored parts open with a subject; nothing here sets FAIL. The generator
  # prompt's own "never a subject" line is unchanged.
  N=$(q "select count(*) from public.need_pattern_parts pp join public.need_patterns p on p.id=pp.pattern_id
         where p.superseded_at is null and p.rubric_version='$RUBRIC'
           and btrim(pp.predicate) ~* '^(the )?(customers?|users?|clients?|subscribers?|people|they|we|everyone)([^a-z]|\$)'")
  echo "note (c10b) $N stored part(s) open with a subject — counted, never failed (SP-525, SP-659)"
  if [ "$N" != "0" ]; then
    q "select pp.pattern_id, pp.ordinal, pp.predicate from public.need_pattern_parts pp
       join public.need_patterns p on p.id=pp.pattern_id
       where p.superseded_at is null and p.rubric_version='$RUBRIC'
         and btrim(pp.predicate) ~* '^(the )?(customers?|users?|clients?|subscribers?|people|they|we|everyone)([^a-z]|\$)'
       order by pp.predicate" | sed 's/^/        /'
  fi

  # SP-507, STRUCTURALLY: a quote that `bears` must have a stating verdict for EVERY part of its
  # pattern. This is the one invariant that makes "bears" mean what the band tells a reader it means.
  N=$(q "select count(*) from public.need_pattern_quotes pq
         join public.need_patterns p on p.id = pq.pattern_id
         where p.superseded_at is null and p.rubric_version='$RUBRIC' and pq.bears
           and (select count(*) from public.need_pattern_quote_parts qp
                join public.need_pattern_parts pp on pp.id = qp.part_id
                where qp.quote_row_id = pq.id and pp.pattern_id = p.id and qp.states)
             <> (select count(*) from public.need_pattern_parts pp2 where pp2.pattern_id = p.id)")
  if [ "$N" = "0" ]; then ok "(c10c) SP-507: every supporting quote states EVERY part of its pattern"; else
    bad "(c10c) $N supporting quote(s) do not have a stating verdict for every part — 'bears' overclaims"
    q "select pq.signal_id, left(p.name,40),
         (select count(*) from public.need_pattern_quote_parts qp where qp.quote_row_id=pq.id and qp.states) as stated,
         (select count(*) from public.need_pattern_parts pp2 where pp2.pattern_id=p.id) as parts
       from public.need_pattern_quotes pq join public.need_patterns p on p.id=pq.pattern_id
       where p.superseded_at is null and p.rubric_version='$RUBRIC' and pq.bears
         and (select count(*) from public.need_pattern_quote_parts qp
              join public.need_pattern_parts pp on pp.id=qp.part_id
              where qp.quote_row_id=pq.id and pp.pattern_id=p.id and qp.states)
           <> (select count(*) from public.need_pattern_parts pp2 where pp2.pattern_id=p.id) limit 5" | sed 's/^/        /'
  fi

  # SP-494, per part: a stating verdict needs a span, and the span must be verbatim in its own quote.
  N=$(q "select count(*) from public.need_pattern_quote_parts qp
         join public.need_pattern_quotes pq on pq.id = qp.quote_row_id
         join public.need_patterns p on p.id = pq.pattern_id
         where p.superseded_at is null and p.rubric_version='$RUBRIC' and qp.states
           and coalesce(qp.states_span,'') = ''")
  [ "$N" = "0" ] && ok "(c10d) every stating per-part verdict carries a span" \
    || bad "(c10d) $N stating per-part verdict(s) carry no span"
  N=$(q "select count(*) from public.need_pattern_quote_parts qp
         join public.need_pattern_quotes pq on pq.id = qp.quote_row_id
         join public.need_patterns p on p.id = pq.pattern_id
         join public.signals s on s.id = pq.signal_id
         where p.superseded_at is null and p.rubric_version='$RUBRIC' and qp.states
           and coalesce(qp.states_span,'') <> ''
           and position(lower(regexp_replace(btrim(qp.states_span), '\s+', ' ', 'g'))
                        in lower(regexp_replace(coalesce(s.quote,''), '\s+', ' ', 'g'))) = 0")
  [ "$N" = "0" ] && ok "(c10e) every per-part span is verbatim in its own quote" \
    || bad "(c10e) $N per-part span(s) are NOT verbatim in the quote they claim to come from"

  # A verdict's quote row and its part must belong to the SAME PATTERN. The composite FKs make a
  # cross-COMPANY verdict unrepresentable; they do not make a cross-PATTERN one unrepresentable, so
  # this is a real gap and not a restatement of a constraint.
  N=$(q "select count(*) from public.need_pattern_quote_parts qp
         join public.need_pattern_quotes pq on pq.id = qp.quote_row_id
         join public.need_pattern_parts pp on pp.id = qp.part_id
         where pp.pattern_id <> pq.pattern_id")
  [ "$N" = "0" ] && ok "(c10f) no per-part verdict pairs a quote with another pattern's part" \
    || bad "(c10f) $N per-part verdict(s) pair a quote row with a part of a DIFFERENT pattern"

  # NON-VACUITY for the "unrepresentable" claim: the three composite keys must exist.
  CK=$(q "select count(*) from pg_constraint where conname in
          ('need_patterns_id_company','need_pattern_quotes_id_company','need_pattern_parts_id_company')")
  [ "$CK" = "3" ] && ok "(c10g) all three composite (id, company_id) keys are in place" \
    || bad "(c10g) only $CK of 3 composite (id, company_id) keys exist — a cross-company verdict would merely be unchecked"
fi

echo "— (c8) the rubric is recorded on every live pattern"
N=$(q "select count(*) from public.need_patterns where superseded_at is null
       and (coalesce(rubric_version,'') = '' or coalesce(rubric_md5,'') = '' or coalesce(model_name,'') = '')")
[ "$N" = "0" ] && ok "(c8) every live pattern names its rubric and its model" || bad "(c8) $N live pattern(s) do not name the rubric or model that produced them"

if [ "$FAIL" = 0 ]; then echo "GUARD OK  pattern-citation-guard: $PQ quote row(s) under $PAT pattern(s), all sound"; exit 0; fi
echo "guard: RED"; exit 1
