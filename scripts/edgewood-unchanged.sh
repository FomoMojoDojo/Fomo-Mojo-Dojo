#!/usr/bin/env bash
# ── EDGEWOOD UNCHANGED (D4, 2026-11-16) ─────────────────────────────────────────────────────────────
#
# Edgewood (3dd2cfbb) is a real client company and is about to receive real documents, so no test may
# change it. Its read-only specs and pinned checks still read it (the clone that would let them move is
# a later, separate decision); every WRITER has moved to a held throwaway. This is the proof that the
# move holds: a snapshot of every row Edgewood owns, taken before a run and compared after it.
#
#   bash scripts/edgewood-unchanged.sh snapshot <file>   write the snapshot
#   bash scripts/edgewood-unchanged.sh compare  <file>   re-take it; exit 0 + "guard: PASS" when identical,
#                                                        exit 1 + "guard: FAIL" naming each table that moved
#
# WHAT IS COVERED: the companies row, and every public base table with a company_id column — one line
# per table: its row count and the md5 of its rows' md5s in sorted order (order-independent). Rows tied
# to Edgewood only through a parent (no company_id of their own) are not covered.
# READ-ONLY: runs inside a read-only transaction. Called by scripts/guards-sweep.sh (before / after the
# sweep) and by the Playwright global setup / teardown. It lives outside scripts/guards/ on purpose: it
# is a before/after pair, not a one-shot guard, and the sweep's glob must not run it alone.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
CO=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
mode="${1:-}"; file="${2:-}"
[ -n "$mode" ] && [ -n "$file" ] || { echo "usage: $0 snapshot|compare <file>"; exit 2; }

take() {
  docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 \
    -c "set default_transaction_read_only = on;" -c "
do \$\$
declare r record; n bigint; h text;
begin
  select count(*), coalesce(md5(string_agg(md5(c::text), '' order by md5(c::text))), '-') into n, h
    from public.companies c where c.id = '$CO';
  raise notice 'companies % %', n, h;
  for r in select c.table_name
             from information_schema.columns c
             join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
            where c.table_schema = 'public' and c.column_name = 'company_id' and t.table_type = 'BASE TABLE'
            order by 1
  loop
    execute format('select count(*), coalesce(md5(string_agg(md5(x::text), '''' order by md5(x::text))), ''-'') from public.%I x where x.company_id::text = %L', r.table_name, '$CO') into n, h;
    raise notice '% % %', r.table_name, n, h;
  end loop;
end \$\$;" 2>&1 | sed -n 's/^NOTICE:  //p'
}

case "$mode" in
  snapshot)
    out=$(take)
    [ "$(printf '%s\n' "$out" | grep -c .)" -gt 1 ] || { echo "guard: FAIL could not snapshot company $CO"; exit 1; }
    printf '%s\n' "$out" > "$file"
    echo "edgewood-unchanged: snapshot of $(printf '%s\n' "$out" | grep -c .) table(s) → $file"
    ;;
  compare)
    [ -s "$file" ] || { echo "guard: FAIL no snapshot at $file"; exit 1; }
    now=$(take)
    moved=$(diff <(cat "$file") <(printf '%s\n' "$now") | sed -n 's/^> \([^ ]*\) \([0-9]*\) .*/\1 (now \2 rows)/p')
    if [ -z "$moved" ] && [ "$(printf '%s\n' "$now")" = "$(cat "$file")" ]; then
      echo "guard: PASS Edgewood unchanged — $(grep -c . "$file") table(s) identical"
    else
      echo "guard: FAIL Edgewood CHANGED during the run:"; printf '%s\n' "$moved" | sed 's/^/  /'
      exit 1
    fi
    ;;
  *) echo "usage: $0 snapshot|compare <file>"; exit 2 ;;
esac
