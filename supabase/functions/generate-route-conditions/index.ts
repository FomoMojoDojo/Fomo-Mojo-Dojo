// ── generate-route-conditions ─────────────────────────────────────────────────
//
// Stage-0: deliberate Generate/Regenerate for route WWHTBT conditions. Thin HTTP
// wrapper over the committed _shared/routeConditionSynthesis core
// (generateRouteConditionsForCompany). Per route, produces 2–3 falsifiable
// conditions and writes them onto the parent route's what_would_have_to_be_true
// jsonb (satisfied_flag=false, source='generate-route-conditions:<date>'). Additive:
// it never re-authors the route (provenance_type unchanged) and never touches
// legs/tests. Operator-authored conditions are preserved on re-run; generated
// conditions re-roll (origin-merge).
//
// Accepts { company_id, write? }. write:false ⇒ NO-WRITE DRY-RUN (returns the
// proposed conditions for operator read; nothing persists). write:true (default)
// ⇒ the origin-merge write.
//
// LOCAL-ONLY (Option B privacy): generation/judging go to a localhost Ollama
// (qwen2.5:14b gen + llama3:70b SOLUTION-AGNOSTIC judge). ZERO OpenAI in this path.
// Frozen fixtures (CB1) are HARD-EXCLUDED in the shared core (403 before any write).
//
// Long-running: per-route (14b gen + 70b judge ×N) can exceed the Kong 150s gateway
// timeout. Writes land server-side per-route regardless; the client tolerates a
// timeout and refreshes (mirrors the sibling generators).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateRouteConditionsForCompany } from "../_shared/routeConditionSynthesis.ts";

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
    const doWrite = write !== false; // default true; write:false ⇒ dry-run

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const genModel = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:14b-instruct";
    const judgeModel = Deno.env.get("OLLAMA_JUDGE_MODEL") ?? "llama3:70b";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const result = await generateRouteConditionsForCompany({
      supabase,
      companyId: company_id,
      ollamaUrl,
      genModel,
      judgeModel,
      write: doWrite,
      nowIso: new Date().toISOString(),
    });

    if (result.ok) {
      return json({ ok: true, dry_run: !doWrite, totals: result.totals, perRoute: result.perRoute });
    }
    // Honest skip statuses, returned BEFORE any write runs.
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — conditions aren't generated for it." }, 403);
      if (result.skipped === "no_routes") return json({ ok: false, error: "no active routes for this company" }, 404);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-route-conditions] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
