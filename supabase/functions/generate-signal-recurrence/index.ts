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
import { computeRecurrenceForCompany } from "../_shared/signalRecurrence.ts";

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
    const { company_id, write, pairs, plan } = await req.json();
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

    const baseArgs = {
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
      pairs: scopedPairs,
    };
    const result = doPlan
      ? await computeRecurrenceForCompany({ ...baseArgs, plan: true })
      : await computeRecurrenceForCompany(baseArgs);

    if (result.ok) {
      if ("plan" in result) return json(result);
      return json({ ok: true, dry_run: !doWrite, scoped: result.scoped, totals: result.totals, verdicts: result.verdicts });
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
