#!/usr/bin/env bash
# ── SIGNAL CONTENT IDENTITY GUARD (SP-426, operator brief 2026-11-19) ────────────────────────────
#
# A counter over `signals` must count DISTINCT SENTENCES, not rows: a document analysed more than
# once stores the same sentence many times (SP-F49), and duplication exists within one run too, so
# retiring superseded rows cannot by itself make a count right. `signals.content_identity` is that
# identity. It is stamped in TypeScript by signalContentIdentity() because the SQL/TS parity ruling
# (contentIdentity.ts:6-9) rejected a SQL re-implementation — Postgres POSIX \s diverges from JS \s
# on Unicode whitespace.
#
# Read-only against live data: every check is a SELECT or a grep. No fixture company, no write.
#
#   s1  the column and its partial index exist
#   s2  every row with a non-blank excerpt carries an identity (CB1 excluded, see s3)
#   s3  CB1 (58b2b15b) carries NO identity at all — SP-426 says it is never written, and a NULL
#       identity is never folded, so CB1's counts are the pre-slice row counts
#   s4  every signal INSERT site stamps the identity through withContentIdentity()
#   s5  the beat-2 fold keys on the identity rule, and still keys on the HOST (R4: "strong" means
#       recurrence across INDEPENDENT sources, so one sentence on two hosts is two sightings)
#   s6  no stored identity disagrees with the normalized form of its own excerpt
#
# Plant (injected live, RED, restored md5-identical, GREEN):
#   P1  drop withContentIdentity() from one mint site  => s4 FAILED
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
CB1=58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
fail() { echo "FAIL $1: $2"; echo "guard: RED"; exit 1; }
q() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }

# s1 ── the column and the index
COL=$(q "select count(*) from information_schema.columns where table_name='signals' and column_name='content_identity'")
[ "$COL" = "1" ] || fail s1 "signals.content_identity is missing"
IDX=$(q "select count(*) from pg_indexes where tablename='signals' and indexname='signals_content_identity'")
[ "$IDX" = "1" ] || fail s1 "index signals_content_identity is missing"
echo "s1. signals.content_identity and its partial index exist"

# s2 ── every identifiable row on a REAL company is identified
#
# SCOPED TO NON-THROWAWAY COMPANIES (SP-435). The identity is stamped in TypeScript by the mint path,
# and 13 guard scripts insert signals in raw SQL as fixtures — they CANNOT stamp a correct identity,
# because computing it in SQL is forbidden (contentIdentity.ts:6-9, the PCT-1 ruling). So an
# unstamped fixture row is expected, not a defect: a NULL identity is never folded, so the row counts
# once, which is the pre-slice behaviour.
#
# The marker is the STORED column, never a name pattern. R40
# (supabase/migrations/20261020020000_companies_fixture_hold.sql:1-5): "a test fixture is HELD by a
# stored column, not by convention. companies.fixture_hold carries the hold reason … and is null for
# every real client. Every reader that feeds a fleet sweep or a client surface excludes a non-null
# row." This check is such a reader. Same test as 20261113180000_voice_gate_on_enqueue.sql:62.
MISSING=$(q "select count(*) from public.signals s join public.companies c on c.id = s.company_id
             where s.company_id <> '$CB1' and c.fixture_hold is null
               and btrim(coalesce(s.evidence_excerpt,'')) <> '' and s.content_identity is null")
EXCLUDED=$(q "select count(*) from public.signals s join public.companies c on c.id = s.company_id
              where c.fixture_hold is not null
                and btrim(coalesce(s.evidence_excerpt,'')) <> '' and s.content_identity is null")
HELD_COS=$(q "select count(*) from public.companies where fixture_hold is not null")
[ "$MISSING" = "0" ] || fail s2 "$MISSING row(s) on a real company carry a non-blank excerpt and no content_identity"
echo "s2. every non-CB1 row on a real company with a non-blank excerpt carries an identity"
echo "    (excluded: $EXCLUDED unstamped fixture row(s) across $HELD_COS companies held by fixture_hold — SP-435)"

# s3 ── CB1 is never written
CB1_ID=$(q "select count(*) from public.signals where company_id='$CB1' and content_identity is not null")
[ "$CB1_ID" = "0" ] || fail s3 "$CB1_ID CB1 row(s) carry an identity — SP-426 says CB1 is never written"
CB1_ROWS=$(q "select count(*) from public.signals where company_id='$CB1'")
echo "s3. CB1 carries no identity on any of its $CB1_ROWS rows (never written; NULL is never folded)"

# s4 ── every mint site stamps it
SITES=$(grep -rn 'from("signals")' --include='*.ts' supabase/functions src 2>/dev/null \
        | grep -v '\.test\.' | grep -E '\.insert|\.upsert' || true)
N=$(printf '%s\n' "$SITES" | grep -c . || true)
[ "$N" -ge 5 ] || fail s4 "found only $N signal insert site(s), expected at least 5 — the census is stale"
BAD=$(printf '%s\n' "$SITES" | grep -v 'withContentIdentity' || true)
[ -z "$BAD" ] || fail s4 "insert site(s) do not stamp the identity: $(printf '%s' "$BAD" | cut -d: -f1,2 | tr '\n' ' ')"
echo "s4. all $N signal insert sites stamp the identity through withContentIdentity()"

# s5 ── the fold reads the identity rule, and keeps the host
M=src/views/client/firstReadPreview/mapping.ts
grep -qF 'const key = `${it.host}||${normalizeForHash(it.signal.text)}`' $M \
  || fail s5 "the beat-2 fold no longer keys on (host, normalizeForHash(text))"
echo "s5. the beat-2 fold keys on (host, identity) — host kept, so cross-host recurrence still counts"

# s6 ── no identity disagrees with its own excerpt
#   The comparison is the SQL normalization, which is why it is a cross-check and not the authority:
#   it can only differ from the TS rule on Unicode whitespace, and any hit is worth a look either way.
DIFF=$(q "select count(*) from public.signals
          where content_identity is not null
            and content_identity <> btrim(lower(regexp_replace(coalesce(evidence_excerpt,''),'\s+',' ','g')))")
[ "$DIFF" = "0" ] || fail s6 "$DIFF stored identity/identities disagree with the normalized form of their excerpt"
echo "s6. no stored identity disagrees with the normalized form of its own excerpt"

echo "GUARD OK"
