#!/usr/bin/env bash
# ============================================================================
# DESTRUCTIVE SQL CHECKER
#
# Scans seed files, migration files, and SQL scripts for destructive SQL
# statements without a safety marker comment.
#
# Required marker (must appear within 3 lines before the statement):
#   -- destructive-ok: <reason why this is safe>
#
# Usage:
#   ./scripts/check-destructive-sql.sh           # exits 1 on violations
#   npm run db:check-destructive
#
# Patterns checked:
#   DELETE FROM, TRUNCATE, DROP TABLE, DROP SCHEMA, ALTER TABLE ... DROP
#   Unguarded UPDATE on workspace tables (seeds/scripts only, not migrations)
# ============================================================================

set -euo pipefail

python3 - "$@" << 'PYEOF'
import sys, os, re, pathlib

SCAN_DIRS = [
    "supabase/seeds",
    "supabase/migrations",
    "sql",
    "scripts",
]

# Always require a marker for these patterns
DESTRUCTIVE_PATTERNS = [
    re.compile(r'DELETE\s+FROM', re.IGNORECASE),
    re.compile(r'\bTRUNCATE\b', re.IGNORECASE),
    re.compile(r'\bDROP\s+TABLE\b', re.IGNORECASE),
    re.compile(r'\bDROP\s+SCHEMA\b', re.IGNORECASE),
    re.compile(r'ALTER\s+TABLE.*DROP\s+COLUMN', re.IGNORECASE),
]

# Sensitive table patterns — UPDATE on these requires a marker (seeds/scripts only)
SENSITIVE_UPDATE_TABLES = [
    re.compile(r'public\.companies', re.IGNORECASE),
    re.compile(r'public\.routes', re.IGNORECASE),
    re.compile(r'public\.odi_needs', re.IGNORECASE),
    re.compile(r'public\.job_steps', re.IGNORECASE),
    re.compile(r'public\.odi_market_definitions', re.IGNORECASE),
    re.compile(r'public\.positioning_canvases', re.IGNORECASE),
    re.compile(r'public\.strategy_cascades', re.IGNORECASE),
    re.compile(r'public\.inputs\b', re.IGNORECASE),
    re.compile(r'public\.input_files', re.IGNORECASE),
    re.compile(r'public\.opportunities', re.IGNORECASE),
]

MARKER_RE = re.compile(r'destructive-ok:', re.IGNORECASE)
UPDATE_RE  = re.compile(r'^\s*UPDATE\s', re.IGNORECASE)
COMMENT_RE = re.compile(r'^\s*(--|#)')

violations = 0
scanned = 0

def is_migration(path_str):
    return 'supabase/migrations' in path_str.replace('\\', '/')

def check_file(fpath):
    global violations, scanned
    if fpath.suffix not in ('.sql', '.sh'):
        return
    scanned += 1
    migration = is_migration(str(fpath))

    try:
        lines = fpath.read_text(encoding='utf-8', errors='replace').splitlines()
    except Exception as e:
        print(f"  WARN: could not read {fpath}: {e}")
        return

    for i, line in enumerate(lines):
        if COMMENT_RE.match(line):
            continue

        needs_check = False
        reason = ''

        # Always check destructive patterns
        for pat in DESTRUCTIVE_PATTERNS:
            if pat.search(line):
                needs_check = True
                reason = pat.pattern
                break

        # Check sensitive UPDATEs only in seeds/scripts (not migrations)
        if not needs_check and not migration:
            if UPDATE_RE.match(line):
                # Check next 5 lines for the table name
                window = ' '.join(lines[i:i+6])
                for tpat in SENSITIVE_UPDATE_TABLES:
                    if tpat.search(window):
                        needs_check = True
                        reason = f'UPDATE on sensitive table ({tpat.pattern})'
                        break

        if needs_check:
            # Look back 8 lines for marker (CTEs place DELETE/UPDATE 4-7 lines after WITH keyword)
            marked = any(MARKER_RE.search(lines[k]) for k in range(max(0, i-8), i+1))
            if not marked:
                print(f"VIOLATION: {fpath}:{i+1} — {reason}")
                print(f"  Line: {line[:120]}")
                print(f"  Fix:  Add '-- destructive-ok: <reason>' within 3 lines before this statement.")
                print()
                violations += 1

print("=== Destructive SQL Check ===")
print(f"Scanning: {' '.join(SCAN_DIRS)}")
print()

for d in SCAN_DIRS:
    dp = pathlib.Path(d)
    if dp.is_dir():
        for fpath in sorted(dp.rglob('*')):
            if fpath.is_file():
                check_file(fpath)

print(f"Scanned {scanned} files.")

if violations > 0:
    print()
    print(f"Found {violations} violation(s). Each destructive statement must have:")
    print("  -- destructive-ok: <explanation of why this is safe>")
    print("within 3 lines before the statement.")
    print()
    print("See docs/DATA_SAFETY.md for guidance.")
    sys.exit(1)
else:
    print("No violations found. All destructive statements are marked safe.")

PYEOF
