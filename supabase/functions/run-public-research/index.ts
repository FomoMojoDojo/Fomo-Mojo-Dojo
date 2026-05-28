// ONB-F4 S5: F1 flow — run-public-research
//
// Standalone entry point for the "public research" flow. Wraps public-baseline
// with agent_flow_runs tracking (flow_type = 'public_research'). Does NOT write
// to workshop surface tables — that is F3 / run-framework-diagnosis territory.
//
// Existing callers of public-baseline (run-agent-flow stage 3, client-refine
// bypass) are NOT migrated to use this function. They continue calling
// public-baseline directly.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const STAGE_KEY = "public_research.baseline_run";
const STAGE_ORDER = 1;
const BASELINE_TIMEOUT_MS = 210_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJsonSafe(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // ignore
  }
  return null;
}

async function invokeBaseline(args: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BASELINE_TIMEOUT_MS);
  try {
    const response = await fetch(`${args.supabaseUrl}/functions/v1/public-baseline`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: args.anonKey,
        Authorization: args.authHeader,
      },
      body: JSON.stringify(args.body),
      signal: controller.signal,
    });
    const raw = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      payload: parseJsonSafe(raw),
      raw,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function createFlowRun(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  trigger: string;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("agent_flow_runs")
    .insert({
      company_id: args.companyId,
      user_id: args.userId,
      mode: "public_only",
      trigger: args.trigger,
      flow_type: "public_research",
      status: "running",
      input_json: { company_id: args.companyId },
      summary_json: {},
    })
    .select("id")
    .single();

  if (error) {
    console.log("[run-public-research] flow run insert error:", error.message);
    return null;
  }
  return String((data as { id?: unknown } | null)?.id || "");
}

async function finalizeFlowRun(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  status: "completed" | "failed" | "blocked";
  summaryJson: Record<string, unknown>;
}) {
  const { error } = await args.supabase
    .from("agent_flow_runs")
    .update({
      status: args.status,
      summary_json: args.summaryJson,
      updated_at: new Date().toISOString(),
      ...(args.status !== "running" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", args.runId);

  if (error) {
    console.log("[run-public-research] flow run finalize error:", error.message);
  }
}

async function startStageRun(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  companyId: string;
  userId: string;
  input: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("agent_flow_stage_runs")
    .insert({
      run_id: args.runId,
      company_id: args.companyId,
      user_id: args.userId,
      stage_key: STAGE_KEY,
      stage_order: STAGE_ORDER,
      status: "running",
      input_json: args.input,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.log("[run-public-research] stage start error:", error.message);
    return null;
  }
  return String((data as { id?: unknown } | null)?.id || "");
}

async function finishStageRun(args: {
  supabase: ReturnType<typeof createClient>;
  stageRunId: string | null;
  status: "completed" | "failed";
  output: Record<string, unknown>;
  errorText?: string;
  durationMs: number;
}) {
  if (!args.stageRunId) return;
  const { error } = await args.supabase
    .from("agent_flow_stage_runs")
    .update({
      status: args.status,
      output_json: args.output,
      error_text: args.errorText ? args.errorText.slice(0, 4000) : "",
      finished_at: new Date().toISOString(),
      duration_ms: Math.max(0, Math.round(args.durationMs)),
    })
    .eq("id", args.stageRunId);

  if (error) {
    console.log("[run-public-research] stage finish error:", error.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const companyId = String(body?.company_id || "").trim();
    const trigger = String(body?.trigger || "manual").trim();

    if (!companyId) return json({ error: "company_id is required" }, 400);

    const userId = userRes.user.id;

    // Create the flow run record — establishes audit trail before doing any work
    const runId = await createFlowRun({ supabase, companyId, userId, trigger });
    if (!runId) {
      return json({ error: "Failed to create flow run record" }, 500);
    }

    const stageInput = { company_id: companyId };
    const stageRunId = await startStageRun({
      supabase,
      runId,
      companyId,
      userId,
      input: stageInput,
    });

    const stageStart = Date.now();
    let baselineResult: { ok: boolean; status: number; payload: Record<string, unknown> | null; raw: string };

    try {
      baselineResult = await invokeBaseline({
        supabaseUrl,
        anonKey,
        authHeader,
        body: { company_id: companyId },
      });
    } catch (err) {
      const errorText = String((err as Error)?.message || err);
      const durationMs = Date.now() - stageStart;
      await finishStageRun({
        supabase,
        stageRunId,
        status: "failed",
        output: { error: errorText },
        errorText,
        durationMs,
      });
      await finalizeFlowRun({
        supabase,
        runId,
        status: "failed",
        summaryJson: { error: errorText, stage: STAGE_KEY },
      });
      return json({ error: "public-baseline invoke error", detail: errorText, flow_run_id: runId }, 500);
    }

    const durationMs = Date.now() - stageStart;
    const payload = baselineResult.payload ?? {};
    const baselineStatus = String(payload.status || "").trim();
    const publicBaselineRunId = payload.run_id != null ? String(payload.run_id) : null;

    // Lock conflict — public-baseline is already running for this company
    if (baselineResult.status === 409) {
      await finishStageRun({
        supabase,
        stageRunId,
        status: "failed",
        output: { ...payload, http_status: 409 },
        errorText: "Company locked by another baseline run",
        durationMs,
      });
      await finalizeFlowRun({
        supabase,
        runId,
        status: "blocked",
        summaryJson: { status: "company_locked", ...payload },
      });
      return json({
        flow_run_id: runId,
        public_baseline_run_id: null,
        status: "blocked",
        baseline_status: "company_locked",
        detail: payload,
      }, 409);
    }

    // Baseline call failed at the HTTP level
    if (!baselineResult.ok) {
      const errorText = String(payload.error || `public-baseline returned HTTP ${baselineResult.status}`);
      await finishStageRun({
        supabase,
        stageRunId,
        status: "failed",
        output: { ...payload, http_status: baselineResult.status },
        errorText,
        durationMs,
      });
      await finalizeFlowRun({
        supabase,
        runId,
        status: "failed",
        summaryJson: { error: errorText, http_status: baselineResult.status, stage: STAGE_KEY },
      });
      return json({
        flow_run_id: runId,
        public_baseline_run_id: null,
        status: "failed",
        baseline_status: "error",
        detail: payload,
      }, baselineResult.status || 500);
    }

    // Baseline ran and wrote a public_baseline_runs row — quality may vary
    // ('ok', 'insufficient_public_evidence', 'ambiguous_public_evidence' all count as completed)
    await finishStageRun({
      supabase,
      stageRunId,
      status: "completed",
      output: {
        public_baseline_run_id: publicBaselineRunId,
        baseline_status: baselineStatus,
        sources: payload.sources ?? null,
        strong_matches: payload.strong_matches ?? null,
        medium_matches: payload.medium_matches ?? null,
      },
      durationMs,
    });

    await finalizeFlowRun({
      supabase,
      runId,
      status: "completed",
      summaryJson: {
        flow_type: "public_research",
        trigger,
        stage: STAGE_KEY,
        public_baseline_run_id: publicBaselineRunId,
        baseline_status: baselineStatus,
        duration_ms: durationMs,
      },
    });

    return json({
      flow_run_id: runId,
      public_baseline_run_id: publicBaselineRunId,
      status: "completed",
      baseline_status: baselineStatus,
    });
  } catch (err) {
    console.error("[run-public-research] unhandled error:", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
