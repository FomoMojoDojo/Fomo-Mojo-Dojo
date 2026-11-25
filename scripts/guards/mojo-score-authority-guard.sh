#!/usr/bin/env bash
# ── SP-478 / SP-682: ONE Mojo Score authority ─────────────────────────────────────────────────────
#
# One company used to show three numbers: the live score, a cached copy of an old snapshot, and — on
# some surfaces — the OUTSIDE score, a different calculation stored in the same table. The ruling:
#
#   • the AUTHORITY is the live computation, computeMojoScore, over ONE input rule (scoreInputSet);
#   • client and operator surfaces read it; the stored copies (mojo_scores, companies.mojo_score)
#     have ONE server writer, snapshotMojoScore, which keeps them in step on change and on a daily tick;
#   • a reader of mojo_scores says which calculation's rows it wants.
#
# This guard fails when a new code path computes, writes or reads a score outside that. Every list
# below is a list of NAMES: a new caller, writer or reader has to be added here by name, which is the
# review. The lists were taken from the census (SP-479 law): the database's own catalogs for views,
# functions, triggers and jobs, and the code searched in every quoting style — "x", 'x' and `x`.
#
#   (a1) one calculation   computeMojoScore is called only from the named files
#   (a2) one writer        mojo_scores and companies.mojo_score are written only by the named writers
#   (a3) named readers     every file that reads either store is on the list
#   (a4) the database      no view, function, trigger or job names a score unless it is on the list
#   (a5) the mirror        the stored copy is in step with live — see the note on (a5) below
#   (a6) one input rule    the browser hooks and the server writer all read through scoreInputSet
#   (a7) methodology named a read of mojo_scores says which calculation it wants
#
# (a5) reads the database through scripts/mojo-score-mirror.ts, which runs the writer's own dry run on
# a client that can only GET. It cannot write. It needs the service-role key from `supabase status`;
# the key is never printed.
#
# The guard writes nothing and leaves nothing behind.
set -uo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=${MOJO_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}
FAIL=0
q()   { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
bad() { echo "FAIL $*"; FAIL=$((FAIL + 1)); }
# a file's CODE: whole-line comments are dropped, so a file that only talks about a score in a comment
# is not counted as reading or writing one
code() { grep -vE '^[[:space:]]*(//|\*|/\*|#|--)' "$1"; }
ok()  { echo "ok   $*"; }
# every source file the product or its tooling runs; tests are read separately where a check says so
SRC() { find src supabase/functions scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.sh' -o -name '*.sql' \) \
          -not -path '*/node_modules/*' -not -name '*.test.ts' -not -name '*.test.tsx' -not -path 'scripts/guards/*' -not -name 'types.ts' -print | sort; }
# `types.ts` is excluded by NAME above only for the generated src/integrations/supabase/types.ts; the
# score's own src/lib/mojoScore/types.ts is read explicitly by (a6).
listed() { printf '%s\n' "$2" | grep -qxF "$1"; }

echo "— (a1) one calculation: who calls computeMojoScore"
# The Mojo Score's function is the one in src/lib/mojoScore/. Two older functions share its NAME and
# are different calculations (the legacy area score in src/lib/scoring.ts, the gate-based calibration
# in src/lib/scoring/mojoScore.ts); a file that imports one of those is not calling this one.
A1_ALLOWED="scripts/mojo-score-live.ts
src/lib/mojoScore/computeMojoScore.ts
src/lib/mojoScore/strikePreview.ts
src/views/client/workspace/useLiveMojoScore.ts
src/views/client/workspace/useLiveMojoScores.ts
supabase/functions/_shared/snapshotMojoScore.ts"
A1_N=0; A1_BAD=""
while IFS= read -r f; do
  grep -qE 'computeMojoScore\(' "$f" || continue
  case "$f" in src/lib/scoring.ts|src/lib/scoring/mojoScore.ts) continue ;; esac
  # a caller of one of the two same-named older functions
  if grep -qE 'from ["'"'"'`]@/lib/scoring["'"'"'`]|from ["'"'"'`](\.\./)*(lib/)?scoring/mojoScore|from ["'"'"'`]@/lib/scoring/mojoScore' "$f" \
     && ! grep -qE 'mojoScore/computeMojoScore' "$f"; then continue; fi
  A1_N=$((A1_N + 1))
  listed "$f" "$A1_ALLOWED" || A1_BAD="$A1_BAD $f"
done < <(SRC)
[ "$A1_N" -ge 5 ] || bad "(a1) only $A1_N caller(s) of computeMojoScore found — this check has gone vacuous"
[ -z "$A1_BAD" ] && ok "(a1) $A1_N file(s) call the Mojo Score's calculation, all named" \
  || bad "(a1) computeMojoScore is called outside the named files:$A1_BAD"

echo "— (a2) one writer of each store"
S=$FAIL
# mojo_scores: a write is .insert/.update/.upsert/.delete within a few lines of from(mojo_scores) in
# any quoting style, or raw SQL. snapshotMojoScore writes Mojo Score rows; the outside-score function
# and its script write OUTSIDE-score rows (a different calculation, by ruling left where it is);
# writeMojoScore is dead code with no caller, named for retirement under SP-681.
A2_ROWS_ALLOWED="scripts/compute-outside-scores.ts
src/lib/mojoScore/writeMojoScore.ts
supabase/functions/_shared/snapshotMojoScore.ts
supabase/functions/outside-score/index.ts"
A2_BAD=""; A2_N=0
while IFS= read -r f; do
  hit=$(awk '
    /from\(["\x27`]mojo_scores["\x27`]\)/ { near = NR }
    near && NR - near <= 8 && /\.(insert|update|upsert|delete)\(/ { print FILENAME; exit }
    tolower($0) ~ /(insert[ \t]+into|update|delete[ \t]+from)[ \t]+(public\.)?mojo_scores/ { print FILENAME; exit }
  ' "$f")
  [ -n "$hit" ] || continue
  A2_N=$((A2_N + 1))
  listed "$f" "$A2_ROWS_ALLOWED" || A2_BAD="$A2_BAD $f"
done < <(SRC)
[ "$A2_N" -ge 3 ] || bad "(a2) only $A2_N writer(s) of mojo_scores found — this check has gone vacuous"
[ -z "$A2_BAD" ] && ok "(a2) mojo_scores: $A2_N writer file(s), all named" || bad "(a2) mojo_scores is written outside the named writers:$A2_BAD"
# companies.mojo_score: a `mojo_score:` key in an update or insert on companies, or raw SQL.
# snapshotMojoScore is the sole writer (SCORE-1). The legacy Job Steps "reset" writes 0 — a page that
# may not be edited, kept as a NAMED EXCEPTION by SP-682 ruling 7. The seed file plants fixed numbers.
A2_CACHE_ALLOWED="sql/seed_generic_audit_company.sql
src/views/JobSteps/index.tsx
supabase/functions/_shared/snapshotMojoScore.ts"
A2C_BAD=""; A2C_N=0
while IFS= read -r f; do
  hit=$(awk '
    /from\(["\x27`]companies["\x27`]\)/ { near = NR; wr = 0 }
    near && NR - near <= 6 && /\.(insert|update|upsert)\(/ { wr = NR }
    wr && NR - wr <= 12 && /(^|[^_a-zA-Z"\x27])["\x27]?mojo_score["\x27]?[ \t]*:/ { print FILENAME; exit }
    tolower($0) ~ /update[ \t]+(public\.)?companies[ \t]+set.*mojo_score[ \t]*=/ { print FILENAME; exit }
  ' "$f")
  [ -n "$hit" ] || continue
  A2C_N=$((A2C_N + 1))
  listed "$f" "$A2_CACHE_ALLOWED" || A2C_BAD="$A2C_BAD $f"
done < <( { SRC; find sql supabase/seeds -type f -name '*.sql' 2>/dev/null; } | sort -u)
for f in sql/seed_generic_audit_company.sql; do grep -qw 'mojo_score' "$f" 2>/dev/null && A2C_N=$((A2C_N + 1)); done
[ "$A2C_N" -ge 2 ] || bad "(a2) only $A2C_N writer(s) of companies.mojo_score found — this check has gone vacuous"
[ -z "$A2C_BAD" ] && ok "(a2) companies.mojo_score: written by the named writers only (the legacy Job Steps reset is the named exception)" \
  || bad "(a2) companies.mojo_score is written outside the named writers:$A2C_BAD"
# and the one writer is still what it says: a row only on change, never a frozen company, a dry run that writes nothing
W=supabase/functions/_shared/snapshotMojoScore.ts
grep -q 'const rowNeeded = previous === null || previous !== result.total_score;' "$W" || bad "(a2) the writer no longer adds a row only when the total changes"
grep -q 'if (company.frozen === true) {' "$W" || bad "(a2) the writer no longer stops for a frozen company"
awk '/if \(dryRun\) \{/ { d = NR } /\.insert\(\{/ && !d && !/integrity_runs/ { bad = 1 } END { exit bad }' "$W" \
  || bad "(a2) the writer inserts before its dry-run return"
grep -q 'if (!dryRun && !opts.quietSkip) {' "$W" || bad "(a2) the writer's skip ledger is no longer held back by a dry run"
[ "$FAIL" = "$S" ] && ok "(a2) the writer: a row only when the total changes, never a frozen company, a dry run returns before any write"

echo "— (a3) every reader of a stored score is named"
S=$FAIL
# A file whose CODE names companies.mojo_score (the word, in any quoting) or mojo_scores must be on
# this list. Display surfaces under /legacy and /admin read the cache and are not edited; server jobs read
# the cache; the First Read and the client story read OUTSIDE rows; the home's sparkline reads Mojo
# Score history. The Mojo Score's CURRENT value on a client or operator surface comes from the live
# computation, never from here — a new product surface that reaches for the cache fails this check.
A3_ALLOWED="scripts/compute-outside-scores.ts
scripts/first-read-fill.ts
scripts/validate-cafe-barra-migration.ts
src/components/admin/InventoryTable.tsx
src/hooks/useCompany.tsx
src/hooks/useDynamicScoring.ts
src/hooks/useMojoScore.ts
src/lib/admin/companiesInventory.ts
src/lib/mojoScore/writeMojoScore.ts
src/lib/scoring/mojoScore.ts
src/lib/scoring/scoreWritePolicy.ts
src/pages/AdminCompanies.tsx
src/pages/AdminCompanyDetail.tsx
src/pages/AdminCompanyFiles.tsx
src/pages/MapSignalPrototype.tsx
src/views/Analytics/index.tsx
src/views/Inputs/index.tsx
src/views/JobSteps/index.tsx
src/views/MapView/HeroSection.tsx
src/views/MapView/InputsPanel.tsx
src/views/MapView/index.tsx
src/views/Routes/index.tsx
src/views/client/ClientRefinePreviewRoutesView.tsx
src/views/client/ClientRefinePreviewView.tsx
src/views/client/ClientRefinePreviewWorkshopView.tsx
src/views/client/ClientScoreView.tsx
src/views/client/firstReadPreview/useFirstReadPreviewData.ts
src/views/client/workspace/useLiveMojoScores.ts
supabase/functions/_shared/snapshotMojoScore.ts
supabase/functions/council-review/index.ts
supabase/functions/generate-first-read-proposal/index.ts
supabase/functions/local-alignment/index.ts
supabase/functions/outside-score/index.ts
supabase/functions/public-companies/index.ts
supabase/functions/research-company/index.ts
supabase/functions/run-framework-diagnosis/index.ts"
A3_BAD=""; A3_N=0
while IFS= read -r f; do
  # (the output is tested, not the pipe's status: under pipefail a reader that stops early fails the pipe)
  [ -n "$(code "$f" | grep -cE '(^|[^_a-zA-Z0-9])mojo_score([^_a-zA-Z0-9s]|$)|mojo_scores' | grep -v '^0$')" ] || continue
  A3_N=$((A3_N + 1))
  listed "$f" "$A3_ALLOWED" || A3_BAD="$A3_BAD $f"
done < <(SRC)
[ "$A3_N" -ge 30 ] || bad "(a3) only $A3_N file(s) name a stored score — this check has gone vacuous"
[ -z "$A3_BAD" ] && ok "(a3) $A3_N file(s) name a stored score, all on the list" \
  || bad "(a3) a stored score is named by a file that is not on the reader list:$A3_BAD"
# the two surfaces the ruling moved OFF the cache must stay off it
for f in src/lib/decisionPathAdapter.ts src/hooks/useClientViewData.ts src/views/client/home/HeaderCompanySwitcher.tsx; do
  [ -n "$(code "$f" | grep -cE '(^|[^_a-zA-Z0-9])mojo_score([^_a-zA-Z0-9s]|$)' | grep -v '^0$')" ] && bad "(a3) $f reads the cached mojo_score again — the client decision view and the switcher show the LIVE score"
done
grep -q 'input.liveMojoScore' src/lib/decisionPathAdapter.ts || bad "(a3) the decision view's adapter no longer takes the live score"
grep -q 'useCompanyLiveMojoScore' src/hooks/useClientViewData.ts || bad "(a3) the decision view's data hook no longer computes the live score"
[ "$(grep -l 'switcherScoreLabel(liveScores' src/views/client/home/HeaderCompanySwitcher.tsx src/views/client/ClientRefinePreviewRoutesView.tsx src/views/client/ClientRefinePreviewWorkshopView.tsx 2>/dev/null | grep -c .)" = 3 ] \
  || bad "(a3) not all three company switchers print the live score"
grep -rnE 'c\.mojo_score[^;]*score \$' src --include='*.tsx' >/dev/null 2>&1 && bad "(a3) a switcher prints the cached mojo_score as \"score N\""
[ "$FAIL" = "$S" ] && ok "(a3) the client decision view and all three switchers read the live score"

echo "— (a4) the database: views, functions, triggers and jobs that name a score"
A4_FN_ALLOWED="reopen_first_read_session
tick_mojo_scores"
A4_BAD=""
while IFS= read -r n; do [ -n "$n" ] || continue; listed "$n" "$A4_FN_ALLOWED" || A4_BAD="$A4_BAD function:$n"; done < <(q "
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname not in ('pg_catalog','information_schema') and (p.prosrc ilike '%mojo_score%' or p.proname ilike '%mojo_score%')")
while IFS= read -r n; do [ -n "$n" ] || continue; A4_BAD="$A4_BAD view:$n"; done < <(q "
  select schemaname||'.'||viewname from pg_views where schemaname not in ('pg_catalog','information_schema') and definition ilike '%mojo_score%'
  union all select schemaname||'.'||matviewname from pg_matviews where definition ilike '%mojo_score%'")
while IFS= read -r n; do [ -n "$n" ] || continue; A4_BAD="$A4_BAD trigger:$n"; done < <(q "
  select c.relname||'.'||t.tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal and p.prosrc ilike '%mojo_score%'")
while IFS= read -r n; do [ -n "$n" ] || continue; [ "$n" = "tick-mojo-scores" ] || A4_BAD="$A4_BAD job:$n"; done < <(q "
  select jobname from cron.job where command ilike '%mojo_score%' or command ilike '%mojo-score%' or jobname ilike '%score%'")
A4_OBJ=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and (p.prosrc ilike '%mojo_score%' or p.proname ilike '%mojo_score%')")
[ "${A4_OBJ:-0}" -ge 1 ] || bad "(a4) the catalog query found no function at all — this check has gone vacuous"
[ -z "$A4_BAD" ] && ok "(a4) $A4_OBJ function(s), 0 views, 0 triggers; the one job is the tick — nothing unnamed" \
  || bad "(a4) a database object names a score and is not on the list:$A4_BAD"
TICK_CMD=$(q "select command from cron.job where jobname='tick-mojo-scores'")
[ "$TICK_CMD" = "SELECT public.tick_mojo_scores()" ] && ok "(a4) the tick job exists and calls the one function" \
  || bad "(a4) the tick job is missing or calls something else: '$TICK_CMD'"
[ "$(q "select count(*) from pg_proc p where p.proname='tick_mojo_scores' and p.prosecdef and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')")" = 1 ] \
  && ok "(a4) tick_mojo_scores cannot be executed by a browser role" || bad "(a4) tick_mojo_scores is executable by anon or authenticated"

echo "— (a6) one input rule, shared by the browser and the server"
S=$FAIL
R=src/lib/mojoScore/types.ts
grep -q 'export function scoreInputSet' "$R" || bad "(a6) the input rule (scoreInputSet) is gone from $R"
grep -q 'return c.status !== "struck";' "$R" || bad "(a6) the rule no longer leaves out struck claims"
grep -q 'return r.relevance_state === undefined || r.relevance_state === "active";' "$R" || bad "(a6) the rule no longer leaves out inactive routes"
grep -q 'return n.journey_key !== null && n.status !== "retracted" && n.status !== "proposed";' "$R" || bad "(a6) the rule no longer leaves out company-held, retracted or proposed needs"
grep -q 'needs: "needs_in_market"' "$R" || bad "(a6) the rule's needs source is no longer the needs_in_market view"
for f in supabase/functions/_shared/snapshotMojoScore.ts src/views/client/workspace/useLiveMojoScore.ts src/views/client/workspace/useLiveMojoScores.ts scripts/mojo-score-live.ts; do
  grep -q 'scoreInputSet' "$f" || bad "(a6) $f does not read the score's inputs through scoreInputSet"
done
# the server writer states no filter of its own: every predicate lives in the rule
grep -nE '\.(neq|not|is|in)\(' supabase/functions/_shared/snapshotMojoScore.ts | grep -vE 'methodology_version' >/dev/null \
  && bad "(a6) snapshotMojoScore filters its reads itself again — a second statement of the input rule"
# and the client-refine Routes view no longer carries its own copy of the live hook's body
grep -qE 'computeMojoScore\(' src/views/client/ClientRefinePreviewRoutesView.tsx && bad "(a6) ClientRefinePreviewRoutesView computes the score itself again instead of through the one hook"
[ "$FAIL" = "$S" ] && ok "(a6) one rule; the server writer, both live hooks and the harness read through it"

echo "— (a7) a read of mojo_scores names the calculation it wants"
S=$FAIL
# mojo_scores holds rows of two calculations. A read that does not filter methodology_version takes
# whichever was written last. The admin inventory does that on purpose, on a page that is not edited;
# a count-only read and a write are not reads of a score.
A7_BAD=""; A7_N=0
while IFS= read -r f; do
  case "$f" in src/lib/admin/companiesInventory.ts|src/lib/mojoScore/writeMojoScore.ts|scripts/compute-outside-scores.ts) continue ;; esac
  awk -v F="$f" '
    /from\(["\x27`]mojo_scores["\x27`]\)/ { if (open && !named && !write) print F ":" start; open = 1; named = 0; write = 0; start = NR; next }
    open && NR - start <= 12 && /methodology_version/ { named = 1 }
    open && NR - start <= 8 && /\.(insert|update|upsert|delete)\(/ { write = 1 }
    open && NR - start > 12 { if (!named && !write) print F ":" start; open = 0 }
    END { if (open && !named && !write) print F ":" start }
  ' "$f" > /tmp/.a7.$$ 2>/dev/null
  A7_N=$((A7_N + $(grep -cE 'from\(["'"'"'`]mojo_scores["'"'"'`]\)' "$f")))
  [ -s /tmp/.a7.$$ ] && A7_BAD="$A7_BAD $(tr '\n' ' ' < /tmp/.a7.$$)"
  rm -f /tmp/.a7.$$
done < <(SRC | xargs grep -lE 'from\(["'"'"'`]mojo_scores["'"'"'`]\)' 2>/dev/null)
[ "$A7_N" -ge 4 ] || bad "(a7) only $A7_N read(s) of mojo_scores found — this check has gone vacuous"
[ -z "$A7_BAD" ] && ok "(a7) every read of mojo_scores names its methodology ($A7_N site(s) checked; the admin inventory is the named exception)" \
  || bad "(a7) a read of mojo_scores does not say which calculation it wants: $A7_BAD"
grep -q 'export function useMojoScore(companyId: string | undefined, kind: StoredScoreKind)' src/hooks/useMojoScore.ts \
  || bad "(a7) useMojoScore no longer makes its caller name the score"
grep -q 'useMojoScore(companyId, "outside")' src/components/client-view/story/OutsideHeroAct.tsx || bad "(a7) the client story's card no longer reads the OUTSIDE score (SP-682 ruling 1)"
grep -q 'useMojoScore(companyId, "outside")' src/components/client-view/story/check/ExportButton.tsx || bad "(a7) the client story's export no longer reads the OUTSIDE score"
grep -q 'useMojoScore(activeCompany?.id, "mojo")' src/views/client/ClientRefinePreviewView.tsx || bad "(a7) the home's sparkline no longer reads Mojo Score rows only (SP-682 ruling 4)"
[ "$FAIL" = "$S" ] && ok "(a7) the story card and its export read the outside score; the home's sparkline reads Mojo Score rows"

echo "— (a5) the mirror: is the stored copy in step with live?"
# The score falls on the calendar, so "stored equals live" can only be true to the day, and it is the
# DAILY TICK that makes it true. So this check asks two things:
#   (i)  how many unfrozen companies with evidence hold a stored copy that differs from what the one
#        writer would write now — always printed;
#   (ii) is the tick alive: active, and succeeded within the last 26 hours?
# It is RED when companies are out of step AND the tick is not alive: nothing is going to put them
# right. With the tick alive, a company out of step has changed since the last tick and the next tick
# writes it; that count is printed, not failed. Frozen companies are skipped (SP-682 ruling 6).
KEY=$(npx supabase status --output env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
if [ -z "$KEY" ]; then
  bad "(a5) no service-role key from \`supabase status\` — the mirror could not be read"
else
  MIRROR=$(SERVICE_ROLE_KEY="$KEY" deno run -A scripts/mojo-score-mirror.ts 2>/dev/null)
  read -r M_CO M_FROZEN M_NOEV M_SCORED M_OUT M_ERR < <(printf '%s' "$MIRROR" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin); print(d['companies'], d['frozen_skipped'], d['no_evidence_skipped'], d['scored'], len(d['out_of_step']), d['errors'])
except Exception: print('x x x x x x')")
  TICK_ACTIVE=$(q "select coalesce((select active::text from cron.job where jobname='tick-mojo-scores'),'missing')")
  TICK_LAST=$(q "select coalesce((select max(d.start_time)::text from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='tick-mojo-scores' and d.status='succeeded'),'never')")
  TICK_FRESH=$(q "select coalesce((select max(d.start_time) > now() - interval '26 hours' from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='tick-mojo-scores' and d.status='succeeded'), false)::text")
  if [ "$M_CO" = "x" ]; then
    bad "(a5) the mirror harness did not answer"
  else
    echo "        companies $M_CO · frozen, skipped $M_FROZEN · no evidence, skipped $M_NOEV · scored $M_SCORED · OUT OF STEP $M_OUT · read errors $M_ERR"
    echo "        the tick: active=$TICK_ACTIVE · last succeeded: $TICK_LAST"
    [ "$M_ERR" = 0 ] || bad "(a5) $M_ERR company read(s) failed — the count above is not the whole fleet"
    [ "$M_SCORED" -ge 1 ] || bad "(a5) the mirror scored no company at all — this check has gone vacuous"
    if [ "$M_OUT" = 0 ]; then
      ok "(a5) every unfrozen company's stored copy equals what the writer would write now"
    elif [ "$TICK_ACTIVE" = "true" ] && [ "$TICK_FRESH" = "true" ]; then
      ok "(a5) $M_OUT company(ies) have changed since the last tick ($TICK_LAST); the tick is alive and will write them"
    else
      bad "(a5) $M_OUT company(ies) hold a stored score that differs from live, and the daily tick is not alive (active=$TICK_ACTIVE, last succeeded: $TICK_LAST)"
    fi
  fi
fi

if [ "$FAIL" = 0 ]; then echo "GUARD OK"; exit 0; fi
echo "guard: RED"; exit 1
