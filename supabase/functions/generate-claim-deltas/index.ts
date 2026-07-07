// ── generate-claim-deltas ─────────────────────────────────────────────────────
//
// INT-3: thin HTTP wrapper over _shared/claimDeltaSynthesis.ts — computes the
// internal-declared vs public-observed claim deltas for one company (the
// founding signal). Accepts { company_id, write? }; write:false ⇒ dry-run.
//
// LOCAL-ONLY (Option B): this compares internal content; generation/judging go
// to a localhost Ollama (qwen2.5:14b proposer + llama3:70b judge). ZERO OpenAI.
// require_model: a failed/unparseable model call aborts the run loudly (500) —
// no template fallback. Frozen fixtures (CB1) are hard-excluded in the core.
//
// NOTE (FMD-2 lesson): the per-request isolate wall-clock (~400s) bounds how
// many candidate pairs one request can judge. Recompute is identity-cached, so
// repeated invocations converge; big first runs use the sanctioned harness.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeDeltasForCompany } from "../_shared/claimDeltaSynthesis.ts";

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
    const { company_id, write } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    const result = await computeDeltasForCompany({
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel: Deno.env.get("OLLAMA_MODEL") ?? undefined,
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
    });

    if (result.ok) return json({ ok: true, dry_run: !doWrite, totals: result.totals, deltas: result.deltas });
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — deltas aren't computed for it." }, 403);
      if (result.skipped === "no_declared_claims") return json({ ok: false, error: "no internal_declared claims for this company" }, 404);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-claim-deltas] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
