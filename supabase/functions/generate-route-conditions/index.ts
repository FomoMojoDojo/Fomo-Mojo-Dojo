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
import { generateRouteConditionsForCompany, type RouteConditionResult } from "../_shared/routeConditionSynthesis.ts";

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
    const { company_id, write, route_ids, plan, run_target } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false; // default true; write:false ⇒ dry-run
    const doPlan = plan === true;
    // WF-3: presence-gated scoping — an empty route_ids array is a caller error, never
    // silently the whole company (a chunk intent must not become a full run).
    let routeIds: string[] | undefined;
    if (route_ids !== undefined && route_ids !== null) {
      const filtered = Array.isArray(route_ids) ? (route_ids as unknown[]).filter((x): x is string => typeof x === "string" && x.length > 0) : [];
      if (filtered.length === 0) return json({ ok: false, error: "route_ids must be a non-empty array of route ids — omit it for the whole company" }, 422);
      routeIds = filtered;
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const genModel = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:14b-instruct";
    const judgeModel = Deno.env.get("OLLAMA_JUDGE_MODEL") ?? "llama3:70b";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    // PLAN — the route worklist manifest for the client's chunk loop (zero model calls,
    // zero writes; resume truth).
    if (doPlan) {
      const p = await generateRouteConditionsForCompany({ supabase, companyId: company_id, ollamaUrl, genModel, judgeModel, write: false, routeIds, nowIso: new Date().toISOString(), plan: true });
      if (p.ok) return json(p);
      if (p.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — conditions aren't generated for it." }, 403);
      return json({ ok: false, error: "no active routes for this company" }, 404);
    }

    // START-of-run ledger (long_runner_runs, WF-3) — the first WRITING chunk creates the
    // row (client passes run_target = the plan's route count); each chunk advances
    // done_count; when done_count ≥ target the run is marked completed. Non-fatal: a
    // ledger failure never breaks the run. Resume-by-reclick: re-planning re-chunks the
    // routes not yet reconciled; the origin-merge is idempotent per route.
    const RUN_KIND = "route_conditions";
    let ledgerRowId: string | null = null;
    if (doWrite) {
      try {
        const { data: running } = await supabase.from("long_runner_runs").select("id").eq("run_kind", RUN_KIND).eq("company_id", company_id).eq("status", "running").limit(1);
        ledgerRowId = (running as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!ledgerRowId) {
          const target = typeof run_target === "number" && run_target >= 0 ? Math.floor(run_target) : (routeIds?.length ?? 0);
          const { data: row } = await supabase.from("long_runner_runs").insert({ run_kind: RUN_KIND, company_id, status: "running", target_count: target }).select("id").single();
          ledgerRowId = (row as { id?: unknown } | null)?.id ? String((row as { id: unknown }).id) : null;
        }
      } catch (e) {
        console.log("[route-conditions] ledger start error", String((e as Error)?.message ?? e));
      }
    }

    let result: RouteConditionResult;
    try {
      result = await generateRouteConditionsForCompany({
        supabase,
        companyId: company_id,
        ollamaUrl,
        genModel,
        judgeModel,
        write: doWrite,
        routeIds,
        nowIso: new Date().toISOString(),
      });
    } catch (err) {
      if (ledgerRowId) {
        try { await supabase.from("long_runner_runs").update({ status: "failed", error_text: String((err as Error)?.message ?? err), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledgerRowId); } catch { /* non-fatal */ }
      }
      throw err;
    }

    if (result.ok && ledgerRowId) {
      try {
        const { data: row } = await supabase.from("long_runner_runs").select("done_count, target_count").eq("id", ledgerRowId).single();
        const done = Number((row as { done_count?: unknown } | null)?.done_count ?? 0) + result.totals.routes;
        const target = Number((row as { target_count?: unknown } | null)?.target_count ?? 0);
        const patch: Record<string, unknown> = { done_count: done, updated_at: new Date().toISOString() };
        if (target > 0 && done >= target) { patch.status = "completed"; patch.finished_at = new Date().toISOString(); }
        await supabase.from("long_runner_runs").update(patch).eq("id", ledgerRowId);
      } catch (e) {
        console.log("[route-conditions] ledger update error", String((e as Error)?.message ?? e));
      }
    }

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
