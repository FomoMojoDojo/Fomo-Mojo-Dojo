// ── generate-step-conditions ──────────────────────────────────────────────────
//
// Production invocation for b-ii per-step conditions. Thin wrapper over the
// committed _shared/stepConditionsSynthesis module — NO logic fork. Accepts
// { company_id, journey_key } and runs generate→judge→writer for that one set,
// field-merging (origin:generated replaced, origin:operator kept).
//
// LOCAL-ONLY: generation/judging go to a localhost Ollama (14b + 70b). Internal
// conditions content never leaves the box — the OLLAMA_BASE_URL must resolve local.
// Declared / internal_derived sets only. Frozen fixture companies (CB1/CB2) are
// HARD-EXCLUDED (SELECT-only reference data — must never be written).
//
// Long-running: 8 steps × (14b gen + 70b judge) can exceed the Kong 150s gateway
// timeout. The writes land server-side regardless; the client tolerates a timeout
// and polls conditions_json (mirrors the run-mojo-analysis button pattern).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { synthesizeStepConditions, type StepInput } from "../_shared/stepConditionsSynthesis.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// Frozen reference fixtures — SELECT-only, never written. Keep in sync with the
// frontend guard (src/lib/frozenCompanies.ts). Remove when CB1/CB2 are retired.
const FROZEN_COMPANY_IDS = new Set([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  "fd3f7f63-968b-4698-b946-3d6b6450d79d", // Cafe Barra 2 (CB2)
]);

// Conditions are an internal-layer artifact — only generated for sets the system
// authored/derived. Mirrors PROTECTED_PROVENANCE_TYPES (journeyProtection.ts).
const WRITABLE_PROVENANCE = new Set(["internal_derived", "internal_declared", "operator_authored"]);

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
    const { company_id, journey_key } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    if (!journey_key || typeof journey_key !== "string") return json({ ok: false, error: "journey_key required" }, 400);

    if (FROZEN_COMPANY_IDS.has(company_id)) {
      return json({ ok: false, error: "This company is a frozen reference fixture (SELECT-only); conditions are not generated for it." }, 403);
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json({ ok: false, error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." }, 500);
    }
    const genModel = Deno.env.get("OLLAMA_MODEL") ?? "qwen2.5:14b-instruct";

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // The set's steps — and a writable-provenance check (declared/internal only).
    const { data: stepRows, error: stepErr } = await supabase
      .from("job_steps")
      .select("id, step_number, step_label, description, evidence_basis, provenance_type")
      .eq("company_id", company_id)
      .eq("journey_key", journey_key)
      .order("step_number", { ascending: true });
    if (stepErr) return json({ ok: false, error: `failed loading steps: ${stepErr.message}` }, 500);
    const rows = (stepRows ?? []) as Array<StepInput & { provenance_type?: string | null }>;
    if (rows.length === 0) return json({ ok: false, error: `no steps for journey '${journey_key}'` }, 404);

    const provenances = new Set(rows.map((r) => String(r.provenance_type ?? "")));
    const writable = [...provenances].every((p) => WRITABLE_PROVENANCE.has(p));
    if (!writable) {
      return json({ ok: false, error: `set '${journey_key}' is not a declared/internal_derived set (provenance: ${[...provenances].join(",") || "null"}); conditions are internal-layer only.` }, 422);
    }

    const { data: marketDef } = await supabase
      .from("odi_market_definitions")
      .select("job_executor, jtbd")
      .eq("company_id", company_id)
      .eq("journey_key", journey_key)
      .maybeSingle();
    // Fallback: the company's primary market_def if the set has none of its own.
    let md = marketDef as { job_executor?: string | null; jtbd?: string | null } | null;
    if (!md) {
      const { data: anyMd } = await supabase
        .from("odi_market_definitions")
        .select("job_executor, jtbd")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      md = (anyMd as typeof md) ?? null;
    }

    const steps: StepInput[] = rows.map((r) => ({
      id: r.id, step_number: r.step_number, step_label: r.step_label, description: r.description, evidence_basis: r.evidence_basis,
    }));

    const result = await synthesizeStepConditions({
      supabase,
      companyId: company_id,
      steps,
      marketDef: md,
      ollamaUrl,
      nowIso: new Date().toISOString(),
      genModel,
      runId: `generate-step-conditions:${new Date().toISOString().slice(0, 10)}`,
      write: true,
      persistVerdicts: true,
    });

    return json({ ok: true, journey_key, totals: result.totals });
  } catch (err) {
    console.error("[generate-step-conditions] error:", String((err as Error)?.message ?? err));
    return json({ ok: false, error: String((err as Error)?.message ?? err) }, 500);
  }
});
