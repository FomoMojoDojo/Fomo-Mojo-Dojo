// LOCAL LANE Phase 2 — local canonical generator (the safety net for the canonical
// generation e63f11c gated off OpenAI for internal subjects). Reformats a row's OWN
// desired_outcome into ODI canonical form LOCALLY (qwen2.5:14b, direct Ollama,
// native /api/chat) — internal text NEVER reaches OpenAI. This module imports NO
// OpenAI client, so the Option-B guarantee is structural.
//
// Inherits Phase 1's template (localAlignmentJudge): single-sourced inputs,
// fail-closed, one integrity row per eval. The ODI formula PROMPT + the
// deterministic isValidCanonical GUARD are single-sourced in odiCanonical.ts. NO 70b
// faithfulness judge (deferred — a one-module add later if drift shows). This is the
// template Phase 3 (cascade) inherits.
//
// Fail-closed: on qwen error / unparseable / failed-isValidCanonical → record an
// integrity_runs row and RETURN {canonical:null} (skip — caller leaves the column
// NULL, display falls back to desired_outcome). Never throws to abort a batch fold,
// never calls callOpenAIJSON, never imports public-baseline's degraded_default, never
// fabricates a canonical on failure.

import { recordIntegrityRun } from "./integrity.ts";
import { ODI_CANONICAL_SYSTEM, buildOdiCanonicalUser, isValidCanonical } from "./odiCanonical.ts";

const GEN_TIMEOUT_MS = 120_000;
const DEFAULT_GEN_MODEL = "qwen2.5:14b-instruct";

type SupabaseLike = { from: (t: string) => any };

async function callQwenJson(
  ollamaUrl: string,
  model: string,
  system: string,
  user: string,
): Promise<{ ok: boolean; content?: string; err?: string }> {
  const nativeBase = ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GEN_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model,
        format: "json",
        stream: false,
        options: { num_ctx: 4096, temperature: 0.2 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) return { ok: false, err: `ollama HTTP ${resp.status}` };
    const data = await resp.json().catch(() => ({}));
    return { ok: true, content: String(data?.message?.content ?? "") };
  } catch (e) {
    return { ok: false, err: String((e as Error)?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

// Generate a canonical for one internal row LOCALLY. Records exactly one
// integrity_runs row (completed with the canonical, or failed with the reason) and
// returns {canonical} on success / {canonical:null, reason} on any failure — never
// throws, so a batch fold continues. The CALLER writes the canonical (this module
// only generates + validates + records), and per the identity hardening the canonical
// write must NOT touch content_identity (= hash(desired_outcome) always).
export async function generateCanonicalLocal(args: {
  supabase: SupabaseLike;
  companyId: string;
  journeyKey: string;
  needId: string;
  desiredOutcome: string;
  ollamaUrl: string;
  genModel?: string;
}): Promise<{ canonical: string | null; reason?: string }> {
  const genModel = args.genModel ?? DEFAULT_GEN_MODEL;
  const fail = async (reason: string): Promise<{ canonical: null; reason: string }> => {
    console.error(`[local-canonical-gen] ${args.needId}: SKIP (fail-closed): ${reason}`);
    await recordIntegrityRun(args.supabase, {
      company_id: args.companyId,
      component: "local_canonical_gen",
      surface_type: "opportunity",
      surface_id: args.needId,
      status: "failed",
      examined: 1,
      error: `local canonical: ${reason}`,
      run_ref: "local-canonical",
    });
    return { canonical: null, reason };
  };

  // job_executor context for the "when" clause (read-only; internal stays local).
  const { data: marketDef } = await args.supabase
    .from("odi_market_definitions")
    .select("job_executor")
    .eq("company_id", args.companyId)
    .eq("journey_key", args.journeyKey)
    .maybeSingle();
  const jobExecutor = (marketDef as { job_executor?: string | null } | null)?.job_executor?.trim() ?? "";

  const res = await callQwenJson(
    args.ollamaUrl,
    genModel,
    ODI_CANONICAL_SYSTEM,
    buildOdiCanonicalUser(args.desiredOutcome, jobExecutor),
  );
  if (!res.ok) return fail(res.err ?? "qwen error");

  let parsed: { odi_canonical_statement?: string };
  try {
    parsed = JSON.parse(String(res.content ?? ""));
  } catch {
    return fail(`unparseable: ${String(res.content ?? "").slice(0, 160)}`);
  }
  const canonical = String(parsed.odi_canonical_statement ?? "").trim();
  const validity = isValidCanonical(canonical, args.desiredOutcome);
  if (!validity.ok) return fail(`guard: ${validity.reason} — value: "${canonical.slice(0, 120)}"`);

  console.log(`[local-canonical-gen] ${args.needId} → "${canonical.slice(0, 80)}"`);
  await recordIntegrityRun(args.supabase, {
    company_id: args.companyId,
    component: "local_canonical_gen",
    surface_type: "opportunity",
    surface_id: args.needId,
    status: "completed",
    examined: 1,
    admitted: 1,
    excluded_by_rule: { canonical, model: genModel },
    run_ref: "local-canonical",
  });
  return { canonical };
}
