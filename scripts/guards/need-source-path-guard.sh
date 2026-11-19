#!/usr/bin/env bash
# ── NEED SOURCE_PATH GUARD (SP-415, operator brief 2026-11-19) ───────────────────────────────────────
#
# odi_needs.source_path is the column that decides whether a need's content may reach an outside
# model: needRestsOnPrivateSource (supabase/functions/_shared/externalProvenance.ts) is an ALLOWLIST
# whose only public member is 'public_research'. The column used to carry
# `NOT NULL DEFAULT 'public_research'`, so an insert that omitted it landed on the PUBLIC value and
# was admitted externally. SP-415 dropped that default and constrained the column's shape.
#
# Read-only against live data: every check is a SELECT or a grep. No fixture company, no write.
#
#   n1  the default is GONE and the column is still NOT NULL — an omitted source_path now fails loudly
#   n2  constraint odi_needs_source_path_shape exists, and is NOT VALID (VALIDATE is out of scope:
#       6 legacy Cafe Barra rows carry free prose and are not reconciled)
#   n3  PUBLIC_NEED_SOURCE_PATHS is EXACTLY {public_research} — the SP-404 assertion. A second value
#       added to that set turns this RED, which is the only mechanical proof available, because the
#       database cannot carry the public/private distinction (the column also holds storage paths).
#   n4  'outside_voice_read' appears in NEITHER the TS public set NOR the CHECK (SP-404: private by
#       default; permitting it in the column would be a separate, visible act)
#   n5  every odi_needs INSERT site in the tree names source_path explicitly — product code, migrations
#       AND scripts/guards fixtures (SP-420) — so a new path cannot
#       rely on a default that no longer exists
#   n6  fleet-wide: no need whose source_path is the public value also carries an upload marker, an
#       interview_record_id or a source_proposal_id
#
# Plant (injected live, RED, restored md5-identical, GREEN):
#   P1  add "outside_voice_read" to PUBLIC_NEED_SOURCE_PATHS  => n3 FAILED (measured 2026-11-19;
#       n4 asserts the same value from the other side, but n3 short-circuits first)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
EP=supabase/functions/_shared/externalProvenance.ts
fail() { echo "FAIL $1: $2"; echo "guard: RED"; exit 1; }
q() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

# n1 ── the default is gone, NOT NULL stands
DEF=$(q "select coalesce(column_default,'∅') from information_schema.columns
         where table_name='odi_needs' and column_name='source_path'")
NUL=$(q "select is_nullable from information_schema.columns
         where table_name='odi_needs' and column_name='source_path'")
[ "$DEF" = "∅" ] || fail n1 "source_path still has a default: $DEF (an omitted insert would fail OPEN to public)"
[ "$NUL" = "NO" ] || fail n1 "source_path is nullable ($NUL) — a NULL would read as unknown"
echo "n1. odi_needs.source_path has NO default and is NOT NULL — an omitted source_path fails loudly"

# n2 ── the shape constraint, NOT VALID
CON=$(q "select coalesce(convalidated::text,'∅') from pg_constraint
         where conrelid='public.odi_needs'::regclass and conname='odi_needs_source_path_shape'")
[ -n "$CON" ] || fail n2 "constraint odi_needs_source_path_shape is missing"
case "$CON" in f|false) : ;; *) fail n2 "constraint is validated (convalidated=$CON); SP-415 signed it NOT VALID" ;; esac
echo "n2. constraint odi_needs_source_path_shape present and NOT VALID"

# n3 ── PUBLIC_NEED_SOURCE_PATHS is exactly {public_research}
LINE=$(grep -n 'PUBLIC_NEED_SOURCE_PATHS' "$EP" | grep 'new Set' || true)
[ -n "$LINE" ] || fail n3 "PUBLIC_NEED_SOURCE_PATHS definition not found in $EP"
MEMBERS=$(printf '%s' "$LINE" | sed 's/.*new Set(\[//; s/\]).*//' | tr -d ' "' | tr ',' '\n' | grep -v '^$' | sort | paste -sd, -)
[ "$MEMBERS" = "public_research" ] \
  || fail n3 "PUBLIC_NEED_SOURCE_PATHS is {$MEMBERS}, expected exactly {public_research}"
echo "n3. PUBLIC_NEED_SOURCE_PATHS is exactly {public_research} ($EP)"

# n4 ── outside_voice_read is nowhere near public
grep -q 'outside_voice_read' "$EP" \
  && fail n4 "'outside_voice_read' appears in $EP — SP-404 signs it private by default, so it must be absent"
CHECKDEF=$(q "select pg_get_constraintdef(oid) from pg_constraint
              where conrelid='public.odi_needs'::regclass and conname='odi_needs_source_path_shape'")
printf '%s' "$CHECKDEF" | grep -q 'outside_voice_read' \
  && fail n4 "the CHECK permits 'outside_voice_read'; SP-415 signed it absent"
echo "n4. 'outside_voice_read' is in neither the TS public set nor the CHECK"

# n5 ── every odi_needs INSERT site names source_path
# An insert site is `from("odi_needs")` with `.insert(`/`.upsert(` on the same line or within the
# next 3 lines. A SELECT on odi_needs is not a site; nor is an insert into another table.
TS_HITS=$(grep -rn --include='*.ts' --include='*.tsx' 'from("odi_needs")' supabase/functions src 2>/dev/null \
          | grep -v '\.test\.' | awk -F: '{print $1":"$2}')
MISSING=""; SITES=0
for hit in $TS_HITS; do
  f=${hit%%:*}; l=${hit##*:}
  WINDOW=$(awk -v L="$l" 'NR>=L && NR<=L+3' "$f")
  printf '%s' "$WINDOW" | grep -qE '\.(insert|upsert)\(' || continue
  SITES=$((SITES+1))
  # the payload: an inline object literal is in the next 30 lines; a pre-built variable
  # (`.insert(needsPayload)`) is resolved to where it is constructed.
  PAYLOAD=$(awk -v L="$l" 'NR>=L && NR<=L+30' "$f")
  if ! printf '%s' "$PAYLOAD" | grep -q 'source_path'; then
    ARG=$(printf '%s' "$WINDOW" | tr '\n' ' ' | sed -E 's/.*\.(insert|upsert)\(//; s/[),].*//' | tr -d ' ')
    RESOLVED=""
    case "$ARG" in
      ''|'{'*|'['*) : ;;
      *) DEF=$(grep -nE "(const|let|var)[[:space:]]+$ARG[[:space:]]*=" "$f" | head -1 | cut -d: -f1)
         [ -n "$DEF" ] && RESOLVED=$(awk -v D="$DEF" 'NR>=D && NR<=D+40' "$f") ;;
    esac
    printf '%s' "$RESOLVED" | grep -q 'source_path' || MISSING="$MISSING $f:$l"
  fi
done
SQL_SITES=$(grep -rl 'insert into public.odi_needs' supabase/migrations/*.sql 2>/dev/null | sort -u)
for f in $SQL_SITES; do
  SITES=$((SITES+1))
  awk '/insert into public\.odi_needs/,/;/' "$f" | grep -q 'source_path' || MISSING="$MISSING $f"
done
# SP-420 (2026-11-19): the guard FIXTURES are insert sites too. SP-415 dropped the default and six
# guards went RED because their fixtures relied on it; the first version of this check scanned only
# supabase/functions, src and supabase/migrations, so it could not have caught them.
SHELL_REPORT=$(python3 - <<'PYEOF'
import re, glob
pat = re.compile(r'insert\s+into\s+(?:public\.)?odi_needs\b([^;]*?)(?:values|select)', re.I | re.S)
cols_pat = re.compile(r'\(([^)]*)\)', re.S)
var_pat = re.compile(r'\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?')
bad, sites = [], 0
for f in sorted(glob.glob("scripts/guards/*.sh")):
    src = open(f).read()
    for m in pat.finditer(src):
        sites += 1
        line = src[:m.start()].count("\n") + 1
        cm = cols_pat.search(m.group(1))
        if not cm:
            bad.append(f"{f}:{line} (no column list — positional insert)"); continue
        cols = cm.group(1)
        if "source_path" in cols:
            continue
        # a column list held in a shell variable (e.g. $NEED_COLS) is resolved against the file
        resolved = False
        for v in var_pat.findall(cols):
            for dm in re.finditer(rf'^\s*{v}=(.*)$', src, re.M):
                if "source_path" in dm.group(1):
                    resolved = True
        if not resolved:
            bad.append(f"{f}:{line}")
print(f"SITES={sites}")
for b in bad:
    print(f"BAD={b}")
PYEOF
) || fail n5 "the shell-fixture scan failed to run"
SHELL_SITES=$(printf '%s' "$SHELL_REPORT" | sed -n 's/^SITES=//p')
SHELL_BAD=$(printf '%s' "$SHELL_REPORT" | sed -n 's/^BAD=/ /p' | tr '\n' ' ')
[ -z "${SHELL_BAD// /}" ] || fail n5 "guard fixture insert site(s) do not name source_path:$SHELL_BAD"
[ "${SHELL_SITES:-0}" -ge 10 ] || fail n5 "found only ${SHELL_SITES:-0} odi_needs insert sites under scripts/guards, expected at least 10 — the census is stale"
SITES=$((SITES + SHELL_SITES))

[ -z "$MISSING" ] || fail n5 "insert site(s) do not name source_path:$MISSING"
[ "$SITES" -ge 15 ] || fail n5 "found only $SITES odi_needs insert sites, expected at least 15 — the census is stale"
echo "n5. every odi_needs insert site names source_path explicitly ($SITES sites: product code, migrations AND scripts/guards)"

# n6 ── fleet: a public-source need never rests on private material
BAD=$(q "select count(*) from public.odi_needs
         where source_path = 'public_research'
           and ( interview_record_id is not null
              or source_proposal_id is not null
              or step_label like 'Upload-derived%'
              or step_label like 'Reanalyzed existing file%'
              or frameworks_used && array['Local Upload Analysis','Existing File Reanalysis'] )")
[ "$BAD" = "0" ] || fail n6 "$BAD public-source need(s) carry a private marker"
echo "n6. no public-source need carries an upload marker, an interview id or a proposal id (fleet-wide)"

echo "GUARD OK"
