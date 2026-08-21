// ── generate-signal-recurrence ────────────────────────────────────────────────
//
// CV-2d-1: thin HTTP wrapper over _shared/signalRecurrence.ts — the CONSISTENT
// computation (same fact recurring across independent outside sources) for one
// company. Accepts { company_id, write?, pairs?, plan? }; write:false ⇒ dry-run.
// pairs (non-empty array of {a,b} signal-id pairs) ⇒ scoped judge-only chunk —
// no pruning, no cluster rebuild; present-but-empty pairs is a caller error
// (422), never silently a full run. plan:true ⇒ candidate manifest, zero model
// calls, zero writes. Absent pairs + absent plan ⇒ the unscoped FINALIZE
// (verdict prune + union-find clusters + finding_recurrence reconcile).
//
// LOCAL-ONLY (Option B): judging goes to a localhost Ollama (llama3:70b judge —
// judge duty is 70b-only; this pipeline has NO generation stage). ZERO OpenAI.
// require_model: a failed/unparseable judge call aborts loudly (500) — no
// template fallback. Frozen fixtures (CB1) are hard-excluded in the core.
//
// Wall-clock: each fresh pair ≈ one 70b judgment (~26s cold-swap worst case);
// callers chunk at ~4-5 fresh pairs per request under the 150s gateway ceiling.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeRecurrenceForCompany, callOllamaJson, JUDGE_TIMEOUT_MS } from "../_shared/signalRecurrence.ts";
import { makeRoutedJudge, usdCost } from "../_shared/modelRouter.ts";

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
    const { company_id, write, pairs, plan, run_target } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    // Presence-gated scoping (CH-2b-1 convention): present-but-empty pairs is a
    // CALLER ERROR — a scoped intent must never silently become a finalize.
    let scopedPairs: Array<{ a: string; b: string }> | undefined;
    if (pairs !== undefined && pairs !== null) {
      const filtered = Array.isArray(pairs)
        ? (pairs as unknown[]).filter(
          (x): x is { a: string; b: string } =>
            !!x && typeof x === "object" &&
            typeof (x as { a?: unknown }).a === "string" && (x as { a: string }).a.length > 0 &&
            typeof (x as { b?: unknown }).b === "string" && (x as { b: string }).b.length > 0,
        )
        : [];
      if (filtered.length === 0) {
        return json({ ok: false, error: "pairs must be a non-empty array of {a,b} signal-id pairs — omit it entirely for the finalize run" }, 422);
      }
      scopedPairs = filtered;
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    // ROUTER: pairs of all-public signals judge on the fast external model; any analysis/NULL/internal
    // input keeps the pair on the local llama3:70b judge (byte-identical local path via callLocal).
    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    const routedJudge = makeRoutedJudge({
      callLocal: (m: string, s: string, u: string) => callOllamaJson(ollamaUrl, m, s, u, JUDGE_TIMEOUT_MS),
      onUsage: (uu) => { usage.prompt_tokens += uu.prompt_tokens; usage.completion_tokens += uu.completion_tokens; },
    });
    const baseArgs = {
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
      pairs: scopedPairs,
      routedJudge,
    };

    if (doPlan) {
      const result = await computeRecurrenceForCompany({ ...baseArgs, plan: true });
      if (result.ok) return json(result);
      if ("skipped" in result && result.skipped === "frozen_company") {
        return json({ ok: false, error: "This is a frozen reference company — recurrence isn't computed for it." }, 403);
      }
      return json({ ok: false, error: (result as { error: string }).error }, 500);
    }

    // ── START-of-run ledger (long_runner_runs, CV-2d-2c) ──────────────────────
    // Self-owned, non-fatal, mirrors public-baseline's writer. A run's first
    // writing CHUNK creates the row (plan is zero-writes by law; the client
    // passes run_target = the plan's fresh count); later chunks advance
    // done_count; the FINALIZE terminal-updates it. A ledger failure never
    // breaks a run.
    const RUN_KIND = "signal_recurrence";
    let ledgerRowId: string | null = null;
    if (doWrite) {
      try {
        const { data: runningRows } = await supabase
          .from("long_runner_runs")
          .select("id")
          .eq("run_kind", RUN_KIND)
          .eq("company_id", company_id)
          .eq("status", "running")
          .limit(1);
        ledgerRowId = (runningRows as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!ledgerRowId) {
          const target = typeof run_target === "number" && run_target >= 0
            ? Math.floor(run_target)
            : (scopedPairs?.length ?? 0);
          const { data: ledgerRow } = await supabase
            .from("long_runner_runs")
            .insert({ run_kind: RUN_KIND, company_id, status: "running", target_count: target })
            .select("id")
            .single();
          ledgerRowId = (ledgerRow as { id?: unknown } | null)?.id ? String((ledgerRow as { id: unknown }).id) : null;
        }
      } catch (e) {
        console.log("[signal-recurrence] ledger start error", String((e as Error)?.message ?? e));
      }
    }

    let result;
    try {
      result = await computeRecurrenceForCompany(baseArgs);
    } catch (err) {
      // Terminal-mark the ledger on a scoped-chunk crash too (finalize marks
      // its own outcome below); banked verdicts survive, re-click resumes.
      if (ledgerRowId && !scopedPairs) {
        try {
          await supabase.from("long_runner_runs").update({
            status: "failed", error_text: String((err as Error)?.message ?? err),
            finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", ledgerRowId);
        } catch { /* non-fatal */ }
      }
      throw err;
    }

    if (result.ok && ledgerRowId) {
      try {
        if (result.scoped) {
          // Advance done_count by the pairs this chunk disposed of (judged or
          // already-frozen). Single-writer per company in practice.
          const processed = result.totals.judged + result.totals.cached;
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
        console.log("[signal-recurrence] ledger update error", String((e as Error)?.message ?? e));
      }
    }

    if (result.ok) {
      return json({ ok: true, dry_run: !doWrite, scoped: result.scoped, totals: result.totals, verdicts: result.verdicts, cost: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) } });
    }
    if ("skipped" in result && result.skipped === "frozen_company") {
      return json({ ok: false, error: "This is a frozen reference company — recurrence isn't computed for it." }, 403);
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-signal-recurrence] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
