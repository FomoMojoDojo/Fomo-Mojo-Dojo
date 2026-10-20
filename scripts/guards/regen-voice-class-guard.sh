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
#   v4. (R28) the first-person gate: the regen handler's gate list names first_person, the baseline's call sites name no
#       text gate; the probe mints the pilot-3 tagline on a gated URL as client_voice by rule with ZERO judge calls.
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
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('voice_class'))")" = "client_voice" ] || fail v4 "the tagline fixture did not mint client_voice: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('judge_calls'))")" = "0" ] || fail v4 "the judge was called for a first-person candidate: $FP"
[ "$(echo "$FP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('rule'))")" = "first_person" ] || fail v4 "the rule is not stamped: $FP"
echo "v4. R28 probe (fake transport, judge spy): $FP"
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
echo "GUARD OK"
