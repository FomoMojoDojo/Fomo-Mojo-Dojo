import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestDifyProposalSignals } from "../_shared/evidencePhase1.ts";
import { snapshotMojoScore } from "../_shared/snapshotMojoScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// Source types that represent primary customer research — only these may be
// treated as customer-validated in candidate needs outputs.
const CUSTOMER_VALIDATED_SOURCE_TYPES = new Set(["interview", "survey", "transcript", "customer_research"]);
const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const DIFY_STARTUP_TIMEOUT_MS = 180000;
const DIFY_MONITOR_MAX_ATTEMPTS = 540;
const DIFY_MONITOR_DELAY_MS = 5000;
const DIFY_RUN_ID_GRACE_MS = 180000;

async function readLocalEnvValue(name: string): Promise<string | undefined> {
  const cwd = (() => {
    try {
      return Deno.cwd();
    } catch {
      return "";
    }
  })();

  const candidates = [
    (() => {
      try {
        return new URL("../.env.local", import.meta.url).pathname;
      } catch {
        return "";
      }
    })(),
    (() => {
      try {
        return new URL("../.env", import.meta.url).pathname;
      } catch {
        return "";
      }
    })(),
    cwd ? `${cwd}/supabase/functions/.env.local` : "",
    cwd ? `${cwd}/supabase/functions/.env` : "",
    cwd ? `${cwd}/functions/.env.local` : "",
    cwd ? `${cwd}/functions/.env` : "",
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      const text = await Deno.readTextFile(path);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex <= 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        if (key !== name) continue;
        const rawValue = trimmed.slice(eqIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");
        if (value) return value;
      }
    } catch {
      // Ignore missing local env files. Production should rely on Deno.env.
    }
  }

  return undefined;
}

function buildDifyWorkflowsRunEndpoint(baseUrl: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (normalizedBase.endsWith("/v1")) {
    return `${normalizedBase}/workflows/run`;
  }
  return `${normalizedBase}/v1/workflows/run`;
}

function buildDifyWorkflowRunDetailEndpoint(baseUrl: string, workflowRunId: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  if (normalizedBase.endsWith("/v1")) {
    return `${normalizedBase}/workflows/run/${workflowRunId}`;
  }
  return `${normalizedBase}/v1/workflows/run/${workflowRunId}`;
}

function extensionFromName(name: string) {
  const parts = String(name || "").toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isLocalUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOST_ALLOWLIST.has(String(url.hostname || "").trim().toLowerCase());
  } catch {
    return false;
  }
}

async function extractTextViaLocalParser(params: {
  parserUrl: string;
  fileName: string;
  fileType: string;
  bytes: Uint8Array;
}) {
  const { parserUrl, fileName, fileType, bytes } = params;
  const base64 = encodeBase64(bytes);
  const response = await fetch(parserUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_name: fileName,
      file_type: fileType,
      content_base64: base64,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Local parser error (${response.status}): ${text}`);
  }
  const data = await response.json().catch(() => ({}));
  const text = typeof data?.text === "string" ? data.text : "";
  const source = typeof data?.source === "string" ? data.source : "local_parser";
  return { text, source };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function readStringArray(value: unknown): string[] {
  const parsed = parseJsonString(value);
  if (parsed !== value) {
    return readStringArray(parsed);
  }
  if (typeof value === "string") {
    return value
      .split("|")
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  const parsed = parseJsonString(value);
  if (parsed !== value) {
    return readRecordArray(parsed);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => !!item);
  }
  return [];
}

function normalizeCandidateNeed(value: Record<string, unknown>): Record<string, unknown> {
  const desiredOutcome = String(
    value.desired_outcome ??
    value.outcome ??
    value.need ??
    value.title ??
    ""
  ).trim();

  const next: Record<string, unknown> = {
    desired_outcome: desiredOutcome,
  };

  if (typeof value.importance === "number") next.importance = value.importance;
  else if (typeof value.importance === "string" && value.importance.trim() !== "") {
    const parsedImportance = Number(value.importance);
    if (Number.isFinite(parsedImportance)) next.importance = parsedImportance;
  }

  if (typeof value.satisfaction === "number") next.satisfaction = value.satisfaction;
  else if (typeof value.satisfaction === "string" && value.satisfaction.trim() !== "") {
    const parsedSatisfaction = Number(value.satisfaction);
    if (Number.isFinite(parsedSatisfaction)) next.satisfaction = parsedSatisfaction;
  }

  if (typeof value.customer_validated === "boolean") {
    next.customer_validated = value.customer_validated;
  }

  const evidence = String(
    value.evidence ??
    value.signal ??
    value.supporting_evidence ??
    ""
  ).trim();
  if (evidence) next.evidence = evidence;

  return next;
}

function normalizeFrameworkFinding(value: Record<string, unknown>): Record<string, unknown> {
  return {
    claim: String(value.claim ?? "").trim(),
    evidence: String(value.evidence ?? "").trim(),
    confidence: String(value.confidence ?? "low").trim().toLowerCase(),
    mojo_area: String(value.mojo_area ?? "").trim(),
    suggested_update: String(value.suggested_update ?? "").trim(),
    risk_if_ignored: String(value.risk_if_ignored ?? "").trim(),
  };
}

function normalizeFrameworkResult(value: Record<string, unknown>): Record<string, unknown> {
  return {
    framework: String(value.framework ?? "").trim(),
    findings: readRecordArray(value.findings)
      .map((item) => normalizeFrameworkFinding(item))
      .filter((item) => item.claim),
  };
}

function normalizePositioningUpdate(value: Record<string, unknown>): Record<string, unknown> {
  return {
    field: String(value.field ?? "").trim(),
    current_issue: String(value.current_issue ?? "").trim(),
    suggested_update: String(value.suggested_update ?? "").trim(),
    evidence: String(value.evidence ?? "").trim(),
    confidence: String(value.confidence ?? "low").trim().toLowerCase(),
  };
}

function normalizeJobStep(value: Record<string, unknown>): Record<string, unknown> {
  return {
    step_label: String(value.step_label ?? "").trim(),
    step_description: String(value.step_description ?? "").trim(),
    evidence: String(value.evidence ?? "").trim(),
    confidence: String(value.confidence ?? "low").trim().toLowerCase(),
  };
}

function normalizeCandidateOutcome(value: Record<string, unknown>): Record<string, unknown> {
  return {
    outcome: String(value.outcome ?? "").trim(),
    related_opportunities: readStringArray(value.related_opportunities),
    evidence: String(value.evidence ?? "").trim(),
    confidence: String(value.confidence ?? "low").trim().toLowerCase(),
  };
}

function normalizePossibleRoute(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return {
      title: value.trim(),
      why_this_could_matter: "",
      linked_opportunity: "",
      evidence: "",
      confidence: "low",
    };
  }

  const record = asRecord(value) ?? {};
  return {
    title: String(record.title ?? record.route ?? "").trim(),
    why_this_could_matter: String(record.why_this_could_matter ?? "").trim(),
    linked_opportunity: String(record.linked_opportunity ?? "").trim(),
    evidence: String(record.evidence ?? "").trim(),
    confidence: String(record.confidence ?? "low").trim().toLowerCase(),
  };
}

function normalizeExperimentToRun(value: Record<string, unknown>): Record<string, unknown> {
  return {
    experiment: String(value.experiment ?? "").trim(),
    what_it_tests: String(value.what_it_tests ?? "").trim(),
    evidence: String(value.evidence ?? "").trim(),
  };
}

function normalizeContradiction(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return {
      claim: value.trim(),
      conflicts_with: "",
      evidence: "",
    };
  }

  const record = asRecord(value) ?? {};
  return {
    claim: String(record.claim ?? "").trim(),
    conflicts_with: String(record.conflicts_with ?? "").trim(),
    evidence: String(record.evidence ?? "").trim(),
  };
}

function waitUntil(promise: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
    return true;
  }
  return false;
}

type PersistContext = {
  supabase: ReturnType<typeof createClient>;
  difyApiKey: string;
  difyBaseUrl: string;
  difyRequestBody: {
    inputs: {
      file_url: string;
      file_name: string;
      file_text: string;
      source_type: string;
      enabled_frameworks: string;
      company_id: string;
      trigger_type: string;
      journey_key: string;
    };
    response_mode: string;
    user: string;
  };
  proposalId: string;
  sourceType: string;
};

function extractDifyPayload(difyResult: Record<string, unknown>) {
  const topLevel = asRecord(difyResult) ?? {};
  const data = asRecord(topLevel.data) ?? {};
  const workflowRun = asRecord(topLevel.workflow_run) ?? asRecord(data.workflow_run) ?? {};

  const outputs = (
    asRecord(data.outputs) ??
    asRecord(topLevel.outputs) ??
    asRecord(workflowRun.outputs) ??
    {}
  ) as Record<string, unknown>;

  const rawStatus = String(
    workflowRun.status ??
    data.status ??
    topLevel.status ??
    data.workflow_status ??
    topLevel.workflow_status ??
    data.state ??
    topLevel.state ??
    ""
  ).trim().toLowerCase();

  let workflowStatus = rawStatus;
  if (workflowStatus === "success" || workflowStatus === "completed" || workflowStatus === "complete") {
    workflowStatus = "succeeded";
  }

  const workflowError = String(
    workflowRun.error ??
    data.error ??
    topLevel.error ??
    ""
  ).trim();

  const hasMeaningfulOutputs =
    Object.keys(outputs).length > 0 ||
    typeof topLevel.text === "string" ||
    typeof data.text === "string";

  if (!workflowStatus && hasMeaningfulOutputs && !workflowError) {
    workflowStatus = "succeeded";
  }

  return { outputs, workflowStatus, workflowError };
}

async function markProposalFailed(params: {
  supabase: ReturnType<typeof createClient>;
  proposalId: string;
  summary: string;
  error: string;
}) {
  const { supabase, proposalId, summary, error } = params;
  await supabase.from("file_proposals").update({
    summary,
    processing_state: "failed",
    processing_error: error,
    processing_completed_at: new Date().toISOString(),
  }).eq("id", proposalId).neq("status", "rejected");
}

async function persistDifyResult(params: {
  supabase: ReturnType<typeof createClient>;
  proposalId: string;
  sourceType: string;
  difyResult: Record<string, unknown>;
}) {
  const { supabase, proposalId, sourceType, difyResult } = params;
  const { outputs, workflowStatus, workflowError } = extractDifyPayload(difyResult);

  if (workflowStatus && workflowStatus !== "succeeded") {
    await markProposalFailed({
      supabase,
      proposalId,
      summary: workflowError || `Dify workflow ${workflowStatus}`,
      error: workflowError || `Dify workflow ${workflowStatus}`,
    });
    throw new Error(`Dify workflow ${workflowStatus}: ${workflowError || "unknown error"}`);
  }

  console.log("[dify-analyze-file] parsed outputs keys:", Object.keys(outputs).join(", ") || "(none)");

  const fallbackText = String(
    (asRecord(difyResult.data)?.text) ??
    difyResult.text ??
    ""
  ).trim();
  const parsedResult = parseJsonString(outputs.result ?? fallbackText);
  const resultRecord = asRecord(parsedResult);
  const structuredOutputs = resultRecord ?? (Object.keys(outputs).length > 0 ? outputs : asRecord(parseJsonString(fallbackText)) ?? outputs);

  const summary = String(
    structuredOutputs.summary ??
    (typeof parsedResult === "string" ? parsedResult : "") ??
    ""
  ).trim();
  const evidence = readStringArray(structuredOutputs.evidence);
  const signalType = String(structuredOutputs.signal_type ?? "document").trim().toLowerCase();
  const frameworkResults = readRecordArray(structuredOutputs.framework_results)
    .map((item) => normalizeFrameworkResult(item))
    .filter((item) => item.framework);
  const suggestedAreas = readStringArray(
    structuredOutputs.suggested_areas ?? structuredOutputs.suggested_area
  );
  const candidatePositioningUpdates = readRecordArray(structuredOutputs.candidate_positioning_updates)
    .map((item) => normalizePositioningUpdate(item))
    .filter((item) => item.field && item.suggested_update);
  const candidateJobSteps = readRecordArray(structuredOutputs.candidate_job_steps)
    .map((item) => normalizeJobStep(item))
    .filter((item) => item.step_label);
  const rawNeedRecords = readRecordArray(
    structuredOutputs.candidate_needs ??
    structuredOutputs.candidate_need
  );
  const candidateOutcomes = readRecordArray(structuredOutputs.candidate_outcomes)
    .map((item) => normalizeCandidateOutcome(item))
    .filter((item) => item.outcome);
  const possibleGaps: unknown[] = Array.isArray(structuredOutputs.possible_gaps)
    ? (structuredOutputs.possible_gaps as unknown[])
    : [];
  const possibleRoutes = (
    Array.isArray(parseJsonString(structuredOutputs.possible_routes ?? structuredOutputs.possible_route))
      ? (parseJsonString(structuredOutputs.possible_routes ?? structuredOutputs.possible_route) as unknown[])
      : []
  )
    .map((item) => normalizePossibleRoute(item))
    .filter((item) => item.title);
  const experimentsToRun = readRecordArray(structuredOutputs.experiments_to_run)
    .map((item) => normalizeExperimentToRun(item))
    .filter((item) => item.experiment);
  const contradictions = (
    Array.isArray(parseJsonString(structuredOutputs.contradictions))
      ? (parseJsonString(structuredOutputs.contradictions) as unknown[])
      : []
  )
    .map((item) => normalizeContradiction(item))
    .filter((item) => item.claim);
  const rawConfidence = String(structuredOutputs.confidence ?? "medium").trim().toLowerCase();
  const confidence = ["high", "medium", "low"].includes(rawConfidence) ? rawConfidence : "medium";
  const confidenceReason = String(
    structuredOutputs.confidence_reason ??
    structuredOutputs.confidence_reasoning ??
    ""
  ).trim();
  const questionsToVerify: unknown[] = Array.isArray(structuredOutputs.questions_to_verify)
    ? (structuredOutputs.questions_to_verify as unknown[])
    : [];

  console.log("[dify-analyze-file] parsed — summary length:", summary.length,
    "| evidence:", evidence.length,
    "| frameworks:", frameworkResults.length,
    "| areas:", suggestedAreas.length,
    "| positioning:", candidatePositioningUpdates.length,
    "| job steps:", candidateJobSteps.length,
    "| needs:", rawNeedRecords.length,
    "| outcomes:", candidateOutcomes.length,
    "| gaps:", possibleGaps.length,
    "| routes:", possibleRoutes.length,
    "| experiments:", experimentsToRun.length,
    "| contradictions:", contradictions.length,
    "| confidence:", confidence,
  );

  const isCustomerSource = CUSTOMER_VALIDATED_SOURCE_TYPES.has(sourceType ?? "");
  const candidateNeeds = rawNeedRecords
    .map((need) => normalizeCandidateNeed(need))
    .filter((need) => typeof need.desired_outcome === "string" && need.desired_outcome.trim().length > 0)
    .map((need) => {
    if (!isCustomerSource && need.customer_validated !== false) {
      return { ...need, customer_validated: false };
    }
    return need;
  });

  const { error: updateError } = await supabase
    .from("file_proposals")
    .update({
      summary,
      evidence,
      signal_type: signalType,
      framework_results: frameworkResults,
      suggested_areas: suggestedAreas,
      candidate_positioning_updates: candidatePositioningUpdates,
      candidate_job_steps: candidateJobSteps,
      candidate_needs: candidateNeeds,
      candidate_outcomes: candidateOutcomes,
      possible_gaps: possibleGaps,
      possible_routes: possibleRoutes,
      experiments_to_run: experimentsToRun,
      contradictions,
      confidence,
      confidence_reason: confidenceReason,
      questions_to_verify: questionsToVerify,
      processing_state: "ready",
      processing_error: null,
      processing_completed_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .neq("status", "rejected");

  if (updateError) {
    console.log("[dify-analyze-file] update error:", updateError.message);
    throw new Error(`Failed to save proposal: ${updateError.message}`);
  }

  const { data: proposalRow } = await supabase
    .from("file_proposals")
    .select("company_id, file_name, source_type")
    .eq("id", proposalId)
    .maybeSingle();

  if (proposalRow?.company_id) {
    const companyId = String(proposalRow.company_id);
    await ingestDifyProposalSignals({
      supabase,
      companyId,
      proposalId,
      sourceType: String(proposalRow.source_type ?? sourceType ?? "file_proposal"),
      sourceTitle: String(proposalRow.file_name ?? "Dify proposal"),
      summary,
      evidence,
      contradictions,
      frameworkResults,
      questionsToVerify,
      rawPayload: structuredOutputs,
    });
    await snapshotMojoScore(supabase, companyId);
  }

  console.log("[dify-analyze-file] proposal updated, id:", proposalId);
}

function parseSseEventBlock(block: string): { event?: string; payload?: Record<string, unknown> } | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  let eventName = "";
  const dataLines: string[] = [];
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;
  const dataText = dataLines.join("\n").trim();
  if (!dataText || dataText === "[DONE]") return null;
  try {
    const payload = JSON.parse(dataText) as Record<string, unknown>;
    return { event: eventName || String(payload.event ?? "").trim() || undefined, payload };
  } catch {
    return null;
  }
}

// Reads the Dify SSE stream only until workflow_run_id appears in the first
// workflow_started event, then cancels the reader and returns immediately.
// Does NOT drain the full stream — the background monitor polls for completion.
async function startDifyWorkflowStreaming(params: {
  difyApiKey: string;
  difyEndpoint: string;
  difyRequestBody: PersistContext["difyRequestBody"];
}) {
  const { difyApiKey, difyEndpoint, difyRequestBody } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DIFY_STARTUP_TIMEOUT_MS);
  try {
    const response = await fetch(difyEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${difyApiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
        "Accept-Encoding": "identity",
      },
      body: JSON.stringify({ ...difyRequestBody, response_mode: "streaming" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(`Dify workflow error (${response.status}): ${raw}`);
    }

    if (!response.body) {
      throw new Error("Dify did not return a streaming body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let workflowRunId = "";
    let taskId = "";
    let chunkCount = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunkCount += 1;
        const chunkText = decoder.decode(value, { stream: true });
        if (chunkCount <= 3) {
          console.log(
            "[dify-analyze-file] Dify startup chunk:", chunkCount,
            "| bytes:", value.length,
            "| preview:", JSON.stringify(chunkText.slice(0, 240)),
          );
        }
        buffer += chunkText;
        const blocks = buffer.split(/\n\n+/);
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const parsed = parseSseEventBlock(block);
          const payload = parsed?.payload;
          if (!payload) continue;

          workflowRunId ||= String(
            payload.workflow_run_id ??
            (asRecord(payload.data)?.workflow_run_id ?? "")
          ).trim();
          taskId ||= String(
            payload.task_id ??
            (asRecord(payload.data)?.task_id ?? "")
          ).trim();

          if (workflowRunId) {
            // Stop reading immediately — do NOT drain to workflow_finished.
            // The background monitor polls GET /workflows/run/<id> for completion.
            try {
              await reader.cancel();
            } catch {
              // Best-effort connection cleanup; we already have the run ID.
            }
            return { workflowRunId, taskId };
          }
        }
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      // Startup timeout fired — no run ID captured in time.
      if (msg.includes("AbortError") || msg.includes("abort") || controller.signal.aborted) {
        throw new Error(`Dify startup timed out after ${DIFY_STARTUP_TIMEOUT_MS / 1000}s — no workflow_run_id received`);
      }
      throw err;
    }

    if (!workflowRunId) {
      throw new Error("Dify streaming start did not return workflow_run_id");
    }

    return { workflowRunId, taskId };
  } finally {
    clearTimeout(timeout);
  }
}

async function syncDifyRun(params: {
  supabase: ReturnType<typeof createClient>;
  difyApiKey: string;
  difyBaseUrl: string;
  proposalId: string;
}) {
  const { supabase, difyApiKey, difyBaseUrl, proposalId } = params;
  const { data: proposal, error } = await supabase
    .from("file_proposals")
    .select("id, status, source_type, processing_state, processing_error, dify_workflow_run_id, created_at, processing_started_at")
    .eq("id", proposalId)
    .single();

  if (error || !proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status === "rejected") {
    return { state: "rejected" };
  }
  if (proposal.processing_state === "ready" || proposal.processing_state === "failed") {
    return { state: proposal.processing_state };
  }

  const workflowRunId = String((proposal as Record<string, unknown>).dify_workflow_run_id ?? "").trim();
  if (!workflowRunId) {
    const createdAt = String((proposal as Record<string, unknown>).created_at ?? "").trim();
    const processingStartedAt = String((proposal as Record<string, unknown>).processing_started_at ?? "").trim();
    const referenceTime = processingStartedAt || createdAt;
    const startedMs = referenceTime ? Date.parse(referenceTime) : NaN;
    const ageMs = Number.isFinite(startedMs) ? Date.now() - startedMs : 0;

    if (
      proposal.processing_state === "queued" ||
      (proposal.processing_state === "running" && ageMs < DIFY_RUN_ID_GRACE_MS)
    ) {
      await supabase.from("file_proposals").update({
        processing_state: proposal.processing_state === "running" ? "running" : "queued",
        processing_error: null,
      }).eq("id", proposalId).neq("status", "rejected");
      return { state: proposal.processing_state === "running" ? "running" : "queued" };
    }

    await markProposalFailed({
      supabase,
      proposalId,
      summary: "Dify run id missing",
      error: "No dify_workflow_run_id stored for queued/running proposal.",
    });
    return { state: "failed" };
  }

  const detailEndpoint = buildDifyWorkflowRunDetailEndpoint(difyBaseUrl, workflowRunId);
  const response = await fetch(detailEndpoint, {
    headers: { "Authorization": `Bearer ${difyApiKey}` },
  });
  const raw = await response.text().catch(() => "");
  console.log("[dify-analyze-file] sync status:", response.status, "| run:", workflowRunId);
  console.log("[dify-analyze-file] sync raw response:", raw.slice(0, 1200));

  if (!response.ok) {
    await markProposalFailed({
      supabase,
      proposalId,
      summary: `Dify detail error (${response.status})`,
      error: raw.slice(0, 2000),
    });
    return { state: "failed" };
  }

  let difyResult: Record<string, unknown>;
  try {
    difyResult = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    await markProposalFailed({
      supabase,
      proposalId,
      summary: "Dify detail returned non-JSON response",
      error: raw.slice(0, 2000),
    });
    return { state: "failed" };
  }

  const { workflowStatus, workflowError } = extractDifyPayload(difyResult);
  if (!workflowStatus || workflowStatus === "running") {
    await supabase.from("file_proposals").update({
      processing_state: "running",
      processing_error: null,
    }).eq("id", proposalId).neq("status", "rejected");
    return { state: "running" };
  }

  if (workflowStatus !== "succeeded") {
    await markProposalFailed({
      supabase,
      proposalId,
      summary: workflowError || `Dify workflow ${workflowStatus}`,
      error: workflowError || `Dify workflow ${workflowStatus}`,
    });
    return { state: "failed" };
  }

  await persistDifyResult({
    supabase,
    proposalId,
    sourceType: String(proposal.source_type ?? ""),
    difyResult,
  });
  return { state: "ready" };
}

async function monitorDifyRunInBackground(params: {
  supabase: ReturnType<typeof createClient>;
  difyApiKey: string;
  difyBaseUrl: string;
  proposalId: string;
  maxAttempts?: number;
  delayMs?: number;
}) {
  const {
    supabase,
    difyApiKey,
    difyBaseUrl,
    proposalId,
    maxAttempts = DIFY_MONITOR_MAX_ATTEMPTS,
    delayMs = DIFY_MONITOR_DELAY_MS,
  } = params;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await syncDifyRun({
        supabase,
        difyApiKey,
        difyBaseUrl,
        proposalId,
      });

      if (result.state === "ready" || result.state === "failed" || result.state === "rejected") {
        console.log("[dify-analyze-file] background monitor completed:", proposalId, "| state:", result.state, "| attempts:", attempt + 1);
        return;
      }
    } catch (error) {
      console.log("[dify-analyze-file] background monitor error:", proposalId, "|", String((error as Error)?.message ?? error));
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  await markProposalFailed({
    supabase,
    proposalId,
    summary: "Dify background monitor timed out",
    error: "Dify workflow did not reach a terminal state within the background polling window.",
  });
}

async function startDifyRun(params: PersistContext) {
  const { supabase, difyApiKey, difyBaseUrl, difyRequestBody, proposalId } = params;
  const difyEndpoint = buildDifyWorkflowsRunEndpoint(difyBaseUrl);
  const { workflowRunId, taskId } = await startDifyWorkflowStreaming({
    difyApiKey,
    difyEndpoint,
    difyRequestBody,
  });

  if (!workflowRunId) {
    throw new Error("Failed to capture workflow_run_id from Dify stream");
  }

  const { error } = await supabase
    .from("file_proposals")
    .update({
      processing_state: "running",
      processing_error: null,
      processing_started_at: new Date().toISOString(),
      dify_workflow_run_id: workflowRunId,
      dify_task_id: taskId || null,
    })
    .eq("id", proposalId)
    .neq("status", "rejected");

  if (error) {
    throw new Error(`Failed to save Dify run identifiers: ${error.message}`);
  }

  const monitorPromise = monitorDifyRunInBackground({
    supabase,
    difyApiKey,
    difyBaseUrl,
    proposalId,
  }).catch(async (err) => {
    const msg = String((err as Error)?.message ?? err);
    console.error("[dify-analyze-file] monitor error:", msg);
    await markProposalFailed({ supabase, proposalId, summary: "Background monitor error", error: msg });
  });

  const registered = waitUntil(monitorPromise);
  if (!registered) {
    console.log("[dify-analyze-file] local dev: waitUntil unavailable; monitor running as detached promise (server is long-lived)");
  }

  return { workflowRunId, taskId };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      mode?: string;
      proposalId?: string;
      fileId?: string;
      filePath?: string;
      fileName?: string;
      fileType?: string;
      companyId?: string;
      sourceType?: string;
    };

    const { mode, proposalId: requestedProposalId, fileId, filePath, fileName, fileType, companyId, sourceType } = body;
    console.log("[dify-analyze-file] incoming body:", JSON.stringify({
      mode,
      proposalId: requestedProposalId,
      fileId,
      filePath: filePath?.slice(0, 40),
      fileName,
      fileType,
      companyId,
      sourceType,
    }));

    const envDifyApiKey = Deno.env.get("DIFY_API_KEY");
    const fileDifyApiKey = envDifyApiKey ? undefined : await readLocalEnvValue("DIFY_API_KEY");
    const DIFY_API_KEY = envDifyApiKey ?? fileDifyApiKey;

    const envDifyBaseUrl = Deno.env.get("DIFY_API_BASE_URL");
    const fileDifyBaseUrl = envDifyBaseUrl ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_API_BASE_URL = (envDifyBaseUrl ?? fileDifyBaseUrl ?? "https://api.dify.ai").replace(/\/$/, "");
    const LOCAL_PARSER_URL =
      Deno.env.get("LOCAL_PARSER_URL") ??
      await readLocalEnvValue("LOCAL_PARSER_URL") ??
      "http://host.docker.internal:8789/extract";

    let cwd = "";
    try {
      cwd = Deno.cwd();
    } catch {
      cwd = "(unavailable)";
    }

    console.log("[dify-analyze-file] cwd:", cwd);
    console.log("[dify-analyze-file] DIFY_API_KEY present:", !!DIFY_API_KEY);
    console.log("[dify-analyze-file] DIFY_API_KEY source:", envDifyApiKey ? "Deno.env" : fileDifyApiKey ? ".env.local/.env fallback" : "missing");
    console.log("[dify-analyze-file] DIFY_API_BASE_URL:", DIFY_API_BASE_URL);
    console.log("[dify-analyze-file] LOCAL_PARSER_URL:", LOCAL_PARSER_URL);

    if (!DIFY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Dify is not configured — set DIFY_API_KEY in Supabase secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!isLocalUrl(LOCAL_PARSER_URL)) {
      return new Response(
        JSON.stringify({ error: "LOCAL_PARSER_URL must be localhost/host.docker.internal." }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (mode === "sync") {
      if (!requestedProposalId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: proposalId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const syncResult = await syncDifyRun({
        supabase,
        difyApiKey: DIFY_API_KEY,
        difyBaseUrl: DIFY_API_BASE_URL,
        proposalId: requestedProposalId,
      });

      return new Response(
        JSON.stringify(syncResult),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!fileId || !filePath || !companyId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fileId, filePath, companyId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Create a 15-minute signed URL so Dify can fetch the file directly.
    const { data: signedData, error: signError } = await supabase.storage
      .from("input-files")
      .createSignedUrl(filePath, 900);

    if (signError || !signedData?.signedUrl) {
      console.log("[dify-analyze-file] signed URL error:", signError?.message ?? "no signedUrl");
      return new Response(
        JSON.stringify({ error: "Could not access file in storage." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[dify-analyze-file] signed URL created (length):", signedData.signedUrl.length);

    const { data: downloaded, error: downloadError } = await supabase
      .storage
      .from("input-files")
      .download(filePath);

    if (downloadError || !downloaded) {
      console.log("[dify-analyze-file] download error:", downloadError?.message ?? "no file downloaded");
      return new Response(
        JSON.stringify({ error: "Could not download file from storage." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let fileText = "";
    try {
      const bytes = new Uint8Array(await downloaded.arrayBuffer());
      const ext = extensionFromName(fileName ?? "");
      const normalizedType = String(fileType || downloaded.type || "").toLowerCase();
      if (
        normalizedType.startsWith("text/") ||
        normalizedType.includes("json") ||
        normalizedType.includes("csv") ||
        ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml"].includes(ext)
      ) {
        fileText = new TextDecoder().decode(bytes);
      } else {
        const parsed = await extractTextViaLocalParser({
          parserUrl: LOCAL_PARSER_URL,
          fileName: fileName ?? "",
          fileType: normalizedType,
          bytes,
        });
        fileText = parsed.text;
      }
    } catch (extractError) {
      console.log("[dify-analyze-file] extraction error:", String((extractError as Error)?.message ?? extractError));
      fileText = "";
    }

    console.log("[dify-analyze-file] extracted file_text length:", fileText.length);

    // Build request body matching the Dify Start node variables:
    // company_id (required), trigger_type, journey_key (required), file_url, file_name, file_text, source_type, enabled_frameworks
    const difyRequestBody: PersistContext["difyRequestBody"] = {
      inputs: {
        file_url:     signedData.signedUrl,
        file_name:    fileName ?? "",
        file_text:    fileText,
        source_type:  sourceType ?? "",
        enabled_frameworks: JSON.stringify([
          "april_dunford",
          "jtbd",
          "odi",
          "strategy_cascade",
          "teresa_torres",
        ]),
        company_id:   companyId,
        trigger_type: "file_analysis",
        journey_key:  "customer",
      },
      response_mode: "streaming",
      user: "system",
    };
    console.log("[dify-analyze-file] request body:", JSON.stringify({
      ...difyRequestBody,
      inputs: {
        ...difyRequestBody.inputs,
        file_url: difyRequestBody.inputs.file_url.slice(0, 60) + "…",
        file_text: `[${fileText.length} chars]`,
      },
    }));

    // Insert as a new proposal immediately so the UI gets a stable record while
    // the long-running Dify workflow completes in the background.
    const { data: inserted, error: insertError } = await supabase
      .from("file_proposals")
      .insert({
        company_id:         companyId,
        file_id:            fileId,
        file_name:          fileName ?? "",
        source_type:        sourceType ?? "",
        summary:            "Dify analysis queued. Results will appear when processing finishes.",
        evidence:           [],
        signal_type:        "document",
        framework_results:  [],
        suggested_areas:    [],
        candidate_positioning_updates: [],
        candidate_job_steps: [],
        candidate_needs:    [],
        candidate_outcomes: [],
        possible_gaps:      [],
        possible_routes:    [],
        experiments_to_run: [],
        contradictions:     [],
        confidence:         "medium",
        confidence_reason:  "",
        questions_to_verify: [],
        status:              "pending",
        processing_state:    "queued",
        processing_error:    null,
        dify_workflow_run_id: null,
        dify_task_id:        null,
        applied_areas:       [],
      })
      .select()
      .single();

    if (insertError) {
      console.log("[dify-analyze-file] insert error:", insertError.message);
      return new Response(
        JSON.stringify({ error: `Failed to save proposal: ${insertError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[dify-analyze-file] proposal inserted, id:", (inserted as Record<string, unknown>)?.id);

    const insertedProposalId = String((inserted as Record<string, unknown>)?.id ?? "");
    try {
      const started = await startDifyRun({
        supabase,
        difyApiKey: DIFY_API_KEY,
        difyBaseUrl: DIFY_API_BASE_URL,
        difyRequestBody,
        proposalId: insertedProposalId,
        sourceType: sourceType ?? "",
      });
      console.log("[dify-analyze-file] workflow started:", JSON.stringify(started));
    } catch (error) {
      await markProposalFailed({
        supabase,
        proposalId: insertedProposalId,
        summary: "Failed to start Dify workflow",
        error: String((error as Error)?.message ?? error),
      });
      throw error;
    }

    return new Response(
      JSON.stringify({ queued: true, proposal: inserted }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.log("[dify-analyze-file] unhandled error:", String((err as Error)?.message ?? err));
    return new Response(
      JSON.stringify({ error: String((err as Error)?.message ?? err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
