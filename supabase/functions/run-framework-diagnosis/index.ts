// ONB-F6 S6: F3 flow — run-framework-diagnosis
//
// Standalone entry point for the "framework diagnosis" flow. Wraps research-company
// with the adjudication guard from _shared/adjudication.ts, tracking via agent_flow_runs
// with flow_type = 'framework_diagnosis'.
//
// Architectural note: research-company is External LLM synthesis; the strict F3
// ("Framework diagnosis via local Dify") framing from ONB-F1 §2 is deferred.
// This wrapper ships S6 per the design doc's framing as-is.
//
// Existing callers are NOT migrated:
//   - run-agent-flow stage 5 (output_generation) calls research-company directly
//   - client-refine bypass (rerunFoundationScope) calls research-company directly

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  adjudicate,
  AdjudicationBlockedError,
  type AdjudicationInput,
  type ContextMode,
  type FlowMode,
} from "../_shared/adjudication.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const FLOW_TYPE = "framework_diagnosis";
const ADJUDICATION_STAGE_KEY = "framework_diagnosis.adjudication";
const OUTPUT_STAGE_KEY = "framework_diagnosis.output_generation";
const ADJUDICATION_STAGE_ORDER = 1;
const OUTPUT_STAGE_ORDER = 2;
const RESEARCH_COMPANY_TIMEOUT_MS = 420_000;

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

async function fetchCompanyRow(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
}): Promise<{ name: string; website: string } | null> {
  const { data, error } = await args.supabase
    .from("companies")
    .select("name, website")
    .eq("id", args.companyId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { name?: unknown; website?: unknown } | null;
  return {
    name: String(row?.name || "").trim(),
    website: String(row?.website || "").trim(),
  };
}

async function fetchEvidenceState(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
}): Promise<{
  baselineStatus: string;
  uploadedFileCount: number;
  existingArtifactCount: number;
}> {
  const { data: latestBaselineRun } = await args.supabase
    .from("public_baseline_runs")
    .select("result_json")
    .eq("company_id", args.companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const baselineStatus = String(
    ((latestBaselineRun as { result_json?: unknown } | null)?.result_json as { status?: unknown } | null)
      ?.status || "missing",
  );

  const { data: inputs } = await args.supabase
    .from("inputs")
    .select("id")
    .eq("company_id", args.companyId)
    .limit(240);
  const inputIds = (Array.isArray(inputs) ? inputs : [])
    .map((entry) => String((entry as { id?: unknown })?.id || "").trim())
    .filter(Boolean);

  let uploadedFileCount = 0;
  if (inputIds.length > 0) {
    const { count } = await args.supabase
      .from("input_files")
      .select("id", { count: "exact", head: true })
      .in("input_id", inputIds);
    uploadedFileCount = Number(count || 0);
  }

  const { count: existingOpportunityCount } = await args.supabase
    .from("opportunities")
    .select("id", { count: "exact", head: true })
    .eq("company_id", args.companyId);

  const { count: existingRouteCount } = await args.supabase
    .from("routes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", args.companyId);

  return {
    baselineStatus,
    uploadedFileCount,
    existingArtifactCount:
      Number(existingOpportunityCount || 0) + Number(existingRouteCount || 0),
  };
}

async function createFlowRun(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  mode: FlowMode;
  trigger: string;
  input: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("agent_flow_runs")
    .insert({
      company_id: args.companyId,
      user_id: args.userId,
      mode: args.mode,
      trigger: args.trigger,
      flow_type: FLOW_TYPE,
      status: "running",
      input_json: args.input,
      summary_json: {},
    })
    .select("id")
    .single();

  if (error) {
    console.log("[run-framework-diagnosis] flow run insert error:", error.message);
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
      completed_at: new Date().toISOString(),
    })
    .eq("id", args.runId);

  if (error) {
    console.log("[run-framework-diagnosis] flow run finalize error:", error.message);
  }
}

async function startStageRun(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  companyId: string;
  userId: string;
  stageKey: string;
  stageOrder: number;
  input: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("agent_flow_stage_runs")
    .insert({
      run_id: args.runId,
      company_id: args.companyId,
      user_id: args.userId,
      stage_key: args.stageKey,
      stage_order: args.stageOrder,
      status: "running",
      input_json: args.input,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.log("[run-framework-diagnosis] stage start error:", error.message);
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
    console.log("[run-framework-diagnosis] stage finish error:", error.message);
  }
}

async function invokeResearchCompany(args: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; status: number; payload: Record<string, unknown> | null; raw: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESEARCH_COMPANY_TIMEOUT_MS);
  try {
    const response = await fetch(`${args.supabaseUrl}/functions/v1/research-company`, {
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

const VALID_MODES = new Set<string>(["public_only", "uploaded_only", "hybrid"]);

function normalizeMode(value: unknown): FlowMode {
  const str = String(value || "").trim().toLowerCase();
  return VALID_MODES.has(str) ? (str as FlowMode) : "hybrid";
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
    const mode = normalizeMode(body?.mode);
    const trigger = String(body?.trigger || "manual").trim();
    const reviewMode = String(body?.review_mode || "advisory").trim();
    const journeyKey = String(body?.journey_key || "").trim() || null;

    if (!companyId) return json({ error: "company_id is required" }, 400);

    const userId = userRes.user.id;

    // Create the flow run record before any work
    const runId = await createFlowRun({
      supabase,
      companyId,
      userId,
      mode,
      trigger,
      input: { company_id: companyId, mode, trigger, review_mode: reviewMode, journey_key: journeyKey },
    });
    if (!runId) {
      return json({ error: "Failed to create flow run record" }, 500);
    }

    // --- Stage 1: Adjudication ---
    const adjudicationStageId = await startStageRun({
      supabase,
      runId,
      companyId,
      userId,
      stageKey: ADJUDICATION_STAGE_KEY,
      stageOrder: ADJUDICATION_STAGE_ORDER,
      input: { company_id: companyId, mode },
    });
    const adjudicationStart = Date.now();

    let contextMode: ContextMode;
    let adjudicationRationale: string;
    let evidenceState: { baselineStatus: string; uploadedFileCount: number; existingArtifactCount: number };

    try {
      // Fetch company row (name + website required by research-company)
      const companyRow = await fetchCompanyRow({ supabase, companyId });
      if (!companyRow || !companyRow.name) {
        const errorText = "Company not found or missing name";
        await finishStageRun({
          supabase,
          stageRunId: adjudicationStageId,
          status: "failed",
          output: { error: errorText },
          errorText,
          durationMs: Date.now() - adjudicationStart,
        });
        await finalizeFlowRun({
          supabase,
          runId,
          status: "failed",
          summaryJson: { error: errorText, stage: ADJUDICATION_STAGE_KEY },
        });
        return json({ error: errorText, flow_run_id: runId }, 404);
      }

      // Fetch evidence state for adjudication
      evidenceState = await fetchEvidenceState({ supabase, companyId });

      const adjudicationInput: AdjudicationInput = {
        mode,
        baselineStatus: evidenceState.baselineStatus,
        // No separate public_collection step in this flow — before == current
        baselineStatusBeforePublicCollection: evidenceState.baselineStatus,
        uploadedFileCount: evidenceState.uploadedFileCount,
        existingArtifactCount: evidenceState.existingArtifactCount,
      };

      const adjResult = adjudicate(adjudicationInput);
      contextMode = adjResult.contextMode;
      adjudicationRationale = adjResult.rationale;

      await finishStageRun({
        supabase,
        stageRunId: adjudicationStageId,
        status: "completed",
        output: {
          mode,
          baseline_status: evidenceState.baselineStatus,
          uploaded_file_count: evidenceState.uploadedFileCount,
          existing_artifact_count: evidenceState.existingArtifactCount,
          selected_context_mode: contextMode,
          rationale: adjudicationRationale,
        },
        durationMs: Date.now() - adjudicationStart,
      });

      // --- Stage 2: Output generation (research-company) ---
      const outputStageId = await startStageRun({
        supabase,
        runId,
        companyId,
        userId,
        stageKey: OUTPUT_STAGE_KEY,
        stageOrder: OUTPUT_STAGE_ORDER,
        input: {
          company_id: companyId,
          selected_context_mode: contextMode,
          review_mode: reviewMode,
          journey_key: journeyKey,
        },
      });
      const outputStart = Date.now();

      const requestBody: Record<string, unknown> = {
        company_id: companyId,
        company_name: companyRow.name,
        website: companyRow.website,
        review_mode: reviewMode,
      };

      // Translate adjudicated context mode into research-company's context_mode param
      if (contextMode === "uploaded_only" || contextMode === "uploaded_evidence_fallback") {
        requestBody.context_mode = "uploaded_only";
      }

      if (journeyKey) {
        requestBody.journey_key = journeyKey;
        requestBody.journeys_to_generate = [journeyKey];
        requestBody.job_maps = [{ journey_key: journeyKey, source: "selected" }];
      }

      let researchResult: { ok: boolean; status: number; payload: Record<string, unknown> | null; raw: string };
      try {
        researchResult = await invokeResearchCompany({
          supabaseUrl,
          anonKey,
          authHeader,
          body: requestBody,
        });
      } catch (err) {
        const errorText = String((err as Error)?.message || err);
        const outputDuration = Date.now() - outputStart;
        await finishStageRun({
          supabase,
          stageRunId: outputStageId,
          status: "failed",
          output: { error: errorText },
          errorText,
          durationMs: outputDuration,
        });
        await finalizeFlowRun({
          supabase,
          runId,
          status: "failed",
          summaryJson: { error: errorText, stage: OUTPUT_STAGE_KEY },
        });
        return json({ error: "research-company invoke error", detail: errorText, flow_run_id: runId }, 500);
      }

      const outputDuration = Date.now() - outputStart;
      const researchPayload = researchResult.payload ?? {};

      if (!researchResult.ok) {
        const errorText = String(researchPayload.error || `research-company returned HTTP ${researchResult.status}`);
        await finishStageRun({
          supabase,
          stageRunId: outputStageId,
          status: "failed",
          output: { ...researchPayload, http_status: researchResult.status },
          errorText,
          durationMs: outputDuration,
        });
        await finalizeFlowRun({
          supabase,
          runId,
          status: "failed",
          summaryJson: { error: errorText, http_status: researchResult.status, stage: OUTPUT_STAGE_KEY },
        });
        return json({
          flow_run_id: runId,
          status: "failed",
          context_mode: contextMode,
          detail: researchPayload,
        }, researchResult.status || 500);
      }

      await finishStageRun({
        supabase,
        stageRunId: outputStageId,
        status: "completed",
        output: {
          selected_context_mode: contextMode,
          mojo_score: researchPayload.mojo_score ?? null,
          inputs_inserted: researchPayload.inputs_inserted ?? null,
          opportunities_inserted: researchPayload.opportunities_inserted ?? null,
          routes_inserted: researchPayload.routes_inserted ?? null,
          cascade_status: researchPayload.cascade_status ?? null,
          positioning_status: researchPayload.positioning_status ?? null,
        },
        durationMs: outputDuration,
      });

      await finalizeFlowRun({
        supabase,
        runId,
        status: "completed",
        summaryJson: {
          flow_type: FLOW_TYPE,
          trigger,
          mode,
          context_mode: contextMode,
          mojo_score: researchPayload.mojo_score ?? null,
          opportunities_inserted: researchPayload.opportunities_inserted ?? null,
          routes_inserted: researchPayload.routes_inserted ?? null,
        },
      });

      return json({
        flow_run_id: runId,
        status: "completed",
        context_mode: contextMode,
        research_company_result: researchPayload,
      });
    } catch (err) {
      // AdjudicationBlockedError — blocked path
      if (err instanceof AdjudicationBlockedError) {
        const adjDuration = Date.now() - adjudicationStart;
        await finishStageRun({
          supabase,
          stageRunId: adjudicationStageId,
          status: "failed",
          output: {
            status: err.status,
            reason: err.reason,
          },
          errorText: err.message,
          durationMs: adjDuration,
        });
        await finalizeFlowRun({
          supabase,
          runId,
          status: "blocked",
          summaryJson: {
            status: err.status,
            reason: err.reason,
            stage: ADJUDICATION_STAGE_KEY,
          },
        });
        return json({
          flow_run_id: runId,
          status: "blocked",
          adjudication_status: err.status,
          reason: err.reason,
        }, err.statusCode);
      }

      // Unexpected error during adjudication stage
      const errorText = String((err as Error)?.message || err);
      await finishStageRun({
        supabase,
        stageRunId: adjudicationStageId,
        status: "failed",
        output: { error: errorText },
        errorText,
        durationMs: Date.now() - adjudicationStart,
      });
      await finalizeFlowRun({
        supabase,
        runId,
        status: "failed",
        summaryJson: { error: errorText, stage: ADJUDICATION_STAGE_KEY },
      });
      return json({ error: errorText, flow_run_id: runId }, 500);
    }
  } catch (err) {
    console.error("[run-framework-diagnosis] unhandled error:", err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
