// ── generate-market-hypothesis ────────────────────────────────────────────────
//
// Production invocation for MH-5a/5b market hypotheses. Thin HTTP wrapper over the
// committed _shared/marketHypothesisSynthesis core (generateMarketHypothesisForSet)
// — the SAME entry point the bootstrap hook and the backfill use. Accepts
// { company_id, journey_key, force? } and synthesizes ONE market sentence (who +
// the job they're getting done) for that set, judged the buyer's-own-job (not
// seller-framed), written as a labeled hypothesis (provenance='internal_hypothesis').
//
// LOCAL-ONLY (localhost Ollama). Declared/internal sets only. Frozen fixtures
// (CB1/CB2) and manual market_defs are protected in the core. force=true overwrites
// an existing internal_hypothesis (deliberate Regenerate); manual stays protected.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateMarketHypothesisForSet } from "../_shared/marketHypothesisSynthesis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function isLocalOllamaUrl(u: string): boolean {
  try {
    const h = new URL(u).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "host.docker.internal" || h.endsWith(".local");
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { company_id, journey_key, force } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    if (!journey_key || typeof journey_key !== "string") return json({ ok: false, error: "journey_key required" }, 400);

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const genModel = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:14b-instruct";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const result = await generateMarketHypothesisForSet({
      supabase,
      companyId: company_id,
      journeyKey: journey_key,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel,
      runId: `generate-market-hypothesis:${new Date().toISOString().slice(0, 10)}`,
      force: Boolean(force),
    });

    if (result.ok) return json({ ok: true, journey_key, written: result.written });
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This company is a frozen reference fixture (SELECT-only)." }, 403);
      if (result.skipped === "protected_manual") return json({ ok: false, error: "This market is operator-authored (manual) and is never overwritten." }, 409);
      if (result.skipped === "no_steps") return json({ ok: false, error: `no steps for journey '${journey_key}'` }, 404);
      return json({ ok: false, error: `market for '${journey_key}' already has a hypothesis; pass force to regenerate.` }, 409);
    }
    if ("rejected" in result) return json({ ok: false, error: "Generated market read as seller/acquisition framing — not written.", candidate: result.candidate }, 422);
    return json({ ok: false, error: result.error }, 500);
  } catch (err) {
    console.error("[generate-market-hypothesis] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
