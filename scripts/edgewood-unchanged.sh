#!/usr/bin/env bash
# ── EDGEWOOD UNCHANGED (D4, 2026-11-16; made stable across added columns by E1) ───────────────────────
#
# Edgewood (3dd2cfbb) is a real client company and no test may change it. Every test reads the Edgewood test
# twin instead (D4b); this is the proof that nothing touched Edgewood itself: a snapshot of every row it owns,
# taken before a run and compared after it.
#
#   bash scripts/edgewood-unchanged.sh snapshot <file>   write the snapshot
#   bash scripts/edgewood-unchanged.sh compare  <file>   re-take it; exit 0 + "guard: PASS" when identical,
#                                                        exit 1 + "guard: FAIL" naming each table that moved
#   bash scripts/edgewood-unchanged.sh selftest          prove the comparison on a temp copy (no real write)
#
# WHAT IS COVERED: the companies row, and every public base table with a company_id column — one line per
# table: its row count, a hash of its rows, and THE COLUMNS THAT HASH WAS TAKEN OVER.
#
# E1 (2026-11-16): STABLE ACROSS AN ADDED COLUMN. The first version hashed each row's text form, and a
# migration that only ADDED a column to a company table (S2's ocr_pages, S6's page_unit) changed every
# row's text and read as "Edgewood changed" though no row was written. Each row is now hashed as jsonb
# PROJECTED onto the columns the table had at snapshot time, and the compare re-projects onto those same
# columns: a column added afterwards — nullable or with a default — cannot move the hash. A changed value in
# a snapshotted column still does, and so does a row added or removed, a column dropped, or a NEW table
# holding Edgewood rows. READ-ONLY outside the self-test, which writes only a temp table it rolls back.
# Called by scripts/guards-sweep.sh (before / after the sweep) and by the Playwright global setup /
# teardown. It lives outside scripts/guards/ on purpose: it is a before/after pair, not a one-shot guard.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
CO=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
mode="${1:-}"; file="${2:-}"
psqlx() { docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=1 "$@" </dev/null; }

# The per-row hash, projected onto a column list. $1 = the table expression alias, $2 = the column array.
ROWHASH='md5(coalesce(string_agg(md5((select coalesce(jsonb_object_agg(e.key, e.value), %L::jsonb) from jsonb_each(to_jsonb(x)) e where e.key = any(%L::text[]))::text), %L order by md5((select coalesce(jsonb_object_agg(e.key, e.value), %L::jsonb) from jsonb_each(to_jsonb(x)) e where e.key = any(%L::text[]))::text)), %L))'

# take [<table|cols ...> pairs on stdin-like var]: print "table count hash cols=a,b,c" for every table.
# With PROJ set (from a snapshot), each table is hashed over the snapshot's columns.
take() {
  local proj_sql="${1:-}"
  [ -n "$proj_sql" ] || proj_sql='{}' 
  psqlx -c "set default_transaction_read_only = on;" -c "
do \$\$
declare r record; n bigint; h text; cols text[]; proj jsonb := '${proj_sql}'::jsonb;
begin
  for r in select 'companies'::text as table_name, 'id'::text as key_col
           union all
           select c.table_name::text, 'company_id'
             from information_schema.columns c
             join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
            where c.table_schema = 'public' and c.column_name = 'company_id'
            order by 1
  loop
    if proj ? r.table_name then
      select array_agg(v) into cols from jsonb_array_elements_text(proj -> r.table_name) v;
    else
      select array_agg(column_name::text order by ordinal_position) into cols
        from information_schema.columns where table_schema = 'public' and table_name = r.table_name;
    end if;
    execute format('select count(*), ' || '$ROWHASH' || ' from public.%I x where x.%I::text = %L',
                   '{}', cols, '', '{}', cols, '-', r.table_name, r.key_col, '$CO') into n, h;
    raise notice '% % % cols=%', r.table_name, n, h, array_to_string(cols, ',');
  end loop;
end \$\$;" 2>&1 | sed -n 's/^NOTICE:  //p'
}

# the snapshot's column lists, as a jsonb object {table: [cols]}
proj_of() { awk '{ sub(/^cols=/, "", $4); printf "%s\t%s\n", $1, $4 }' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o={};for(const l of s.trim().split("\n")){const [t,c]=l.split("\t");o[t]=c?c.split(","):[]}process.stdout.write(JSON.stringify(o).replace(/'"'"'/g,"'"'"''"'"'"))})'; }

case "$mode" in
  snapshot)
    [ -n "$file" ] || { echo "usage: $0 snapshot <file>"; exit 2; }
    out=$(take)
    [ "$(printf '%s\n' "$out" | grep -c .)" -gt 1 ] || { echo "guard: FAIL could not snapshot company $CO"; exit 1; }
    printf '%s\n' "$out" > "$file"
    echo "edgewood-unchanged: snapshot of $(printf '%s\n' "$out" | grep -c .) table(s) → $file"
    ;;
  compare)
    [ -n "$file" ] || { echo "usage: $0 compare <file>"; exit 2; }
    [ -s "$file" ] || { echo "guard: FAIL no snapshot at $file"; exit 1; }
    now=$(take "$(proj_of "$file")")
    # a table absent from the snapshot only matters if it now holds Edgewood rows
    moved=$(diff <(awk '{print $1, $2, $3}' "$file") <(printf '%s\n' "$now" | awk '{print $1, $2, $3}') \
      | sed -n 's/^> \([^ ]*\) \([0-9]*\) .*/\1 \2/p' \
      | while read -r t n; do grep -q "^$t " "$file" || [ "$n" != 0 ] && echo "$t (now $n rows)"; done)
    gone=$(comm -23 <(awk '{print $1}' "$file" | sort) <(printf '%s\n' "$now" | awk '{print $1}' | sort) | sed 's/$/ (table gone)/')
    if [ -z "$moved$gone" ]; then
      echo "guard: PASS Edgewood unchanged — $(grep -c . "$file") table(s) identical over their snapshotted columns"
    else
      echo "guard: FAIL Edgewood CHANGED during the run:"; printf '%s\n' "$moved" "$gone" | grep . | sed 's/^/  /'
      exit 1
    fi
    ;;
  selftest)
    # On a TEMP copy of Edgewood's companies row, inside a transaction that is rolled back: the projected hash
    # holds when a column is ADDED (nullable and with a default), and moves when a snapshotted VALUE changes.
    out=$(psqlx -c "
begin;
create temp table e1_probe on commit drop as select * from public.companies where id = '$CO';
create temp table e1_h (step text, h text) on commit drop;
do \$\$ declare cols text[]; h text; begin
  select array_agg(column_name::text order by ordinal_position) into cols from information_schema.columns where table_name = 'e1_probe';
  execute format('select ' || '$ROWHASH' || ' from e1_probe x', '{}', cols, '', '{}', cols, '-') into h; insert into e1_h values ('before', h);
  alter table e1_probe add column e1_nullable int;
  alter table e1_probe add column e1_defaulted text not null default 'x';
  execute format('select ' || '$ROWHASH' || ' from e1_probe x', '{}', cols, '', '{}', cols, '-') into h; insert into e1_h values ('added', h);
  update e1_probe set name = name || ' (changed)';
  execute format('select ' || '$ROWHASH' || ' from e1_probe x', '{}', cols, '', '{}', cols, '-') into h; insert into e1_h values ('changed', h);
end \$\$;
select string_agg(step || '=' || h, ' ' order by step) from e1_h;
rollback;" 2>&1 | grep "=" | tail -1)
    b=$(echo "$out" | grep -o 'before=[0-9a-f]*' | cut -d= -f2); a=$(echo "$out" | grep -o 'added=[0-9a-f]*' | cut -d= -f2); c=$(echo "$out" | grep -o 'changed=[0-9a-f]*' | cut -d= -f2)
    if [ -n "$b" ] && [ "$a" = "$b" ] && [ "$c" != "$b" ]; then
      echo "guard: PASS self-test: an added column leaves the hash as it was; a changed value moves it"
    else
      echo "guard: FAIL self-test: before=$b added=$a changed=$c"; exit 1
    fi
    ;;
  *) echo "usage: $0 snapshot|compare <file> | selftest"; exit 2 ;;
esac
