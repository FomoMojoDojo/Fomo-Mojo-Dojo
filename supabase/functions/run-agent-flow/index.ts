import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const WEAK_BASELINE_STATUSES = new Set(["ambiguous_public_evidence", "insufficient_public_evidence"]);
const ALLOWED_AREAS = new Set(["positioning", "strategy", "market", "odi"]);

type FlowMode = "public_only" | "uploaded_only" | "hybrid";
type ContextMode = "public_baseline" | "uploaded_only" | "uploaded_evidence_fallback";
type FrameworkMode = "dunford_positioning" | "torres_opportunity_map" | "martin_strategy_cascade";
type ProgramStage = "outside" | "diagnose" | "focus" | "flow";
type OrchestratorMode = "off" | "chained" | "parallel";

const FRAMEWORK_MODES: FrameworkMode[] = [
  "dunford_positioning",
  "torres_opportunity_map",
  "martin_strategy_cascade",
];
const PROGRAM_STAGES: ProgramStage[] = ["outside", "diagnose", "focus", "flow"];
const ORCHESTRATOR_MODES: OrchestratorMode[] = ["off", "chained", "parallel"];

type RuntimeContract = {
  request_id: string;
  orchestrator_mode: OrchestratorMode;
  framework_mode: FrameworkMode | null;
  framework_modes: FrameworkMode[];
  framework_schema_version: string;
  stage: ProgramStage;
  journey_key: string;
  strict: boolean;
};

type StageKey =
  | "input_collect"
  | "evidence_check"
  | "public_collection"
  | "adjudication"
  | "output_generation"
  | "output_check";

const STAGE_ORDER: Record<StageKey, number> = {
  input_collect: 1,
  evidence_check: 2,
  public_collection: 3,
  adjudication: 4,
  output_generation: 5,
  output_check: 6,
};

class FlowError extends Error {
  stageKey: StageKey;
  statusCode: number;
  payload: Record<string, unknown> | null;

  constructor(
    message: string,
    stageKey: StageKey,
    statusCode = 500,
    payload: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = "FlowError";
    this.stageKey = stageKey;
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseJsonObjectSafe(raw: string): Record<string, unknown> | null {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function normalizeJourneyKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFrameworkMode(value: unknown): FrameworkMode | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (FRAMEWORK_MODES as string[]).includes(normalized) ? normalized as FrameworkMode : null;
}

function parseFrameworkModes(value: unknown): FrameworkMode[] {
  if (!Array.isArray(value)) return [];
  const out: FrameworkMode[] = [];
  for (const item of value) {
    const mode = normalizeFrameworkMode(item);
    if (!mode) continue;
    if (out.includes(mode)) continue;
    out.push(mode);
  }
  return out;
}

function normalizeProgramStage(value: unknown): ProgramStage | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (PROGRAM_STAGES as string[]).includes(normalized) ? normalized as ProgramStage : null;
}

function normalizeOrchestratorMode(value: unknown): OrchestratorMode | null {
  const normalized = String(value || "").trim().toLowerCase();
  return (ORCHESTRATOR_MODES as string[]).includes(normalized) ? normalized as OrchestratorMode : null;
}

function hasRuntimeContractFields(body: Record<string, unknown>) {
  const keys = [
    "framework_mode",
    "framework_modes",
    "orchestrator_mode",
    "stage",
    "framework_schema_version",
    "enforce_framework_contract",
  ];
  return keys.some((key) => body[key] !== undefined);
}

function parseRuntimeContract(body: Record<string, unknown>) {
  const strict = body?.enforce_framework_contract === true || hasRuntimeContractFields(body);
  if (!strict) return { strict: false, contract: null as RuntimeContract | null, errors: [] as string[] };

  const errors: string[] = [];
  const orchestratorMode = normalizeOrchestratorMode(body?.orchestrator_mode);
  if (!orchestratorMode) {
    errors.push("orchestrator_mode must be one of: off, chained, parallel");
  }

  const stage = normalizeProgramStage(body?.stage);
  if (!stage) {
    errors.push("stage must be one of: outside, diagnose, focus, flow");
  }

  const journeyKey = normalizeJourneyKey(body?.journey_key ?? body?.journey_id);
  if (!journeyKey) {
    errors.push("journey_key is required");
  }

  const frameworkSchemaVersion = String(body?.framework_schema_version || "").trim();
  if (!frameworkSchemaVersion) {
    errors.push("framework_schema_version is required");
  }

  const frameworkMode = normalizeFrameworkMode(body?.framework_mode);
  const frameworkModes = parseFrameworkModes(body?.framework_modes);

  if (orchestratorMode === "off") {
    if (!frameworkMode) {
      errors.push("framework_mode is required when orchestrator_mode=off");
    }
    if (frameworkModes.length > 0) {
      errors.push("framework_modes is forbidden when orchestrator_mode=off");
    }
  } else if (orchestratorMode === "chained" || orchestratorMode === "parallel") {
    if (frameworkModes.length === 0) {
      errors.push("framework_modes is required when orchestrator_mode is chained or parallel");
    }
    if (String(body?.framework_mode || "").trim()) {
      errors.push("framework_mode is forbidden when orchestrator_mode is chained or parallel");
    }
  }

  const requestIdRaw = String(body?.request_id || "").trim();
  const contract: RuntimeContract = {
    request_id: requestIdRaw || crypto.randomUUID(),
    orchestrator_mode: orchestratorMode || "off",
    framework_mode: orchestratorMode === "off" ? frameworkMode : null,
    framework_modes: orchestratorMode === "off"
      ? (frameworkMode ? [frameworkMode] : [])
      : frameworkModes,
    framework_schema_version: frameworkSchemaVersion,
    stage: stage || "outside",
    journey_key: journeyKey,
    strict: true,
  };

  return { strict: true, contract, errors };
}

function normalizeMode(raw: unknown): FlowMode {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "public_only" || value === "uploaded_only" || value === "hybrid") return value;
  return "hybrid";
}

function normalizeAreas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return ["positioning", "strategy", "market", "odi"];
  const out = raw
    .map((item) => String(item || "").trim().toLowerCase())
    .filter((item) => ALLOWED_AREAS.has(item));
  return out.length > 0 ? [...new Set(out)] : ["positioning", "strategy", "market", "odi"];
}

function isWeakBaselineStatus(status: unknown) {
  return WEAK_BASELINE_STATUSES.has(String(status || "").trim().toLowerCase());
}

function errorMessageFromPayload(payload: Record<string, unknown> | null, fallback: string) {
  if (!payload) return fallback;
  const message = String(payload.message || payload.error || payload.reason || "").trim();
  return message || fallback;
}

async function invokeEdgeFunction(args: {
  supabaseUrl: string;
  anonKey: string;
  authHeader: string;
  functionName: string;
  body: Record<string, unknown>;
  timeoutMs?: number;
}) {
  const timeoutMs = args.timeoutMs ?? 180_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${args.supabaseUrl}/functions/v1/${args.functionName}`, {
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
    const payload = parseJsonObjectSafe(raw);
    return {
      ok: response.ok,
      status: response.status,
      payload,
      raw,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function startStageRun(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  companyId: string;
  userId: string;
  stageKey: StageKey;
  input: Record<string, unknown>;
}) {
  const { data, error } = await args.supabase
    .from("agent_flow_stage_runs")
    .insert({
      run_id: args.runId,
      company_id: args.companyId,
      user_id: args.userId,
      stage_key: args.stageKey,
      stage_order: STAGE_ORDER[args.stageKey],
      status: "running",
      input_json: args.input,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.log("[run-agent-flow] stage start insert error", args.stageKey, error.message);
    return null;
  }
  return String((data as { id?: unknown } | null)?.id || "");
}

async function finishStageRun(args: {
  supabase: ReturnType<typeof createClient>;
  stageRunId: string | null;
  stageKey: StageKey;
  status: "completed" | "failed" | "skipped";
  output: Record<string, unknown>;
  errorText?: string;
  durationMs?: number;
}) {
  if (!args.stageRunId) return;
  const updates: Record<string, unknown> = {
    status: args.status,
    output_json: args.output,
    finished_at: new Date().toISOString(),
  };
  if (typeof args.durationMs === "number") updates.duration_ms = Math.max(0, Math.round(args.durationMs));
  if (args.errorText) updates.error_text = args.errorText.slice(0, 4000);

  const { error } = await args.supabase
    .from("agent_flow_stage_runs")
    .update(updates)
    .eq("id", args.stageRunId);
  if (error) {
    console.log("[run-agent-flow] stage finish update error", args.stageKey, error.message);
  }
}

async function markStageSkipped(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  companyId: string;
  userId: string;
  stageKey: StageKey;
  reason: string;
}) {
  const now = new Date().toISOString();
  const { error } = await args.supabase
    .from("agent_flow_stage_runs")
    .insert({
      run_id: args.runId,
      company_id: args.companyId,
      user_id: args.userId,
      stage_key: args.stageKey,
      stage_order: STAGE_ORDER[args.stageKey],
      status: "skipped",
      input_json: { skipped: true },
      output_json: { reason: args.reason },
      error_text: "",
      started_at: now,
      finished_at: now,
      duration_ms: 0,
    });
  if (error) {
    console.log("[run-agent-flow] stage skip insert error", args.stageKey, error.message);
  }
}

async function runStage<T>(args: {
  supabase: ReturnType<typeof createClient>;
  runId: string;
  companyId: string;
  userId: string;
  stageKey: StageKey;
  input: Record<string, unknown>;
  task: () => Promise<T>;
  serializeOutput?: (value: T) => Record<string, unknown>;
}) {
  const startedAt = Date.now();
  const stageRunId = await startStageRun({
    supabase: args.supabase,
    runId: args.runId,
    companyId: args.companyId,
    userId: args.userId,
    stageKey: args.stageKey,
    input: args.input,
  });

  try {
    const result = await args.task();
    const output = args.serializeOutput ? args.serializeOutput(result) : { ok: true };
    await finishStageRun({
      supabase: args.supabase,
      stageRunId,
      stageKey: args.stageKey,
      status: "completed",
      output,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = error instanceof FlowError ? error.payload : null;
    await finishStageRun({
      supabase: args.supabase,
      stageRunId,
      stageKey: args.stageKey,
      status: "failed",
      output: payload || {},
      errorText: message,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRole || !anonKey) {
    return json({ error: "Missing Supabase env vars" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No auth header" }, 401);

  const supabase = createClient(supabaseUrl, serviceRole);
  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: authError } = await anonClient.auth.getUser();
  const userId = String(userRes?.user?.id || "");
  if (authError || !userId) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const companyId = String(body?.company_id || "").trim();
  const trigger = String(body?.trigger || body?.trigger_type || "manual").trim() || "manual";
  const requestedJourneyKey = normalizeJourneyKey(body?.journey_key ?? body?.journey_id);
  const mode = normalizeMode(body?.mode);
  const includePublicCollection = body?.include_public_collection === undefined
    ? mode !== "uploaded_only"
    : body?.include_public_collection === true;
  const includeLocalAlignment = body?.include_local_alignment === undefined
    ? true
    : body?.include_local_alignment === true;
  const applyScoreUpdate = body?.apply_score_update === undefined
    ? true
    : body?.apply_score_update === true;
  const allowReviewBlockSave = body?.allow_review_block_save === undefined
    ? true
    : body?.allow_review_block_save === true;
  const reviewMode = String(body?.review_mode || "advisory").trim() || "advisory";
  const areas = normalizeAreas(body?.areas);
  const contractParse = parseRuntimeContract(asRecord(body) || {});
  if (contractParse.errors.length > 0) {
    return json({
      error: "invalid_runtime_contract",
      details: contractParse.errors,
    }, 422);
  }
  const runtimeContract = contractParse.contract;

  if (runtimeContract?.strict && runtimeContract.orchestrator_mode !== "off") {
    return json({
      error: "orchestrator_mode_not_supported",
      status: "orchestrator_mode_not_supported",
      message: "run-agent-flow currently supports single framework runs only (orchestrator_mode=off).",
      orchestrator_mode: runtimeContract.orchestrator_mode,
      request_id: runtimeContract.request_id,
    }, 422);
  }

  if (!companyId) return json({ error: "company_id is required" }, 400);

  const { data: companyRow } = await supabase
    .from("companies")
    .select("id,name,website")
    .eq("id", companyId)
    .maybeSingle();
  if (!companyRow) return json({ error: "Company not found" }, 404);

  const companyName = String(body?.company_name || (companyRow as { name?: unknown }).name || "").trim();
  const website = String(body?.website || (companyRow as { website?: unknown }).website || "").trim();
  if (!companyName) return json({ error: "company_name is required" }, 400);
  if (mode === "public_only" && !website) {
    return json({
      error: "website is required for public_only mode",
      status: "website_required",
    }, 422);
  }

  const runInput = {
    company_id: companyId,
    company_name: companyName,
    website,
    mode,
    trigger,
    include_public_collection: includePublicCollection,
    include_local_alignment: includeLocalAlignment,
    apply_score_update: applyScoreUpdate,
    review_mode: reviewMode,
    allow_review_block_save: allowReviewBlockSave,
    areas,
    request_id: runtimeContract?.request_id ?? null,
    runtime_contract: runtimeContract,
    journey_key: requestedJourneyKey || null,
  };

  const { data: runInsert, error: runInsertErr } = await supabase
    .from("agent_flow_runs")
    .insert({
      company_id: companyId,
      user_id: userId,
      mode,
      trigger,
      status: "running",
      input_json: runInput,
    })
    .select("id")
    .single();

  if (runInsertErr) return json({ error: runInsertErr.message }, 500);
  const runId = String((runInsert as { id?: unknown } | null)?.id || "");
  if (!runId) return json({ error: "Could not create agent flow run id" }, 500);

  let selectedContextMode: ContextMode | null = null;
  let adjudicationResult: Record<string, unknown> | null = null;
  let researchResult: Record<string, unknown> | null = null;
  let localAlignmentResult: Record<string, unknown> | null = null;
  let localAlignmentError: string | null = null;

  try {
    const evidenceCheck = await runStage({
      supabase,
      runId,
      companyId,
      userId,
      stageKey: "input_collect",
      input: { company_id: companyId },
      task: async () => {
        const { data: latestBaselineRun } = await supabase
          .from("public_baseline_runs")
          .select("id,created_at,result_json")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const baselineStatus = String(
          ((latestBaselineRun as { result_json?: unknown } | null)?.result_json as { status?: unknown } | null)?.status || "missing",
        );

        const { data: inputs } = await supabase
          .from("inputs")
          .select("id")
          .eq("company_id", companyId)
          .limit(240);
        const inputIds = (Array.isArray(inputs) ? inputs : [])
          .map((entry) => String((entry as { id?: unknown })?.id || "").trim())
          .filter(Boolean);

        let uploadedFileCount = 0;
        if (inputIds.length > 0) {
          const { count } = await supabase
            .from("input_files")
            .select("id", { count: "exact", head: true })
            .in("input_id", inputIds);
          uploadedFileCount = Number(count || 0);
        }

        const { count: existingOpportunityCount } = await supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId);

        const { count: existingRouteCount } = await supabase
          .from("routes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId);

        return {
          latest_baseline_run_id: (latestBaselineRun as { id?: unknown } | null)?.id ?? null,
          latest_baseline_status: baselineStatus,
          uploaded_file_count: uploadedFileCount,
          existing_artifact_count:
            Number(existingOpportunityCount || 0) + Number(existingRouteCount || 0),
          website_present: Boolean(website),
        };
      },
      serializeOutput: (value) => asRecord(value) || {},
    });

    await runStage({
      supabase,
      runId,
      companyId,
      userId,
      stageKey: "evidence_check",
      input: {
        baseline_status: String(asRecord(evidenceCheck)?.latest_baseline_status || "missing"),
        uploaded_file_count: Number(asRecord(evidenceCheck)?.uploaded_file_count || 0),
        existing_artifact_count: Number(asRecord(evidenceCheck)?.existing_artifact_count || 0),
      },
      task: async () => ({
        weak_public_baseline: isWeakBaselineStatus(asRecord(evidenceCheck)?.latest_baseline_status),
        has_uploaded_evidence: Number(asRecord(evidenceCheck)?.uploaded_file_count || 0) > 0,
        has_existing_artifacts: Number(asRecord(evidenceCheck)?.existing_artifact_count || 0) > 0,
      }),
      serializeOutput: (value) => asRecord(value) || {},
    });

    let baselineStatus = String(asRecord(evidenceCheck)?.latest_baseline_status || "missing");
    const baselineStatusBeforePublicCollection = baselineStatus;

    if (includePublicCollection) {
      const publicCollection = await runStage({
        supabase,
        runId,
        companyId,
        userId,
        stageKey: "public_collection",
        input: { company_id: companyId, company_name: companyName, website },
        task: async () => {
          const invokeResult = await invokeEdgeFunction({
            supabaseUrl,
            anonKey,
            authHeader,
            functionName: "public-baseline",
            body: {
              company_id: companyId,
              company_name: companyName,
              website,
            },
            timeoutMs: 210_000,
          });

          if (!invokeResult.ok) {
            throw new FlowError(
              errorMessageFromPayload(invokeResult.payload, "Public baseline failed"),
              "public_collection",
              invokeResult.status || 500,
              invokeResult.payload,
            );
          }

          if (invokeResult.payload?.error) {
            throw new FlowError(
              errorMessageFromPayload(invokeResult.payload, "Public baseline failed"),
              "public_collection",
              422,
              invokeResult.payload,
            );
          }

          return invokeResult.payload || { status: "ok" };
        },
        serializeOutput: (value) => asRecord(value) || {},
      });
      baselineStatus = String(asRecord(publicCollection)?.status || baselineStatus || "ok");
    } else {
      await markStageSkipped({
        supabase,
        runId,
        companyId,
        userId,
        stageKey: "public_collection",
        reason: "Public collection stage skipped by request.",
      });
    }

    adjudicationResult = await runStage({
      supabase,
      runId,
      companyId,
      userId,
      stageKey: "adjudication",
      input: {
        mode,
        baseline_status: baselineStatus,
        baseline_status_before_public_collection: baselineStatusBeforePublicCollection,
        uploaded_file_count: Number(asRecord(evidenceCheck)?.uploaded_file_count || 0),
        existing_artifact_count: Number(asRecord(evidenceCheck)?.existing_artifact_count || 0),
      },
      task: async () => {
        const uploadedFileCount = Number(asRecord(evidenceCheck)?.uploaded_file_count || 0);
        const existingArtifactCount = Number(asRecord(evidenceCheck)?.existing_artifact_count || 0);
        const hasUploadedEvidence = uploadedFileCount > 0;
        const hasExistingArtifacts = existingArtifactCount > 0;
        const weakBaseline = isWeakBaselineStatus(baselineStatus);
        const weakBaselineBeforePublicCollection = isWeakBaselineStatus(baselineStatusBeforePublicCollection);
        const baselineMissing = baselineStatus === "missing";
        let contextMode: ContextMode = "public_baseline";
        let rationale = "";

        if (mode === "uploaded_only") {
          if (!hasUploadedEvidence) {
            throw new FlowError(
              "Uploaded-only mode requires at least one uploaded file.",
              "adjudication",
              422,
              {
                error: "Uploaded-only mode requires at least one uploaded file.",
                status: "uploaded_context_requires_files",
                reason: "No uploaded files were found for this company.",
              },
            );
          }
          contextMode = "uploaded_only";
          rationale = "Uploaded-only mode selected, so generated outputs must rely on uploaded company evidence.";
        } else if (mode === "public_only") {
          if (weakBaseline || baselineMissing) {
            throw new FlowError(
              "Public-only mode requires a strong public baseline.",
              "adjudication",
              422,
              {
                error: "Public-only mode requires a strong public baseline.",
                status: "public_baseline_not_ready",
                reason: baselineMissing
                  ? "No baseline run found for this company."
                  : `Latest baseline status is '${baselineStatus}', which is not strong enough for public-only generation.`,
              },
            );
          }
          contextMode = "public_baseline";
          rationale = "Public-only mode selected and baseline quality check passed.";
        } else {
          if ((weakBaseline || baselineMissing) && hasUploadedEvidence) {
            contextMode = "uploaded_only";
            rationale = baselineMissing
              ? "No public baseline run is available, so flow switched to uploaded evidence."
              : "Public baseline is weak/ambiguous, so flow switched to uploaded evidence.";
          } else if (weakBaseline && !hasUploadedEvidence) {
            if (hasExistingArtifacts || !weakBaselineBeforePublicCollection) {
              contextMode = "public_baseline";
              rationale = hasExistingArtifacts
                ? "Latest baseline is weak, but prior generated artifacts exist for this company, so flow continues with public baseline context."
                : "Latest baseline is weak, but a prior baseline status was not weak, so flow continues with public baseline context.";
            } else {
              throw new FlowError(
                "Public baseline is weak and no uploaded evidence is available.",
                "adjudication",
                422,
                {
                  error: "Public baseline is weak and no uploaded evidence is available.",
                  status: baselineStatus || "insufficient_public_evidence",
                  reason: "Add uploaded evidence or improve public baseline before generating artifacts.",
                },
              );
            }
          } else if (baselineMissing && !hasUploadedEvidence) {
            throw new FlowError(
              "No baseline run or uploaded evidence available.",
              "adjudication",
              422,
              {
                error: "No baseline run or uploaded evidence available.",
                status: "missing_evidence_context",
                reason: "Run public baseline or upload files before artifact generation.",
              },
            );
          } else {
            contextMode = "public_baseline";
            rationale = "Hybrid mode selected and public baseline quality check passed.";
          }
        }

        selectedContextMode = contextMode;
        return {
          mode,
          baseline_status: baselineStatus,
          has_uploaded_evidence: hasUploadedEvidence,
          uploaded_file_count: uploadedFileCount,
          selected_context_mode: contextMode,
          rationale,
        };
      },
      serializeOutput: (value) => asRecord(value) || {},
    });

    const selected = String(adjudicationResult?.selected_context_mode || "").trim() as ContextMode;
    selectedContextMode = selected || selectedContextMode || "public_baseline";

    researchResult = await runStage({
      supabase,
      runId,
      companyId,
      userId,
      stageKey: "output_generation",
      input: {
        company_id: companyId,
        selected_context_mode: selectedContextMode,
        runtime_contract: runtimeContract,
      },
      task: async () => {
        if (runtimeContract?.strict && runtimeContract.orchestrator_mode === "off" && runtimeContract.framework_modes.length !== 1) {
          throw new FlowError(
            "Strict runtime contract requires exactly one framework mode.",
            "output_generation",
            422,
            { error: "invalid_framework_mode_count", request_id: runtimeContract.request_id },
          );
        }

        const requestBody: Record<string, unknown> = {
          company_id: companyId,
          company_name: companyName,
          website,
          review_mode: reviewMode,
          allow_review_block_save: allowReviewBlockSave,
        };

        if (selectedContextMode === "uploaded_only" || selectedContextMode === "uploaded_evidence_fallback") {
          requestBody.context_mode = "uploaded_only";
        }

        if (requestedJourneyKey) {
          requestBody.journey_key = requestedJourneyKey;
          requestBody.journeys_to_generate = [requestedJourneyKey];
          requestBody.job_maps = [{ journey_key: requestedJourneyKey, source: "selected" }];
        }

        if (runtimeContract?.strict) {
          requestBody.enforce_framework_contract = true;
          requestBody.request_id = runtimeContract.request_id;
          requestBody.run_id = runId;
          requestBody.orchestrator_mode = runtimeContract.orchestrator_mode;
          requestBody.framework_schema_version = runtimeContract.framework_schema_version;
          requestBody.stage = runtimeContract.stage;
          requestBody.journey_key = runtimeContract.journey_key;
          requestBody.journeys_to_generate = [runtimeContract.journey_key];
          requestBody.job_maps = [{ journey_key: runtimeContract.journey_key, source: "selected" }];
          if (runtimeContract.framework_mode) {
            requestBody.framework_mode = runtimeContract.framework_mode;
          }
        }

        const invokeResult = await invokeEdgeFunction({
          supabaseUrl,
          anonKey,
          authHeader,
          functionName: "research-company",
          body: requestBody,
          timeoutMs: 420_000,
        });

        if (!invokeResult.ok) {
          throw new FlowError(
            errorMessageFromPayload(invokeResult.payload, "Research output generation failed"),
            "output_generation",
            invokeResult.status || 500,
            invokeResult.payload,
          );
        }

        if (invokeResult.payload?.error) {
          throw new FlowError(
            errorMessageFromPayload(invokeResult.payload, "Research output generation failed"),
            "output_generation",
            Number(invokeResult.payload?.status) || 422,
            invokeResult.payload,
          );
        }

        return invokeResult.payload || { status: "saved" };
      },
      serializeOutput: (value) => asRecord(value) || {},
    });

    if (includeLocalAlignment) {
      try {
        localAlignmentResult = await runStage({
          supabase,
          runId,
          companyId,
          userId,
          stageKey: "output_check",
          input: {
            company_id: companyId,
            areas,
            selected_context_mode: selectedContextMode,
            apply_score_update: applyScoreUpdate,
          },
          task: async () => {
            const invokeResult = await invokeEdgeFunction({
              supabaseUrl,
              anonKey,
              authHeader,
              functionName: "local-alignment",
              body: {
                company_id: companyId,
                areas,
                trigger: `agent_flow:${trigger}`,
                apply_score_update: applyScoreUpdate,
                ignore_public_baseline: selectedContextMode === "uploaded_only",
              },
              timeoutMs: 120_000,
            });

            if (!invokeResult.ok || invokeResult.payload?.error) {
              throw new FlowError(
                errorMessageFromPayload(invokeResult.payload, "Local alignment check failed"),
                "output_check",
                invokeResult.status >= 400 ? invokeResult.status : 422,
                invokeResult.payload,
              );
            }

            return invokeResult.payload || { status: "local_alignment" };
          },
          serializeOutput: (value) => asRecord(value) || {},
        });
      } catch (error) {
        localAlignmentError = error instanceof Error ? error.message : String(error);
      }
    } else {
      await markStageSkipped({
        supabase,
        runId,
        companyId,
        userId,
        stageKey: "output_check",
        reason: "Local alignment stage skipped by request.",
      });
    }

    const finalStatus = localAlignmentError ? "partial" : "completed";
    const summary = {
      trigger,
      mode,
      selected_context_mode: selectedContextMode,
      run_ledger: {
        stage_count: Object.keys(STAGE_ORDER).length,
        local_alignment_attempted: includeLocalAlignment,
        local_alignment_error: localAlignmentError,
      },
      runtime_contract: runtimeContract,
      adjudication: adjudicationResult,
      research: researchResult,
      local_alignment: localAlignmentResult,
    };

    await supabase
      .from("agent_flow_runs")
      .update({
        status: finalStatus,
        selected_context_mode: selectedContextMode,
        summary_json: summary,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    return json({
      message: localAlignmentError
        ? "Agent flow completed with output-check warnings."
        : "Agent flow completed.",
      status: finalStatus,
      run_id: runId,
      request_id: runtimeContract?.request_id ?? null,
      selected_context_mode: selectedContextMode,
      runtime_contract: runtimeContract,
      adjudication: adjudicationResult,
      research_result: researchResult,
      local_alignment_result: localAlignmentResult,
      local_alignment_error: localAlignmentError,
    });
  } catch (error) {
    // Preserve the original stage from FlowError; only fall back to
    // "output_generation" when the error truly has no stage attribution
    // (i.e. an unexpected throw outside any runStage call).
    const flowError = error instanceof FlowError
      ? error
      : new FlowError(
          error instanceof Error ? error.message : String(error),
          // Use the last known active stage rather than hard-coding output_generation,
          // so monitoring surfaces accurate failure attribution.
          (researchResult != null ? "output_check" : adjudicationResult != null ? "output_generation" : "adjudication") as StageKey,
          500,
          null,
        );

    const runStatus = flowError.statusCode === 422 ? "blocked" : "failed";
    const failureSummary = {
      error: flowError.message,
      status: runStatus,
      stage: flowError.stageKey,
      payload: flowError.payload,
    };

    await supabase
      .from("agent_flow_runs")
      .update({
        status: runStatus,
        selected_context_mode: selectedContextMode,
        summary_json: failureSummary,
        updated_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (flowError.payload) {
      return json({
        ...flowError.payload,
        run_id: runId,
        request_id: runtimeContract?.request_id ?? null,
        stage: flowError.stageKey,
      }, flowError.statusCode);
    }

    return json({
      error: flowError.message,
      status: runStatus,
      stage: flowError.stageKey,
      run_id: runId,
      request_id: runtimeContract?.request_id ?? null,
    }, flowError.statusCode);
  }
});
