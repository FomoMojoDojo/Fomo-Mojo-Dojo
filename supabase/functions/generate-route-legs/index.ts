// ── generate-route-legs ───────────────────────────────────────────────────────
//
// Gate 2: deliberate Regenerate for route legs. Thin HTTP wrapper over the
// committed _shared/routeLegSynthesis core (generateLegsForCompany). Turns each of
// a route's `what_would_have_to_be_true` conditions into ONE supporting leg
// (level='leg', parent_id=route, provenance_type='internal_hypothesis'). Generated
// legs are Starting hypotheses; operator-edited legs (source LIKE 'manual_%') are
// preserved on re-run while generated legs re-roll.
//
// Accepts { company_id, write? }. write:false ⇒ NO-WRITE DRY-RUN (returns the
// proposed legs for operator read; nothing persists). write:true (default) ⇒ the
// origin-merge write.
//
// LOCAL-ONLY (Option B privacy): generation/judging go to a localhost Ollama
// (qwen2.5:14b gen + llama3:70b honesty judge). ZERO OpenAI in this path. Frozen
// fixtures (CB1/CB2) are HARD-EXCLUDED in the shared core (403 before any write).
//
// Long-running: per-condition (14b gen + 70b judge) can exceed the Kong 150s
// gateway timeout. The writes land server-side regardless; the client tolerates a
// timeout and polls the route's legs (mirrors the sibling follow-ons).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateLegsForCompany } from "../_shared/routeLegSynthesis.ts";

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

    const result = await generateLegsForCompany({
      supabase,
      companyId: company_id,
      ollamaUrl,
      genModel,
      judgeModel,
      write: doWrite,
      runId: `generate-route-legs:${new Date().toISOString().slice(0, 10)}`,
      nowIso: new Date().toISOString(),
    });

    if (result.ok) {
      return json({ ok: true, dry_run: !doWrite, totals: result.totals, perRoute: result.perRoute });
    }
    // Honest skip statuses, returned BEFORE any delete/insert runs.
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — legs aren't generated for it." }, 403);
      if (result.skipped === "no_routes") return json({ ok: false, error: "no active routes for this company" }, 404);
      if (result.skipped === "no_conditions") return json({ ok: false, error: "No conditions to turn into legs yet." }, 422);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-route-legs] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
