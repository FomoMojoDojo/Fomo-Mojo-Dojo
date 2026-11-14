#!/usr/bin/env python3
"""SP-264: a guard deletes or updates ONLY rows it created, by its own fixture ids.

Scans every script under scripts/guards for a DELETE or UPDATE on a shared table that carries no
WHERE clause. Prints one line per finding and exits 1 if there are any.

WHY A SCRIPT AND NOT A grep. The statements are multi-line and often sit inside compound SQL
(`begin; set local ...; delete from x where ...`), so a line-oriented grep reports the wrong table and
splits on a semicolon that PRECEDES the statement. Both mistakes were made while writing this: a
naive version reported six findings, five of which had a WHERE on the following line. The boundary
that matters is from the match to its OWN terminator.

WHY IT EXISTS. ingest-queue-guard q18 ran an unscoped `delete from ingest_single_flight` to install
its own fixture lock — the lock table's primary key is a constant, so there is only ever one row and
deleting whatever was there was the easy way to get the slot. On 2026-11-13 it took the Charter 10-Q's
claim at window 10 of 17 and broke a live analysis. A guard that corrupts the thing it checks is worse
than no guard.
"""
import glob
import os
import re
import sys

SHARED = (
    "ingest_single_flight|file_proposals|file_proposal_chunks|file_proposal_extracts|"
    "company_run_locks|long_runner_runs|signals|claims|companies|input_files|"
    "integrity_runs|model_calls|doc_voice_verdicts"
)
PATTERN = re.compile(r"\b(delete\s+from|update)\s+(?:public\.)?(" + SHARED + r")\b", re.I)


def scan(root: str) -> list[tuple[str, int, str, str, str]]:
    findings = []
    for path in sorted(glob.glob(os.path.join(root, "*.sh"))):
        lines = open(path, encoding="utf-8").read().split("\n")
        for i, line in enumerate(lines):
            if line.strip().startswith("#"):
                continue                      # prose describing a statement is not a statement
            for m in PATTERN.finditer(line):
                # from the match to ITS OWN terminator, which may be several lines down
                rest = line[m.end():] + "\n" + "\n".join(lines[i + 1:i + 8])
                statement = re.split(r";", rest)[0]
                if not re.search(r"\bwhere\b", statement, re.I):
                    findings.append((
                        path, i + 1, m.group(1).lower(), m.group(2),
                        line[m.start():m.start() + 110].strip(),
                    ))
    return findings


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "scripts/guards"
    found = scan(root)
    for path, line, op, table, text in found:
        print(f"UNSCOPED {path}:{line} [{op} {table}] {text}")
    print(f"scanned {len(glob.glob(os.path.join(root, '*.sh')))} guard script(s); "
          f"{len(found)} unscoped statement(s)")
    sys.exit(1 if found else 0)
