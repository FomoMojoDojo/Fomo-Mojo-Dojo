import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminOnlyGate } from "../_shared/callerGate.ts";
import { isTrustedInternal } from "../_shared/callerAuthz.ts";
import { normalizeForHash, sha256Hex } from "../_shared/contentIdentity.ts";
import { encodeBlobBase64, parserRequestBody } from "../_shared/base64.ts";
import { fileTooLargeBody, isOverCap, MAX_ANALYSIS_FILE_BYTES, storageObjectSize } from "../_shared/fileSizeGuard.ts";
import { interviewFenceForFile, interviewFileRefusalBody } from "../_shared/uploadCorpus.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestDifyProposalSignals } from "../_shared/evidencePhase1.ts";
import { isLocalOllamaUrl as isLocalClassifierUrl, resolveUploadOrigin } from "../_shared/uploadVoiceClassifier.ts";
import { snapshotMojoScore } from "../_shared/snapshotMojoScore.ts";
import { loadUploadSidecar } from "../_shared/uploadSidecar.ts";
import { FILE_ANALYSIS_VERSION } from "../../../src/lib/fileAnalysis.ts";

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

// Flat path (2026-09-12): the file is base64-encoded from the Blob's stream into one byte buffer and
// sent as the request body as-is — no whole-file ArrayBuffer copy, no rope string, no JSON.stringify
// copy of the payload. See _shared/base64.ts for the measurement that forced this.
async function extractTextViaLocalParser(params: {
  parserUrl: string;
  fileName: string;
  fileType: string;
  blob: Blob;
}) {
  const { parserUrl, fileName, fileType, blob } = params;
  const base64 = await encodeBlobBase64(blob);
  const response = await fetch(parserUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: parserRequestBody(fileName, fileType, base64),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Local parser error (${response.status}): ${text}`);
  }
  const data = await response.json().catch(() => ({}));
  const text = typeof data?.text === "string" ? data.text : "";
  const source = typeof data?.source === "string" ? data.source : "local_parser";
  // EXTRACTION SHAPE (ruling 8, 2026-09-14): what the parser read and did not read, carried onto the proposal.
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  // SP-93 (2026-11-13): pages_read is what the parser OPENED, pages_total what the document has.
  // They are one fact, so an answer that knows only one of them is treated as knowing neither —
  // a lone total is exactly the half-truth this slice exists to remove, and the stored pair carries
  // a CHECK that forbids it. `pages` stays the document's count, as extraction_pages always meant.
  const pagesRead = num(data?.pages_read);
  const pagesTotal = num(data?.pages_total);
  const pairKnown = pagesRead !== null && pagesTotal !== null && pagesRead <= pagesTotal;
  return {
    text,
    source,
    images: num(data?.images) ?? 0,
    pages: num(data?.pages),
    pagesRead: pairKnown ? pagesRead : null,
    pagesTotal: pairKnown ? pagesTotal : null,
    charsTotal: num(data?.chars_total),
  };
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

/**
 * Release the fleet-wide single-flight lock for this proposal (SP-180, SP-189).
 *
 * Called on EVERY terminal path, so the next queued file starts within the minute instead of waiting
 * out the 30-minute TTL. The TTL stays as the backstop for a worker that dies without reaching any
 * path at all, and sweep_file_proposal_completion frees a lock whose row is no longer live — three
 * independent ways out, because a wedged queue is the failure this slice exists to prevent.
 *
 * Scoped by proposal_id on purpose: a lock taken for a DIFFERENT row must never be released here,
 * or a late-finishing run would free the lock out from under the run that currently holds it.
 */
// deno-lint-ignore no-explicit-any
async function releaseIngestLock(supabase: { from: (t: string) => any }, proposalId: string) {
  const { error } = await supabase
    .from("ingest_single_flight")
    .delete()
    .eq("lock_key", "file_analysis")
    .eq("proposal_id", proposalId);
  // Never fatal: the lock expires on its own, and failing the analysis over its bookkeeping is worse.
  if (error) console.warn("[dify-analyze-file] lock release failed (non-fatal):", error.message);
}

/**
 * The Dify request body, built in ONE place (SP-219).
 *
 * I-1 gave this function a second entry point — mode:"start", for a row the server claimed — and a
 * second hand-written copy of this body would be free to drift from the one the upload path has always
 * sent. The five fields SP-219 names are fixed here and cannot differ between callers:
 * journey_key, enabled_frameworks, user, response_mode and trigger_type.
 *
 * Two fields are necessarily RE-DERIVED per caller and are therefore parameters, not constants:
 *   file_url   the upload path signs the file it just downloaded; the start door must sign it AGAIN,
 *              because the body carries a 15-minute URL and the starter usually runs after it expired.
 *   file_text  the upload path passes its own fresh parser extraction; the start door passes the
 *              upload SIDECAR, which is also the basis the E4 excerpt guard uses. Same parser, same
 *              document — recorded in I1-review.md rather than left for a reader to notice.
 */
function buildDifyRequestBody(args: {
  fileUrl: string;
  fileName: string;
  fileText: string;
  sourceType: string;
  companyId: string;
}): PersistContext["difyRequestBody"] {
  return {
    inputs: {
      file_url:     args.fileUrl,
      file_name:    args.fileName,
      file_text:    args.fileText,
      source_type:  args.sourceType,
      enabled_frameworks: JSON.stringify([
        "april_dunford",
        "jtbd",
        "odi",
        "strategy_cascade",
        "teresa_torres",
      ]),
      company_id:   args.companyId,
      trigger_type: "file_analysis",
      journey_key:  "customer",
    },
    response_mode: "streaming",
    user: "system",
  };
}

async function markProposalFailed(params: {
  // deno-lint-ignore no-explicit-any
  supabase: { from: (t: string) => any };
  proposalId: string;
  summary: string;
  error: string;
}) {
  const { supabase, proposalId, summary, error } = params;
  // Only an in-flight row can be failed: a row another writer already finished keeps its result.
  await supabase.from("file_proposals").update({
    summary,
    processing_state: "failed",
    processing_error: error,
    processing_completed_at: new Date().toISOString(),
  }).eq("id", proposalId).neq("status", "rejected").in("processing_state", ["queued", "running"]);
  // SP-189: a failed run must not keep the queue. Released whether or not the update above matched —
  // if another writer already finished the row, the lock is stale either way.
  await releaseIngestLock(supabase as unknown as { from: (t: string) => any }, proposalId);
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

  const { data: claimed, error: updateError } = await supabase
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
    .neq("status", "rejected")
    // CLAIM (completion sweep, 2026-09-13): the ready write is atomic on the row still being in flight.
    // The worker's monitor, a page's sync poll and the pg_cron sweep can all reach a finished run; only
    // the writer whose update matched runs the side effects below (signal ingest, score snapshot).
    .in("processing_state", ["queued", "running"])
    .select("id");
  // SP-189: a finished run frees the queue immediately. Placed before the side effects below so a
  // failure in signal ingest or the score snapshot cannot strand the lock behind it.
  await releaseIngestLock(supabase as unknown as { from: (t: string) => any }, proposalId);

  if (updateError) {
    console.log("[dify-analyze-file] update error:", updateError.message);
    throw new Error(`Failed to save proposal: ${updateError.message}`);
  }
  if (!Array.isArray(claimed) || claimed.length === 0) {
    console.log("[dify-analyze-file] proposal already persisted by another writer, id:", proposalId);
    return;
  }

  const { data: proposalRow } = await supabase
    .from("file_proposals")
    .select("company_id, file_name, source_type, file_id, analysis_version")
    .eq("id", proposalId)
    .maybeSingle();
  // The Dify published workflow the run actually used (ruling 2): traceable to supabase/dify-workflows/.
  {
    const topLevel = asRecord(difyResult) ?? {};
    const data = asRecord(topLevel.data) ?? {};
    const workflowRun = asRecord(topLevel.workflow_run) ?? asRecord(data.workflow_run) ?? {};
    const workflowId = String(data.workflow_id ?? workflowRun.workflow_id ?? topLevel.workflow_id ?? "").trim();
    if (workflowId) await supabase.from("file_proposals").update({ analysis_workflow_id: workflowId }).eq("id", proposalId).is("analysis_workflow_id", null);
  }

  if (proposalRow?.company_id) {
    const companyId = String(proposalRow.company_id);
    const effectiveSourceType = String(proposalRow.source_type ?? sourceType ?? "file_proposal");
    // VOICE GATE on the minting path (rulings 1, 2, 11 — 2026-09-13): an uploaded document's signals and
    // claims are minted from its AUTHORSHIP + SUBJECT (doc_voice_verdicts), classified on demand when the
    // document has no sha-matched verdict. Intake rows are the client's own answers and carry no document.
    let origin: { authorship: "client" | "us" | "third_party" | "uncertain"; subject: "this_company" | "the_sector" | "uncertain" } | null = null;
    if (effectiveSourceType !== "intake") {
      const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
      const fileId = String((proposalRow as { file_id?: unknown }).file_id ?? "").trim();
      if (fileId && isLocalClassifierUrl(ollamaUrl)) {
        const resolved = await resolveUploadOrigin(supabase as unknown as { from: (t: string) => any; storage: any }, companyId, fileId, { ollamaUrl, model: Deno.env.get("OLLAMA_MODEL") ?? undefined });
        origin = { authorship: resolved.authorship, subject: resolved.subject };
        console.log("[dify-analyze-file] upload origin:", JSON.stringify({ proposalId, fileId, ...origin, source: resolved.source }));
      } else {
        origin = { authorship: "uncertain", subject: "uncertain" };
        console.warn("[dify-analyze-file] upload origin unresolved (no file id or non-local classifier) → uncertain:", proposalId);
      }
    }
    // E4 EXCERPT GUARD on the upload path (ruling 5, 2026-09-14): the sidecar is the basis. Absent (orphan
    // file row, no sidecar) ⇒ null ⇒ the guard leaves drafts as-is (its honest-limit law) and we say so.
    const sidecar = effectiveSourceType === "intake" ? null : await loadUploadSidecar(supabase as unknown as { from: (t: string) => any; storage: any }, (proposalRow as { file_id?: unknown }).file_id as string | null);
    const sidecarText = sidecar?.text ?? null;
    if (effectiveSourceType !== "intake" && !sidecarText) console.warn("[dify-analyze-file] no sidecar basis for the excerpt guard:", proposalId);
    const analysisVersion = Number((proposalRow as { analysis_version?: unknown }).analysis_version ?? 1) || 1;
    await ingestDifyProposalSignals({
      supabase,
      companyId,
      proposalId,
      origin,
      sourceType: effectiveSourceType,
      sourceTitle: String(proposalRow.file_name ?? "Dify proposal"),
      summary,
      evidence,
      contradictions,
      frameworkResults,
      questionsToVerify,
      rawPayload: structuredOutputs,
      analysisVersion,
      sourceText: sidecarText,
      sourceFilePath: sidecar?.filePath ?? null,
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

  // ── SP-141 / SP-150 / SP-179: WHO IS CALLING, before any row is read or written. ADMIN ONLY.
  // I-1 moved the start of an analysis to the server (cron job sweep-file-proposal-start), so the
  // browser no longer calls this function for a new upload at all. The cron poster presents the
  // service-role bearer, which SP-151 admits as a trusted internal caller; "Analyse again" from the
  // UI stays an admin action. The gateway accepts the publishable anon key, so it identifies nobody.
  const callerRefused = await adminOnlyGate(req, corsHeaders);
  if (callerRefused) return callerRefused;

  // SP-209/SP-211: WHICH admitted caller this is decides whether the exact voice check applies.
  // The cron enqueue is a trusted internal caller and is held to the sha-matched verdict; a browser
  // "Run analysis" is a human choosing to analyse this document and behaves exactly as before I-1.
  // isTrustedInternal is pure — no I/O — so this costs no second caller resolution.
  const trustedInternalCall = isTrustedInternal({
    authHeader: req.headers.get("Authorization"),
    presentedSecret: req.headers.get("x-internal-call"),
    internalSecret: Deno.env.get("INTERNAL_CALL_SECRET") ?? "",
    serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });

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
    // INT-2 hardening: NO cloud fallback. Internal-doc content is Option B
    // local-only; a missing DIFY_API_BASE_URL must fail LOUDLY, never silently
    // route the operator's internal material to api.dify.ai.
    const rawDifyBaseUrl = envDifyBaseUrl ?? fileDifyBaseUrl;
    if (!rawDifyBaseUrl) {
      console.error("[dify-analyze-file] DIFY_API_BASE_URL is not configured — refusing to run (no cloud fallback).");
      return new Response(
        JSON.stringify({ ok: false, error: "DIFY_API_BASE_URL not configured — internal analysis is local-only and has no cloud fallback." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const DIFY_API_BASE_URL = rawDifyBaseUrl.replace(/\/$/, "");
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

    // ── mode: "start" (SP-178, SP-179) — begin the run for a row sweep_file_proposal_start claimed.
    //
    // WHY A NEW DOOR. "sync" RECONCILES a run that already exists; it reads the Dify run id off the
    // row and polls it. It cannot begin one, so posting "sync" at a freshly queued row returns
    // "queued" and does nothing — the lock would be held for its whole TTL for no work. This door
    // starts the workflow for a row that is still waiting.
    //
    // WHY IT REBUILDS THE REQUEST RATHER THAN REPLAYING IT. The Dify body carries a 15-minute signed
    // URL. By the time the starter runs, the URL minted during the upload may well be dead, so the
    // body is rebuilt here: a FRESH signed URL, and the extracted text from the upload sidecar (the
    // same basis the excerpt guard uses). Storing the old body would have shipped an expiring URL.
    if (mode === "start") {
      if (!requestedProposalId) {
        return new Response(
          JSON.stringify({ error: "Missing required field: proposalId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: row } = await supabase
        .from("file_proposals")
        .select("id, company_id, file_id, file_name, source_type, status, processing_state, dify_workflow_run_id")
        .eq("id", requestedProposalId)
        .maybeSingle();

      if (!row) {
        // Nothing to start, and nothing to hold the queue for.
        await releaseIngestLock(supabase as unknown as { from: (t: string) => any }, requestedProposalId);
        return new Response(
          JSON.stringify({ ok: false, error: "proposal_not_found", state: null }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const r = row as Record<string, unknown>;
      const startable = r.status !== "rejected"
        && r.processing_state === "queued"
        && !String(r.dify_workflow_run_id ?? "").trim();
      if (!startable) {
        // Idempotent: a second start for the same row is a no-op, not a second workflow. This is the
        // case SP-180 cares about — two posts, one run — and it is enforced again here, after the
        // lock, because the row's own state is the authority (SP-183).
        await releaseIngestLock(supabase as unknown as { from: (t: string) => any }, String(r.id));
        console.log("[dify-analyze-file] start: not startable", JSON.stringify({
          proposalId: r.id, state: r.processing_state, status: r.status, hasRunId: !!r.dify_workflow_run_id,
        }));
        return new Response(
          JSON.stringify({ ok: true, started: false, state: r.processing_state }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // SP-180: THE DOOR HONOURS THE LOCK TOO, not just the starter.
      //
      // Without this the lock would live only in sweep_file_proposal_start, and a direct post of
      // mode:"start" for a second queued row would begin a second concurrent analysis — the exact
      // thing "a lock that cannot be bypassed" forbids. The starter always claims before it posts,
      // so a legitimate call always holds its claim; anything else is refused without starting.
      const { data: claim } = await supabase
        .from("ingest_single_flight")
        .select("proposal_id")
        .eq("lock_key", "file_analysis")
        .maybeSingle();
      if (String((claim as { proposal_id?: unknown } | null)?.proposal_id ?? "") !== String(r.id)) {
        console.log("[dify-analyze-file] start refused: not the claimed row", JSON.stringify({
          proposalId: r.id, claimed: (claim as { proposal_id?: unknown } | null)?.proposal_id ?? null,
        }));
        return new Response(
          JSON.stringify({ ok: false, error: "not_claimed", state: r.processing_state }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sidecar = await loadUploadSidecar(
        supabase as unknown as { from: (t: string) => any; storage: any },
        r.file_id as string | null,
      );
      if (!sidecar?.filePath) {
        await markProposalFailed({
          supabase,
          proposalId: String(r.id),
          summary: "Could not start analysis",
          error: "No upload sidecar for this file, so neither its text nor its storage path could be resolved.",
        });
        return new Response(
          JSON.stringify({ ok: false, error: "no_sidecar", state: "failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: freshSigned, error: freshSignError } = await supabase.storage
        .from("input-files")
        .createSignedUrl(sidecar.filePath, 900);
      if (freshSignError || !freshSigned?.signedUrl) {
        await markProposalFailed({
          supabase,
          proposalId: String(r.id),
          summary: "Could not start analysis",
          error: `Could not sign the stored file: ${freshSignError?.message ?? "no signedUrl"}`,
        });
        return new Response(
          JSON.stringify({ ok: false, error: "sign_failed", state: "failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const startBody = buildDifyRequestBody({
        fileUrl: freshSigned.signedUrl,
        fileName: String(r.file_name ?? ""),
        fileText: sidecar.text,
        sourceType: String(r.source_type ?? ""),
        companyId: String(r.company_id ?? ""),
      });

      try {
        const started = await startDifyRun({
          supabase,
          difyApiKey: DIFY_API_KEY,
          difyBaseUrl: DIFY_API_BASE_URL,
          difyRequestBody: startBody,
          proposalId: String(r.id),
          sourceType: String(r.source_type ?? ""),
        });
        console.log("[dify-analyze-file] start: workflow started", JSON.stringify(started));
        return new Response(
          JSON.stringify({ ok: true, started: true, state: "running" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (error) {
        // markProposalFailed releases the lock, so a failure to start advances the queue (SP-181).
        await markProposalFailed({
          supabase,
          proposalId: String(r.id),
          summary: "Failed to start Dify workflow",
          error: String((error as Error)?.message ?? error),
        });
        return new Response(
          JSON.stringify({ ok: false, error: "start_failed", state: "failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

    // Interview fence (Gate B, A1, 2026-09-19): an interview transcript never goes through the Dify file
    // workflow — refused before the signed URL, the download and the file_proposals insert. Fails closed.
    const fence = await interviewFenceForFile(supabase as unknown as Parameters<typeof interviewFenceForFile>[0], { fileId, filePath });
    if (fence.interview) {
      console.log("[dify-analyze-file] refused interview_file:", fence.why, fence.detail);
      return new Response(JSON.stringify(interviewFileRefusalBody(fence)), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    // Size guard (2026-09-12): refuse above the cap from storage metadata, before any download and
    // before any status is written (the file_proposals insert is further down).
    const objectSize = await storageObjectSize(supabase, "input-files", filePath);
    if (isOverCap(objectSize)) {
      console.log("[dify-analyze-file] refused file_too_large:", objectSize, "cap:", MAX_ANALYSIS_FILE_BYTES);
      return new Response(
        JSON.stringify(fileTooLargeBody(objectSize)),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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
    // Extraction shape (ruling 8): persisted on the proposal so an image-borne document is visibly thin.
    let extraction: {
      images: number;
      pages: number | null;
      source: string;
      pagesRead: number | null;
      pagesTotal: number | null;
      charsTotal: number | null;
    } = { images: 0, pages: null, source: "local_text_reader", pagesRead: null, pagesTotal: null, charsTotal: null };
    try {
      const ext = extensionFromName(fileName ?? "");
      const normalizedType = String(fileType || downloaded.type || "").toLowerCase();
      if (
        normalizedType.startsWith("text/") ||
        normalizedType.includes("json") ||
        normalizedType.includes("csv") ||
        ["txt", "csv", "md", "json", "xml", "yaml", "yml", "toml", "vtt", "srt"].includes(ext)
      ) {
        fileText = await downloaded.text();
      } else {
        const parsed = await extractTextViaLocalParser({
          parserUrl: LOCAL_PARSER_URL,
          fileName: fileName ?? "",
          fileType: normalizedType,
          blob: downloaded,
        });
        fileText = parsed.text;
        extraction = {
          images: parsed.images,
          pages: parsed.pages,
          source: parsed.source,
          pagesRead: parsed.pagesRead,
          pagesTotal: parsed.pagesTotal,
          charsTotal: parsed.charsTotal,
        };
      }
    } catch (extractError) {
      console.log("[dify-analyze-file] extraction error:", String((extractError as Error)?.message ?? extractError));
      fileText = "";
      // A failed extraction knows nothing about pages, and says nothing rather than zero.
      extraction = { images: 0, pages: null, source: "local_parser_error", pagesRead: null, pagesTotal: null, charsTotal: null };
    }

    console.log("[dify-analyze-file] extracted file_text length:", fileText.length, "shape:", JSON.stringify({ chars: fileText.length, ...extraction }));
    {
      const m = Deno.memoryUsage();
      console.log("[dify-analyze-file] memory after extraction (MB): file", (downloaded.size / 1048576).toFixed(1), "heapUsed", (m.heapUsed / 1048576).toFixed(1), "external", (m.external / 1048576).toFixed(1), "rss", (m.rss / 1048576).toFixed(1));
    }

    // Build request body matching the Dify Start node variables:
    // company_id (required), trigger_type, journey_key (required), file_url, file_name, file_text, source_type, enabled_frameworks
    const difyRequestBody = buildDifyRequestBody({
      fileUrl: signedData.signedUrl,
      fileName: fileName ?? "",
      fileText,
      sourceType: sourceType ?? "",
      companyId,
    });
    console.log("[dify-analyze-file] request body:", JSON.stringify({
      ...difyRequestBody,
      inputs: {
        ...difyRequestBody.inputs,
        file_url: difyRequestBody.inputs.file_url.slice(0, 60) + "…",
        file_text: `[${fileText.length} chars]`,
      },
    }));

    // ── SP-209/SP-210: THE EXACT VOICE GATE, on a trusted internal call ───────────────────────────
    //
    // The enqueue sweep can only pre-filter on "some verdict exists for this file": content_sha is
    // sha256(normalizeForHash(full sidecar text)) computed by contentIdentity.ts, over a storage
    // object Postgres cannot read, and uploadCorpus.ts forbids a second authority for it. So the
    // exact question is asked HERE, with the sidecar in hand and through that same authority.
    //
    // The basis is the SIDECAR, byte for byte as uploadCorpus derives it — the whitespace collapse
    // before normalizeForHash included — because a sha taken over anything else would not be the sha
    // the classifier recorded, and a mismatch would read as "unclassified" for every document.
    //
    // SP-210: the refusal writes the failed row IMMEDIATELY. It does not cycle through SP-193's three
    // attempts, because re-posting cannot make a verdict appear — only classify-upload-voice can.
    if (trustedInternalCall) {
      const voiceSidecar = await loadUploadSidecar(
        supabase as unknown as { from: (t: string) => any; storage: any },
        fileId,
      );
      const voiceText = (voiceSidecar?.text ?? "").replace(/\s+/g, " ").trim();
      const currentSha = voiceText ? await sha256Hex(normalizeForHash(voiceText)) : "";
      let shaMatched = false;
      if (currentSha) {
        const { data: verdictRows } = await supabase
          .from("doc_voice_verdicts")
          .select("content_sha")
          .eq("input_file_id", fileId)
          .eq("content_sha", currentSha)
          .limit(1);
        shaMatched = Array.isArray(verdictRows) && verdictRows.length > 0;
      }
      if (!shaMatched) {
        console.log("[dify-analyze-file] refused voice_not_classified:", JSON.stringify({
          fileId, hasSidecar: !!voiceSidecar, shaPrefix: currentSha.slice(0, 12),
        }));
        // SP-212: the code is stored; processing_error stays NULL so the client reads the existing
        // "Analysis failed" wording with no code and no dangling colon.
        await supabase.from("file_proposals").insert({
          company_id: companyId,
          file_id: fileId,
          file_name: fileName ?? "",
          source_type: sourceType ?? "uploaded_file",
          summary: "Could not start analysis",
          signal_type: "document",
          status: "pending",
          processing_state: "failed",
          processing_error: null,
          processing_error_code: "voice_not_classified",
          processing_completed_at: new Date().toISOString(),
        });
        return new Response(
          JSON.stringify({ ok: false, error: "voice_not_classified" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Insert as a new proposal immediately so the UI gets a stable record while
    // the long-running Dify workflow completes in the background.
    const { data: inserted, error: insertError } = await supabase
      .from("file_proposals")
      .insert({
        company_id:         companyId,
        file_id:            fileId,
        file_name:          fileName ?? "",
        source_type:        sourceType ?? "",
        summary:            "Analysis queued. Results will appear when processing finishes.",
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
        // Methodology version (ruling 2, 2026-09-14): stamped at birth, never re-rolled. Priors read 1 by default.
        analysis_version:    FILE_ANALYSIS_VERSION,
        extraction_chars:    fileText.length,
        extraction_images:   extraction.images,
        extraction_pages:    extraction.pages,
        extraction_source:   extraction.source,
        // SP-93: what the read COVERED, beside what the document holds. Null for a format with no
        // pages and for a failed extraction; never guessed from the other.
        pages_read:          extraction.pagesRead,
        pages_total:         extraction.pagesTotal,
        chars_total:         extraction.charsTotal ?? fileText.length,
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

    // ── SP-178, SP-180, SP-182: THE UPLOAD DOES NOT START THE RUN.
    //
    // This is the whole slice in one deletion. Until now the same request that inserted the row went
    // straight on to start the Dify workflow, which meant: the row was 'queued' for milliseconds and
    // the label never described a waiting file (SP-182); three uploads started three concurrent
    // analyses on a 256 MB worker and one local model (SP-180); and nothing started at all unless a
    // browser made the call, so closing the tab lost the work (SP-178).
    //
    // The row is now left 'queued' and the server picks it up: cron job sweep-file-proposal-start
    // takes the oldest waiting row, wins the fleet-wide lock, and posts mode:"start" above. Nobody
    // clicks, nobody waits between files, and exactly one analysis runs at a time.
    console.log("[dify-analyze-file] queued, not started — the server starts it:", insertedProposalId);

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
