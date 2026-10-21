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
#   v4. (R28/R45, R56 2026-10-21: speakerless first person off the subject's domain → the AUTHORSHIP judge, 0 speaker calls)
#       the first-person gate: detected by rule, DECIDED by the speaker judge — the SIAA agent-forum fixture (a
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
#   v9. (R54) the authorship judge sees where the text sits on the page: probe regen-r54-context-probe.ts — the built prompt
#       carries the CONTEXT block (nearest heading, page words with the TEXT marked) between PAGE BRIEF and TEXT; a no_page
#       context makes no transport call and no ledger row (no_page_words); a call with no context throws before any call
#       (runtime) and is a type error (r54-no-context-typecheck.ts); the regen mint hands the judge a page context.
#   v10. (R54a) the context is the SECTION the text sits in: on a seeded page with headings above and below, the "before"
#       words stop at the heading above (kept as the heading line) and the "after" words at the next heading below; the
#       CONTEXT block says the heading names the field.
#   v11. (R54b) the authorship system prompt carries the listing-data rule — a sentence of only listing data (name, address,
#       phone, URL, hours, category) is platform-authored in any field — with its demonstration and counterexample.
#   v12. (R55) the speaker system prompt carries rule (5): subject_company_text requires the company's own words — a
#       narrator's sentence with no speaker on a third-party host is third_party — with its demonstration and counterexample.
#   v13. (R55a) the attribution detector: a quoted term with no attribution marker (no speaker the verb attaches to, no dash
#       attribution) is not quoted_with_attribution — f2630d58's sentence is form none; a true quotation keeps form + speaker.
#   v14. (R55b, R55c) the speaker system prompt carries rule (6) the SUBJECT line names the subject, and rule (7) an affiliate
#       speaking for itself in first person on its own page is third_party — each with its demonstration and counterexample.
#       (R55c', 2026-10-21, replaced rule (7): first person off the subject's domain is the subject's only when the page
#       identifies the speaker as the subject or its officer; otherwise third_party.)
#   v15. (R55a', R55d) a candidate opening a multi-sentence quotation takes the dash attribution after the close as its
#       speaker; the speaker prompt carries rule (8) (narrator words + a quotation → mixed) and mixed in the answer set.
#   v16. (R55e i) the speaker user prompt states "HOST IS THE SUBJECT'S OWN DOMAIN: no — …" on a third-party host and
#       "yes — …" on the subject's own (computed with isOwnDomainUrl, the own_domain authority's definition).
#   v17. (R55e ii) the speaker user prompt carries the same PAGE BRIEF and CONTEXT block (heading, section) the authorship judge gets.
#   v18. (R55d, R55a'') the detector: narrator words + a quotation opener in one candidate → form mixed (recorded
#       unknown:mixed_candidate, no call); a quotation directly after an attributed quotation carries that speaker.
#   v19. (R56) a speakerless first-person candidate on a host that is not the subject's own domain is asked the FIELD
#       question by the authorship judge (rule first_person, gate via first_person), never the speaker judge; a first-person
#       candidate WITH a detected attribution (speaker string) stays with the speaker judge.
#   v20. (R57) the authorship system prompt carries rule (8): a heading or section naming an entity other than the SUBJECT makes
#       the text that entity's → third_party (demonstration + counterexample); the generic brief says the same.
#   v21. (R55a''') a named subject + any verb + comma/colon opening a quotation is quoted_with_attribution (6003dc65's sentence).
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
#   R54a plant (2026-10-20): P5 the section bound dropped from the before window (Math.max(sectionStart, …) → Math.max(0, …))
#       => v10 before_has_earlier_heading false → true.
#   R54b plant (2026-10-20): P6 rule (7) removed from JUDGE_SYSTEM => v11 rule_present true → false, system sha moves.
#   R55 plant (2026-10-21): P7 rule (5) removed from SPEAKER_SYSTEM => v12 rule_present true → false, speaker sha moves.
#   R55a–c plants (2026-10-21): P8 detectAttribution's marker check removed => v13 term_form none → quoted_with_attribution;
#       P9 rule (6) removed => v14 r55b_present true → false; P10 rule (7) removed => v14 r55c_present true → false.
#   R55a'/c'/d plants (2026-10-21): P11 the dash-after-close check removed => v15 08ff48ad speaker Leary → none; P12 rule (7')
#       removed => v14 r55c_present true → false; P13 rule (8) removed => v15 r55d_present true → false, and the runner's
#       mixed branch removed => r52 p12 unknown_reason mixed_candidate → (none), the seeded row no longer recorded unknown.
#   R55e/d/a'' plants (2026-10-21): P14 own-domain line removed => v16 own_domain_no true → false; P15 the CONTEXT block
#       removed from the speaker prompt => v17 context true → false; P16 the mixed check removed => v18 mixed → first_person path
#       (form none); P17 the carry removed => v18 carry speaker Friend → none.
#   R56 plant (2026-10-21): P18 the first_person → authorship branch removed => v19 first_person_judges [authorship] → [speaker];
#       4b0b3ffa's planned judge authorship → speaker.
#   R57 / R55a''' plants (2026-10-21): P19 rule (8) removed from JUDGE_SYSTEM => v20 rule_present true → false, system sha moves;
#       P20 the subject-verb-quote check removed => v21 6003dc65 form quoted_with_attribution → none (first_person gate path).
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
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('rule'))")" = "first_person" ] || fail v4 "R56: the rule is not first_person: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_calls'))")" = "0" ] || fail v4 "R56: a speakerless first-person candidate reached the speaker judge: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('judge_calls'))")" = "1" ] || fail v4 "R56: the authorship judge was not asked the field question once: $FP"
grep -q 'needs_speaker: true, attribution: { form: "first_person"' supabase/functions/_shared/voiceClassAtMint.ts || fail v4 "R45: the first-person stage does not reach the speaker stage"
grep -q 'attribution.form === "first_person" && !attribution.speaker_string && !(input.company.host && isOwnDomainUrl(input.url, input.company.host))' supabase/functions/_shared/voiceClassAtMint.ts || fail v4 "R56: the speakerless first-person branch to the authorship judge is missing"
echo "v4. R28/R45/R56 probe (fake transport, judge spy, fake speaker judge): $FP"
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

# v6 — R47: the first-person subject anywhere; detection by rule, decision by the authorship judge's field question (R56)
V=supabase/functions/_shared/voiceClassAtMint.ts
grep -qE '^const FIRST_PERSON_SUBJECT = /\\b\(we\|' "$V" || fail v6 "FIRST_PERSON_SUBJECT is anchored to a sentence start again (R47 undone)"
R47=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-r47-probe.ts 2>&1 | tail -1)
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('subject_class'))")" = "client_voice" ] || fail v6 "the provider's mid-sentence first person did not mint client_voice: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('subject_rule'))")" = "first_person" ] || fail v6 "R56: the rule is not first_person: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('review_class'))")" = "outside_voice_about_client" ] || fail v6 "a customer's 'our home' lost its label: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('speaker_calls'))")" = "0" ] || fail v6 "R56: a speakerless first-person candidate reached the speaker judge: $R47"
[ "$(echo "$R47" | python3 -c "import json,sys; print(json.load(sys.stdin).get('judge_calls'))")" = "2" ] || fail v6 "R56: authorship calls != 2 for two mid-sentence first-person candidates: $R47"
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
# v9 — R54: the judge's page context
J9=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-r54-context-probe.ts 2>&1 | tail -1)
q9() { echo "$J9" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
[ "$(q9 "d['prompt']['has_block'] and d['prompt']['between_brief_and_text'] and d['prompt']['marked'] and d['prompt']['heading']=='Questions & Answers' and d['prompt']['rows']==1")" = True ] || fail v9 "the CONTEXT block is not in the built prompt: $J9"
[ "$(q9 "d['no_page']['verdict']=='no_page_words' and d['no_page']['transport_calls']==0 and d['no_page']['ledger_rows']==0")" = True ] || fail v9 "a no_page context reached the model: $J9"
[ "$(q9 "d['refuse']['threw'] and d['refuse']['transport_calls']==0")" = True ] || fail v9 "a call with no context was not refused at runtime: $J9"
NO_COLOR=1 deno check scripts/guards/r54-no-context-typecheck.ts >/dev/null 2>&1 || fail v9 "a call with no context is not a type error (r54-no-context-typecheck.ts)"
grep -q 'authorshipContext: authorshipContext(clean_text, verdictA.excerpt, verdictA.offset),' supabase/functions/_shared/outsideRegenHandler.ts || fail v9 "the mint site does not build the judge's context from the page at the excerpt offset"
[ "$(q9 "d['mint']['judge_calls']==1 and d['mint']['kind']=='page' and d['mint']['at_offset']")" = True ] || fail v9 "the mint path did not hand the judge a page context: $J9"
echo "v9. R54 probe: prompt sha $(q9 "d['prompt']['sha'][:16]") carries CONTEXT (heading '$(q9 "d['prompt']['heading']")'); no_page → 0 calls / 0 ledger rows; no context → refused (runtime + type); mint context kind $(q9 "d['mint']['kind']")"
# v10 — R54a: the context is the text's section, never across a heading; the prompt says the heading names the field
[ "$(q9 "d['section'].get('heading')=='Questions & Answers' and d['section'].get('before_has_earlier_heading') is False and d['section'].get('before_has_own_heading') is False and d['section'].get('after_has_next_heading') is False and d['section'].get('names_field') is True")" = True ] || fail v10 "the context crosses a heading or the prompt does not name the field: $J9"
echo "v10. R54a section: heading '$(q9 "d['section']['heading']")', before $(q9 "d['section']['before_len']") / after $(q9 "d['section']['after_len']") chars, no earlier or next heading inside; prompt names the field"
# v11 — R54b: listing data is platform-authored in any field (system prompt rule, demonstration and counterexample)
[ "$(q9 "d['listing']['rule_present'] and d['listing']['demonstration'] and d['listing']['counterexample']")" = True ] || fail v11 "the listing-data rule is not in the authorship system prompt: $J9"
echo "v11. R54b listing-data rule in the system prompt (demonstration + counterexample); system sha $(q9 "d['listing']['system_sha'][:16]")"
# v12 — R55: a sentence about the subject is not a sentence by it (speaker system prompt rule, demonstration, counterexample)
[ "$(q9 "d['speaker']['rule_present'] and d['speaker']['demonstration'] and d['speaker']['counterexample']")" = True ] || fail v12 "the about-is-not-by rule is not in the speaker system prompt: $J9"
echo "v12. R55 about-is-not-by rule in the speaker system prompt (demonstration + counterexample); speaker sha $(q9 "d['speaker']['system_sha'][:16]")"
# v13 — R55a: a quoted term is not a quotation (the detector needs an attribution marker)
[ "$(q9 "d['r55a']['term_form']=='none' and d['r55a']['quote_form']=='quoted_with_attribution' and d['r55a']['quote_speaker']=='David Friend'")" = True ] || fail v13 "the quotation form fires without an attribution marker (or a true quotation lost it): $J9"
echo "v13. R55a quoted term → form $(q9 "d['r55a']['term_form']"); true quotation → $(q9 "d['r55a']['quote_form']") ($(q9 "d['r55a']['quote_speaker']"))"
# v14 — R55b / R55c: the SUBJECT line names the subject; an affiliate speaking for itself is third_party
[ "$(q9 "d['speaker']['r55b_present'] and d['speaker']['r55c_present']")" = True ] || fail v14 "R55b / R55c not in the speaker system prompt: $J9"
echo "v14. R55b (SUBJECT line names the subject) and R55c' (first person off the subject's domain is the subject's only when the page says so) in the speaker prompt; speaker sha $(q9 "d['speaker']['system_sha'][:16]")"
# v15 — R55a' / R55d: the dash attribution after a quotation's close names every sentence inside it; a mixed candidate is answered mixed
[ "$(q9 "d['r55a']['dash_after_close_speaker']=='Meghan Leary, SVP of Strategic Partnerships of SIAA'")" = True ] || fail v15 "the dash attribution after the close does not name the quotation's opening sentence: $J9"
[ "$(q9 "d['speaker']['r55d_present']")" = True ] || fail v15 "R55d (mixed) not in the speaker system prompt or answer set: $J9"
echo "v15. R55a' opening sentence → $(q9 "d['r55a']['dash_after_close_speaker']"); R55d mixed rule + answer in the speaker prompt"
# v16 — R55e (i): the speaker user prompt carries the computed own-domain line (no on a third-party host, yes on the subject's)
[ "$(q9 "d['r55e']['own_domain_no'] and d['r55e']['own_domain_yes']")" = True ] || fail v16 "the own-domain line is not in the speaker user prompt: $J9"
echo "v16. R55e own-domain line: angi.com → no, iaqm.com → yes"
# v17 — R55e (ii): the speaker user prompt carries the authorship judge's PAGE BRIEF and CONTEXT block
[ "$(q9 "d['r55e']['brief'] and d['r55e']['context']")" = True ] || fail v17 "the PAGE BRIEF / CONTEXT block is not in the speaker user prompt: $J9"
echo "v17. R55e speaker prompt carries PAGE BRIEF + CONTEXT (heading 'Yes, I recommend this pro', text marked)"
# v18 — R55d / R55a'': narration + a quotation is form mixed (no call); a quotation after an attributed one carries its speaker
[ "$(q9 "d['r55d']['mixed_form']=='mixed' and d['r55d']['carry_speaker']=='David Friend, Wasabi Technologies’ co-founder and CEO'")" = True ] || fail v18 "mixed form or quotation carry: $J9"
echo "v18. R55d mixed form → $(q9 "d['r55d']['mixed_form']"); R55a'' carry → $(q9 "d['r55d']['carry_speaker']")"
# v19 — R56: speakerless first person off the subject's domain is a FIELD question (authorship judge); attributed stays with the speaker judge
[ "$(q9 "d['r56']['first_person_judges']==['authorship'] and d['r56']['first_person_rule']=='first_person' and d['r56']['attributed_judges'][:1]==['speaker']")" = True ] || fail v19 "R56 first-person routing: $J9"
echo "v19. R56 speakerless first person (angi.com) → $(q9 "d['r56']['first_person_judges']"); attributed → $(q9 "d['r56']['attributed_judges']")"
# v20 — R57: an About/description section belongs to the entity it is named for (authorship rule (8) + the generic brief)
[ "$(q9 "d['r57']['rule_present'] and d['r57']['generic_brief']")" = True ] || fail v20 "R57 not in the authorship system prompt / generic brief: $J9"
echo "v20. R57 rule (8) in the authorship system prompt (demonstration + counterexample) and the generic brief; system sha $(q9 "d['listing']['system_sha'][:16]")"
# v21 — R55a''': a named subject + any verb + comma/colon opening a quotation is an attribution
[ "$(q9 "d['r55a3']['form']=='quoted_with_attribution' and d['r55a3']['speaker']=='Sonos'")" = True ] || fail v21 "subject-verb-quote shape: $J9"
echo "v21. R55a''' 'Sonos bragged, “…”' → $(q9 "d['r55a3']['form']") ($(q9 "d['r55a3']['speaker']"))"
echo "GUARD OK"
