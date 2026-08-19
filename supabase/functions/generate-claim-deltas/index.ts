// ── generate-claim-deltas ─────────────────────────────────────────────────────
//
// INT-3: thin HTTP wrapper over _shared/claimDeltaSynthesis.ts — computes the
// internal-declared vs public-observed claim deltas for one company (the
// founding signal). Accepts { company_id, write?, declared_ids?, plan? };
// write:false ⇒ dry-run. CH-2b-1: declared_ids (non-empty array) ⇒ scoped
// pairs-only chunk (no silences, no sweep — presence-gated in the core);
// present-but-empty declared_ids is a caller error (422), never silently a
// full run. plan:true ⇒ candidate manifest, zero model calls, zero writes.
// Absent declared_ids + absent plan ⇒ the full run (the finalize pass).
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
    const { company_id, write, declared_ids, plan } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    // CH-2b-1: presence-gated scoping. Present-but-empty (after dropping
    // non-strings) is a CALLER ERROR — a scoped intent must never be silently
    // promoted to a full (sweep-running) run.
    let declaredIds: string[] | undefined;
    if (declared_ids !== undefined && declared_ids !== null) {
      const filtered = Array.isArray(declared_ids)
        ? (declared_ids as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0)
        : [];
      if (filtered.length === 0) {
        return json({ ok: false, error: "declared_ids must be a non-empty array of declared claim ids — omit it entirely for a full run" }, 422);
      }
      declaredIds = filtered;
    }

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
      declaredIds,
    };
    const result = doPlan
      ? await computeDeltasForCompany({ ...baseArgs, plan: true })
      : await computeDeltasForCompany(baseArgs);

    if (result.ok) {
      if ("plan" in result) return json(result);
      // PROOF GUARD: the exclusion ledger (count in totals + ids here) rides every
      // run result — a silent guard would be an invisible decision.
      return json({
        ok: true,
        dry_run: !doWrite,
        scoped: result.scoped,
        totals: result.totals,
        proof_guard_excluded_ids: result.proof_guard_excluded_ids,
        deltas: result.deltas,
      });
    }
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
