// ── rebuild-claims ────────────────────────────────────────────────────────────
//
// RB-1 Stage 4: the signal-derived claim reconcile, moved OFF the public-baseline
// request path into its own invocation with its own fresh request budget.
//
// Why a separate invocation (chunked-invocation-with-resume, cf. CH-1 leg-tests):
// the reconcile previously ran at the tail of the generation request, in the
// overtime left after web-search + assembly had already spent the budget. That is
// how Edgewood was stranded (21 claims / 0 refs). public-baseline now fires this
// function after ingest (waitUntil → fetch, like triggerMojoAnalysis), so the
// reconcile runs with a full budget of its own.
//
// CHUNK UNIT = one company's WHOLE reconcile, which is also the transaction unit
// (rebuild_claims_apply, RB-1 Stage 2). The reconcile is INDIVISIBLE: the mapper
// groups signals across the entire set, the prune needs the full candidate set to
// know what is stale, and the apply must be atomic. So the chunk boundary and the
// transaction boundary are deliberately IDENTICAL — a chunk commits wholly or rolls
// back wholly, and no partially-rebuilt pool is ever visible between chunks.
//
// RESUME = re-invoke. The reconcile is idempotent (deterministic ids + atomic
// upsert + delete-all/insert-same refs converge to a fixed point), so an
// interrupted run is completed by simply calling again — no duplication. The
// claim_rebuild ledger (RB-1 Stage 3) records whether the last attempt finished.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rebuildCompanyReconcile } from "../_shared/evidencePhase1.ts";

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
    const { company_id } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const stats = await rebuildCompanyReconcile(supabase as never, company_id);
    return json({ ok: true, company_id, stats });
  } catch (err) {
    console.error("[rebuild-claims] error:", err);
    return json({ ok: false, error: String((err as { message?: unknown })?.message ?? err) }, 500);
  }
});
