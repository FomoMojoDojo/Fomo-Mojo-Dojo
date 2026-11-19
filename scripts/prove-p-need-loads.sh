#!/usr/bin/env bash
# SP-433 step 7 — prove that a PROPOSED need's labels load once it exists as an odi_needs row.
#
# On a THROWAWAY company, never Charter: the composite FK (signal_id, company_id) means a company can
# only label its OWN signals, so the proof must own both the need and the quotes. The corpus is a
# small proof corpus, md5-pinned exactly as Charter's is — the gate is the same gate, not a relaxed one.
#
# Self-cleaning: the company, its need, its signals, its labels and the proof corpus are all removed
# at the end, pass or fail.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
CO=0c900000-0000-4000-8000-0000000c0433
CORPUS=/tmp/sp433-proof-corpus.json
q() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
# an id capture takes the FIRST line only: a trigger on the table can add a command tag to
# the output, and a captured newline corrupted the proof corpus JSON on the first run.
q1() { q "$1" 2>/dev/null | head -1 | tr -d "\r\n"; }
cleanup() {
  q "delete from public.need_evidence where company_id='$CO';
     delete from public.odi_needs where company_id='$CO';
     delete from public.signals where company_id='$CO';
     delete from public.companies where id='$CO';" >/dev/null 2>&1 || true
  rm -f "$CORPUS"
}
trap cleanup EXIT
cleanup

OWNER=$(q1 "select id from auth.users limit 1")
q "insert into public.companies (id, name, website, created_by, fixture_hold)
   values ('$CO','sp433-throwaway-p-need-load','sp433.example','$OWNER','SP433:test_fixture')" >/dev/null 2>&1

# the P need, as it would exist AFTER the operator accepts its card
NEED=$(q1 "insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number, step_label,
            desired_outcome, source_path, provenance_type, evidence_voice, status)
          values ('$CO','$OWNER','need','market','customer',0,'',
            'Reduce the effort required to sign in to the TV and account apps',
            'outside_voice_read','outside_review_derived','outside','active') returning id")
echo "need:   $NEED  (source_path outside_voice_read, provenance outside_review_derived)"

# three review-lane quotes of ITS OWN
S1=$(q1 "insert into public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, source_url, event_date)
        values ('$CO','public_baseline_run','outside','outside_voice_about_client','a','PROOF quote one','https://apps.apple.com/us/app/x','2026-10-01') returning id")
S2=$(q1 "insert into public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, source_url, event_date)
        values ('$CO','public_baseline_run','outside','outside_voice_about_client','b','PROOF quote two','https://play.google.com/store/apps/details?id=x','2026-10-02') returning id")
S3=$(q1 "insert into public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, source_url, event_date)
        values ('$CO','public_baseline_run','outside','outside_voice_about_client','c','PROOF quote three','https://www.trustpilot.com/review/x',null) returning id")

cat > "$CORPUS" <<JSON
{"what":"SP-433 proof corpus","rubric":"need-match-rubric-v4 (7736a27727323339ac1cb55ca74c5eab)",
 "needs":{"P6":"Reduce the effort required to sign in to the TV and account apps"},
 "quotes":{"$S1":{"brand":"spectrum","text":"PROOF quote one"},
           "$S2":{"brand":"spectrum","text":"PROOF quote two"},
           "$S3":{"brand":"cox","text":"PROOF quote three"}},
 "labels":[{"signal_id":"$S1","need":"P6","bears":true,"polarity":"not working","label_source":"full_read"},
           {"signal_id":"$S2","need":"P6","bears":true,"polarity":"working","label_source":"full_read"},
           {"signal_id":"$S3","need":"P6","bears":false,"polarity":null,"label_source":"full_read"}]}
JSON
MD5=$(md5 -q "$CORPUS")
echo "corpus: $CORPUS  md5 $MD5"

echo "--- the md5 gate still refuses a wrong md5 ---"
if deno run -A scripts/load-need-evidence.ts --corpus="$CORPUS" --md5=deadbeef --company="$CO" --apply >/dev/null 2>&1; then
  echo "FAIL: a wrong md5 was accepted"; exit 1
fi
echo "ok   a wrong md5 is refused"

echo "--- load P6's labels ---"
LOAD=$(deno run -A scripts/load-need-evidence.ts --corpus="$CORPUS" --md5="$MD5" --company="$CO" --apply 2>&1) || { echo "LOADER FAILED:"; echo "$LOAD"; exit 1; }
echo "$LOAD" | grep -E "mapped|rows to load|APPLIED|DEFERRED"

ROWS=$(q "select count(*) from public.need_evidence where company_id='$CO'")
BEARS=$(q "select count(*) from public.need_evidence where company_id='$CO' and bears")
JUDGED=$(q "select distinct judged_by from public.need_evidence where company_id='$CO'")
NEEDID=$(q "select distinct need_id::text from public.need_evidence where company_id='$CO'")
[ "$ROWS" = "3" ] || { echo "FAIL: expected 3 labels, got $ROWS"; exit 1; }
[ "$BEARS" = "2" ] || { echo "FAIL: expected 2 bearing, got $BEARS"; exit 1; }
[ "$JUDGED" = "cc_read_unchecked" ] || { echo "FAIL: judged_by is $JUDGED"; exit 1; }
[ "$NEEDID" = "$NEED" ] || { echo "FAIL: labels landed on $NEEDID, not the P need $NEED"; exit 1; }
echo "ok   3 labels on the P need, 2 bearing, all cc_read_unchecked"

# and the SP-406 counting reads them: 2 bearing, the undated Cox one not counted
echo "PROOF OK — a P need's labels load from an md5-gated corpus once the need exists as a row"
