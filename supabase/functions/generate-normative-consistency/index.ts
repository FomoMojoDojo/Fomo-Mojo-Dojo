// ── generate-normative-consistency ────────────────────────────────────────────
//
// ACT-C-2: thin HTTP wrapper over _shared/normativeConsistency.ts — scores each
// discovered normative step by how many INDEPENDENT industry sources attest it
// (the 5th C). Mirrors generate-signal-recurrence: { company_id, source_run_id?,
// write?, pairs?, plan?, run_target }.
//   plan:true  ⇒ candidate manifest (step×source), zero model calls / writes.
//   pairs:[..] ⇒ scoped 70b chunk (inline-banked, content-frozen). Present-but-
//                empty pairs is a caller error (422).
//   neither    ⇒ FINALIZE: orphan-prune (audited) + per-step distinct-domain
//                rollup rebuild.
// RUN-BOUND: a step scores only against sources with the same source_run_id.
// LOCAL-ONLY: llama3:70b judge on a localhost Ollama. Frozen fixtures (CB1)
// hard-excluded in the core (403).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeNormativeConsistency } from "../_shared/normativeConsistency.ts";

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
    const { company_id, source_run_id, write, pairs, plan, run_target } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    // Presence-gated scoping: present-but-empty pairs is a caller error.
    let scopedPairs: Array<{ a: string; b: string }> | undefined;
    if (pairs !== undefined && pairs !== null) {
      const filtered = Array.isArray(pairs)
        ? (pairs as unknown[]).filter((x): x is { a: string; b: string } =>
          !!x && typeof x === "object" &&
          typeof (x as { a?: unknown }).a === "string" && (x as { a: string }).a.length > 0 &&
          typeof (x as { b?: unknown }).b === "string" && (x as { b: string }).b.length > 0)
        : [];
      if (filtered.length === 0) return json({ ok: false, error: "pairs must be a non-empty array of {a,b} step/source-id pairs — omit it entirely for the finalize run" }, 422);
      scopedPairs = filtered;
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ) as unknown as { from: (t: string) => any };

    // Resolve the target run: explicit source_run_id, else the company's most
    // recent map (normative_job_steps.source_run_id by computed_at).
    let runId = String(source_run_id || "").trim();
    if (!runId) {
      const { data: latest } = await supabase.from("normative_job_steps").select("source_run_id, computed_at").eq("company_id", company_id).order("computed_at", { ascending: false }).limit(1);
      runId = String((latest as Array<{ source_run_id?: unknown }> | null)?.[0]?.source_run_id ?? "");
      if (!runId) return json({ ok: false, error: "no normative_job_steps map for this company — run generate-normative-jobmap (C-1) first" }, 404);
    }

    const baseArgs = {
      supabase,
      companyId: company_id,
      sourceRunId: runId,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
      pairs: scopedPairs,
    };

    if (doPlan) {
      const result = await computeNormativeConsistency({ ...baseArgs, plan: true });
      if (result.ok) return json(result);
      if ("skipped" in result) return json({ ok: false, error: result.skipped === "frozen_company" ? "This is a frozen reference company — consistency isn't computed for it." : "No normative map for this run." }, result.skipped === "frozen_company" ? 403 : 404);
      return json({ ok: false, error: (result as { error: string }).error }, 500);
    }

    // START-of-run ledger (long_runner_runs) — mirrors generate-signal-recurrence.
    const RUN_KIND = "normative_consistency";
    let ledgerRowId: string | null = null;
    if (doWrite) {
      try {
        const { data: running } = await supabase.from("long_runner_runs").select("id").eq("run_kind", RUN_KIND).eq("company_id", company_id).eq("status", "running").limit(1);
        ledgerRowId = (running as Array<{ id: string }> | null)?.[0]?.id ?? null;
        if (!ledgerRowId) {
          const target = typeof run_target === "number" && run_target >= 0 ? Math.floor(run_target) : (scopedPairs?.length ?? 0);
          const { data: row } = await supabase.from("long_runner_runs").insert({ run_kind: RUN_KIND, company_id, status: "running", target_count: target }).select("id").single();
          ledgerRowId = (row as { id?: unknown } | null)?.id ? String((row as { id: unknown }).id) : null;
        }
      } catch (e) {
        console.log("[normative-consistency] ledger start error", String((e as Error)?.message ?? e));
      }
    }

    let result;
    try {
      result = await computeNormativeConsistency(baseArgs);
    } catch (err) {
      if (ledgerRowId && !scopedPairs) {
        try {
          await supabase.from("long_runner_runs").update({ status: "failed", error_text: String((err as Error)?.message ?? err), finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledgerRowId);
        } catch { /* non-fatal */ }
      }
      throw err;
    }

    if (result.ok && ledgerRowId) {
      try {
        if (result.scoped) {
          const processed = result.totals.judged + result.totals.cached;
          const { data: row } = await supabase.from("long_runner_runs").select("done_count").eq("id", ledgerRowId).single();
          const done = Number((row as { done_count?: unknown } | null)?.done_count ?? 0) + processed;
          await supabase.from("long_runner_runs").update({ done_count: done, updated_at: new Date().toISOString() }).eq("id", ledgerRowId);
        } else {
          await supabase.from("long_runner_runs").update({ status: "completed", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ledgerRowId);
        }
      } catch (e) {
        console.log("[normative-consistency] ledger update error", String((e as Error)?.message ?? e));
      }
    }

    if (result.ok) return json({ ok: true, dry_run: !doWrite, source_run_id: runId, scoped: result.scoped, totals: result.totals, steps: result.steps });
    if ("skipped" in result) return json({ ok: false, error: result.skipped === "frozen_company" ? "This is a frozen reference company — consistency isn't computed for it." : "No normative map for this run." }, result.skipped === "frozen_company" ? 403 : 404);
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-normative-consistency] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
