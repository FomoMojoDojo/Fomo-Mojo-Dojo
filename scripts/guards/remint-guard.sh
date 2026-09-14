#!/usr/bin/env bash
# GUARD — re-mint of upload provenance (mechanism signed 2026-09-13; remint-upload-provenance).
#
# Runs against the LOCAL stack on a THROWAWAY company it creates and deletes (cascade) — never a client
# company, never a client document. Seeds the PRE-authorship state by hand (a legacy proposal whose org-band
# signals carry no upload_origin, backing an internal_declared claim promoted to diagnose), plus verdict rows
# so the classifier is never called. Proves, in order:
#   a. IDEMPOTENT: the second apply supersedes 0, mints 0, strikes 0 and writes no ledger row
#   b. HISTORY: the old signals survive with superseded_reason='remint_authorship_v2' and their raw_payload
#      records the from/to origin; the struck claim survives with its refs, reason and claim_events row
#   c. 'us' does not speak: the minted signals are organization-band voice_class='analysis' at
#      minting_version 2 and back NO claim; no internal_declared claim is live for the document
#   d. OVERRIDE UNTOUCHED: a second document whose July-style override says client_voice is resolved
#      'client' — its live signals are left alone (change='none') and its override rows are unchanged
#   e. DOWNSTREAM COMPLETE: no active claim in the company has every backing signal superseded
#   f. DRY RUN writes nothing (ledger, signals, claims all unchanged)
# Exit 0 = every proof held.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aaac"
IN="00000000-0000-4000-8000-00000000ab01"
F_US="00000000-0000-4000-8000-00000000ab10"; F_OV="00000000-0000-4000-8000-00000000ab20"
P_US="00000000-0000-4000-8000-00000000ab11"; P_OV="00000000-0000-4000-8000-00000000ab21"
CL="00000000-0000-5000-8000-00000000ab12"
PREFIX="zz-throwaway/remint"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() {
  curl -s -X DELETE "$API/storage/v1/object/input-files" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "{\"prefixes\":[\"$PREFIX/us.md\",\"$PREFIX/us.md.extracted.txt\",\"$PREFIX/ov.md\",\"$PREFIX/ov.md.extracted.txt\"]}" >/dev/null || true
  # a struck claim refuses deletion (struck-preservation law): restore the throwaway's struck claims first (the strike is reversible by law)
  psql "select set_claim_status(id, 'active', 'guard cleanup', 'guard') from claims where company_id='$CO' and status='struck'" >/dev/null 2>&1 || true
  psql "begin; set local app.remint_ledger_purge = 'on'; delete from provenance_remints where company_id='$CO'; delete from long_runner_runs where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO'; commit;" >/dev/null || true
}
remint() { curl -s --max-time 600 -X POST "$API/functions/v1/remint-upload-provenance" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$1"; }
sha() { python3 -c "import hashlib,sys,re; t=sys.argv[1]; n=re.sub(r'\s+',' ',t.lower()).strip(); print(hashlib.sha256(n.encode()).hexdigest())" "$1"; }

cleanup
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway remint guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into inputs (id, company_id, user_id, input_key, input_label) values ('$IN', '$CO', (select id from auth.users order by created_at limit 1), 'zz_remint', 'ZZ remint')" >/dev/null
TEXT_US="Advisor memo: the organisation should treat care navigation as a funded service. Families wait three weeks for a first appointment."
TEXT_OV="Our mission is to be the heart of youth mental health. Families wait three weeks for a first appointment at our clinics."
for pair in "us:$TEXT_US" "ov:$TEXT_OV"; do k=${pair%%:*}; t=${pair#*:}; printf '%s' "$t" > "/tmp/zz-$k.md"; printf '%s' "$t" > "/tmp/zz-$k.md.extracted.txt"
  curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/$k.md" -H "Authorization: Bearer $SR" -H "Content-Type: text/markdown" -H "x-upsert: true" --data-binary "@/tmp/zz-$k.md"
  curl -s -o /dev/null -X POST "$API/storage/v1/object/input-files/$PREFIX/$k.md.extracted.txt" -H "Authorization: Bearer $SR" -H "Content-Type: text/plain" -H "x-upsert: true" --data-binary "@/tmp/zz-$k.md.extracted.txt"; done
SHA_US=$(sha "$TEXT_US"); SHA_OV=$(sha "$TEXT_OV")
psql "insert into input_files (id, input_id, file_name, file_type, file_path, tags) values ('$F_US','$IN','guard-us.md','text/markdown','$PREFIX/us.md','{}'), ('$F_OV','$IN','guard-ov.md','text/markdown','$PREFIX/ov.md','{}')" >/dev/null
# verdicts: doc US — v1 model client (legacy), v2 model us; v1 override client_voice (July-style), v2 override us (withdrawn)
psql "insert into doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, basis, classifier_model, authorship, classifier_version) values
  ('$F_US','$CO','$SHA_US','client_voice','legacy v1','guard', 'client', 1), ('$F_US','$CO','$SHA_US','external','v2 read: advisor memo','guard','us',2),
  ('$F_OV','$CO','$SHA_OV','client_voice','legacy v1','guard', 'client', 1), ('$F_OV','$CO','$SHA_OV','external','v2 read: advisor-drafted','guard','us',2)" >/dev/null
psql "update doc_voice_verdicts set subject='this_company' where company_id='$CO' and classifier_version=2" >/dev/null
psql "insert into doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, operator_override, basis, override_reason, authorship, override_version) values
  ('$F_US','$CO','$SHA_US','client_voice','client_voice','corpus attestation','guard: July-style attestation','client',1),
  ('$F_US','$CO','$SHA_US','external','external','withdrawn','guard: withdrawn to us','us',2),
  ('$F_OV','$CO','$SHA_OV','client_voice','client_voice','corpus attestation','guard: attestation STANDS (co-created)','client',1)" >/dev/null
# legacy proposals + legacy org-band signals (no upload_origin) + an internal_declared claim in diagnose backed only by doc US
for pair in "$P_US:$F_US:guard-us.md" "$P_OV:$F_OV:guard-ov.md"; do pid=${pair%%:*}; rest=${pair#*:}; fid=${rest%%:*}; name=${rest#*:}
  psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, evidence, framework_results, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, experiments_to_run, contradictions, questions_to_verify, processing_completed_at) values ('$pid','$CO','$fid','$name','uploaded_file','Families wait three weeks for a first appointment.','document','accepted','ready','[\"Families wait three weeks for a first appointment.\"]','[]','[]','[]','[]','[]','[]','[]','[]', now())" >/dev/null
  psql "insert into signals (company_id, source_id, source_type, source_title, signal_band, evidence_type, claim_text, evidence_excerpt, topic, framework, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload) values
    ('$CO','$pid','uploaded_file','$name','organization','internal_data','Families wait three weeks for a first appointment.','Families wait three weeks for a first appointment.','strategy',null,'inferred','strong','extracted','unvalidated','medium','{}'),
    ('$CO','$pid','uploaded_file','$name','organization','internal_data','Summary of $name','Summary of $name','strategy','dify_summary','inferred','strong','interpreted','unvalidated','medium','{}')" >/dev/null
done
SIG_US=$(psql "select id from signals where company_id='$CO' and source_id='$P_US' and structure_level='extracted'")
psql "insert into claims (id, company_id, statement, topic, claim_type, provenance, state, organization_support_count, triangulation_state, confidence) values ('$CL','$CO','Families wait three weeks for a first appointment.','strategy','observation','internal_declared','diagnose',1,'single_source','medium')" >/dev/null
psql "insert into claim_signal_refs (company_id, claim_id, signal_id, relationship) values ('$CO','$CL','$SIG_US','supports')" >/dev/null
BEFORE_SIGS=$(psql "select count(*) from signals where company_id='$CO'"); BEFORE_OV_ROWS=$(psql "select md5(string_agg(row_to_json(v)::text, ',' order by id)) from doc_voice_verdicts v where input_file_id='$F_OV'")

# ── f. dry run writes nothing ──
DRY=$(remint "{\"company_id\":\"$CO\",\"dry_run\":true}")
echo "$DRY" | grep -q '"dry_run":true' || fail f "dry run failed: $(echo "$DRY" | head -c 300)"
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 0 ] || fail f "dry run wrote a ledger row"
[ "$(psql "select count(*) from signals where company_id='$CO'")" = "$BEFORE_SIGS" ] || fail f "dry run changed signals"
[ "$(psql "select status from claims where id='$CL'")" = active ] || fail f "dry run touched the claim"
set +e; python3 - "$DRY" "$P_US" "$P_OV" "$CL" <<'EOF'
import json,sys
d=json.loads(sys.argv[1]); us=[p for p in d['plans'] if p['proposal_id']==sys.argv[2]][0]; ov=[p for p in d['plans'] if p['proposal_id']==sys.argv[3]][0]
assert us['change']=='remint' and us['current_origin']['authorship']=='us' and us['origin_source']=='override', us
assert len(us['superseded_signal_ids'])==2 and [c['id'] for c in us['struck_claim_ids']]==[sys.argv[4]], us
assert us['would_mint']=={'signals':2,'band':'organization','voice_class':'analysis'}, us
assert ov['change']=='none' and ov['current_origin']['authorship']=='client' and ov['origin_source']=='override', ov
print("f. dry run: plan = supersede 2, strike 1 (the declared claim), mint 2 organization/analysis; the attested doc is 'none'; nothing written")
EOF
[ $? = 0 ] || fail f "plan mismatch (see traceback above)"; set -e

# ── apply ──
R1=$(remint "{\"company_id\":\"$CO\",\"dry_run\":false,\"note\":\"guard\"}")
echo "$R1" | grep -q '"dry_run":false' || fail apply "$(echo "$R1" | head -c 300)"
# b. history
[ "$(psql "select count(*) from signals where company_id='$CO' and source_id='$P_US' and superseded_reason='remint_authorship_v2' and raw_payload->>'superseded_by_minting_version'='2' and raw_payload->'superseded_by_remint'->'to'->>'authorship'='us'")" = 2 ] || fail b "old signals not retained as superseded history"
[ "$(psql "select status||'|'||coalesce(struck_by,'')||'|'||(struck_reason like 'remint_authorship_v2:%')::text||'|'||provenance||'|'||state from claims where id='$CL'")" = "struck|remint_authorship_v2 (operator brief 2026-09-13)|true|internal_declared|diagnose" ] || fail b "claim not struck with the remint reason / provenance or state edited: $(psql "select status, struck_by, left(struck_reason,60), provenance, state from claims where id='$CL'")"
[ "$(psql "select count(*) from claim_signal_refs where claim_id='$CL'")" = 1 ] || fail b "the struck claim lost its refs (history must stay readable)"
[ "$(psql "select count(*) from claim_events where claim_id='$CL' and triggered_by_event='status:active->struck'")" = 1 ] || fail b "no claim_events row for the strike"
echo "b. history: 2 signals superseded (reason + from/to in raw_payload), claim struck via set_claim_status (provenance/state untouched, refs kept, event recorded)"
# c. us does not speak
NEW=$(psql "select count(*) from signals where company_id='$CO' and source_id='$P_US' and superseded_at is null and signal_band='organization' and voice_class='analysis' and raw_payload->>'minting_version'='2' and raw_payload->'upload_origin'->>'authorship'='us'")
[ "$NEW" = 2 ] || fail c "expected 2 minted analysis-voice signals, got $NEW"
[ "$(psql "select count(*) from claim_signal_refs r join signals s on s.id=r.signal_id where s.company_id='$CO' and s.source_id='$P_US' and s.superseded_at is null")" = 0 ] || fail c "a minted 'us' signal backs a claim"
[ "$(psql "select count(*) from claims where company_id='$CO' and provenance='internal_declared' and status<>'struck'")" = 0 ] || fail c "a live internal_declared claim remains for the withdrawn document"
echo "c. 'us' mints 2 organization/analysis signals at minting_version 2 that back NO claim; no live internal_declared claim remains"
# d. override untouched
[ "$(psql "select md5(string_agg(row_to_json(v)::text, ',' order by id)) from doc_voice_verdicts v where input_file_id='$F_OV'")" = "$BEFORE_OV_ROWS" ] || fail d "the attested document's verdict rows changed"
[ "$(psql "select count(*) from signals where company_id='$CO' and source_id='$P_OV' and superseded_at is null")" = 2 ] || fail d "the attested document's live signals were touched"
echo "d. attested document: override rows byte-identical, live signals untouched (change='none')"
# e. downstream complete
ORPHANS=$(psql "select count(*) from claims c where c.company_id='$CO' and c.status<>'struck' and exists (select 1 from claim_signal_refs r where r.claim_id=c.id) and not exists (select 1 from claim_signal_refs r join signals s on s.id=r.signal_id where r.claim_id=c.id and s.superseded_at is null)")
[ "$ORPHANS" = 0 ] || fail e "$ORPHANS active claim(s) stand only on superseded signals"
LEDGER=$(psql "select count(*) from provenance_remints where company_id='$CO' and dry_run=false and kind='remint'"); [ "$LEDGER" = 1 ] || fail e "expected 1 ledger row, got $LEDGER"
echo "e. downstream complete: 0 active claims stand on superseded signals; 1 ledger row"
# a. idempotent
SNAP=$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")
R2=$(remint "{\"company_id\":\"$CO\",\"dry_run\":false}")
set +e; python3 - "$R2" <<'EOF'
import json,sys; d=json.loads(sys.argv[1])
assert all(a['superseded']==0 and a['minted']==0 and a['struck']==0 and a['ledger_id'] is None for a in d['applied']), d['applied']
print("a. idempotent: second apply superseded 0, minted 0, struck 0, ledger none")
EOF
[ $? = 0 ] || fail a "second apply re-minted (see traceback above)"; set -e
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 1 ] || fail a "second apply wrote a ledger row"
[ "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")" = "$SNAP" ] || fail a "second apply changed a signal or claim"
cleanup
echo "GUARD OK"
