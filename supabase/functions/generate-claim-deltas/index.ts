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
import {
  computeDeltasForCompany,
  PAIRING_KINDS,
  type PairingKind,
  writeGapPairsIntegrity,
  callOllamaJson,
  GEN_TIMEOUT_MS,
  JUDGE_TIMEOUT_MS,
  JUDGE_DETERMINISM,
} from "../_shared/claimDeltaSynthesis.ts";
import { makeRoutedModel, usdCost } from "../_shared/modelRouter.ts";
import { openaiRecord, openaiRecordsByModel, recordModelCall } from "../_shared/recordModelCall.ts";
import { clampSpendCap, makeLedgeredCapGuard, makeSpendCap } from "../_shared/spendCap.ts";

// SPEND CAP (operator brief 2026-10-22): the output bound a capped deltas call sends (max_tokens) and projects with. The
// proposer and judge answer one short JSON object (verdict, span, one clause) — measured well under this.
export const DELTA_MAX_OUTPUT_TOKENS = 500;

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

  let integrityCtx: { supabase: { from: (t: string) => any }; companyId: string; nowIso: string } | null = null;
  try {
    const { company_id, write, declared_ids, plan, pairing_kind, run_id, page_words_only, spend_cap_usd, spend_cap_since } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const doWrite = write !== false;
    const doPlan = plan === true;

    // GATE B-1: which read this run computes. Default = the founding internal read.
    const pairingKind: PairingKind =
      pairing_kind === undefined || pairing_kind === null ? "internal_vs_public" : pairing_kind;
    if (!PAIRING_KINDS.includes(pairingKind)) {
      return json({ ok: false, error: `pairing_kind must be one of ${PAIRING_KINDS.join(" | ")}` }, 422);
    }

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

    const nowIso = new Date().toISOString();
    // GATE B-1: a failed/skipped PUBLIC FINALIZE must still leave a persisted integrity
    // record (couldn't-check / looked-and-empty) — arm the catch below for exactly that
    // case: public kind, write-mode, unscoped, not a plan.
    if (pairingKind === "public_vs_public" && doWrite && !doPlan && !declaredIds) {
      integrityCtx = { supabase, companyId: company_id, nowIso };
    }
    // ROUTER: each pair's [declared, observed] provenances pick the model. public_vs_public pairs of
    // public claims → external gpt-4.1-mini (proposer + judge); any internal_declared/client_attested
    // declared side → local (internal_vs_public NEVER leaves the machine). Local path byte-identical.
    // SPEND CAP (operator brief 2026-10-22): a requested spend_cap_usd (clamped to SPEND_CAP_CEILING_USD) caps the paid
    // external calls of this run. spend_cap_since (ISO) names when the RUN started, so the chunks and the finalize of one
    // run share one window; absent ⇒ this request's start. On a capped run every external call is ledgered THE MOMENT it
    // returns (not once at the end), because the cap reads the ledger: before each call the pending ledger writes are
    // flushed, a failed ledger write refuses further calls (the cumulative cannot be computed), and the call is projected
    // at signed prices with DELTA_MAX_OUTPUT_TOKENS as its output bound — refused when ledgered + projected > cap.
    const spendCapUsd = clampSpendCap(spend_cap_usd);
    const capSince = typeof spend_cap_since === "string" && !Number.isNaN(Date.parse(spend_cap_since)) ? new Date(spend_cap_since).toISOString() : nowIso;
    const spendCap = spendCapUsd != null ? makeSpendCap({ capUsd: spendCapUsd, companyId: company_id, since: capSince, supabase }) : null;
    const pendingLedger: Array<Promise<boolean>> = [];
    const usage = { prompt_tokens: 0, completion_tokens: 0 };
    let billedModel = "gpt-4.1-mini"; // Gate 3 — the model the cost is attributable to when no external call was made
    const usageByModel = new Map<string, { prompt_tokens: number; completion_tokens: number }>();
    const routedCall = makeRoutedModel({
      callLocalGenerator: (m: string, s: string, u: string) => callOllamaJson(ollamaUrl, m, s, u, GEN_TIMEOUT_MS),
      callLocalJudge: (m: string, s: string, u: string) => callOllamaJson(ollamaUrl, m, s, u, JUDGE_TIMEOUT_MS, JUDGE_DETERMINISM),
      onUsage: (uu, m) => {
        usage.prompt_tokens += uu.prompt_tokens; usage.completion_tokens += uu.completion_tokens;
        // ruling 2 (2026-10-22): usage per model, so each model is ledgered at its own signed rate
        const k = m ?? billedModel; const prev = usageByModel.get(k) ?? { prompt_tokens: 0, completion_tokens: 0 };
        usageByModel.set(k, { prompt_tokens: prev.prompt_tokens + uu.prompt_tokens, completion_tokens: prev.completion_tokens + uu.completion_tokens });
        // capped: ledger this call now, at its own model's signed rate
        if (spendCap) pendingLedger.push(recordModelCall(supabase, { companyId: company_id, runId: null, callSite: "generate-claim-deltas", usage: openaiRecord(k, uu) }));
      },
      ...(spendCap ? {
        externalMaxTokens: DELTA_MAX_OUTPUT_TOKENS,
        beforeExternal: makeLedgeredCapGuard(spendCap, pendingLedger, { site: "generate-claim-deltas", maxOutputTokens: DELTA_MAX_OUTPUT_TOKENS }),
      } : {}),
    });
    const baseArgs = {
      supabase,
      companyId: company_id,
      ollamaUrl,
      nowIso,
      genModel: Deno.env.get("OLLAMA_MODEL") ?? undefined,
      judgeModel: Deno.env.get("OLLAMA_JUDGE_MODEL") ?? undefined,
      write: doWrite,
      declaredIds,
      pairingKind,
      routedCall,
      // Gate 9a — the stepper's child ledger id, provenance on look rows + the looks integrity record.
      runId: run_id != null ? String(run_id) : undefined,
      pageWordsOnly: page_words_only === true,
    };
    const result = doPlan
      ? await computeDeltasForCompany({ ...baseArgs, plan: true })
      : await computeDeltasForCompany(baseArgs);

    if (result.ok) {
      if ("plan" in result) return json(result);
      // GATE 3 — PERSIST THE COST. Computed here since the delta judge landed, returned in a body no
      // caller parsed. recordModelCall never throws: accounting must not take down the work it measures.
      // (Gate 6c: this block sat INSIDE the response literal below from b9fbb81, 2026-09-09 — a syntax
      // error the worker could not boot past; every deltas call answered 503 for two days.)
      // RULING 2 (2026-10-22): one row per model, each at its own signed price; no external call ⇒ the one zero row as before
      if (spendCap) {
        // capped: every call was ledgered as it returned — flush the last writes, add no aggregate row
        await Promise.all(pendingLedger.splice(0));
      } else {
        for (const rec of usageByModel.size ? openaiRecordsByModel(usageByModel) : [openaiRecord(billedModel, usage)]) {
          await recordModelCall(supabase, { companyId: company_id, runId: null, callSite: "generate-claim-deltas", usage: rec });
        }
      }
      // PROOF GUARD: the exclusion ledger (count in totals + ids here) rides every
      // run result — a silent guard would be an invisible decision.
      return json({
        ok: true,
        dry_run: !doWrite,
        scoped: result.scoped,
        totals: result.totals,
        proof_guard_excluded_ids: result.proof_guard_excluded_ids,
        deltas: result.deltas,
        cost: { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens, usd: usdCost(usage) },
        spend_cap: spendCap ? { cap_usd: spendCap.capUsd, since: spendCap.since, refusals: spendCap.refusals } : null,
      });
    }
    if ("skipped" in result) {
      if (result.skipped === "frozen_company") return json({ ok: false, error: "This is a frozen reference company — deltas aren't computed for it." }, 403);
      if (result.skipped === "no_declared_claims") {
        // GATE B-1: an empty public declared side is a LOOKED outcome, not silence.
        if (integrityCtx) {
          await writeGapPairsIntegrity(integrityCtx.supabase, integrityCtx.companyId, {
            status: "skipped_empty_input", ranAtIso: integrityCtx.nowIso, runRef: integrityCtx.nowIso,
          }).catch((e) => console.error("[generate-claim-deltas] integrity skip-write failed:", String(e)));
        }
        // FIRST-RUN LAW: no declared side is an EARNED empty state, never a failure. A first
        // "Run outside signals" run is public-only and must not require internal material — the
        // delta is meaningful only once BOTH sides exist. Return SUCCESS-shaped carrying a
        // machine-readable marker (skipped/empty) so the stepper closes the chain completed-empty.
        // (The old bare 404 destroyed the empty signal at the server-to-server hop — a 404 was
        // indistinguishable from a genuine worker failure, so the stepper failed the whole run.)
        return json({ ok: true, skipped: "no_declared_claims", empty: true, reason: "no declared-side claims for this company" }, 200);
      }
    }
    return json({ ok: false, error: (result as { error: string }).error }, 500);
  } catch (err) {
    console.error("[generate-claim-deltas] error:", String((err as Error)?.message ?? err));
    // GATE B-1: failure-settable integrity — the gap beat renders couldn't-check.
    if (integrityCtx) {
      await writeGapPairsIntegrity(integrityCtx.supabase, integrityCtx.companyId, {
        status: "failed", ranAtIso: integrityCtx.nowIso,
        error: String((err as Error)?.message ?? err).slice(0, 500), runRef: integrityCtx.nowIso,
      }).catch((e) => console.error("[generate-claim-deltas] integrity fail-write failed:", String(e)));
    }
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
