// ── backstop-delta-relevance ──────────────────────────────────────────────────
//
// Verdict-level relevance backstop worker for ONE company (public_vs_public only). Reads the
// company's echoed/divergent delta rows that are not yet relevance-judged, runs the two-stage
// backstop (deterministic router → routed relevance judge), and UPDATEs the six overlay columns
// on claim_deltas. It NEVER calls generate-claim-deltas and NEVER inserts/deletes a claim_deltas
// row. Frozen companies are refused in the core (and by the DB trigger). Accepts
// { company_id, write?, max_judge? }. write:false ⇒ dry-run (no writes at all).
//
// ROUTER (Option B): the relevance judge is routed by input provenance via _shared/modelRouter.ts,
// never hardcoded. For public_vs_public both sides are public_observed ⇒ external gpt-4.1-mini for
// every judge call; no local-model path is exercised on this surface. require_model: an
// unparseable judge answer aborts loudly (500), the row stays NULL/unjudged (revisitable).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeRelevanceForCompany } from "../_shared/relevanceBackstop.ts";
import { makeRoutedModel, usdCost } from "../_shared/modelRouter.ts";
import { callOllamaJson, GEN_TIMEOUT_MS, JUDGE_TIMEOUT_MS, JUDGE_DETERMINISM } from "../_shared/claimDeltaSynthesis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { company_id, write, max_judge } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const maxJudge = typeof max_judge === "number" && max_judge > 0 ? Math.floor(max_judge) : undefined;

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    const nowIso = new Date().toISOString();

    // ROUTER: public_vs_public pairs are all-public ⇒ external gpt-4.1-mini. The local callers are
    // wired for completeness/defense-in-depth but are never reached on this all-public surface.
    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    const routedCall = makeRoutedModel({
      callLocalGenerator: (m: string, s: string, u: string) => callOllamaJson(ollamaUrl, m, s, u, GEN_TIMEOUT_MS),
      callLocalJudge: (m: string, s: string, u: string) => callOllamaJson(ollamaUrl, m, s, u, JUDGE_TIMEOUT_MS, JUDGE_DETERMINISM),
      onUsage: (uu) => { usage.prompt_tokens += uu.prompt_tokens; usage.completion_tokens += uu.completion_tokens; },
    });

    const result = await computeRelevanceForCompany({
      supabase,
      companyId: company_id,
      nowIso,
      write: doWrite,
      routedCall,
      maxJudge,
      pairingKind: "public_vs_public",
    });

    if (result.ok) {
      return json({
        ok: true,
        dry_run: !doWrite,
        totals: result.totals,
        cost: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) },
      });
    }
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") {
        return json({ ok: false, error: "This is a frozen reference company — the relevance backstop is not run for it." }, 403);
      }
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[backstop-delta-relevance] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
