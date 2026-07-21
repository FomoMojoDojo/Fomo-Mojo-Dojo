// ── generate-market-options ───────────────────────────────────────────────────
//
// MO-1: thin HTTP wrapper over _shared/marketOptionSynthesis.ts — ODI-form
// PRELIMINARY MARKET OPTIONS for one company. Accepts
// { company_id, write?, plan?, candidates?, run_target? }.
//
// plan:true    ⇒ ONE 14b gen call → candidate manifest, ZERO writes/judges.
//                (Same documented deviation as generate-market-discovery: the
//                chunked judges need candidate TEXTS only the gen can produce.)
//                Candidates already banked — candidate OR rejected — are
//                filtered out of the manifest: a banked verdict is frozen.
// candidates   ⇒ scoped judge chunk (≤2 recommended: up to 3×70b judgments each
//                against the ~150s gateway wall). Three criteria, verdicts
//                banked INLINE at verdict time so a killed run keeps its work.
//                Present-but-empty candidates = 422 (caller error, never a
//                silent finalize).
// revise:true  ⇒ ONE 14b rewrite per rejected attempt-1 option (the judge's
//                named failing criterion is fed back as a targeted instruction).
//                ZERO writes, ZERO judge calls — returns a manifest of revisions,
//                each carrying revision_of, for the next judge chunk. One cycle
//                only: an original that already has a revision is skipped.
// neither      ⇒ FINALIZE: census.
//
// MODEL-PHASE BATCHING: plan runs the only 14b call; every chunk is 70b-only.
// One model resident in VRAM per phase — the client driver must not interleave.
//
// A NEW row is written per surviving option. odi_market_definitions is read for
// context ONLY — never updated, never deleted. Options are hypotheses by proof
// law (market_options.proof_tier CHECK) and never auto-promote.
//
// LOCAL-ONLY (Option B): qwen2.5:14b gen + llama3:70b judges on a localhost
// Ollama. ZERO OpenAI. require_model: failed/unparseable model calls abort
// loudly (500) with zero further writes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeMarketOptions,
  RUN_KIND,
  type MarketOptionCandidate,
} from "../_shared/marketOptionSynthesis.ts";

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
    const { company_id, write, plan, revise, collapse, candidates, run_target } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;
    const doRevise = revise === true;
    const doCollapse = collapse === true;

    // Presence-gated scoping: present-but-empty is a caller error, never a
    // silent finalize.
    let scopedCandidates: MarketOptionCandidate[] | undefined;
    if (candidates !== undefined && candidates !== null) {
      const filtered = Array.isArray(candidates)
        ? (candidates as unknown[]).filter(
          (x): x is MarketOptionCandidate =>
            !!x && typeof x === "object" &&
            typeof (x as { executor_statement?: unknown }).executor_statement === "string" &&
            (x as { executor_statement: string }).executor_statement.length > 0 &&
            typeof (x as { job_statement?: unknown }).job_statement === "string" &&
            (x as { job_statement: string }).job_statement.length > 0,
        ).map((x) => ({
          executor_statement: (x as MarketOptionCandidate).executor_statement,
          job_statement: (x as MarketOptionCandidate).job_statement,
          basis: (x as MarketOptionCandidate).basis,
          revision_of: (x as MarketOptionCandidate).revision_of,
        }))
        : [];
      if (filtered.length === 0) {
        return json({ ok: false, error: "candidates must be a non-empty array of {executor_statement, job_statement, basis?} — omit it entirely for the finalize run" }, 422);
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

    // ── START-of-run ledger (long_runner_runs) ───────────────────────────────
    // Written BEFORE generation. Self-owned, non-fatal: a ledger failure never
    // breaks a run. Plan is zero-writes by law and opens no ledger row; the
    // first WRITING chunk opens it, later chunks advance done_count, the
    // FINALIZE terminal-marks it.
    let ledgerRowId: string | null = null;
    if (doWrite && !doPlan && !doRevise) {
      try {
        const { data: runningRows } = await supabase
          .from("long_runner_runs")
          .select("id")
          .eq("run_kind", RUN_KIND)
          .eq("company_id", company_id)
          .eq("status", "running")
          .limit(1);
        ledgerRowId = (runningRows as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!ledgerRowId && scopedCandidates) {
          const target = typeof run_target === "number" && run_target >= 0
            ? Math.floor(run_target)
            : scopedCandidates.length;
          const { data: ledgerRow } = await supabase
            .from("long_runner_runs")
            .insert({ run_kind: RUN_KIND, company_id, status: "running", target_count: target })
            .select("id")
            .single();
          ledgerRowId = (ledgerRow as { id?: unknown } | null)?.id ? String((ledgerRow as { id: unknown }).id) : null;
        }
      } catch (e) {
        console.log("[market-options] ledger start error", String((e as Error)?.message ?? e));
      }
    }

    const baseArgs = {
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel: Deno.env.get("OLLAMA_MODEL") ?? undefined,
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
      candidates: scopedCandidates,
      runId: ledgerRowId,
    };

    let result;
    try {
      result = doPlan
        ? await computeMarketOptions({ ...baseArgs, plan: true })
        : doRevise
        ? await computeMarketOptions({ ...baseArgs, revise: true })
        : doCollapse
        ? await computeMarketOptions({ ...baseArgs, collapse: true })
        : await computeMarketOptions(baseArgs);
    } catch (err) {
      // Terminal-mark on a chunk crash. Verdicts banked inline survive; a
      // re-plan resumes from what is already frozen.
      if (ledgerRowId) {
        try {
          await supabase.from("long_runner_runs").update({
            status: "failed",
            error_text: String((err as Error)?.message ?? err),
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", ledgerRowId);
        } catch { /* non-fatal */ }
      }
      throw err;
    }

    if (result.ok && ledgerRowId) {
      try {
        if ("scoped" in result && result.scoped) {
          const processed = result.totals.terminal;
          const { data: row } = await supabase
            .from("long_runner_runs").select("done_count").eq("id", ledgerRowId).single();
          const done = Number((row as { done_count?: unknown } | null)?.done_count ?? 0) + processed;
          await supabase.from("long_runner_runs")
            .update({ done_count: done, updated_at: new Date().toISOString() })
            .eq("id", ledgerRowId);
        } else {
          await supabase.from("long_runner_runs").update({
            status: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", ledgerRowId);
        }
      } catch (e) {
        console.log("[market-options] ledger update error", String((e as Error)?.message ?? e));
      }
    }

    if (result.ok) {
      if ("plan" in result) return json(result);
      if ("collapse" in result) return json(result);
      return json({ ok: true, dry_run: !doWrite, scoped: result.scoped, totals: result.totals, results: result.results });
    }
    if ("skipped" in result) {
      if (result.skipped === "no_evidence") {
        return json({ ok: false, error: "no open findings for this company — options are generated from the outside record" }, 404);
      }
      if (result.skipped === "frozen_company") {
        return json({ ok: false, error: "This is a frozen reference company — options aren't generated for it." }, 403);
      }
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-market-options] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
