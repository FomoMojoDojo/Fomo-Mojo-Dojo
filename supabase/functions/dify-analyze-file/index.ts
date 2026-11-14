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
import { coverageFailures, type DocumentWindow, toDocumentWindows, WINDOW_CHARS } from "../_shared/documentWindows.ts";
import {
  buildWindowExtractUser, DETERMINISTIC_FAILURE_CODES, EXTRACT_KINDS, halvedCaps,
  MAX_EXCERPT_CHARS, MAX_ITEMS_PER_KIND, readWindowExtract, WINDOW_NUM_PREDICT,
  windowExtractSystem,
} from "../_shared/windowExtract.ts";
import {
  type ExtractRow, maxWindowsForBudget, MERGED_EXTRACT_BUDGET, mergeWindowExtracts, selectForBudget,
} from "../_shared/mergeExtracts.ts";
import { modelStamp, resolveModel } from "../_shared/modelRouter.ts";
import { recordModelCall } from "../_shared/recordModelCall.ts";
import {
  FRAMEWORK_TIMEOUT_CODE, FRAMEWORK_TRUNCATED_CODE, isFrameworkOutputTruncated, isTimeCeilingFailure,
  MAX_FRAMEWORK_ATTEMPTS,
} from "../_shared/frameworkRetry.ts";
import { retireEarlierAnalysesOfFile } from "../_shared/retireProposals.ts";
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
    // SP-231: whether the 400,000-character cap dropped text. Reported by the parser as its own
    // fact; a parser that does not report it is read as "not capped" rather than guessed at from
    // the character counts, which also differ by whitespace compaction.
    charsCapped: typeof data?.chars_capped === "boolean" ? data.chars_capped : false,
    // SP-283: which parser produced this text. Recorded beside sidecar_sha, because reuse is sound
    // only when BOTH the text and the parser that would read it today are unchanged.
    parserVersion: typeof data?.versions?.server === "string" ? data.versions.server : null,
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
  // `ReturnType<typeof createClient>` resolves this module's table types to `never`, so EVERY call
  // site that passes a client here has always errored under `deno check` — the pre-existing class
  // that accounts for most of this file's count. Loosened to the shape these helpers actually use,
  // as Part A loosened markProposalFailed and releaseIngestLock, so adding a third startDifyRun call
  // site does not add to it.
  supabase: { from: (t: string) => any; storage: any };
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

/**
 * SP-240: the next window, immediately. `waitUntil` keeps the post alive past the response, so the
 * caller is not held open for a 60-minute document and the chain does not depend on the caller
 * staying connected.
 *
 * FIRE AND FORGET IS SAFE HERE ONLY BECAUSE THE SWEEP IS THE RECOVERY PATH. If this post is lost —
 * worker recycled, network blip — the once-a-minute completion sweep finds a `running` row whose
 * claim is not taken and posts at it again. The chain is the fast path; the sweep is the guarantee.
 */
function chainWindowStep(proposalId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/dify-analyze-file`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  waitUntil(
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        apikey: key,
      },
      body: JSON.stringify({ mode: "window", proposal_id: proposalId }),
    }).then(
      (r) => console.log("[dify-analyze-file] chained window step:", proposalId, r.status),
      (e) => console.warn("[dify-analyze-file] chain failed; the sweep will recover:", proposalId, String(e)),
    ),
  );
}

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

// ── THE READ IS A PROPERTY OF THE RUN, NOT OF THE UPLOAD (SP-231..SP-234) ────────────────────────
//
// WHY RE-EXTRACT AT ALL. The start path used to read the stored `.extracted.txt` sidecar and send it
// on. That sidecar was written by analyze-file whenever the file was uploaded — under whatever parser
// was installed THEN. Every sidecar on this stack older than today was written under a 30-page cap,
// and nothing on the proposal records which parser wrote it (there is no extraction_version column),
// so staleness cannot be detected from the row. The only honest options were to re-extract or to
// leave old documents permanently short. This re-extracts: what a run analyses is what the document
// says now, read by the parser that is installed now.
//
// A REFRESH CAN INVALIDATE THE VOICE VERDICT, AND THAT IS CORRECT. doc_voice_verdicts.content_sha is
// the sha of the sidecar the classifier read. A longer read changes the sha, so SP-209's exact gate
// stops matching and the row is refused `voice_not_classified` — ONCE. classify-upload-voice then
// answers about the new content and the next tick ingests it whole. The gate means "the classifier
// saw exactly this text", and a refresh that silently kept an old verdict would be the gate lying.
//
// A PARSER HICCUP MUST NOT DESTROY A GOOD SIDECAR. An empty or failed extraction keeps the stored
// text and says so; it does not overwrite a readable sidecar with nothing.
async function refreshReadAndWindow(args: {
  supabase: { from: (t: string) => any; storage: any };
  parserUrl: string;
  proposalId: string;
  companyId: string;
  fileId: string;
  fileName: string;
  filePath: string;
  sidecarText: string;
}): Promise<
  | { ok: true; text: string; windows: DocumentWindow[]; refreshed: boolean; capped: boolean | null }
  | { ok: false; error: string; detail: string }
> {
  const { supabase, parserUrl, proposalId, companyId, fileId, fileName, filePath, sidecarText } = args;

  // file_proposals carries no file_type — it never has — so the type comes from the input_files row
  // the sidecar belongs to. An unknown type is passed as empty rather than guessed: the parser then
  // decides by extension, which is what it already does for a file uploaded without a MIME type.
  const { data: fileRow } = await supabase.from("input_files").select("file_type").eq("id", fileId).maybeSingle();
  const fileType = String((fileRow as { file_type?: unknown } | null)?.file_type ?? "");

  // The 25 MB analysis cap is the existing law; a re-read must obey it rather than OOM a 256 MB worker.
  const size = await storageObjectSize(supabase as never, "input-files", filePath);
  if (isOverCap(size)) {
    return { ok: false, error: "file_too_large", detail: `${size} bytes exceeds ${MAX_ANALYSIS_FILE_BYTES}` };
  }

  let text = sidecarText;
  let refreshed = false;
  let capped: boolean | null = null;
  // SP-283: NULL unless THIS run's parser produced the text. A fallback to the stored sidecar does not
  // know which parser wrote it, and unknown must never be reused.
  let parserVersion: string | null = null;
  try {
    const { data: blob, error: downloadError } = await supabase.storage.from("input-files").download(filePath);
    if (downloadError || !blob) throw new Error(downloadError?.message ?? "no blob");
    const extraction = await extractTextViaLocalParser({ parserUrl, fileName, fileType, blob });
    const fresh = String(extraction.text ?? "");
    if (!fresh.trim()) {
      console.warn("[dify-analyze-file] re-read returned no text; keeping the stored sidecar:", proposalId);
    } else {
      capped = extraction.charsCapped;
      parserVersion = extraction.parserVersion;
      if (fresh !== sidecarText) {
        const { error: sidecarError } = await supabase.storage.from("input-files").upload(
          `${filePath}.extracted.txt`,
          new Blob([fresh], { type: "text/plain;charset=utf-8" }),
          { upsert: true, contentType: "text/plain;charset=utf-8" },
        );
        if (sidecarError) throw new Error(`sidecar write failed: ${sidecarError.message}`);
        refreshed = true;
        console.log("[dify-analyze-file] sidecar refreshed:", JSON.stringify({
          proposalId, was: sidecarText.length, now: fresh.length,
          pagesRead: extraction.pagesRead, pagesTotal: extraction.pagesTotal,
        }));
      }
      text = fresh;
      await supabase.from("file_proposals").update({
        extraction_chars: fresh.length,
        extraction_images: extraction.images,
        extraction_pages: extraction.pages,
        extraction_source: extraction.source,
        pages_read: extraction.pagesRead,
        pages_total: extraction.pagesTotal,
        chars_total: extraction.charsTotal ?? fresh.length,
        chars_capped: extraction.charsCapped,
      }).eq("id", proposalId);
    }
  } catch (error) {
    // A re-read that fails is not a reason to abandon a document we already have text for. It IS a
    // reason to say so, because the analysis then describes an older read.
    console.warn("[dify-analyze-file] re-read failed; analysing the stored sidecar:", proposalId, String(error));
  }

  if (!text.trim()) return { ok: false, error: "no_text", detail: "neither the re-read nor the sidecar yielded text" };

  // ── SP-271: THE READ IS CAPPED BY WINDOW COUNT, COMPUTED FROM THE HAND-OFF BUDGET ────────────
  //
  // maxWindowsForBudget() is how many windows a 10,000-character hand-off can give one excerpt each
  // — 30 today, and it moves if the budget moves. Beyond it, SP-256 could not represent the window in
  // the hand-off at all, so reading it would mint extract rows no framework pass ever sees and leave
  // a row saying `ready` over sections the analysis never saw. The document is read UP TO the cap and
  // MARKED instead.
  const windowCap = maxWindowsForBudget();
  const allWindows = await toDocumentWindows(text);
  const windows = allWindows.slice(0, windowCap);
  const windowsCut = allWindows.length > windows.length;
  // The READ text is the prefix those windows cover. Coverage is exact over what was read — which is
  // the whole document unless the cap bit, and the row says which (SP-272).
  const readText = windows.length ? text.slice(0, windows[windows.length - 1].char_end) : "";
  if (windowsCut) {
    console.warn("[dify-analyze-file] window cap bit:", JSON.stringify({
      proposalId, windows: allWindows.length, cap: windowCap,
      chars: text.length, read: readText.length,
    }));
  }
  // SP-234 is a law, not a preference: a gap here means some of the READ would never be analysed and
  // no row would record it. The windower and this check share one predicate, so there is no second
  // opinion to drift from.
  const failures = coverageFailures(readText, windows);
  if (failures.length) {
    return { ok: false, error: "chunk_coverage", detail: failures.slice(0, 3).join("; ") };
  }

  // SP-279: the sha of the text these windows and extracts are offsets INTO. Reuse is sound exactly
  // while this matches the current sidecar, and unsound the moment it does not.
  const bankedSha = await contentIdentityOf(readText);
  await supabase.from("file_proposals").update({
    sidecar_sha: bankedSha,
    parser_version: parserVersion,
  }).eq("id", proposalId);

  // A re-run re-windows: the old rows describe a read that no longer exists.
  await supabase.from("file_proposal_chunks").delete().eq("proposal_id", proposalId);
  if (windows.length) {
    const { error: insertError } = await supabase.from("file_proposal_chunks").insert(
      windows.map((w) => ({
        proposal_id: proposalId,
        company_id: companyId,
        window_index: w.window_index,
        char_start: w.char_start,
        char_end: w.char_end,
        sha256: w.sha256,
        oversize: w.oversize,
        status: "pending",
      })),
    );
    if (insertError) return { ok: false, error: "chunk_write", detail: insertError.message };
  }
  // SP-272: the capped mark is REUSED, not duplicated. `chars_capped` already governs S-ING-4 ("Only
  // the first part of this document was read."), which is exactly what a window cut means, and SP-272
  // forbids a new string. So either cap — the 350,000-character backstop or this window cap — sets the
  // same flag, and no surface needs to learn a second one.
  const cappedEither = windowsCut || capped === true ? true : capped;
  if (windowsCut) {
    await supabase.from("file_proposals").update({ chars_capped: true }).eq("id", proposalId);
  }
  console.log("[dify-analyze-file] windowed:", JSON.stringify({
    proposalId, chars: text.length, read: readText.length, windows: windows.length,
    of: allWindows.length, window_cap: windowCap, size_cap: WINDOW_CHARS,
    oversize: windows.filter((w) => w.oversize).length, refreshed,
    capped: cappedEither, capped_by: windowsCut ? "windows" : (capped === true ? "chars" : "none"),
  }));
  return { ok: true, text: readText, windows, refreshed, capped: cappedEither };
}

// ── THE WINDOW STEPPER (SP-235, SP-236, SP-240, SP-241; 2026-11-13) ─────────────────────────────
//
// ONE WINDOW PER INVOCATION, CHAINED. Not a loop. The edge worker recycles on a 400 s wall clock
// (R46), so a loop over the Charter 10-Q's seventeen windows would be killed somewhere in the middle
// with no record of where — and the recovery sweep would find a row that says `running` and a set of
// chunks it cannot explain. One window, then a self-post for the next, is the `gatewayResume` shape
// SP-240 names: steps chain immediately and the once-a-minute job is the RECOVERY path, not the clock.
//
// WHY A DOOR ON THIS FUNCTION AND NOT A NEW ONE. A new function directory would have had to duplicate
// four things that already live here and are already proven: the caller gate (SP-179), the
// trusted-internal path (SP-151), the fleet-wide single-flight lock, and the completion claim. A
// fourth authz surface to maintain, for a step that cannot run except under this function's lock.
//
// THE CALL IS ROUTED, AND THAT IS WHAT KEEPS IT LOCAL (SP-226). resolveModel is asked with the
// DOCUMENT'S OWN PROVENANCE. An uploaded document's provenance is not in PUBLIC_PROVENANCES, so the
// router returns the local generator — not because a flag says local, but because the provenance
// cannot resolve any other way. `outside-call-guard` stays green by construction.
const WINDOW_MODEL_TIMEOUT_MS = 240_000;
/** SP-241: a window is retried up to twice, so three attempts in all. */
const MAX_WINDOW_ATTEMPTS = 3;
/** Each step pushes the lock out, so a long document is not expired mid-run (SP-240). */
const INGEST_LOCK_STEP_MS = 30 * 60 * 1000;
// WINDOW_NUM_PREDICT now lives in _shared/windowExtract.ts, DERIVED from the item caps it has to
// cover (SP-268). It was a local 1,200 here while the caps permitted ~1,670 tokens, and that
// mismatch truncated two of the 10-Q's windows mid-JSON.

/** The local extraction call. Ollama /api/chat in JSON mode, temperature 0 for determinism, and a
 *  bounded num_predict — the shape interview-parser's finder uses, for the same reasons. */
async function callLocalWindowExtract(args: {
  ollamaUrl: string; model: string; system: string; user: string;
}): Promise<{ content: string; prompt_tokens: number | null; completion_tokens: number | null }> {
  const base = args.ollamaUrl.replace(/\/v1\/?$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WINDOW_MODEL_TIMEOUT_MS);
  try {
    const resp = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer ollama" },
      body: JSON.stringify({
        model: args.model,
        format: "json",
        stream: false,
        options: { num_ctx: 8192, temperature: 0, num_predict: WINDOW_NUM_PREDICT },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);
    const data = await resp.json().catch(() => ({})) as {
      message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown;
    };
    const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
    return {
      content: String(data?.message?.content ?? ""),
      prompt_tokens: n(data?.prompt_eval_count),
      completion_tokens: n(data?.eval_count),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** SP-240: push the single-flight lock out by one step's worth, so a 60-minute document is not
 *  expired mid-run — and a dead one still frees the line within half an hour of its last step. */
async function refreshIngestLock(supabase: { from: (t: string) => any }, proposalId: string) {
  await supabase
    .from("ingest_single_flight")
    .update({ expires_at: new Date(Date.now() + INGEST_LOCK_STEP_MS).toISOString() })
    .eq("lock_key", "file_analysis")
    .eq("proposal_id", proposalId);
}

/** Keep sections_ready / sections_failed on the row in step with the chunk rows (SP-244). */
async function syncSectionCounts(supabase: { from: (t: string) => any }, proposalId: string) {
  const { data: rows } = await supabase
    .from("file_proposal_chunks").select("status").eq("proposal_id", proposalId);
  const list = Array.isArray(rows) ? rows as Array<{ status?: unknown }> : [];
  if (!list.length) return null;
  const counts = {
    sections_total: list.length,
    sections_ready: list.filter((r) => String(r.status) === "ready").length,
    sections_failed: list.filter((r) => String(r.status) === "failed").length,
  };
  await supabase.from("file_proposals").update(counts).eq("id", proposalId);
  return counts;
}

type WindowStepOutcome =
  | { done: false; window: number; items: number }
  | { done: false; window: number; failed: true; reason: string }
  /** Another step owns this window. The caller must NOT chain — that is what multiplied the chains. */
  | { done: false; window: number; inFlight: true }
  | { done: true };

/**
 * One window: claim the next pending chunk, slice its text from the sidecar, extract, store. Returns
 * `done` when no window is left to run.
 *
 * THE SLICE IS RE-VERIFIED AGAINST ITS STORED SHA. The chunk row's offsets point into the sidecar as
 * it was when the document was windowed. If the sidecar changed since — a re-upload, a refreshed
 * read — those offsets now point at different text, and extracting from it would attribute passages
 * to a document that no longer says them. A mismatch fails the WINDOW with a named reason rather
 * than quietly extracting from whatever is there now.
 */
async function runOneWindow(args: {
  supabase: { from: (t: string) => any; storage: any };
  ollamaUrl: string;
  proposalId: string;
  companyId: string;
  fileName: string;
  sourceType: string;
  sidecarText: string;
}): Promise<WindowStepOutcome> {
  const { supabase, ollamaUrl, proposalId, companyId, fileName, sourceType, sidecarText } = args;

  // ── THE CHUNK IS CLAIMED ATOMICALLY, AND THIS IS NOT OPTIONAL ──────────────────────────────────
  //
  // Measured on the first real chunked run (Charter 10-Q, 2026-11-13). The first cut selected the next
  // pending chunk and then updated it — select-then-update, with a gap. Meanwhile the completion
  // sweep posts `{"mode":"sync"}` every minute and the resume clause chains a step from each, so
  // chains ACCUMULATED: one per tick, each self-posting for ever. Two steps then picked the SAME
  // chunk, both called the local model on it, and `attempts` climbed by the number of live chains —
  // windows 10 and 11 reached attempt 2, window 12 attempt 3, window 13 attempt FOUR on its first
  // pass, past SP-241's limit of three. A healthy window would have been marked failed for no reason
  // but concurrency, and every duplicate burned a 40-second local call and a model_calls row.
  //
  // Two fixes, and the pair is what makes it correct:
  //   1. a stale `running` chunk is returned to `pending` first, so a step whose worker died is
  //      retryable — the same reasoning as SP-248's claim ceiling, one level down;
  //   2. the claim is a CONDITIONAL UPDATE that only a `pending` row can satisfy. Whoever's update
  //      matches owns the window; everyone else is told a step is already in flight and stops. The
  //      database decides, exactly as the single-flight primary key decides the document.
  const staleCutoff = new Date(Date.now() - WINDOW_MODEL_TIMEOUT_MS - 60_000).toISOString();
  await supabase.from("file_proposal_chunks")
    .update({ status: "pending" })
    .eq("proposal_id", proposalId)
    .eq("status", "running")
    .lt("started_at", staleCutoff);

  const { data: pending } = await supabase
    .from("file_proposal_chunks")
    .select("id, window_index, char_start, char_end, sha256, attempts, status, error_code")
    .eq("proposal_id", proposalId)
    .in("status", ["pending", "running"])
    .order("window_index", { ascending: true })
    .limit(1);
  const chunk = Array.isArray(pending) && pending.length
    ? pending[0] as { id: string; window_index: number; char_start: number; char_end: number; sha256: string; attempts: number; status: string; error_code: string | null }
    : null;
  if (!chunk) return { done: true };

  // Someone else is on it and has not gone stale: stop, and do NOT chain. This is what collapses the
  // accumulated chains back to one — a step that finds the work taken adds nothing by posting again.
  if (chunk.status === "running") {
    console.log("[dify-analyze-file] window: a step is already in flight", JSON.stringify({
      proposalId, window: chunk.window_index,
    }));
    return { done: false, window: chunk.window_index, inFlight: true };
  }

  const { count: totalCount } = await supabase
    .from("file_proposal_chunks")
    .select("id", { count: "exact", head: true })
    .eq("proposal_id", proposalId);
  const windowCount = Number(totalCount ?? 0) || 1;

  // ── SP-269: WHAT KIND OF FAILURE WAS THE LAST ONE? ───────────────────────────────────────────
  //
  // A timeout or a transport error is not deterministic and keeps its two identical retries. A
  // truncated or unparseable ANSWER is deterministic at temperature 0 — the 10-Q's two failed windows
  // returned byte-identical token counts three times over — so it gets exactly ONE retry, with the
  // item caps HALVED, asking the model for something it can fit. An identical retry of a
  // deterministic failure buys nothing and costs a full call.
  const lastWasDeterministic = DETERMINISTIC_FAILURE_CODES.has(String(chunk.error_code ?? ""));
  const caps = lastWasDeterministic ? halvedCaps() : { maxItemsPerKind: MAX_ITEMS_PER_KIND, maxExcerptChars: MAX_EXCERPT_CHARS };
  const attempts = Number(chunk.attempts ?? 0) + 1;
  const { data: claimed } = await supabase.from("file_proposal_chunks")
    .update({ status: "running", attempts, started_at: new Date().toISOString() })
    .eq("id", chunk.id)
    .eq("status", "pending")      // THE CLAIM: only one caller's update can match
    .select("id");
  if (!Array.isArray(claimed) || claimed.length === 0) {
    // Lost the race between the read and the claim. Not an error, and not ours to retry.
    return { done: false, window: chunk.window_index, inFlight: true };
  }

  const failWindow = async (reason: string) => {
    // SP-241 as amended by SP-269: a non-deterministic failure gets two retries, then the window is
    // `failed` and the DOCUMENT CONTINUES. A deterministic one gets exactly ONE retry at halved caps,
    // so the attempt that FOLLOWED a deterministic failure is terminal whatever it returns.
    const terminal = attempts >= MAX_WINDOW_ATTEMPTS
      || lastWasDeterministic
      || (DETERMINISTIC_FAILURE_CODES.has(reason) && attempts >= 2);
    await supabase.from("file_proposal_chunks").update({
      status: terminal ? "failed" : "pending",
      error_code: reason,
      completed_at: terminal ? new Date().toISOString() : null,
    }).eq("id", chunk.id);
    await syncSectionCounts(supabase, proposalId);
    console.warn("[dify-analyze-file] window failed:", JSON.stringify({
      proposalId, window: chunk.window_index, attempts, terminal, reason,
    }));
    return { done: false as const, window: chunk.window_index, failed: true as const, reason };
  };

  const windowText = sidecarText.slice(chunk.char_start, chunk.char_end);
  if (!windowText) return await failWindow("window_empty");
  const currentSha = await contentIdentityOf(windowText);
  if (currentSha !== chunk.sha256) {
    // Not retryable: re-reading cannot make the old text come back.
    await supabase.from("file_proposal_chunks").update({
      status: "failed", error_code: "window_text_changed", completed_at: new Date().toISOString(),
    }).eq("id", chunk.id);
    await syncSectionCounts(supabase, proposalId);
    return { done: false, window: chunk.window_index, failed: true, reason: "window_text_changed" };
  }

  // SP-226: routed on the DOCUMENT's provenance, which is not public, so the choice is local.
  const choice = resolveModel({ role: "generator", inputs: [{ provenance: sourceType || "uploaded_file" }] });
  if (choice.provider !== "local_ollama") {
    // Defense in depth, as every local-only site carries: the router must not have sent a private
    // document outside, and if it ever did, this refuses rather than complying.
    return await failWindow("local_only_policy_violation");
  }

  let answer: { content: string; prompt_tokens: number | null; completion_tokens: number | null };
  try {
    answer = await callLocalWindowExtract({
      ollamaUrl,
      model: choice.model,
      system: windowExtractSystem(caps.maxItemsPerKind, caps.maxExcerptChars),
      user: buildWindowExtractUser({
        fileName, windowIndex: chunk.window_index, windowCount, windowText,
      }),
    });
  } catch (error) {
    return await failWindow(String(error).includes("abort") ? "window_timeout" : "window_model_error");
  }

  // LEDGERED BEFORE THE PARSE (the rule every other ledgered site follows): the call happened
  // whether or not its answer is usable, and usd is NULL because a local call costs no money — a 0
  // would claim a price was computed.
  await recordModelCall(supabase as never, {
    companyId,
    callSite: "ingest-window-extract",
    attempt: attempts,
    usage: {
      provider: choice.provider, model: choice.model,
      prompt_tokens: answer.prompt_tokens, completion_tokens: answer.completion_tokens, usd: null,
    },
  });

  const extract = await readWindowExtract({
    raw: answer.content, windowText, windowStart: chunk.char_start,
    maxItemsPerKind: caps.maxItemsPerKind, maxExcerptChars: caps.maxExcerptChars,
  });
  if (!extract.items.length) {
    // An empty answer is not necessarily a failure: a page of figures holds no claim. It IS a failure
    // when the model returned nothing parseable at all, which `discarded` distinguishes. And a
    // TRUNCATED answer is named separately from a merely malformed one, because the remedy differs:
    // truncation means the output cap was reached, which halved caps can fix.
    const unparseable = extract.discarded.some((d) => d.reason.includes("not JSON"));
    if (unparseable) {
      const truncated = Number(answer.completion_tokens ?? 0) >= WINDOW_NUM_PREDICT;
      return await failWindow(truncated ? "window_answer_truncated" : "window_answer_unparseable");
    }
  }
  if (extract.discarded.length) {
    console.log("[dify-analyze-file] window discards:", JSON.stringify({
      proposalId, window: chunk.window_index,
      reasons: extract.discarded.map((d) => d.reason),
    }));
  }

  if (extract.items.length) {
    const { error: insertError } = await supabase.from("file_proposal_extracts").insert(
      extract.items.map((item) => ({
        proposal_id: proposalId,
        company_id: companyId,
        chunk_id: chunk.id,
        window_index: chunk.window_index,
        kind: item.kind,
        item_index: item.item_index,
        text: item.text,
        excerpt_sha: item.excerpt_sha,
        char_start: item.char_start,
        char_end: item.char_end,
      })),
    );
    // A unique violation here is a RETRY landing rows a previous attempt already stored: the record it
    // wanted exists, which is not an error (the same reading SP-230 applies to the voice refusal).
    if (insertError && !String(insertError.message ?? "").includes("duplicate key")) {
      return await failWindow("window_store_failed");
    }
  }

  await supabase.from("file_proposal_chunks").update({
    status: "ready", error_code: null, completed_at: new Date().toISOString(),
  }).eq("id", chunk.id);
  await syncSectionCounts(supabase, proposalId);
  await refreshIngestLock(supabase, proposalId);
  return { done: false, window: chunk.window_index, items: extract.items.length };
}

/** sha256(normalizeForHash(text)) through the one identity authority, named here for readability. */
async function contentIdentityOf(text: string): Promise<string> {
  return await sha256Hex(normalizeForHash(text));
}

/**
 * Every window is done: merge, select into the budget, record the two counts, and hand the merged
 * extract to the framework pass ONCE (SP-237, SP-238, SP-255..SP-257).
 *
 * Returns the text to send, or null when there is nothing to interpret.
 */
async function mergeAndPrepareHandOff(args: {
  supabase: { from: (t: string) => any; storage: any };
  proposalId: string;
  sidecarText: string;
}): Promise<{ text: string; itemsExtracted: number; itemsInterpreted: number; untraceable: number } | null> {
  const { supabase, proposalId, sidecarText } = args;
  const { data: rows } = await supabase
    .from("file_proposal_extracts")
    .select("kind, item_index, text, excerpt_sha, window_index, char_start, char_end")
    .eq("proposal_id", proposalId)
    .order("window_index", { ascending: true })
    .order("item_index", { ascending: true });
  const list = (Array.isArray(rows) ? rows : []) as ExtractRow[];

  const merged = mergeWindowExtracts(list, sidecarText);
  const selection = selectForBudget(merged.items, MERGED_EXTRACT_BUDGET);
  // SP-257: both counts, always — the difference between them is a fact about the analysis.
  await supabase.from("file_proposals").update({
    items_extracted: merged.items.length,
    items_interpreted: selection.stats.items_interpreted,
  }).eq("id", proposalId);

  console.log("[dify-analyze-file] merged:", JSON.stringify({
    proposalId, rows_in: merged.stats.rows_in, items: merged.items.length,
    repeated: merged.stats.repeated, untraceable: merged.stats.dropped_untraceable,
    interpreted: selection.stats.items_interpreted, chars: selection.stats.chars,
    budget: MERGED_EXTRACT_BUDGET, windows_represented: selection.stats.windows_represented,
  }));
  if (merged.untraceable.length) {
    // Reported, never passed on: an excerpt the sidecar does not contain is the one thing this
    // pipeline exists not to produce.
    console.warn("[dify-analyze-file] untraceable excerpts dropped:", JSON.stringify({
      proposalId, count: merged.untraceable.length,
      windows: [...new Set(merged.untraceable.flatMap((u) => u.windows))],
    }));
  }
  if (!selection.text) return null;
  return {
    text: selection.text,
    itemsExtracted: merged.items.length,
    itemsInterpreted: selection.stats.items_interpreted,
    untraceable: merged.untraceable.length,
  };
}

// ── SP-279: REUSING BANKED EXTRACTS ──────────────────────────────────────────────────────────────
//
// Extracting the Charter 10-Q's seventeen windows costs about eleven minutes of local model time.
// "Analyze again" on a document nobody has touched should not pay that twice, and SP-278's retry of a
// failed framework pass must not pay it at all.
//
// WHAT MAKES IT SOUND. Every stored extract's pointer is an offset into the text it was read from, so
// the extracts are valid exactly while that text is unchanged — which `sidecar_sha` records and this
// compares. It is the same test the voice gate applies to the same bytes, for the same reason.
//
// IT COPIES RATHER THAN POINTS. The new proposal gets its own chunk and extract rows, so a row is
// never a dangling reference to a proposal somebody later rejects, and `items_extracted` on the new
// row counts rows that actually exist under it. The cost is duplication of text already stored; the
// alternative is a foreign key to a row whose lifecycle nobody controls.
/**
 * SP-283: the installed parser's version, asked of the parser itself with a five-byte text document.
 * No model, no write, and no file read — the same probe ingest-partial-honesty-guard (p2) uses to
 * catch a stale worker. NULL when the parser does not answer, and NULL never matches a banked row, so
 * an unreachable parser means re-extract rather than reuse.
 */
async function currentParserVersion(parserUrl: string): Promise<string | null> {
  try {
    const response = await fetch(parserUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: "probe.txt", file_type: "text/plain", content_base64: "aGVsbG8=" }),
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const v = (data as { versions?: { server?: unknown } })?.versions?.server;
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
}

async function reuseBankedExtracts(args: {
  supabase: { from: (t: string) => any };
  proposalId: string;
  companyId: string;
  fileId: string;
  sidecarSha: string;
  /** SP-283: the parser installed NOW. A banked set written by any other parser is not reused. */
  parserVersion: string | null;
}): Promise<{ windows: number; extracts: number } | null> {
  const { supabase, proposalId, companyId, fileId, sidecarSha, parserVersion } = args;
  if (!fileId || !sidecarSha || !parserVersion) return null;

  const { data: priors } = await supabase
    .from("file_proposals")
    .select("id, sections_total")
    .eq("file_id", fileId)
    .eq("sidecar_sha", sidecarSha)
    .eq("parser_version", parserVersion)   // SP-283: same text AND same parser, or re-extract
    .neq("id", proposalId)
    .order("created_at", { ascending: false })
    .limit(5);
  const candidates = (Array.isArray(priors) ? priors : []) as Array<{ id: string }>;
  for (const prior of candidates) {
    const { data: chunkRows } = await supabase
      .from("file_proposal_chunks")
      .select("id, window_index, char_start, char_end, sha256, oversize, status")
      .eq("proposal_id", prior.id)
      .order("window_index", { ascending: true });
    const chunks = (Array.isArray(chunkRows) ? chunkRows : []) as Array<Record<string, unknown>>;
    if (!chunks.length) continue;
    const { data: extractRows } = await supabase
      .from("file_proposal_extracts")
      .select("window_index, kind, item_index, text, excerpt_sha, char_start, char_end")
      .eq("proposal_id", prior.id);
    const extracts = (Array.isArray(extractRows) ? extractRows : []) as Array<Record<string, unknown>>;
    if (!extracts.length) continue;   // a banked set with no extracts is nothing to reuse

    // Chunks first, so each extract can be hung off its own new chunk id.
    const { data: newChunks, error: chunkError } = await supabase
      .from("file_proposal_chunks")
      .insert(chunks.map((c) => ({
        proposal_id: proposalId,
        company_id: companyId,
        window_index: c.window_index,
        char_start: c.char_start,
        char_end: c.char_end,
        sha256: c.sha256,
        oversize: c.oversize,
        status: c.status,
        completed_at: new Date().toISOString(),
      })))
      .select("id, window_index");
    if (chunkError || !Array.isArray(newChunks)) {
      console.warn("[dify-analyze-file] reuse: could not copy chunks:", chunkError?.message);
      return null;
    }
    const chunkIdByWindow = new Map<number, string>();
    for (const c of newChunks as Array<{ id: string; window_index: number }>) {
      chunkIdByWindow.set(Number(c.window_index), String(c.id));
    }
    const { error: extractError } = await supabase.from("file_proposal_extracts").insert(
      extracts
        .filter((e) => chunkIdByWindow.has(Number(e.window_index)))
        .map((e) => ({
          proposal_id: proposalId,
          company_id: companyId,
          chunk_id: chunkIdByWindow.get(Number(e.window_index)),
          window_index: e.window_index,
          kind: e.kind,
          item_index: e.item_index,
          text: e.text,
          excerpt_sha: e.excerpt_sha,
          char_start: e.char_start,
          char_end: e.char_end,
        })),
    );
    if (extractError) {
      console.warn("[dify-analyze-file] reuse: could not copy extracts:", extractError.message);
      return null;
    }
    const ready = chunks.filter((c) => String(c.status) === "ready").length;
    await supabase.from("file_proposals").update({
      sections_total: chunks.length,
      sections_ready: ready,
      sections_failed: chunks.filter((c) => String(c.status) === "failed").length,
      sidecar_sha: sidecarSha,
      parser_version: parserVersion,
    }).eq("id", proposalId);
    console.log("[dify-analyze-file] REUSED banked extracts — no window model calls:", JSON.stringify({
      proposalId, from: prior.id, windows: chunks.length, extracts: extracts.length,
    }));
    return { windows: chunks.length, extracts: extracts.length };
  }
  return null;
}

// SP-278's retry. The PREDICATE that decides which failures earn one lives in
// _shared/frameworkRetry.ts, so it can be unit-tested against the real recorded error strings
// instead of being a regex buried in a 2,400-line handler.
/**
 * Re-run the merge and the framework pass for a proposal whose extracts are already banked.
 * Returns true when a retry was started, false when the budget is spent or the row cannot be retried.
 */
async function retryFrameworkPass(args: {
  supabase: { from: (t: string) => any; storage: any };
  proposalId: string;
  difyApiKey: string;
  difyBaseUrl: string;
}): Promise<boolean> {
  const { supabase, proposalId, difyApiKey, difyBaseUrl } = args;
  const { data: row } = await supabase
    .from("file_proposals")
    .select("id, company_id, file_id, file_name, source_type, framework_attempts")
    .eq("id", proposalId)
    .maybeSingle();
  const r = row as Record<string, unknown> | null;
  if (!r) return false;
  const attempts = Number(r.framework_attempts ?? 0);
  if (attempts >= MAX_FRAMEWORK_ATTEMPTS) {
    console.log("[dify-analyze-file] framework retry budget spent:", proposalId, attempts);
    return false;
  }

  const sidecar = await loadUploadSidecar(supabase, r.file_id as string | null);
  if (!sidecar?.text) return false;
  const handOff = await mergeAndPrepareHandOff({ supabase, proposalId, sidecarText: sidecar.text });
  if (!handOff) return false;

  const { data: signed } = await supabase.storage.from("input-files").createSignedUrl(sidecar.filePath, 900);
  try {
    // The row goes back to `running` with its completion claim CLEARED, or the claim taken by the
    // failed pass would make the retry's own result unpersistable (SP-227's claim is on that column).
    await supabase.from("file_proposals").update({
      processing_state: "running",
      processing_completed_at: null,
      processing_error: null,
      processing_error_code: null,
      dify_workflow_run_id: null,
      dify_task_id: null,
    }).eq("id", proposalId);
    await startDifyRun({
      supabase,
      difyApiKey,
      difyBaseUrl,
      difyRequestBody: buildDifyRequestBody({
        fileUrl: signed?.signedUrl ?? "",
        fileName: String(r.file_name ?? ""),
        fileText: handOff.text,
        sourceType: String(r.source_type ?? ""),
        companyId: String(r.company_id ?? ""),
      }),
      proposalId,
      sourceType: String(r.source_type ?? ""),
    });
    console.warn("[dify-analyze-file] SP-278: framework pass RETRIED over banked extracts", JSON.stringify({
      proposalId, attempt: attempts + 1, chars: handOff.text.length,
      items_interpreted: handOff.itemsInterpreted, window_model_calls: 0,
    }));
    return true;
  } catch (error) {
    console.warn("[dify-analyze-file] SP-278: the retry itself failed to start:", String(error));
    return false;
  }
}

// ── SP-301: a newer analysis of a file supersedes the earlier ones ──────────────────────────────
// The rule and the work live in _shared/retireProposals.ts (retireEarlierAnalysesOfFile), beside the
// signed retirement path it reuses. What is HERE is the failure policy: a failure to retire does not
// fail this analysis — it is complete and correct; the earlier signals simply stay live, as before,
// until the next analysis of the file (the planner is idempotent).
async function supersedeEarlierAnalyses(args: {
  supabase: { from: (t: string) => any; rpc?: any };
  companyId: string;
  fileId: string;
  proposalId: string;
}): Promise<void> {
  try {
    const r = await retireEarlierAnalysesOfFile(args.supabase as never, args.companyId, args.fileId, args.proposalId);
    if (r.proposals > 0) {
      console.log("[dify-analyze-file] SP-301: earlier analyses superseded", JSON.stringify({ proposalId: args.proposalId, ...r }));
    }
  } catch (error) {
    console.warn("[dify-analyze-file] SP-301: supersede of earlier analyses FAILED; they stay live until the next analysis:",
      args.proposalId, String((error as Error)?.message ?? error));
  }
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
      processing_error: null,
      // SP-227: the row is NOT marked ready here. It is marked ready only after the write step below
      // has actually written the signals and claims — see the end of this function.
      processing_completed_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .neq("status", "rejected")
    // CLAIM (completion sweep, 2026-09-13; re-seated by SP-227): exactly one writer may run the side
    // effects below. That used to be decided by the move to 'ready'; now that 'ready' comes later, the
    // claim is taken on processing_completed_at, which is NULL for precisely as long as the row is in
    // flight. The worker's monitor, a page's sync poll and the pg_cron sweep can all reach a finished
    // run — the one whose update matches is still the only one that proceeds.
    .in("processing_state", ["queued", "running"])
    .is("processing_completed_at", null)
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
    // SP-228 (closes SP-F37): the BAND stays conservative either way, but the row must say which of
    // the two happened — a voice that was established, or one that never could be.
    let mintingOriginState: "resolved" | "uncertain" | null = null;
    if (effectiveSourceType !== "intake") {
      const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
      const fileId = String((proposalRow as { file_id?: unknown }).file_id ?? "").trim();
      if (fileId && isLocalClassifierUrl(ollamaUrl)) {
        const resolved = await resolveUploadOrigin(supabase as unknown as { from: (t: string) => any; storage: any }, companyId, fileId, { ollamaUrl, model: Deno.env.get("OLLAMA_MODEL") ?? undefined });
        origin = { authorship: resolved.authorship, subject: resolved.subject };
        // A classifier that answered 'uncertain' is still an answer ABOUT this document; a classifier
        // that never ran is not. Only the second is recorded as 'uncertain' on the row.
        mintingOriginState = "resolved";
        console.log("[dify-analyze-file] upload origin:", JSON.stringify({ proposalId, fileId, ...origin, source: resolved.source }));
      } else {
        origin = { authorship: "uncertain", subject: "uncertain" };
        mintingOriginState = "uncertain";
        console.warn("[dify-analyze-file] upload origin unresolved (no file id or non-local classifier) → uncertain:", proposalId);
      }
    }
    // E4 EXCERPT GUARD on the upload path (ruling 5, 2026-09-14): the sidecar is the basis. Absent (orphan
    // file row, no sidecar) ⇒ null ⇒ the guard leaves drafts as-is (its honest-limit law) and we say so.
    const sidecar = effectiveSourceType === "intake" ? null : await loadUploadSidecar(supabase as unknown as { from: (t: string) => any; storage: any }, (proposalRow as { file_id?: unknown }).file_id as string | null);
    const sidecarText = sidecar?.text ?? null;
    if (effectiveSourceType !== "intake" && !sidecarText) console.warn("[dify-analyze-file] no sidecar basis for the excerpt guard:", proposalId);
    const analysisVersion = Number((proposalRow as { analysis_version?: unknown }).analysis_version ?? 1) || 1;
    // ── SP-227 (closes SP-F38): 'ready' MEANS the signals and claims were written ─────────────────
    //
    // This step used to run AFTER the row had already been set 'ready'. If it threw — a constraint, a
    // revoked policy, an excerpt-guard error — the row still read 'ready' and a reader could not tell
    // "analyzed and ingested" from "analyzed, ingest threw". The state is now decided by the outcome.
    //
    // THE FORCED-FAILURE DOOR exists for the on-demand guard (SP-227's proof on the served worker):
    // a proposal whose file_name carries the marker below makes the write step throw deliberately.
    // It is gated on a non-production marker, costs nothing, and is the only honest way to exercise
    // the failure arm end to end without corrupting a real row.
    // read once: every access to this row's fields goes through the file's existing loose-shape
    // idiom, and a second direct access would add another instance of its createClient mismatch
    const rowFileName = String((proposalRow as { file_name?: unknown }).file_name ?? "");
    try {
      // SP-247: the door fires ONLY on a company that carries fixture_hold. A marker in a file name
      // on a real company does nothing at all — the hold is the authority, not the name, so this
      // cannot be triggered by a document someone happens to have named unhelpfully.
      if (rowFileName.includes("__iq_force_ingest_failure__")) {
        const { data: holdRow } = await supabase
          .from("companies")
          .select("fixture_hold")
          .eq("id", companyId)
          .maybeSingle();
        const held = String((holdRow as { fixture_hold?: unknown } | null)?.fixture_hold ?? "").trim();
        if (held) {
          throw new Error(`forced ingest failure (guard marker on held fixture ${held})`);
        }
        console.warn("[dify-analyze-file] forced-failure marker IGNORED — company is not a held fixture:", companyId);
      }
      await ingestDifyProposalSignals({
        supabase,
        companyId,
        proposalId,
        origin,
        sourceType: effectiveSourceType,
        sourceTitle: rowFileName || "Dify proposal",
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
    } catch (ingestError) {
      const detail = String((ingestError as Error)?.message ?? ingestError);
      console.error("[dify-analyze-file] write step FAILED, row ends failed not ready:", proposalId, detail);
      // SP-212: the code is stored, processing_error stays NULL, so the client reads the existing
      // "Analysis failed" wording with no code and no dangling colon.
      await (supabase as unknown as { from: (t: string) => any }).from("file_proposals").update({
        processing_state: "failed",
        processing_error: null,
        processing_error_code: "ingest_failed",
        minting_origin_state: mintingOriginState,
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposalId);
      // and the queue moves on (SP-189). Released already before the side effects; released again
      // here because a lock that outlives its row is the one failure this slice cannot afford.
      await releaseIngestLock(supabase as unknown as { from: (t: string) => any }, proposalId);
      console.log("[dify-analyze-file] proposal failed at the write step, id:", proposalId);
      return;
    }

    // The write step is done, so — and only so — the row is ready (SP-227), carrying the record of
    // whether its voice was ever established (SP-228).
    await (supabase as unknown as { from: (t: string) => any }).from("file_proposals").update({
      processing_state: "ready",
      processing_error: null,
      processing_error_code: null,
      minting_origin_state: mintingOriginState,
    }).eq("id", proposalId).neq("status", "rejected");

    // SP-301: only now — minted, linked, ready — do the earlier analyses of this file stand down.
    await supersedeEarlierAnalyses({
      supabase: supabase as unknown as { from: (t: string) => any; rpc?: any },
      companyId,
      fileId: String((proposalRow as { file_id?: unknown }).file_id ?? "").trim(),
      proposalId,
    });
  } else {
    // No company on the row means there is no minting step to succeed or fail, so there is nothing
    // for 'ready' to be a claim about — but the row must still reach a terminal state rather than
    // sitting in 'running' for ever. (file_proposals.company_id is NOT NULL, so this is the
    // unreadable-row case, not a normal one.)
    console.warn("[dify-analyze-file] no company on the row; marking ready with no minting step:", proposalId);
    await (supabase as unknown as { from: (t: string) => any }).from("file_proposals").update({
      processing_state: "ready",
      processing_error: null,
      processing_error_code: null,
    }).eq("id", proposalId).neq("status", "rejected");
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
    const detail = workflowError || `Dify workflow ${workflowStatus}`;
    // SP-294: the Adjudication output backstop fired and the Code node refused the cut answer. A real
    // code, and NO retry — at temperature 0 the same input is cut at the same place every time.
    if (isFrameworkOutputTruncated(String(detail))) {
      await (supabase as unknown as { from: (t: string) => any })
        .from("file_proposals").update({ processing_error_code: FRAMEWORK_TRUNCATED_CODE })
        .eq("id", proposalId).neq("status", "rejected");
      await markProposalFailed({ supabase, proposalId, summary: detail, error: detail });
      return { state: "failed" };
    }
    // SP-278: a TIME CEILING earns one retry over the banked extracts. Anything else fails now.
    if (isTimeCeilingFailure(String(workflowStatus), String(detail))) {
      const retried = await retryFrameworkPass({
        supabase: supabase as unknown as { from: (t: string) => any; storage: any },
        proposalId, difyApiKey, difyBaseUrl,
      });
      if (retried) return { state: "running" };
      // Budget spent: a real code, so a reader can tell "ran out of time twice" from "unreadable".
      // Through the loose shape, as every other write in this module does (the createClient generic
      // resolves this file's table types to `never` — the pre-existing class).
      await (supabase as unknown as { from: (t: string) => any })
        .from("file_proposals").update({ processing_error_code: FRAMEWORK_TIMEOUT_CODE })
        .eq("id", proposalId).neq("status", "rejected");
    }
    await markProposalFailed({
      supabase,
      proposalId,
      summary: detail,
      error: detail,
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

  // SP-278: every framework start is counted here, so the first pass and its one retry share one
  // counter and neither path can forget to advance it.
  const { data: before } = await supabase
    .from("file_proposals").select("framework_attempts").eq("id", proposalId).maybeSingle();
  const started = Number((before as { framework_attempts?: unknown } | null)?.framework_attempts ?? 0) + 1;
  const { error } = await supabase
    .from("file_proposals")
    .update({
      processing_state: "running",
      processing_error: null,
      processing_started_at: new Date().toISOString(),
      dify_workflow_run_id: workflowRunId,
      dify_task_id: taskId || null,
      framework_attempts: Math.min(MAX_FRAMEWORK_ATTEMPTS, started),
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

    // ── mode: "window" (SP-235, SP-240, SP-241) — ONE window of a chunked document, then chain.
    //
    // It holds the SAME claim the start door does: a window step that did not come from the row's own
    // chain has no business reading the document, and the single-flight key is what says so.
    if (mode === "window") {
      const requestedId = String(
        (body as Record<string, unknown>)?.proposal_id ?? (body as Record<string, unknown>)?.proposalId ?? "",
      ).trim();
      if (!requestedId) {
        return new Response(
          JSON.stringify({ error: "proposal_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: row } = await supabase
        .from("file_proposals")
        .select("id, company_id, file_id, file_name, source_type, status, processing_state")
        .eq("id", requestedId)
        .maybeSingle();
      if (!row) {
        return new Response(
          JSON.stringify({ ok: false, error: "not_found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const w = row as Record<string, unknown>;
      if (String(w.processing_state) !== "running") {
        // Not an error: the sweep and the chain can both arrive, and whoever is second finds the work
        // already done. Saying so is better than starting a second pass over the same windows.
        return new Response(
          JSON.stringify({ ok: true, skipped: "not_running", state: String(w.processing_state) }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // ── THE CLAIM, AND WHAT TO DO WHEN IT IS SIMPLY GONE ───────────────────────────────────────
      //
      // A window step runs only under this document's claim. But "no claim at all" is NOT the same as
      // "someone else's claim", and refusing both strands a document that did nothing wrong.
      //
      // Measured on the first real chunked run (Charter 10-Q, 2026-11-13): the lock vanished at window
      // 10 of 17 and every chained step answered 409 for ever after. The cause was
      // `ingest-queue-guard` q18, which did an UNSCOPED `delete from ingest_single_flight` to install
      // its own fixture lock — a guard breaking a live analysis, fixed there too. But the lesson is
      // this function's: a lock can disappear for reasons the document cannot control (an expiry
      // while a step ran long, an operator clearing a wedged queue), and a half-read document that can
      // never resume is worse than one that re-takes an UNHELD line.
      //
      // Re-acquiring is safe because the primary key is on a CONSTANT: if two documents race for a
      // free lock, exactly one insert wins and the loser gets its 409. The single-flight guarantee is
      // the key's, not this code's, so reclaiming cannot weaken it.
      const { data: claimRow } = await supabase
        .from("ingest_single_flight").select("proposal_id").eq("lock_key", "file_analysis").maybeSingle();
      const claimedBy = String((claimRow as { proposal_id?: unknown } | null)?.proposal_id ?? "");
      if (!claimedBy) {
        const { error: reclaimError } = await supabase.from("ingest_single_flight").insert({
          lock_key: "file_analysis",
          proposal_id: String(w.id),
          company_id: String(w.company_id ?? ""),
          expires_at: new Date(Date.now() + INGEST_LOCK_STEP_MS).toISOString(),
        });
        if (reclaimError) {
          // Another document won the free lock between the read and the insert. Not an error.
          console.log("[dify-analyze-file] window: lost the race to reclaim the lock", String(w.id));
          return new Response(
            JSON.stringify({ ok: false, error: "not_claimed", reclaim: "lost" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        console.warn("[dify-analyze-file] window: the lock was GONE and has been reclaimed", JSON.stringify({
          proposalId: w.id,
        }));
      } else if (claimedBy !== String(w.id)) {
        return new Response(
          JSON.stringify({ ok: false, error: "not_claimed" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const sidecar = await loadUploadSidecar(
        supabase as unknown as { from: (t: string) => any; storage: any },
        w.file_id as string | null,
      );
      if (!sidecar?.text) {
        await markProposalFailed({
          supabase,
          proposalId: String(w.id),
          summary: "Could not continue analysis",
          error: "The extracted-text sidecar is gone, so the window offsets point at nothing.",
        });
        return new Response(
          JSON.stringify({ ok: false, error: "no_sidecar", state: "failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // The same default the voice-classification path uses at its own call site, so one function
      // does not reach two different Ollamas.
      const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
      if (!isLocalClassifierUrl(ollamaUrl)) {
        // SP-226 as a door, not a comment: a non-local Ollama URL would send a private document's
        // text off this machine. Refused before the window is read.
        console.error("[dify-analyze-file] OLLAMA_BASE_URL is not local; refusing to extract:", ollamaUrl);
        return new Response(
          JSON.stringify({ ok: false, error: "local_only_policy_violation" }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const step = await runOneWindow({
        supabase: supabase as unknown as { from: (t: string) => any; storage: any },
        ollamaUrl,
        proposalId: String(w.id),
        companyId: String(w.company_id ?? ""),
        fileName: String(w.file_name ?? ""),
        sourceType: String(w.source_type ?? ""),
        sidecarText: sidecar.text,
      });

      if (!step.done) {
        // One window per invocation (the 400 s wall clock, R46), so the next one is a fresh request —
        // UNLESS another step already owns the current window, in which case chaining would just add
        // another live chain to the pile. Whoever holds the claim will chain when it finishes.
        if (!("inFlight" in step)) chainWindowStep(String(w.id));
        return new Response(
          JSON.stringify({ ok: true, window: step.window, done: false, in_flight: "inFlight" in step }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Every window is done. Merge, select into the budget, and hand over ONCE (SP-238).
      const counts = await syncSectionCounts(supabase as unknown as { from: (t: string) => any }, String(w.id));
      const handOff = await mergeAndPrepareHandOff({
        supabase: supabase as unknown as { from: (t: string) => any; storage: any },
        proposalId: String(w.id),
        sidecarText: sidecar.text,
      });

      if (!handOff) {
        // SP-242: no window yielded anything the framework pass could read. That is `failed` — a
        // document we read end to end and found nothing in is not a ready analysis.
        await markProposalFailed({
          supabase,
          proposalId: String(w.id),
          summary: "Could not analyze this document",
          error: "Every section was read, but none yielded a passage, claim or need to interpret.",
        });
        return new Response(
          JSON.stringify({ ok: false, error: "nothing_extracted", state: "failed", sections: counts }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: refreshed } = await supabase.storage
        .from("input-files").createSignedUrl(sidecar.filePath, 900);
      try {
        const started = await startDifyRun({
          supabase,
          difyApiKey: DIFY_API_KEY,
          difyBaseUrl: DIFY_API_BASE_URL,
          difyRequestBody: buildDifyRequestBody({
            fileUrl: refreshed?.signedUrl ?? "",
            fileName: String(w.file_name ?? ""),
            // THE MERGED EXTRACT, not the document (SP-238, SP-239). This is the only text the
            // framework pass ever sees for a chunked document, and it is within the SP-255 budget.
            fileText: handOff.text,
            sourceType: String(w.source_type ?? ""),
            companyId: String(w.company_id ?? ""),
          }),
          proposalId: String(w.id),
          sourceType: String(w.source_type ?? ""),
        });
        console.log("[dify-analyze-file] framework pass started on the merged extract", JSON.stringify({
          proposalId: w.id, chars: handOff.text.length,
          items_extracted: handOff.itemsExtracted, items_interpreted: handOff.itemsInterpreted,
          sections: counts, started,
        }));
        return new Response(
          JSON.stringify({ ok: true, done: true, handed_off: handOff.text.length, sections: counts }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch (error) {
        // SP-242: the framework pass failing is a FAILED document, however many windows succeeded —
        // there is no analysis without it. markProposalFailed releases the lock (SP-181).
        await markProposalFailed({
          supabase,
          proposalId: String(w.id),
          summary: "Failed to start Dify workflow",
          error: String((error as Error)?.message ?? error),
        });
        return new Response(
          JSON.stringify({ ok: false, error: "start_failed", state: "failed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

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

      // ── SP-279: IF THE TEXT HAS NOT CHANGED, REUSE WHAT WAS ALREADY EXTRACTED ─────────────────
      //
      // Eleven minutes of local model time for the Charter 10-Q's seventeen windows, paid again for
      // an "Analyze again" on a document nobody has touched. The sha of the stored sidecar is the
      // test: every banked pointer is an offset into that text.
      //
      // The reuse path then posts an ordinary window step. runOneWindow finds every chunk already
      // `ready`, answers `done`, and falls into the merge and framework pass — so reuse runs the
      // SAME code the long way round does, rather than a second copy of it that could drift.
      const currentSidecarSha = await contentIdentityOf(sidecar.text);
      const installedParser = await currentParserVersion(LOCAL_PARSER_URL);
      const reused = await reuseBankedExtracts({
        supabase: supabase as unknown as { from: (t: string) => any },
        proposalId: String(r.id),
        companyId: String(r.company_id ?? ""),
        fileId: String(r.file_id ?? ""),
        sidecarSha: currentSidecarSha,
        parserVersion: installedParser,
      });
      if (reused) {
        await (supabase as unknown as { from: (t: string) => any })
          .from("file_proposals")
          .update({ processing_state: "running", processing_started_at: new Date().toISOString() })
          .eq("id", r.id);
        await refreshIngestLock(supabase as unknown as { from: (t: string) => any }, String(r.id));
        chainWindowStep(String(r.id));
        return new Response(
          JSON.stringify({
            ok: true, started: true, state: "running", reused: true,
            windows: reused.windows, extracts: reused.extracts,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // SP-231..SP-234: read the document WHOLE and split it, before anything is sent anywhere.
      // This replaces the sidecar's possibly-30-page text with what the installed parser reads today,
      // and writes one file_proposal_chunks row per window with exact coverage.
      const read = await refreshReadAndWindow({
        supabase: supabase as unknown as { from: (t: string) => any; storage: any },
        parserUrl: LOCAL_PARSER_URL,
        proposalId: String(r.id),
        companyId: String(r.company_id ?? ""),
        fileId: String(r.file_id ?? ""),
        fileName: String(r.file_name ?? ""),
        filePath: sidecar.filePath,
        sidecarText: sidecar.text,
      });
      if (!read.ok) {
        await markProposalFailed({
          supabase,
          proposalId: String(r.id),
          summary: "Could not start analysis",
          error: `Could not read and split this document (${read.error}): ${read.detail}`,
        });
        return new Response(
          JSON.stringify({ ok: false, error: read.error, state: "failed" }),
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

      // ── SP-235, SP-238: A MULTI-WINDOW DOCUMENT IS NOT SENT TO THE FRAMEWORK PASS YET ──────────
      //
      // The framework pass runs ONCE per document, over the MERGED extract (SP-238), and no window is
      // ever sent to it (SP-235). So when the document has more than one window, `start` marks the row
      // running, records the section count, and chains to the first window step. The framework pass is
      // launched by the LAST window step, from the merged extract.
      //
      // A ONE-WINDOW DOCUMENT GOES STRAIGHT THROUGH, unchanged. Chunking a two-page brief into one
      // window, extracting it, merging a merge of one and then handing it over would be the same call
      // with three extra round trips and a different failure surface — and SP-244 already says a
      // one-window document shows none of the section copy. The old path IS the right path for it.
      if (read.windows.length > 1) {
        // Through the loose shape, as every other write in this file does: the createClient generic
        // in this module resolves its table types to `never`, a pre-existing mismatch (73 errors at
        // 2adac0fd) that a new write would otherwise add to.
        const db = supabase as unknown as { from: (t: string) => any };
        await db.from("file_proposals").update({
          processing_state: "running",
          processing_started_at: new Date().toISOString(),
          sections_total: read.windows.length,
          sections_ready: 0,
          sections_failed: 0,
        }).eq("id", r.id);
        await refreshIngestLock(supabase as unknown as { from: (t: string) => any }, String(r.id));
        console.log("[dify-analyze-file] start: chunked document, chaining window steps", JSON.stringify({
          proposalId: r.id, windows: read.windows.length, chars: read.text.length,
        }));
        chainWindowStep(String(r.id));
        return new Response(
          JSON.stringify({ ok: true, started: true, state: "running", windows: read.windows.length }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const startBody = buildDifyRequestBody({
        fileUrl: freshSigned.signedUrl,
        fileName: String(r.file_name ?? ""),
        fileText: read.text,
        sourceType: String(r.source_type ?? ""),
        companyId: String(r.company_id ?? ""),
      });

      // A one-window document records its single section, so every chunked row carries the counts and
      // a reader never has to ask whether NULL means "one section" or "never ran".
      await (supabase as unknown as { from: (t: string) => any })
        .from("file_proposals").update({ sections_total: 1, sections_ready: 1, sections_failed: 0 })
        .eq("id", r.id);

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

      // ── SP-240: THIS IS WHERE THE BROKEN CHAIN IS RECOVERED ─────────────────────────────────────
      //
      // The completion sweep posts `{"mode":"sync"}` and nothing else — it has always been the one
      // recovery post, and widening it to a second body would change completion-sweep-guard's
      // subject (the reason I-1 gave the starter its own function rather than widening jobid 2).
      //
      // A chunked document mid-windows has NO dify_workflow_run_id, because the framework pass has
      // not started yet. So a plain sync at it reads a NULL run id and does nothing, and if the
      // window chain was lost — worker recycled between steps, a dropped self-post — the row would
      // sit `running` until the 24-hour ceiling. "Analyzing…" for a day, which is the exact failure
      // SP-248 closed for a dying writer and would have reopened here for a dying chain.
      //
      // So sync asks first: is this a chunked row with windows still to run? If it is, the recovery
      // is to RESUME THE CHAIN, not to poll a run that does not exist. One idempotent step: whichever
      // of the chain and the sweep arrives first does the work, and the other finds it done.
      const { data: syncRow } = await supabase
        .from("file_proposals")
        .select("id, processing_state, dify_workflow_run_id")
        .eq("id", requestedProposalId)
        .maybeSingle();
      const sr = syncRow as { processing_state?: unknown; dify_workflow_run_id?: unknown } | null;
      // A CHUNKED ROW MID-WINDOWS MUST NEVER FALL THROUGH TO syncDifyRun.
      //
      // This is the bug that killed the first real 10-Q run at window 16 of 17, with
      // `summary: "Dify run id missing"`. syncDifyRun reasonably treats a running proposal with no
      // dify_workflow_run_id as broken — that WAS broken, before a document could be running for
      // twenty minutes before its framework pass starts. The first cut of the resume clause only
      // caught the case where a window was claimable; when the current window was running and fresh
      // there was nothing to resume, so the door fell through and failed a document that was working
      // perfectly. Resuming and NOT-FAILING are two decisions, and only the first depends on whether
      // a window can be picked up right now.
      const chunkedInFlight = sr && String(sr.processing_state) === "running"
        && !String(sr.dify_workflow_run_id ?? "");
      if (chunkedInFlight) {
        // Resume only when there is something to PICK UP: a pending window, or a running one whose
        // step has gone stale (a dead worker). A window that is running and fresh means a step is in
        // flight, and posting another chain at it is how chains multiplied in the first place — each
        // cron tick would add one.
        const { count: pendingCount } = await supabase
          .from("file_proposal_chunks")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", requestedProposalId)
          .eq("status", "pending");
        const { count: staleCount } = await supabase
          .from("file_proposal_chunks")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", requestedProposalId)
          .eq("status", "running")
          .lt("started_at", new Date(Date.now() - WINDOW_MODEL_TIMEOUT_MS - 60_000).toISOString());
        const { count: liveCount } = await supabase
          .from("file_proposal_chunks")
          .select("id", { count: "exact", head: true })
          .eq("proposal_id", requestedProposalId)
          .in("status", ["pending", "running"]);
        const waiting = Number(pendingCount ?? 0) + Number(staleCount ?? 0);
        // Still working, but nothing to pick up: a step owns the current window and has not gone
        // stale. Say so and STOP. Falling through from here is what failed the run.
        if (waiting === 0 && Number(liveCount ?? 0) > 0) {
          return new Response(
            JSON.stringify({ ok: true, waiting: "window_in_flight", windows_left: Number(liveCount ?? 0) }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (waiting > 0) {
          console.log("[dify-analyze-file] sync: resuming a stalled window chain", JSON.stringify({
            proposalId: requestedProposalId, pending: Number(pendingCount ?? 0), stale: Number(staleCount ?? 0),
          }));
          chainWindowStep(requestedProposalId);
          return new Response(
            JSON.stringify({ ok: true, resumed: "window_chain", waiting }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
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
      // SP-231. It is on this local type and not only on the parser's return because THIS object is
      // what the insert reads: without the field, `extraction.charsCapped` was undefined and the row
      // stored NULL — "we do not know whether the cap bit" — for a document the parser had just told
      // us it did not bite on. Measured on the Charter 10-Q's first whole read before this line
      // existed. NULL is the honest value only for a read that never happened.
      charsCapped: boolean | null;
    } = { images: 0, pages: null, source: "local_text_reader", pagesRead: null, pagesTotal: null, charsTotal: null, charsCapped: null };
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
          charsCapped: parsed.charsCapped,
        };
      }
    } catch (extractError) {
      console.log("[dify-analyze-file] extraction error:", String((extractError as Error)?.message ?? extractError));
      fileText = "";
      // A failed extraction knows nothing about pages, and says nothing rather than zero.
      // A failed extraction knows nothing — not whether pages were missed, and not whether the cap bit.
      extraction = { images: 0, pages: null, source: "local_parser_error", pagesRead: null, pagesTotal: null, charsTotal: null, charsCapped: null };
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
        //
        // SP-230 (closes SP-F40): two callers racing for the same file both reach this insert, and the
        // partial unique index file_proposals_one_voice_refusal_per_file admits ONE. The loser's
        // unique violation is not an error to report — the record it wanted already exists — so it is
        // logged and swallowed. One file, one voice refusal, whoever got there first.
        const { error: refusalInsertError } = await supabase.from("file_proposals").insert({
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
        if (refusalInsertError) {
          // 23505 is unique_violation: another caller recorded the same refusal first.
          const isDuplicate = String((refusalInsertError as { code?: unknown }).code ?? "") === "23505";
          console.log(
            `[dify-analyze-file] voice refusal insert ${isDuplicate ? "already recorded by another caller" : "FAILED"}:`,
            refusalInsertError.message,
          );
        }
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
        // SP-231: the one remaining cap, recorded at birth as well as on every re-read.
        chars_capped:        extraction.charsCapped,
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
