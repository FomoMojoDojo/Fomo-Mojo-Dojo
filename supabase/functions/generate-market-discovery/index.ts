// ── generate-market-discovery ─────────────────────────────────────────────────
//
// MPD-1b: thin HTTP wrapper over _shared/marketPortfolioDiscovery.ts — multi-
// market portfolio discovery for one company. Accepts { company_id, write?,
// candidates?, plan?, force? }; write:false ⇒ dry-run.
//
// plan:true ⇒ ONE 14b gen call → candidate manifest, ZERO writes/judges
//   (documented deviation from the zero-model-call plan convention: the
//   chunked judges need candidate TEXTS only the gen can produce). Skips
//   'already_discovered' when mkt-* defs exist and !force.
// candidates (non-empty array) ⇒ scoped judge chunk (≤2 recommended: up to
//   3×70b judgments each ≈ within the 150s gateway) — buyer → solution-
//   agnostic → same-market dedup, verdicts banked inline, surviving
//   candidates write def+lens INLINE. Present-but-empty candidates = 422.
// neither ⇒ FINALIZE: verdict prune + census.
//
// LOCAL-ONLY (Option B): internal signal content goes to a localhost Ollama
// only (qwen2.5:14b gen + llama3:70b judges). ZERO OpenAI. require_model:
// failed/unparseable model calls abort loudly (500). CB1 frozen ⇒ 403.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeMarketDiscovery, type MarketCandidate } from "../_shared/marketPortfolioDiscovery.ts";

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
    const { company_id, write, candidates, plan, force } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    // Presence-gated scoping (CH-2b-1 convention): present-but-empty is a
    // caller error, never silently a finalize.
    let scopedCandidates: MarketCandidate[] | undefined;
    if (candidates !== undefined && candidates !== null) {
      const filtered = Array.isArray(candidates)
        ? (candidates as unknown[]).filter(
          (x): x is MarketCandidate =>
            !!x && typeof x === "object" &&
            typeof (x as { job_executor?: unknown }).job_executor === "string" && (x as { job_executor: string }).job_executor.length > 0 &&
            typeof (x as { jtbd?: unknown }).jtbd === "string" && (x as { jtbd: string }).jtbd.length > 0,
        )
        : [];
      if (filtered.length === 0) {
        return json({ ok: false, error: "candidates must be a non-empty array of {job_executor, jtbd, ...} — omit it entirely for the finalize run" }, 422);
      }
      scopedCandidates = filtered;
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
      force: force === true,
      candidates: scopedCandidates,
    };
    const result = doPlan
      ? await computeMarketDiscovery({ ...baseArgs, plan: true })
      : await computeMarketDiscovery(baseArgs);

    if (result.ok) {
      if ("plan" in result) return json(result);
      return json({ ok: true, dry_run: !doWrite, scoped: result.scoped, totals: result.totals, results: result.results });
    }
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — markets aren't discovered for it." }, 403);
      if (result.skipped === "already_discovered") return json({ ok: false, skipped: result.skipped, existing_discovered: result.existing_discovered }, 409);
      if (result.skipped === "no_signals") return json({ ok: false, error: "no outside/organization signals for this company" }, 404);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-market-discovery] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
