// ── generate-declared-markets ─────────────────────────────────────────────────
//
// MPD-1f-1b: thin HTTP wrapper over _shared/declaredMarketIngest.ts — lands
// client-DECLARED markets (declared_direction canvas/cascade artifacts) as
// odi_market_definitions rows at internal_declared provenance. Accepts
// { company_id, write?, plan? }; write:false ⇒ dry-run; plan:true ⇒ source
// manifest (zero model calls, zero writes).
//
// NO reality judges run here — declared markets are never rejected (provenance
// ⊥ proof). The only model calls: format-only 14b shaping (non-strengthening)
// + the unchanged 70b same-market judge for cross-provenance PAIRING.
//
// LOCAL-ONLY (Option B): declared content goes to a localhost Ollama only.
// ZERO OpenAI. Frozen fixtures (CB1) hard-excluded in the core (403).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeDeclaredIngest } from "../_shared/declaredMarketIngest.ts";

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
    const { company_id, write, plan } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    const baseArgs = {
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel: Deno.env.get("OLLAMA_MODEL") ?? undefined,
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
    };
    const result = doPlan
      ? await computeDeclaredIngest({ ...baseArgs, plan: true })
      : await computeDeclaredIngest(baseArgs);

    if (result.ok) {
      if ("plan" in result) return json(result);
      return json({ ok: true, dry_run: !doWrite, totals: result.totals, results: result.results });
    }
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — declared markets aren't ingested for it." }, 403);
      if (result.skipped === "no_declared_sources") return json({ ok: false, error: "no declared_direction artifacts with market content for this company" }, 404);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-declared-markets] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
