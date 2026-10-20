#!/usr/bin/env bash
# ── REGEN VOICE-CLASS GUARD — R14 / R17 (operator rulings 2026-10-18) ────────────────────────────────
#
# WHY THIS GUARD EXISTS. extract-outside-evidence stamped every regenerated row outside_voice_about_client as a
# literal; 32 of the 282 b3 URLs are classed otherwise by the shared authorities (own domain, registry,
# authorship judge). The class now comes from ONE function, _shared/voiceClassAtMint.ts, which public-baseline's
# overlay, registry stamp and authorship demote call too. On the regen path an unjudged gated row is REFUSED, never
# minted outside (amendment b). This guard proves the handler holds no copy, the rules hold on fixtures, and the
# per-URL expectation over the b3 set has not drifted.
#
# Checks (affirmative, no plant):
#   v1. SOURCE — no `voice_class: "` literal in the handler; it imports voiceClassAtMint.ts and calls
#       voiceClassForMintedExcerpt at the mint site with REGEN_JUDGE_FAILURE_POLICY = "refuse_mint"; the baseline's
#       overlay, registryIngest and aggregatorAuthorship call the same module.
#   v2. MODULE — voiceClassAtMint.test.ts (own domain → client_voice; GuideStar self-reported → client_voice/filing;
#       wire + judge subject_company → client_voice; wire + judge_failed on refuse_mint → refused, on keep_label → the
#       label with a stamp; plain third party → outside) and the handler tests (plan reports the class; write refuses
#       an unjudged gated URL) pass.
#   v4. (R28/R45) the first-person gate: detected by rule, DECIDED by the speaker judge — the SIAA agent-forum fixture (a
#       third party saying "we") keeps the label with the speaker recorded, one speaker call, zero authorship-judge calls;
#       the baseline's call sites name no text gate.
#   v6. (R47, R51) the first-person subject ANYWHERE in the candidate is detected (FIRST_PERSON_SUBJECT carries no sentence-start
#       anchor); probe regen-r47-probe.ts: the provider's mid-sentence "our … we" mints client_voice (first_person_judged), a
#       customer's "our home" keeps the label with the speaker recorded; speaker_calls 2, authorship calls 0.
#   v7. (R48, R51) unquoted reported speech: outsideEvidenceRegen.test.ts (the Auletta fixture is reported_name_appositive with the
#       title in the speaker string; the possessive and participle false positives are null); the form is in the source.
#       (R49, R51) the provider-written profile hosts: probe regen-r49-host-probe.ts — one URL per host opens the profile gate
#       and carries a field brief; the controls (usnews, freementalhealth, tracxn, globaldata, list / review / blog paths) stay shut.
#   v8. (R38, R51) the syndication stage DECIDES on the regen path, after the registry and before the text gates: source order
#       pinned; probe regen-syndication-probe.ts — verbatim client copy mints client_voice (authority syndication, deterministic),
#       the band goes to the ledgered band judge (rows = calls = tally), a short item is clean with no call, every minted row
#       carries raw_payload.syndication; the baseline's call sites pass no syndication input.
#   v5. (R32) the attributed_speech gate: CEO-quote fixture client_voice, third-party keeps the label, unknown refused,
#       apostrophes not quotation marks, speaker calls = attribution-bearing candidates; the baseline names no text gate.
#   v3. EXPECTATION — scripts/guards/regen-voice-expectation.ts recomputes (class, authority) for every in-scope URL of
#       the plan file and compares PER URL to scripts/guards/fixtures/regen-voice-expected.tsv (gated rows expected as
#       "gated"). Any difference is named.
#
# Plants (each in place, confirmed to move a measured value, RED, restored md5-identical — 2026-10-18):
#   P1  the literal reintroduced at the mint site (voice_class: "outside_voice_about_client")  => v1 red; and the
#       handler's own-domain write test moves client_voice → outside (v2 red)
#   P3  (R28) "first_person" dropped from REGEN_TEXT_GATES in place            => v4: the tagline fixture moves
#       client_voice → outside_voice_about_client and judge_calls 0 → 1; the handler's R28 test red (v2)
#   P2  the regen policy flipped to keep_label                                                  => v2: judge_failed
#       fixture moves refused → minted (handler test red); v1 red
#   R51 plants (2026-10-20): P1 the ^ anchor restored on FIRST_PERSON_SUBJECT => v6 speaker_calls 2 → 0, subject class → outside;
#       P2 the appositive chain dropped from RE_NAME_APPOSITIVE => v7 the Auletta fixture null (test red); P3 the psychologytoday
#       entry removed => v7 gated 19 → 18 and v3 differences 0 → 4; P4 the ledger call skipped in judgeSyndicationBand => v8
#       syndication_ledger_rows 1 → 0 ≠ band_judge_calls 1; P5 the syndication stage moved after the text gates => v8 source pin
#       red and the authority test's order case moves syndication → first_person_judged (v2 red).
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
fail() { echo "FAIL step $1: $2"; exit 1; }
H=supabase/functions/_shared/outsideRegenHandler.ts
PLAN="${REGEN_VOICE_PLAN:-$HOME/Desktop/beat2-oct18/b3plan-r10.tsv}"

# v1 — source
grep -qE 'voice_class:\s*"' "$H" && fail v1 "a voice_class literal is back in the handler: $(grep -nE 'voice_class:\s*"' "$H" | head -1)"
grep -q 'from "./voiceClassAtMint.ts"' "$H" || fail v1 "handler does not import the one authority"
grep -q 'voiceClassForMintedExcerpt(' "$H" || fail v1 "handler does not call voiceClassForMintedExcerpt at the mint site"
grep -q 'REGEN_JUDGE_FAILURE_POLICY: JudgeFailurePolicy = "refuse_mint"' "$H" || fail v1 "the regen policy is not refuse_mint"
grep -q 'onJudgeFailure: REGEN_JUDGE_FAILURE_POLICY' "$H" || fail v1 "the mint site does not pass the named policy"
grep -q 'from "../_shared/voiceClassAtMint.ts"' supabase/functions/public-baseline/index.ts || fail v1 "public-baseline does not import the authority"
grep -q 'decideVoiceClassBeforeJudge(' supabase/functions/_shared/registryIngest.ts || fail v1 "the registry stamp bypasses the authority"
grep -q 'voiceClassForMintedExcerpt(' supabase/functions/_shared/aggregatorAuthorship.ts || fail v1 "the authorship demote bypasses the authority"
echo "v1. source: no voice_class literal in the handler; one import; refuse_mint named at the mint site; baseline overlay, registry stamp and demote call the authority"

# v2 — module fixtures
for t in supabase/functions/_shared/voiceClassAtMint.test.ts supabase/functions/_shared/outsideRegenHandler.test.ts; do
  T=$(NO_COLOR=1 deno test --allow-all --no-check "$t" 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
  echo "$T" | grep -q '^ok |' || fail v2 "$t: ${T:-no summary} $(NO_COLOR=1 deno test --allow-all --no-check "$t" 2>&1 | grep -E '\.\.\. FAILED' | head -3)"
  echo "v2. $t: $T"
done

# v3 — per-URL expectation
[ -f "$PLAN" ] || fail v3 "plan file not found: $PLAN (set REGEN_VOICE_PLAN)"
OUT=$(deno run --allow-all scripts/guards/regen-voice-expectation.ts --plan="$PLAN" 2>&1) || fail v3 "$OUT"
echo "v3. $(echo "$OUT" | head -1)"

# v4 — R28: the first-person gate is named by the regen handler only; the tagline fixture mints client_voice by rule
#      with ZERO judge calls (probe: scripts/guards/regen-first-person-probe.ts, fake transport + judge spy).
grep -qE 'REGEN_TEXT_GATES: ReadonlyArray<TextGate> = \["first_person"(, "[a-z_]+")*\]' "$H" || fail v4 "the regen gate list does not name first_person first"
grep -q 'textGates: REGEN_TEXT_GATES' "$H" || fail v4 "the mint site does not pass the regen gate list"
for f in supabase/functions/public-baseline/index.ts supabase/functions/_shared/aggregatorAuthorship.ts supabase/functions/_shared/registryIngest.ts; do
  grep -q 'textGates' "$f" && fail v4 "the baseline's call site $f names a text gate — the baseline's gate list is unchanged by ruling"
done
FP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-first-person-probe.ts 2>&1 | tail -1)
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('voice_class'))")" = "outside_voice_about_client" ] || fail v4 "R45: a third party saying 'we' did not keep the label: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('rule'))")" = "first_person_judged" ] || fail v4 "R45: the rule is not first_person_judged: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_class'))")" = "third_party" ] || fail v4 "R45: the speaker is not recorded: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_calls'))")" = "1" ] || fail v4 "R45: speaker calls != 1 for one first-person candidate: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('judge_calls'))")" = "0" ] || fail v4 "the authorship judge was called for a first-person candidate: $FP"
grep -q 'needs_speaker: true, attribution: { form: "first_person"' supabase/functions/_shared/voiceClassAtMint.ts || fail v4 "R45: the first-person stage does not hand the candidate to the speaker judge"
echo "v4. R28/R45 probe (fake transport, judge spy, fake speaker judge): $FP"
echo "v4. R28 source: the regen handler names [first_person]; the baseline's three call sites name no text gate"

# v5 — R32: the attributed_speech gate — the CEO-quote fixture mints client_voice by the speaker judge; the third-party
#      interior quotation keeps the label; unknown is REFUSED (never minted); apostrophes are not quotation marks.
SP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-speaker-probe.ts 2>&1 | tail -1)
[ "$(echo "$SP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ceo_quote_class'))")" = "client_voice" ] || fail v5 "the CEO-quote fixture did not mint client_voice: $SP"
[ "$(echo "$SP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('third_party_class'))")" = "outside_voice_about_client" ] || fail v5 "the third-party fixture lost its label: $SP"
[ "$(echo "$SP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('unknown_minted'))")" = "False" ] || fail v5 "an unknown speaker was minted: $SP"
[ "$(echo "$SP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('apostrophe_attribution'))")" = "False" ] || fail v5 "apostrophes were read as quotation marks: $SP"
[ "$(echo "$SP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_calls'))")" = "5" ] || fail v5 "speaker calls != 5 attribution-bearing candidates: $SP"
grep -q 'REGEN_TEXT_GATES: ReadonlyArray<TextGate> = \["first_person", "attributed_speech"\]' "$H" || fail v5 "the regen gate list does not name attributed_speech"
for f in supabase/functions/public-baseline/index.ts supabase/functions/_shared/aggregatorAuthorship.ts supabase/functions/_shared/registryIngest.ts; do grep -q 'textGates' "$f" && fail v5 "the baseline's call site $f names a text gate"; done
echo "v5. R32 probe (fake transport, fake speaker judge): $SP"

# v6 — R47: the first-person subject anywhere; detection by rule, decision by the speaker judge
V=supabase/functions/_shared/voiceClassAtMint.ts
grep -qE '^const FIRST_PERSON_SUBJECT = /\\b\(we\|' "$V" || fail v6 "FIRST_PERSON_SUBJECT is anchored to a sentence start again (R47 undone)"
R47=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-r47-probe.ts 2>&1 | tail -1)
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('subject_class'))")" = "client_voice" ] || fail v6 "the provider's mid-sentence first person did not mint client_voice: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('subject_rule'))")" = "first_person_judged" ] || fail v6 "the rule is not first_person_judged: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('review_class'))")" = "outside_voice_about_client" ] || fail v6 "a customer's 'our home' lost its label: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_calls'))")" = "2" ] || fail v6 "speaker calls != 2 for two mid-sentence first-person candidates: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('judge_calls'))")" = "0" ] || fail v6 "the authorship judge was called: $R47"
echo "v6. R47 probe (fake transport, fake speaker judge): $R47"

# v7 — R48 (the reported-speech forms) and R49 (the provider-written profile hosts)
grep -q '"reported_name_appositive"' supabase/functions/_shared/attribution.ts || fail v7 "the R48 form reported_name_appositive is not in the detector"
T=$(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/outsideEvidenceRegen.test.ts 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
echo "$T" | grep -q '^ok |' || fail v7 "outsideEvidenceRegen tests (R48 Auletta fixture): ${T:-no summary} $(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/outsideEvidenceRegen.test.ts 2>&1 | grep -E '\.\.\. FAILED' | head -3)"
R49=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-r49-host-probe.ts 2>&1 | tail -1)
[ "$(echo "$R49" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('gated')==d.get('hosts')==19)")" = "True" ] || fail v7 "R49: not every provider-written profile host opens the profile gate: $R49"
[ "$(echo "$R49" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('briefed')==19 and d.get('unbriefed')==[])")" = "True" ] || fail v7 "R49: a gated host has no field brief: $R49"
[ "$(echo "$R49" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('controls_ungated')==d.get('controls'))")" = "True" ] || fail v7 "R49: a control URL opens the gate: $R49"
echo "v7. R48 tests: $T"
echo "v7. R49 host probe: $R49"

# v8 — R38: the syndication stage, its order, its ledger, its stamp; the baseline passes no syndication input
python3 - "$V" <<'PY' || exit 1
import sys; s=open(sys.argv[1]).read()
body=s[s.index('export function decideVoiceClassBeforeJudge'):s.index('export function decideTextGates')]
i_reg=body.index('registry journalism'); i_syn=body.index('const synd = stage ?? syndicationStage(input);'); i_tg=body.index('decideTextGates(input, label)')
assert i_reg < i_syn < i_tg, "FAIL step v8: the syndication stage is not between the registry stamp and the text gates (decideVoiceClassBeforeJudge calls the text gates before it scores)"
tg=s[s.index('export function decideTextGates'):s.index('function decideUrlGate')]
assert 'firstPersonSelfDescription(input.judgedText)' in tg and 'return decideUrlGate(input, label);' in tg, "FAIL step v8: the text gates no longer run first_person then attributed_speech then the URL gate"
PY
grep -q 'syndication: { corpus, judge: syndicationJudge, anchors }' "$H" || fail v8 "the mint site does not pass the syndication stage its corpus, judge and anchors"
grep -q 'buildClientCorpus(supabase, company_id' "$H" || fail v8 "the handler does not build the client corpus"
grep -q 'callSite: regenCallSite("syndication")' "$H" || fail v8 "the handler does not ledger the band judge under role syndication"
grep -q '{ syndication: voice.syndication }' "$H" || fail v8 "the minted row does not carry raw_payload.syndication"
for f in supabase/functions/public-baseline/index.ts supabase/functions/_shared/aggregatorAuthorship.ts supabase/functions/_shared/registryIngest.ts; do grep -q 'syndication: {' "$f" && fail v8 "the baseline's call site $f passes a syndication input — the baseline's policy is unchanged by ruling"; done
SY=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-syndication-probe.ts 2>&1 | tail -1)
[ "$(echo "$SY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('copy_class')=='client_voice' and d.get('copy_authority')=='syndication' and d.get('copy_method')=='deterministic')")" = "True" ] || fail v8 "verbatim client copy did not mint client_voice by syndication: $SY"
[ "$(echo "$SY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('band_class')=='client_voice' and d.get('band_method')=='local_llm')")" = "True" ] || fail v8 "the band judge's YES did not decide: $SY"
[ "$(echo "$SY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('short_method')=='short_item' and d.get('short_class')=='outside_voice_about_client')")" = "True" ] || fail v8 "the short item was not clean by the floor: $SY"
[ "$(echo "$SY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('band_judge_calls')==d.get('syndication_ledger_rows')==d.get('tally_syndication')==1)")" = "True" ] || fail v8 "band judge calls, syndication ledger rows and the tally disagree: $SY"
[ "$(echo "$SY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('stamped_rows')==d.get('minted')==3)")" = "True" ] || fail v8 "not every minted row carries raw_payload.syndication: $SY"
echo "v8. R38 probe (fake transport, real ledgered band judge over a fake Ollama): $SY"
echo "v8. R38 source: the stage sits between the registry stamp and the text gates; the mint site passes corpus/judge/anchors; the baseline passes none"
echo "GUARD OK"
