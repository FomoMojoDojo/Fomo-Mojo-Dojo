// GATE R3 — outside-evidence REGENERATION (the restore gate's generator).
//
// The outside analog of extract-own-words. For each regen URL it reads the STORED
// outside_page_snapshots basis (NO fetch — R2 already captured the page), asks
// gpt-4.1-mini to lift statements a third-party source makes ABOUT the client as
// EXACT substrings, then admits each through the deterministic gate-2 birth guard
// (admitOutsideEvidence = E4 verbatim-substring + E2 specificity, default-deny).
// Admitted excerpts are minted as NEW outside_voice_about_client signals with
// held_at/superseded_at NULL — the RESTORE law: old held/superseded rows stay as
// audit, restoration mints NEW rows. Nothing is fetched; no flag is ever cleared.
//
// Router: the input is PUBLIC snapshot corpus → external gpt-4.1-mini (matching
// extract-own-words: "corpus not substance → external"; the router law all-public →
// gpt-4.1-mini). No non-public text ever reaches the model.
//
// R8 (operator ruling 2026-10-18): THE MODE IS NAMED, OR THE CALL IS REFUSED. The body carries
// `plan: true` (read-only: the per-URL plan with review-gate state, zero writes, zero model calls)
// or `write: true` (the run as before); nothing else, and no key outside company_id / run_id /
// urls / plan / write. The handler lives in _shared/outsideRegenHandler.ts so the rule is provable
// without a network; this file supplies the two seams — the SHARED transport (callOpenAIJson, which
// returns usage) and the SHARED ledger (recordModelCall) — and the model step (R4,
// _shared/outsideRegenModel.ts) ledgers EVERY attempt, before parse, mini then nano.
//
// Provenance is stamped at the CLAIM layer by rebuild-claims (deriveClaimProvenance:
// outside band + outside_voice → public_observed); we record the intent + run_id +
// content_identity + snapshot hash in raw_payload for audit. Frozen company → 403.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJson } from "../_shared/modelRouter.ts";
import { recordModelCall } from "../_shared/recordModelCall.ts";
import { type RegenLedger, type RegenTransport } from "../_shared/outsideRegenModel.ts";
import { runOutsideRegen, type RegenJudge } from "../_shared/outsideRegenHandler.ts";
import { genSystem, judgeSystem, QUOTE_MAX_WORDS } from "../_shared/outsideRegenPrompts.ts";
import { judgeAggregatorAuthorship, judgeSpeaker, ollamaSpeakerTransport, resolveLocalOllamaUrl, type SpeakerJudge, type SpeakerLedger } from "../_shared/aggregatorAuthorship.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const GEN_MODEL = Deno.env.get("OUTSIDE_REGEN_MODEL") ?? "gpt-4.1-mini";
const GEN_FALLBACK = Deno.env.get("OUTSIDE_REGEN_FALLBACK_MODEL") ?? "gpt-4.1-nano";
const REGEN_MODELS = [GEN_MODEL, GEN_FALLBACK] as const;
const PER_URL_CAP = Number(Deno.env.get("OUTSIDE_REGEN_PER_URL_CAP") ?? "12");
const WALL_MS = 140_000;
const MODEL_TIMEOUT_MS = 90_000;
// R22: both prompts are built from the client's anchor set (name, host, entity anchors) in
// _shared/outsideRegenPrompts.ts; neither carries a fallback name.

/** One attempt against one model; throws on a non-ok answer so the module moves to the next model.
 *  Built by the handler ONLY on the write path; a missing key refuses before any attempt. */
function makeTransport(): RegenTransport {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  return async ({ model, system, user }) => {
    const r = await callOpenAIJson({ model, system, user, temperature: 0, timeoutMs: MODEL_TIMEOUT_MS, apiKey });
    return { content: r.content, usage: r.usage };
  };
}
/** R17: the local authorship judge (the same one public-baseline wires), built ONLY on the write path. Null when
 *  no local Ollama URL resolves — the handler then REFUSES every gated URL's excerpts (REGEN_JUDGE_FAILURE_POLICY)
 *  rather than minting them as the record speaking. */
function makeJudge(): RegenJudge | null {
  const ollamaUrl = resolveLocalOllamaUrl();
  if (!ollamaUrl) return null;
  return (input) => judgeAggregatorAuthorship(input, { ollamaUrl, model: Deno.env.get("OLLAMA_MODEL") || undefined });
}
/** R32: the local speaker judge, built ONLY on the write path with the run's ledger; every call writes a model_calls row
 *  (provider ollama, token counts from the response, usd null) before its answer is parsed. Null when no local Ollama
 *  URL resolves — attributed candidates are then refused, not minted. */
function makeSpeakerJudge(ledger: SpeakerLedger): SpeakerJudge | null {
  const ollamaUrl = resolveLocalOllamaUrl();
  if (!ollamaUrl) return null;
  const transport = ollamaSpeakerTransport(ollamaUrl);
  return (input) => judgeSpeaker(input, { transport, ledger, model: Deno.env.get("OLLAMA_MODEL") || undefined });
}
/** One model_calls row per attempt — the same writer every captured site uses; run_id null (no long_runner row). */
function makeLedger(supabase: { from: (t: string) => unknown }, companyId: string): RegenLedger {
  return (e) => recordModelCall(supabase as never, {
    companyId, runId: null, callSite: e.callSite, usage: e.usage, attempt: e.attempt, promptSha: e.promptSha,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const r = await runOutsideRegen(body, {
      supabase, makeTransport, makeLedger: (cid) => makeLedger(supabase, cid), makeJudge, makeSpeakerJudge,
      models: REGEN_MODELS, genSystem, judgeSystem, quoteMaxWords: QUOTE_MAX_WORDS, perUrlCap: PER_URL_CAP, wallMs: WALL_MS,
    });
    return json(r.body, r.status);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
