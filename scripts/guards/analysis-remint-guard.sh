#!/usr/bin/env bash
# GUARD — our analysis minted as ours (operator rulings 1–4, 2026-09-14; remint-upload-provenance {proposal_ids}).
# THROWAWAY company, never a client document. Seeds a mojo-analysis proposal whose live signals are the
# pre-ruling shape (organization band, voice NULL — counted as TEAM) backing an ANALYTIC claim, plus a
# public-baseline analysis-voice hypothesis (D1) and an intake signal. Proves:
#   f. dry run writes nothing and names the analytic claim on the rows
#   r. RE-MINT: the old rows are superseded (reason remint_authorship_v3, from/to in raw_payload); the new rows
#      are organization band, voice 'analysis', stamped {us, minting_version 3} — and leave the TEAM read
#   e. the analytic claim is KEPT and re-linked (same id, active, live ref on a new signal) — NOT struck
#   b. the rebuild minted an ANALYTIC claim from OUR analysis and NO claim from the public hypothesis (D1) —
#      and no internal_declared claim carries an analysis-voice ref (ruling 2)
#   c. the intake signal is untouched: organization, no voice class, its declared claim intact
#   i. IDEMPOTENT: a second apply plans 'none', writes no ledger row, changes no row
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew; API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aab2"; P_MOJO="00000000-0000-4000-8000-00000000b201"; P_INTAKE="00000000-0000-4000-8000-00000000b202"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() { psql "select set_claim_status(id, 'active', 'guard cleanup', 'guard') from claims where company_id='$CO' and status='struck'" >/dev/null 2>&1 || true; psql "begin; set local app.remint_ledger_purge='on'; delete from provenance_remints where company_id='$CO'; delete from long_runner_runs where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO'; commit;" >/dev/null || true; }
remint() { curl -s --max-time 600 -X POST "$API/functions/v1/remint-upload-provenance" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$1"; }
cleanup
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway analysis remint guard', (select id from auth.users order by created_at limit 1))" >/dev/null
STMT="Specific product claims without customer validation in ODI."
psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, evidence, framework_results, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, experiments_to_run, contradictions, questions_to_verify, processing_completed_at) values
  ('$P_MOJO','$CO',null,'mojo-analysis-guard','mojo_analysis','Customer proof lags behind positioning claims.','document','pending','ready','[\"$STMT\"]','[]','[]','[]','[]','[]','[]','[]','[\"What is the actual adoption rate?\"]', now()),
  ('$P_INTAKE','$CO',null,'guard-intake.md','uploaded_file','s','document','pending','ready','[]','[]','[]','[]','[]','[]','[]','[]','[]', now())" >/dev/null
SIG() { psql "insert into signals (company_id, source_id, source_type, source_title, signal_band, evidence_type, claim_text, evidence_excerpt, topic, framework, directness, framing_fit, structure_level, validation_status, confidence_to_use, voice_class, raw_payload) values ('$CO','$1','$2','guard','$3','internal_data','$4','$5','$6',$7,'inferred','partial','$8','unvalidated','medium',$9,'{}') returning id" | head -1; }
S_M1=$(SIG "$P_MOJO" mojo_analysis organization "$STMT" "$STMT" problem null extracted null)
S_M2=$(SIG "$P_MOJO" mojo_analysis organization "Customer proof lags behind positioning claims." "$STMT" strategy "'dify_summary'" interpreted null)
S_M3=$(SIG "$P_MOJO" mojo_analysis organization "What is the actual adoption rate?" "What is the actual adoption rate?" question "'dify_question'" interpreted null)
S_INT=$(SIG "$P_INTAKE" intake organization "We do not have enough customer evidence." "We do not have enough customer evidence." problem null extracted null)
S_PUB=$(SIG "run-1" public_baseline_run outside "The market is consolidating around premium roasters." "" market "'public_baseline'" interpreted "'analysis'")
# claim ids as the rebuild derives them (evidencePhase1 deterministicSignalClaimId: uuid-v5-shaped sha1 over
# NAMESPACE:company:segment:statement) — so the rebuild re-links the SAME rows, as it does for born-derived claims
CID() { python3 -c "
import hashlib,sys; co,st=sys.argv[1],sys.argv[2]
h=bytearray(hashlib.sha1(f'signal-derived-claims-2026-06:{co}:signal_derived:{st.strip().lower()}'.encode()).digest()); h[6]=(h[6]&0x0f)|0x50; h[8]=(h[8]&0x3f)|0x80; x=h.hex(); print(f'{x[:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:32]}')" "$CO" "$1"; }
CL_AN=$(CID "$STMT"); CL_INT=$(CID "We do not have enough customer evidence.")
psql "insert into claims (id, company_id, statement, topic, claim_type, provenance, state, organization_support_count, triangulation_state, confidence) values ('$CL_AN','$CO','$STMT','problem','observation','analytic','outside_view',1,'single_source','medium'), ('$CL_INT','$CO','We do not have enough customer evidence.','problem','observation','internal_declared','diagnose',1,'single_source','medium')" >/dev/null
psql "insert into claim_signal_refs (company_id, claim_id, signal_id, relationship) values ('$CO','$CL_AN','$S_M1','supports'), ('$CO','$CL_INT','$S_INT','supports')" >/dev/null
TEAM() { psql "select count(*) from signals where company_id='$CO' and superseded_at is null and signal_band='organization' and coalesce(voice_class,'')<>'analysis'"; }
[ "$(TEAM)" = 4 ] || fail seed "TEAM should start at 4 (3 mojo + 1 intake), got $(TEAM)"
BEFORE=$(psql "select md5(string_agg(row_to_json(s)::text, ',' order by id)) from signals s where company_id='$CO'")
# f
DRY=$(remint "{\"company_id\":\"$CO\",\"proposal_ids\":[\"$P_MOJO\"],\"dry_run\":true}")
echo "$DRY" | grep -q '"mode":"analysis"' || fail f "dry run: $(echo "$DRY" | head -c 200)"
[ "$(psql "select md5(string_agg(row_to_json(s)::text, ',' order by id)) from signals s where company_id='$CO'")" = "$BEFORE" ] || fail f "dry run changed a signal"
python3 - "$DRY" "$CL_AN" <<'PY' || fail f "plan mismatch"
import json,sys; d=json.loads(sys.argv[1]); p=d['plans'][0]
assert p['change']=='remint' and p['live_signals']==3 and [c['id'] for c in p['claims_on_signals']]==[sys.argv[2]] and p['would_mint']['voice_class']=='analysis', p
print("f. dry run: remint 3 rows → organization/analysis; names the analytic claim; nothing written")
PY
# apply
R1=$(remint "{\"company_id\":\"$CO\",\"proposal_ids\":[\"$P_MOJO\"],\"dry_run\":false,\"actor\":\"guard\"}")
echo "$R1" | grep -q '"dry_run":false' || fail apply "$(echo "$R1" | head -c 300)"
# r
[ "$(psql "select count(*) from signals where company_id='$CO' and id in ('$S_M1','$S_M2','$S_M3') and superseded_reason='remint_authorship_v3' and raw_payload->'superseded_by_remint'->'to'->>'authorship'='us'")" = 3 ] || fail r "old rows not superseded as history"
[ "$(psql "select count(*) from signals where company_id='$CO' and source_id='$P_MOJO' and superseded_at is null and signal_band='organization' and voice_class='analysis' and raw_payload->'upload_origin'->>'authorship'='us' and raw_payload->>'minting_version'='3'")" = 3 ] || fail r "new rows not organization/analysis/us/v3: $(psql "select signal_band, voice_class, raw_payload->'upload_origin', raw_payload->>'minting_version' from signals where company_id='$CO' and source_id='$P_MOJO' and superseded_at is null")"
[ "$(TEAM)" = 1 ] || fail r "TEAM should drop to 1 (the intake row), got $(TEAM)"
echo "r. re-mint: 3 superseded (v3, from client → to us), 3 minted organization/analysis stamped us + minting_version 3; TEAM 4 → 1"
# e
[ "$(psql "select status||'|'||provenance||'|'||(select count(*) from claim_signal_refs r join signals s on s.id=r.signal_id where r.claim_id='$CL_AN' and s.superseded_at is null and s.voice_class='analysis') from claims where id='$CL_AN'")" = "active|analytic|1" ] || fail e "the analytic claim was not kept and re-linked: $(psql "select status, provenance from claims where id='$CL_AN'")"
echo "$R1" | python3 -c "import json,sys; a=json.load(sys.stdin)['applied'][0]; assert a['claims_relinked']==1 and a['struck']==0, a" || fail e "applied report: $(echo "$R1" | head -c 300)"
echo "e. the analytic claim is KEPT: same id, active, re-linked to a new analysis-voice signal; struck 0"
# b
[ "$(psql "select count(*) from claims c where c.company_id='$CO' and c.status='active' and c.provenance='analytic' and exists (select 1 from claim_signal_refs r join signals s on s.id=r.signal_id where r.claim_id=c.id and s.voice_class='analysis' and s.superseded_at is null)")" -ge 1 ] || fail b "no analytic claim stands on our analysis"
[ "$(psql "select count(*) from claims c join claim_signal_refs r on r.claim_id=c.id where c.company_id='$CO' and c.provenance='internal_declared' and r.signal_id in (select id from signals where company_id='$CO' and voice_class='analysis')")" = 0 ] || fail b "an internal_declared claim carries an analysis-voice ref"
[ "$(psql "select count(*) from claim_signal_refs where signal_id='$S_PUB'")" = 0 ] || fail b "the public-baseline hypothesis (analysis voice, not ours) minted a claim"
echo "b. our analysis mints ANALYTIC only; no declared claim carries an analysis-voice ref; the public hypothesis minted nothing (D1 intact)"
# c
[ "$(psql "select signal_band||'|'||coalesce(voice_class,'∅')||'|'||(superseded_at is null)::text from signals where id='$S_INT'")" = "organization|∅|true" ] || fail c "the intake signal moved"
[ "$(psql "select status||'|'||provenance from claims where id='$CL_INT'")" = "active|internal_declared" ] || fail c "the intake claim moved"
echo "c. intake untouched: organization, no voice class, internal_declared claim intact"
# i
SNAP=$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))"); N=$(psql "select count(*) from provenance_remints where company_id='$CO'")
R2=$(remint "{\"company_id\":\"$CO\",\"proposal_ids\":[\"$P_MOJO\"],\"dry_run\":false,\"actor\":\"guard\"}")
echo "$R2" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['plans'][0]['change']=='none' and d['applied'][0]['superseded']==0 and d['applied'][0]['minted']==0 and d['applied'][0]['ledger_id'] is None, d" || fail i "second apply did something"
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = "$N" ] || fail i "second apply wrote a ledger row"
[ "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")" = "$SNAP" ] || fail i "second apply changed a row"
echo "i. idempotent: second apply 'none', ledger unchanged, rows byte-identical"
cleanup; echo "GUARD OK"
