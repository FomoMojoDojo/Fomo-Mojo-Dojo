// ── generate-step-conditions ──────────────────────────────────────────────────
//
// Production invocation for b-ii per-step conditions. Thin HTTP wrapper over the
// committed _shared/stepConditionsSynthesis core (generateConditionsForSet) — the
// SAME entry point the bootstrap-gen hook (B-II-4b) uses. Accepts
// { company_id, journey_key } and runs generate→judge→writer for that one set,
// field-merging (origin:generated replaced, origin:operator kept).
//
// LOCAL-ONLY: generation/judging go to a localhost Ollama (14b + 70b). Declared /
// internal_derived sets only. Frozen fixtures (CB1/CB2) are HARD-EXCLUDED.
//
// Long-running: 8 steps × (14b gen + 70b judge) can exceed the Kong 150s gateway
// timeout. The writes land server-side regardless; the client tolerates a timeout
// and polls conditions_json (mirrors the run-mojo-analysis button pattern).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateConditionsForSet } from "../_shared/stepConditionsSynthesis.ts";

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
    const { company_id, journey_key } = await req.json();
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

    const result = await generateConditionsForSet({
      supabase,
      companyId: company_id,
      journeyKey: journey_key,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel,
      runId: `generate-step-conditions:${new Date().toISOString().slice(0, 10)}`,
    });

    if (result.ok) return json({ ok: true, journey_key, totals: result.totals });
    // Map skip reasons → honest HTTP statuses.
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This company is a frozen reference fixture (SELECT-only); conditions are not generated for it." }, 403);
      if (result.skipped === "no_steps") return json({ ok: false, error: `no steps for journey '${journey_key}'` }, 404);
      return json({ ok: false, error: `set '${journey_key}' is not a declared/internal_derived set (provenance: ${(result.provenances ?? []).join(",") || "null"}); conditions are internal-layer only.` }, 422);
    }
    return json({ ok: false, error: result.error }, 500);
  } catch (err) {
    console.error("[generate-step-conditions] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
