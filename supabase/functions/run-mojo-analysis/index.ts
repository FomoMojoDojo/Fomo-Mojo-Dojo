import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestDifyProposalSignals } from "../_shared/evidencePhase1.ts";
import { regenerateJobMapJourney } from "../_shared/jobMapRegeneration.ts";
import { snapshotMojoScore } from "../_shared/snapshotMojoScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DIFY_MONITOR_MAX_ATTEMPTS = 240;
const DIFY_MONITOR_DELAY_MS = 5000;
const DIFY_RUN_ID_TIMEOUT_MS = 180000;
const DIFY_POLL_TIMEOUT_MS = 4000;
const DIFY_LOG_POLL_DELAY_MS = 1000;

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "what", "how",
  "when", "then", "your", "their", "will", "have", "make", "more", "less",
  "core", "work", "step", "team", "customer", "internal", "progress",
]);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v ?? "").trim()).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? "").trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  return [];
}

function readJsonField(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

const BARE_STAGE_LABELS = new Set([
  "define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude",
]);

function isBareStageLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (BARE_STAGE_LABELS.has(normalized)) return true;
  // Also reject labels that just prepend a bare stage name (e.g. "Execute core marketing actions")
  for (const stage of BARE_STAGE_LABELS) {
    if (normalized.startsWith(stage + " ")) return true;
  }
  return false;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

type NormalizedStep = {
  step_number: number;
  step_label: string;
  description: string;
  designed: boolean;
  has_gap: boolean;
  evidence_status: string;
  evidence_basis: string;
  evidence_confidence: number;
  gap_note: string;
};

function normalizeRawJobStep(raw: unknown): NormalizedStep | null {
  const r = asRecord(raw);
  if (!r) return null;
  const step_number = clampInt(Number(r.step_number ?? r.stepNumber ?? 0), 1, 8);
  const step_label = String(r.step_label ?? r.stepLabel ?? r.label ?? "").trim();
  if (!step_label) return null;
  // Keep the step even if the label starts with a bare stage word —
  // the frontend substitutes the canonical label for display.
  return {
    step_number,
    step_label,
    description: String(r.description ?? "").trim(),
    designed: Boolean(r.designed),
    has_gap: r.has_gap !== undefined ? Boolean(r.has_gap) : true,
    evidence_status: String(r.evidence_status ?? "unclear").trim() || "unclear",
    evidence_basis: String(r.evidence_basis ?? "").trim(),
    evidence_confidence: clampInt(Number(r.evidence_confidence ?? 40), 0, 100),
    gap_note: String(r.gap_note ?? "").trim(),
  };
}

function tryParseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return Array.isArray(p) ? p : null;
    } catch { return null; }
  }
  return null;
}

function tryParseRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return p && typeof p === "object" && !Array.isArray(p) ? p as Record<string, unknown> : null;
    } catch { return null; }
  }
  return value as Record<string, unknown>;
}

function extractStepsFromValue(value: unknown): NormalizedStep[] {
  if (!value) return [];

  // Parse string to object/array first
  const parsed = typeof value === "string"
    ? (() => { try { return JSON.parse(value); } catch { return null; } })()
    : value;

  if (!parsed) return [];

  // If it's already a steps array
  const asArr = tryParseJsonArray(parsed);
  if (asArr) {
    const steps = asArr.map(normalizeRawJobStep).filter(Boolean) as NormalizedStep[];
    if (steps.length >= 2) return steps;
  }

  // If it's an object (e.g. ODI node JSON output with a job_map field)
  const rec = asRecord(parsed);
  if (rec) {
    const mapArr = tryParseJsonArray(rec.job_map ?? rec.steps ?? rec.checkpoints);
    if (mapArr) {
      const steps = mapArr.map(normalizeRawJobStep).filter(Boolean) as NormalizedStep[];
      if (steps.length >= 2) return steps;
    }
  }

  return [];
}

// Extract internal_job_map from the ODI output object (company operational perspective)
function extractInternalJobStepsFromOutputs(outputs: Record<string, unknown>): NormalizedStep[] {
  const odiText = outputs.odi_text;
  if (odiText) {
    const parsed = typeof odiText === "string"
      ? (() => { try { return JSON.parse(odiText); } catch { return null; } })()
      : odiText;
    const rec = asRecord(parsed);
    if (rec) {
      const mapArr = tryParseJsonArray(rec.internal_job_map);
      if (mapArr) {
        const steps = mapArr.map(normalizeRawJobStep).filter(Boolean) as NormalizedStep[];
        if (steps.length >= 2) return steps;
      }
    }
  }

  const frameworkResults = tryParseJsonArray(outputs.framework_results);
  if (frameworkResults) {
    for (const item of frameworkResults) {
      const rec = asRecord(item) ?? tryParseRecord(item);
      if (!rec) continue;
      const isOdiItem = String(rec.framework ?? "").toUpperCase() === "ODI";
      const odiData: Record<string, unknown> | null = isOdiItem
        ? rec
        : (() => {
            try {
              const pr = asRecord(JSON.parse(String(rec.result ?? rec.text ?? rec.output ?? "")));
              return pr && String(pr.framework ?? "").toUpperCase() === "ODI" ? pr : null;
            } catch { return null; }
          })();
      if (!odiData) continue;
      const mapArr = tryParseJsonArray(odiData.internal_job_map);
      if (mapArr) {
        const steps = mapArr.map(normalizeRawJobStep).filter(Boolean) as NormalizedStep[];
        if (steps.length >= 2) return steps;
      }
    }
  }

  return [];
}

function extractJobStepsFromOutputs(outputs: Record<string, unknown>): NormalizedStep[] {
  // 1. Try top-level named keys — odi_text is what we expose from the OUTPUT node
  const topLevelCandidates = [
    outputs.odi_text,        // OUTPUT node variable mapped from FALLBACK OUTPUTS @ODI $text
    outputs.candidate_job_steps,
    outputs.odi_job_map,
    outputs.odi_output,
    outputs.job_map,
  ];
  for (const candidate of topLevelCandidates) {
    if (!candidate) continue;
    const steps = extractStepsFromValue(candidate);
    if (steps.length >= 4) return steps;
  }

  // 2. Scan framework_results for the ODI item — the ODI node embeds job_map inside its JSON output
  const frameworkResults = tryParseJsonArray(outputs.framework_results);
  if (frameworkResults) {
    for (const item of frameworkResults) {
      const rec = asRecord(item) ?? tryParseRecord(item);
      if (!rec) continue;

      const isOdiItem = String(rec.framework ?? "").toUpperCase() === "ODI";

      // Also try parsing result/text field in case it's a {framework, result} wrapper
      const odiData: Record<string, unknown> | null = isOdiItem
        ? rec
        : (() => {
            const resultStr = String(rec.result ?? rec.text ?? rec.output ?? "");
            try {
              const pr = asRecord(JSON.parse(resultStr));
              return pr && String(pr.framework ?? "").toUpperCase() === "ODI" ? pr : null;
            } catch { return null; }
          })();

      if (!odiData) continue;

      const steps = extractStepsFromValue(odiData.job_map ?? odiData.steps ?? odiData.checkpoints);
      if (steps.length >= 4) {
        console.log("[run-mojo-analysis] found job_map inside framework_results ODI item, steps:", steps.length);
        return steps;
      }
    }
  }

  // 3. Try nested under journeys[0].steps (local-jobmap-synthesis format)
  const journeys = tryParseJsonArray(outputs.journeys);
  if (journeys) {
    const customer = journeys.find((j: unknown) => {
      const r = asRecord(j);
      return r && String(r.journey_key ?? "").toLowerCase().includes("customer");
    });
    const stepsArr = customer ? tryParseJsonArray((asRecord(customer))?.steps) : null;
    if (stepsArr) {
      const normalized = stepsArr.map(normalizeRawJobStep).filter(Boolean) as NormalizedStep[];
      if (normalized.length >= 4) return normalized;
    }
  }

  return [];
}

async function writeJourneySteps(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  steps: NormalizedStep[],
  journeyKey: string,
  journeyTitle: string,
  journeySubtitle: string,
  sourceRunId: string | null = null,
) {
  const runTag = `dify_mojo_analysis:${new Date().toISOString().slice(0, 10)}`;
  await supabase.from("job_steps").delete().eq("company_id", companyId).eq("journey_key", journeyKey);
  for (const step of steps) {
    const payload: Record<string, unknown> = {
      company_id: companyId,
      user_id: userId,
      journey_key: journeyKey,
      journey_title: journeyTitle,
      journey_subtitle: journeySubtitle,
      frameworks_used: ["JTBD", "ODI", "dify_mojo_analysis"],
      step_number: step.step_number,
      step_label: step.step_label,
      description: step.description,
      designed: step.designed,
      has_gap: step.has_gap,
      evidence_status: step.evidence_status,
      evidence_basis: step.evidence_basis || runTag,
      evidence_confidence: step.evidence_confidence,
      gap_note: step.has_gap ? step.gap_note : "",
      dependency_state: "fresh",
      validation_state: "unvalidated",
      evidence_state: step.evidence_status === "evidenced" ? "sufficient" : step.evidence_status === "implied" ? "partial" : "thin",
      stale_reason: null,
      stale_since_event_id: null,
      last_reviewed_at: null,
      source_run_id: sourceRunId,
      updated_at: nowIso(),
    };
    const { error } = await supabase.from("job_steps").insert(payload);
    if (error) {
      const {
        evidence_status: _es,
        evidence_basis: _eb,
        evidence_confidence: _ec,
        dependency_state: _ds,
        validation_state: _vs,
        evidence_state: _xs,
        stale_reason: _sr,
        stale_since_event_id: _seid,
        last_reviewed_at: _lra,
        source_run_id: _run,
        updated_at: _upd,
        ...legacyPayload
      } = payload;
      await supabase.from("job_steps").insert(legacyPayload);
    }
  }
}

// ODI need templates keyed by checkpoint position (1–8), matching local-jobmap-synthesis pattern
const ODI_NEED_TEMPLATES: Record<number, string[]> = {
  1: ["Minimize the time it takes to agree on measurable success criteria for {topic}.", "Increase confidence that teams define success for {topic} the same way."],
  2: ["Minimize the time it takes to find the strongest evidence for {topic}.", "Increase confidence that the chosen path for {topic} fits the real customer need."],
  3: ["Minimize delays caused by missing ownership or data before work on {topic} starts.", "Increase confidence that owners are ready before execution on {topic} begins."],
  4: ["Reduce the risk of committing to a weak approach for {topic}.", "Increase confidence that the selected approach for {topic} will hold up in real use."],
  5: ["Minimize mistakes while executing the core work tied to {topic}.", "Increase first-pass success while executing the core work tied to {topic}."],
  6: ["Increase visibility into live progress signals for {topic}.", "Minimize the time it takes to detect when {topic} is drifting off track."],
  7: ["Minimize the time to adjust when {topic} is not producing expected results.", "Increase confidence that course corrections improve {topic} quickly."],
  8: ["Minimize the time to confirm whether the work delivered {topic}.", "Increase clarity on what to repeat next cycle for {topic}."],
};

function needOutcomeFromStep(step: NormalizedStep, index: number): string {
  const templates = ODI_NEED_TEMPLATES[step.step_number] ?? ODI_NEED_TEMPLATES[1];
  const topic = step.step_label.toLowerCase().replace(/^(identify|define|evaluate|select|confirm|monitor|adjust|validate)\s+/i, "").trim() || "this checkpoint";
  return templates[index % templates.length].replace(/{topic}/g, topic);
}

function needServiceState(importance: number, satisfaction: number): string {
  if (importance >= 7 && satisfaction <= 4) return "underserved";
  if (importance <= 4 && satisfaction >= 8) return "overserved";
  return "served";
}

function nowIso() {
  return new Date().toISOString();
}

function semanticJobStepKey(row: { journey_key?: unknown; step_number?: unknown }) {
  return `${String(row.journey_key ?? "").trim().toLowerCase()}::${Number(row.step_number ?? 0)}`;
}

function normalizeComparisonText(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenizeComparisonText(value: unknown) {
  return normalizeComparisonText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !STOP_WORDS.has(part));
}

function hasMeaningfulTextOverlap(a: unknown, b: unknown) {
  const aTokens = tokenizeComparisonText(a);
  const bSet = new Set(tokenizeComparisonText(b));
  let matches = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) matches += 1;
    if (matches >= 2) return true;
  }
  return false;
}

function jobStepChanged(previousRow: Record<string, unknown> | null | undefined, nextStep: NormalizedStep) {
  if (!previousRow) return true;
  return (
    normalizeComparisonText(previousRow.step_label) !== normalizeComparisonText(nextStep.step_label) ||
    normalizeComparisonText(previousRow.description) !== normalizeComparisonText(nextStep.description) ||
    Boolean(previousRow.designed) !== Boolean(nextStep.designed) ||
    Boolean(previousRow.has_gap) !== Boolean(nextStep.has_gap) ||
    normalizeComparisonText(previousRow.gap_note) !== normalizeComparisonText(nextStep.gap_note)
  );
}

async function restoreJobStepsForJourney(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  journeyKey: string,
  rows: Record<string, unknown>[],
) {
  const { error: deleteError } = await supabase.from("job_steps").delete().eq("company_id", companyId).eq("journey_key", journeyKey);
  if (deleteError) {
    throw new Error(deleteError.message || "Failed clearing regenerated job steps before restore.");
  }
  if (rows.length === 0) return;

  let result = await supabase.from("job_steps").insert(rows);
  if (result.error) {
    const message = result.error.message || "";
    if (
      isJobStepEvidenceColumnError(message) ||
      message.toLowerCase().includes("dependency_state") ||
      message.toLowerCase().includes("source_run_id") ||
      message.toLowerCase().includes("stale_since_event_id")
    ) {
      const fallbackRows = rows.map((row) => {
        const {
          evidence_status,
          evidence_basis,
          evidence_confidence,
          dependency_state,
          validation_state,
          evidence_state,
          stale_reason,
          stale_since_event_id,
          last_reviewed_at,
          source_run_id,
          ...rest
        } = row;
        return rest;
      });
      result = await supabase.from("job_steps").insert(fallbackRows);
    }
  }

  if (result.error) {
    throw new Error(result.error.message || "Failed to restore previous job steps after regeneration error.");
  }
}

async function generateNeedsFromSteps(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  steps: NormalizedStep[],
  journeyKey: string,
) {
  if (steps.length === 0) return;

  await supabase.from("odi_needs").delete().eq("company_id", companyId).eq("journey_key", journeyKey);

  // Generate both template variants per step for broad Diagnose-phase coverage.
  // Template 0 uses the base importance/satisfaction; template 1 bumps satisfaction
  // by 1, producing a slightly less urgent variant of the same step concern.
  let sortOrder = 1;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const baseImportance = Math.max(5, Math.min(9, 8 - ((step.step_number - 1) % 3)));
    const baseSatisfaction = Math.max(2, Math.min(7, 4 + ((step.step_number + 1) % 3)));
    const templates = ODI_NEED_TEMPLATES[step.step_number] ?? ODI_NEED_TEMPLATES[1];

    for (let t = 0; t < templates.length; t++) {
      const importance = baseImportance;
      const satisfaction = Math.min(7, baseSatisfaction + t);
      const opportunityScore = importance + Math.max(0, importance - satisfaction);

      await supabase.from("odi_needs").insert({
        company_id: companyId,
        user_id: userId,
        tier: "need",
        desired_outcome: needOutcomeFromStep(step, t),
        journey_key: journeyKey,
        step_number: step.step_number,
        step_label: step.step_label,
        importance,
        satisfaction,
        opportunity_score: opportunityScore,
        sort_order: sortOrder++,
        service_state: needServiceState(importance, satisfaction),
        source_path: "dify_mojo_analysis",
        frameworks_used: ["JTBD", "ODI", "dify_mojo_analysis"],
      });
    }
  }

  console.log("[run-mojo-analysis] generated", steps.length * 2, "needs from job steps — journey:", journeyKey);
}

async function applyJobStepsFromDify(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  customerSteps: NormalizedStep[],
  internalSteps: NormalizedStep[] = [],
  journeyKey: string = "customer",
  jobPerformer: string = "",
  primaryJob: string = "",
  sourceRunId: string | null = null,
) {
  if (customerSteps.length < 4 && internalSteps.length < 4) return;

  const { data: company } = await supabase
    .from("companies")
    .select("created_by")
    .eq("id", companyId)
    .maybeSingle();

  const userId = String((company as Record<string, unknown> | null)?.created_by ?? "").trim();
  if (!userId) return;

  const normalizedKey = journeyKey.trim() || "customer";
  if (internalSteps.length >= 4) {
    const internalTitle = "Internal Operations";
    const internalSubtitle = "How the organization supports the customer job internally";
    const internalResult = await regenerateJobMapJourney({
      supabase,
      companyId,
      userId,
      actorType: "dify",
      actorId: userId,
      journeyKey: "internal",
      journeyTitle: internalTitle,
      journeySubtitle: internalSubtitle,
      steps: internalSteps,
      sourceRunId,
      sourceLabel: "run_mojo_analysis",
      frameworksUsed: ["JTBD", "ODI", "dify_mojo_analysis"],
    });
    console.log("[run-mojo-analysis] wrote", internalSteps.length, "internal operational steps | affected artifacts:", internalResult.affectedArtifactCount);
  }

  if (customerSteps.length >= 4) {
    const customerTitle = jobPerformer
      ? `Checkpoint Map: ${jobPerformer}`
      : "Customer Checkpoint Map";
    const customerSubtitle = primaryJob
      ? `How ${jobPerformer.toLowerCase() || "the job performer"} accomplishes: ${primaryJob}`
      : "";

    const customerResult = await regenerateJobMapJourney({
      supabase,
      companyId,
      userId,
      actorType: "dify",
      actorId: userId,
      journeyKey: normalizedKey,
      journeyTitle: customerTitle,
      journeySubtitle: customerSubtitle,
      steps: customerSteps,
      sourceRunId,
      sourceLabel: "run_mojo_analysis",
      frameworksUsed: ["JTBD", "ODI", "dify_mojo_analysis"],
      claimTopic: "job",
    });

    console.log("[run-mojo-analysis] wrote", customerSteps.length, "customer steps — journey:", normalizedKey, "| affected artifacts:", customerResult.affectedArtifactCount);
  }
}

function waitUntil(promise: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(promise);
    return true;
  }
  return false;
}

async function readLocalEnvValue(name: string): Promise<string | undefined> {
  const candidates = [
    (() => { try { return new URL("../.env.local", import.meta.url).pathname; } catch { return ""; } })(),
    (() => { try { return new URL("../.env", import.meta.url).pathname; } catch { return ""; } })(),
  ].filter(Boolean);

  for (const path of candidates) {
    try {
      const text = await Deno.readTextFile(path);
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex <= 0) continue;
        if (trimmed.slice(0, eqIndex).trim() === name) {
          return trimmed.slice(eqIndex + 1).trim();
        }
      }
    } catch { /* ignore */ }
  }
}

async function resolveMojoAnalysisApiKey() {
  const dedicatedEnv = Deno.env.get("DIFY_MOJO_ANALYSIS_API_KEY");
  if (dedicatedEnv) return dedicatedEnv;

  const dedicatedFile = await readLocalEnvValue("DIFY_MOJO_ANALYSIS_API_KEY");
  if (dedicatedFile) return dedicatedFile;

  const genericEnv = Deno.env.get("DIFY_API_KEY");
  if (genericEnv) return genericEnv;

  const genericFile = await readLocalEnvValue("DIFY_API_KEY");
  return genericFile;
}

async function readDockerGatewayFromProc() {
  try {
    const routeTable = await Deno.readTextFile("/proc/net/route");
    const lines = routeTable.split(/\r?\n/).slice(1);
    for (const line of lines) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 3) continue;
      const destination = columns[1];
      const gatewayHex = columns[2];
      if (destination !== "00000000" || gatewayHex.length !== 8) continue;
      const octets = gatewayHex.match(/../g)?.map((part) => parseInt(part, 16)).reverse();
      if (!octets || octets.some((part) => !Number.isFinite(part))) continue;
      return octets.join(".");
    }
  } catch {
    // Ignore local runtime probing errors and fall back to other local gateway heuristics.
  }
  return null;
}

async function inferDockerGatewayIpv4() {
  try {
    const osModule = await import("node:os");
    const interfaces = osModule.networkInterfaces?.() ?? {};
    const candidates: string[] = [];
    for (const entries of Object.values(interfaces)) {
      for (const entry of entries ?? []) {
        if (!entry || entry.family !== "IPv4" || entry.internal) continue;
        const octets = String(entry.address ?? "").trim().split(".");
        if (octets.length !== 4) continue;
        if (octets[0] !== "172" && octets[0] !== "192" && octets[0] !== "10") continue;
        candidates.push(`${octets[0]}.${octets[1]}.${octets[2]}.1`);
      }
    }
    const preferred = candidates.find((ip) => ip.startsWith("172."));
    if (preferred) return preferred;
    if (candidates.length > 0) return candidates[0];
  } catch {
    // Ignore node compatibility probing errors.
  }
  return null;
}

async function buildDifyBaseUrlCandidates(baseUrl: string) {
  const trimmed = String(baseUrl ?? "").trim().replace(/\/$/, "");
  return trimmed ? [trimmed] : [baseUrl];
}

// ── Dify helpers ──────────────────────────────────────────────────────────────

function buildWorkflowRunEndpoint(baseUrl: string) {
  return `${baseUrl}/workflows/run`;
}

function buildWorkflowRunDetailEndpoint(baseUrl: string, runId: string) {
  return `${baseUrl}/workflows/run/${runId}`;
}

function buildWorkflowLogsEndpoint(baseUrl: string, difyUserSessionId: string) {
  const url = new URL(`${baseUrl}/workflows/logs`);
  url.searchParams.set("created_by_end_user_session_id", difyUserSessionId);
  url.searchParams.set("page", "1");
  url.searchParams.set("limit", "1");
  return url.toString();
}

function extractWorkflowStartPayload(value: unknown): { workflowRunId: string; taskId: string } {
  const payload = asRecord(value) ?? {};
  const nested = asRecord(payload.data) ?? {};
  return {
    workflowRunId: String(payload.workflow_run_id ?? nested.workflow_run_id ?? nested.id ?? "").trim(),
    taskId: String(payload.task_id ?? nested.task_id ?? "").trim(),
  };
}

function extractWorkflowStartFromText(text: string): { workflowRunId: string; taskId: string } {
  const normalized = String(text ?? "");

  const workflowMatch = normalized.match(/"workflow_run_id"\s*:\s*"([^"]+)"/);
  const taskMatch = normalized.match(/"task_id"\s*:\s*"([^"]+)"/);
  if (workflowMatch?.[1]) {
    return {
      workflowRunId: workflowMatch[1].trim(),
      taskId: String(taskMatch?.[1] ?? "").trim(),
    };
  }

  const blocks = normalized.split(/\r?\n\r?\n+/);
  for (const block of blocks) {
    for (const line of block.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw) continue;
      try {
        const extracted = extractWorkflowStartPayload(JSON.parse(raw));
        if (extracted.workflowRunId) return extracted;
      } catch {
        // Ignore malformed or partial SSE payloads and continue scanning.
      }
    }
  }

  return { workflowRunId: "", taskId: "" };
}

async function lookupWorkflowRunFromLogs(params: {
  apiKey: string;
  baseUrl: string;
  difyUserSessionId: string;
}): Promise<{ workflowRunId: string; taskId: string }> {
  const { apiKey, baseUrl, difyUserSessionId } = params;
  const response = await fetch(buildWorkflowLogsEndpoint(baseUrl, difyUserSessionId), {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(DIFY_POLL_TIMEOUT_MS),
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`Dify log lookup error (${response.status}): ${raw}`);
  }

  const payload = asRecord(await response.json().catch(() => null)) ?? {};
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const first = asRecord(rows[0]) ?? {};
  const workflowRun = asRecord(first.workflow_run) ?? {};
  return {
    workflowRunId: String(workflowRun.id ?? "").trim(),
    taskId: "",
  };
}

async function waitForWorkflowRunFromLogs(params: {
  apiKey: string;
  baseUrl: string;
  difyUserSessionId: string;
  deadline: number;
}): Promise<{ workflowRunId: string; taskId: string }> {
  const { apiKey, baseUrl, difyUserSessionId, deadline } = params;

  while (Date.now() < deadline) {
    try {
      const found = await lookupWorkflowRunFromLogs({ apiKey, baseUrl, difyUserSessionId });
      if (found.workflowRunId) return found;
    } catch (err) {
      console.warn("[run-mojo-analysis] Dify log lookup retry:", String((err as Error)?.message ?? err), "| candidate:", baseUrl);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(DIFY_LOG_POLL_DELAY_MS, remainingMs)));
  }

  throw new Error("startup-timeout");
}

async function startDifyStream(params: {
  apiKey: string;
  endpoint: string;
  inputs: Record<string, string>;
  difyUserSessionId: string;
}): Promise<{ workflowRunId: string; taskId: string }> {
  const { apiKey, endpoint, inputs, difyUserSessionId } = params;
  const controller = new AbortController();
  const startupTimeout = setTimeout(() => controller.abort("startup-timeout"), DIFY_RUN_ID_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream, application/json",
        "Accept-Encoding": "identity",
      },
      body: JSON.stringify({ inputs, response_mode: "streaming", user: difyUserSessionId }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(`Dify error (${response.status}): ${raw}`);
    }

    const contentType = String(response.headers.get("content-type") ?? "").toLowerCase();
    console.log("[run-mojo-analysis] Dify startup response:", endpoint, "| status:", response.status, "| content-type:", contentType || "none");
    if (!response.body) {
      const raw = await response.text().catch(() => "");
      const extracted = extractWorkflowStartFromText(raw);
      if (extracted.workflowRunId) return extracted;
      throw new Error("Dify stream missing response body");
    }

    if (contentType.includes("application/json")) {
      const extracted = extractWorkflowStartPayload(await response.json().catch(() => null));
      if (extracted.workflowRunId) return extracted;
      throw new Error("Dify JSON response missing workflow_run_id");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const baseUrl = endpoint.replace(/\/workflows\/run$/, "");
    const startupDeadline = Date.now() + DIFY_RUN_ID_TIMEOUT_MS;
    let chunkCount = 0;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const chunkText = decoder.decode(value, { stream: true });
          chunkCount += 1;
          if (chunkCount <= 3) {
            console.log(
              "[run-mojo-analysis] Dify startup chunk:",
              endpoint,
              "| chunk:",
              chunkCount,
              "| bytes:",
              value.length,
              "| preview:",
              JSON.stringify(chunkText.slice(0, 240)),
            );
          }
          buffer += chunkText;
          const extracted = extractWorkflowStartFromText(buffer);
          if (extracted.workflowRunId) {
            try {
              await reader.cancel();
            } catch {
              // Best-effort cleanup; we already have the run ID.
            }
            return extracted;
          }
          if (chunkText.includes("event: ping")) {
            // Dify heartbeat — the workflow_started event with the run ID arrives
            // in the next chunk. Keep reading instead of switching to log polling.
            console.log("[run-mojo-analysis] Dify startup received ping on chunk", chunkCount, "— continuing SSE read");
          }
        }
      }
    } catch (err) {
      const message = String((err as Error)?.message ?? err);
      if (message.includes("startup-timeout")) {
        console.warn("[run-mojo-analysis] Dify startup stream timed out after response, falling back to workflow logs");
        return await waitForWorkflowRunFromLogs({
          apiKey,
          baseUrl,
          difyUserSessionId,
          deadline: Date.now() + 15000,
        });
      }
      throw err;
    }

    buffer += decoder.decode();
    const extracted = extractWorkflowStartFromText(buffer);
    if (extracted.workflowRunId) return extracted;
    return await waitForWorkflowRunFromLogs({
      apiKey,
      baseUrl,
      difyUserSessionId,
      deadline: Date.now() + 15000,
    });
  } finally {
    clearTimeout(startupTimeout);
  }
}

async function startDifyStreamWithFallbacks(params: {
  apiKey: string;
  baseUrls: string[];
  inputs: Record<string, string>;
  difyUserSessionId: string;
}): Promise<{ workflowRunId: string; taskId: string; baseUrl: string }> {
  const { apiKey, baseUrls, inputs, difyUserSessionId } = params;
  let lastError: Error | null = null;

  for (const baseUrl of baseUrls) {
    try {
      const started = await startDifyStream({
        apiKey,
        endpoint: buildWorkflowRunEndpoint(baseUrl),
        inputs,
        difyUserSessionId,
      });
      return { ...started, baseUrl };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;
      const message = String(error.message || error);
      const retryable =
        message.includes("startup-timeout") ||
        message.toLowerCase().includes("fetch failed") ||
        message.toLowerCase().includes("connection") ||
        message.toLowerCase().includes("network");

      if (!retryable) throw error;
      console.warn("[run-mojo-analysis] retrying Dify start with next base URL after:", message, "| candidate:", baseUrl);
    }
  }

  throw lastError ?? new Error("Failed to start Dify workflow");
}

async function fetchDifyRunResult(params: {
  apiKey: string;
  baseUrl: string;
  runId: string;
}): Promise<{ status: string; outputs: Record<string, unknown>; error: string }> {
  const { apiKey, baseUrl, runId } = params;
  const res = await fetch(buildWorkflowRunDetailEndpoint(baseUrl, runId), {
    headers: { "Authorization": `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(DIFY_POLL_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Dify poll error (${res.status})`);
  const data = asRecord(await res.json()) ?? {};
  const status = String(data.status ?? "").toLowerCase();
  const outputs = asRecord(data.outputs) ?? {};
  const error = String(data.error ?? "").trim();
  return { status, outputs, error };
}


// ── Proposal persistence ──────────────────────────────────────────────────────

async function markFailed(supabase: ReturnType<typeof createClient>, proposalId: string, error: string) {
  await supabase.from("file_proposals").update({
    processing_state: "failed",
    processing_error: error,
    processing_completed_at: new Date().toISOString(),
    summary: "Analysis run failed",
  }).eq("id", proposalId);
}

function extractString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const r = asRecord(value);
  if (r) {
    // Try common text fields in order of preference
    for (const key of ["claim", "text", "signal", "description", "result", "finding"]) {
      if (typeof r[key] === "string" && r[key]) return String(r[key]).trim();
    }
    return JSON.stringify(r);
  }
  return String(value).trim();
}

function readStringArrayFlexible(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(extractString).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(extractString).filter(Boolean);
    } catch { /* fall through */ }
    return value.trim() ? [value.trim()] : [];
  }
  return [];
}

function resolveEvidence(raw: unknown, frameworkResults: unknown): string[] {
  const candidates = readStringArrayFlexible(raw);
  const corrupted = candidates.every((s) => s === "[object Object]" || !s.trim());
  if (!corrupted) return candidates.filter(Boolean);
  // Dify aggregation node serialised objects as [object Object] — fall back to framework result text
  return (Array.isArray(frameworkResults) ? frameworkResults : [])
    .map((r: unknown) => {
      const rec = asRecord(r);
      return rec ? String(rec.result ?? rec.claim ?? rec.text ?? "").trim() : "";
    })
    .filter(Boolean);
}

type SaveResultOpts = {
  jobmapOnly?: boolean;
  journeyKey?: string;
  jobPerformer?: string;
  primaryJob?: string;
};

async function saveResult(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  outputs: Record<string, unknown>,
  opts: SaveResultOpts = {},
) {
  const { jobmapOnly = false, journeyKey = "customer", jobPerformer = "", primaryJob = "" } = opts;

  // Extract job steps first — needed in both full and jobmap-only modes
  const odiJobSteps = extractJobStepsFromOutputs(outputs);
  const odiInternalSteps = extractInternalJobStepsFromOutputs(outputs);

  if (jobmapOnly) {
    // Scoped write: only update job_steps, leave all other artifacts untouched
    const { data: proposalRow } = await supabase
      .from("file_proposals")
      .select("company_id")
      .eq("id", proposalId)
      .maybeSingle();

    if (proposalRow?.company_id && (odiJobSteps.length >= 4 || odiInternalSteps.length >= 4)) {
      await applyJobStepsFromDify(
        supabase,
        String(proposalRow.company_id),
        odiJobSteps,
        odiInternalSteps,
        journeyKey,
        jobPerformer,
        primaryJob,
        proposalId,
      );
    }

    await supabase.from("file_proposals").update({
      processing_state: "ready",
      processing_completed_at: new Date().toISOString(),
      processing_error: null,
      ...(odiJobSteps.length > 0 ? { candidate_job_steps: odiJobSteps } : {}),
    }).eq("id", proposalId);

    console.log("[run-mojo-analysis] jobmap_only save — proposal:", proposalId, "| customer steps:", odiJobSteps.length, "| internal steps:", odiInternalSteps.length, "| journey:", journeyKey);
    return;
  }

  // Full pipeline save
  const summary = String(outputs.summary ?? "").trim();
  if (!summary) {
    console.log("[run-mojo-analysis] saveResult called with empty outputs — skipping");
    return;
  }
  const frameworkResults = readJsonField(outputs.framework_results);
  const evidence = resolveEvidence(outputs.evidence, frameworkResults);
  const contradictions = readJsonField(outputs.contradictions);
  const questionsToVerify = readJsonField(outputs.questions_to_verify);
  const possibleGaps = readJsonField(outputs.possible_gaps);
  const experimentsToRun = readJsonField(outputs.experiments_to_run);
  const confidence = String(outputs.confidence ?? "medium").trim();
  const confidenceReason = String(outputs.confidence_reason ?? "").trim();

  const candidateJobStepsPayload = odiJobSteps.length > 0 ? odiJobSteps : null;

  const { error } = await supabase.from("file_proposals").update({
    summary,
    evidence,
    contradictions,
    questions_to_verify: questionsToVerify,
    possible_gaps: possibleGaps,
    framework_results: frameworkResults,
    experiments_to_run: experimentsToRun,
    confidence,
    confidence_reason: confidenceReason,
    ...(candidateJobStepsPayload ? { candidate_job_steps: candidateJobStepsPayload } : {}),
    processing_state: "ready",
    processing_completed_at: new Date().toISOString(),
    processing_error: null,
  }).eq("id", proposalId);

  if (error) throw new Error(`Failed to save result: ${error.message}`);

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
      sourceType: String(proposalRow.source_type ?? "mojo_analysis"),
      sourceTitle: String(proposalRow.file_name ?? "Mojo analysis proposal"),
      summary,
      evidence,
      contradictions,
      frameworkResults,
      questionsToVerify,
      rawPayload: outputs,
    });

    // Write ODI job maps — customer perspective + internal operational (if Dify outputs both)
    if (odiJobSteps.length >= 4 || odiInternalSteps.length >= 4) {
      await applyJobStepsFromDify(supabase, companyId, odiJobSteps, odiInternalSteps, "customer", jobPerformer, primaryJob, proposalId);
    }

    // ── MojoScore snapshot ────────────────────────────────────────────────────
    // Compute after claims and needs are finalized so the snapshot reflects the
    // full state produced by this analysis run. Routes are not modified here but
    // are read fresh from the DB so the snapshot is always consistent.
    await snapshotMojoScore(supabase, companyId);
  }

  console.log("[run-mojo-analysis] saved proposal:", proposalId, "| odi steps extracted:", odiJobSteps.length);
}

// ── Background monitor ────────────────────────────────────────────────────────

async function monitorInBackground(params: {
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  baseUrl: string;
  proposalId: string;
  saveOpts?: SaveResultOpts;
}) {
  const { supabase, apiKey, baseUrl, proposalId, saveOpts = {} } = params;

  const { data: proposal } = await supabase
    .from("file_proposals")
    .select("dify_workflow_run_id")
    .eq("id", proposalId)
    .single();

  const runId = proposal?.dify_workflow_run_id;
  if (!runId) {
    await markFailed(supabase, proposalId, "No Dify run ID recorded");
    return;
  }

  for (let attempt = 0; attempt < DIFY_MONITOR_MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, DIFY_MONITOR_DELAY_MS));

    try {
      const { status, outputs, error } = await fetchDifyRunResult({ apiKey, baseUrl, runId });

      if (status === "succeeded" || status === "success" || status === "completed") {
        await saveResult(supabase, proposalId, outputs, saveOpts);
        return;
      }
      if (status === "failed" || status === "stopped" || status === "error") {
        await markFailed(supabase, proposalId, error || `Workflow ${status}`);
        return;
      }
      // still running — continue polling
    } catch (err) {
      console.error("[run-mojo-analysis] poll error:", err);
    }
  }

  await markFailed(supabase, proposalId, "Analysis timed out");
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as { company_id?: string; trigger_type?: string; journey_key?: string };
    const { company_id, trigger_type = "manual", journey_key: requestedJourneyKey = "" } = body;

    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

    const jobmapOnly = trigger_type === "jobmap_regenerate";
    const validTriggers = ["manual", "baseline_complete", "scheduled", "jobmap_regenerate"];
    const triggerLabel = validTriggers.includes(trigger_type) ? trigger_type : "manual";

    const DIFY_API_KEY = await resolveMojoAnalysisApiKey();

    if (!DIFY_API_KEY) {
      return jsonResponse({ error: "DIFY_MOJO_ANALYSIS_API_KEY or DIFY_API_KEY not configured" }, 503);
    }

    const baseUrlEnv = Deno.env.get("DIFY_API_BASE_URL");
    const baseUrlFile = baseUrlEnv ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_BASE_URLS = await buildDifyBaseUrlCandidates((baseUrlEnv ?? baseUrlFile ?? "https://api.dify.ai").replace(/\/$/, ""));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Create the proposal row first so startup success/failure is always traceable.
    const { data: proposal, error: insertError } = await supabase
      .from("file_proposals")
      .insert({
        company_id,
        source_type: "mojo_analysis",
        file_name: `mojo-analysis-${triggerLabel}-${new Date().toISOString().slice(0, 10)}`,
        processing_state: "queued",
        processing_started_at: new Date().toISOString(),
        summary: "",
        evidence: [],
        contradictions: [],
        questions_to_verify: [],
        possible_gaps: [],
        framework_results: [],
        experiments_to_run: [],
      })
      .select("id")
      .single();

    if (insertError || !proposal) {
      return jsonResponse({ error: `Failed to create proposal: ${insertError?.message}` }, 500);
    }

    const proposalId = proposal.id as string;
    console.log("[run-mojo-analysis] queued proposal:", proposalId, "trigger:", triggerLabel);

    // Fetch ODI context to pass to Dify — these become named input variables in the workflow
    const [marketDefResult, outcomesResult, problemsResult] = await Promise.all([
      supabase.from("odi_market_definitions")
        .select("job_executor, jtbd")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("managed_outcomes")
        .select("outcome_statement")
        .eq("company_id", company_id)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("strategy_problem_statements")
        .select("statement")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const jobPerformer = String((marketDefResult.data as Record<string, unknown> | null)?.job_executor ?? "").trim();
    const primaryJob = String((marketDefResult.data as Record<string, unknown> | null)?.jtbd ?? "").trim();
    const desiredOutcome = String((outcomesResult.data as Record<string, unknown> | null)?.outcome_statement ?? "").trim();
    const recurringProgressChallenge = String((problemsResult.data as Record<string, unknown> | null)?.statement ?? "").trim();

    console.log("[run-mojo-analysis] odi context — job_performer:", jobPerformer ? "set" : "empty", "| primary_job:", primaryJob ? "set" : "empty", "| desired_outcome:", desiredOutcome ? "set" : "empty", "| challenge:", recurringProgressChallenge ? "set" : "empty");

    const startupInputs = {
      company_id,
      trigger_type: triggerLabel,
      journey_key: requestedJourneyKey || "",
      file_url: "",
      job_performer: jobPerformer,
      primary_job: primaryJob,
      desired_outcome: desiredOutcome,
      recurring_progress_challenge: recurringProgressChallenge,
    };
    const difyUserSessionId = `mojo-analysis:${proposalId}`;

    // ── Step 1: Start Dify workflow synchronously ─────────────────────────────
    // SSE startup must happen before returning the HTTP response so the local
    // Edge Runtime (which has no EdgeRuntime.waitUntil) reliably gets the run ID.
    console.log("[run-mojo-analysis] starting Dify workflow via candidates:", DIFY_BASE_URLS.join(", "));

    let workflowRunId = "";
    let taskId = "";
    let selectedBaseUrl = DIFY_BASE_URLS[0];
    try {
      const started = await startDifyStreamWithFallbacks({
        apiKey: DIFY_API_KEY,
        baseUrls: DIFY_BASE_URLS,
        inputs: startupInputs,
        difyUserSessionId,
      });
      workflowRunId = started.workflowRunId;
      taskId = started.taskId;
      selectedBaseUrl = started.baseUrl;
      console.log("[run-mojo-analysis] selected Dify base URL:", selectedBaseUrl);
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      console.error("[run-mojo-analysis] startup error:", msg);
      await markFailed(supabase, proposalId, msg);
      return jsonResponse({ error: `Failed to start Dify workflow: ${msg}` }, 500);
    }

    if (!workflowRunId) {
      const message = "Failed to start Dify workflow — no run ID returned";
      await markFailed(supabase, proposalId, message);
      return jsonResponse({ error: message }, 500);
    }

    console.log("[run-mojo-analysis] dify run started:", workflowRunId);

    // ── Step 2: Persist run ID synchronously ──────────────────────────────────
    const { error: runningUpdateError } = await supabase.from("file_proposals").update({
      processing_state: "running",
      dify_workflow_run_id: workflowRunId,
      dify_task_id: taskId || null,
    }).eq("id", proposalId);

    if (runningUpdateError) {
      const message = `Failed to persist Dify run ID: ${runningUpdateError.message}`;
      console.error("[run-mojo-analysis] startup persistence error:", message);
      await markFailed(supabase, proposalId, message);
      return jsonResponse({ error: message }, 500);
    }

    // ── Step 3: Poll for completion ───────────────────────────────────────────
    // The Dify workflow is now confirmed running (workflowRunId persisted above).
    // Background the polling monitor. In production, EdgeRuntime.waitUntil keeps
    // the promise alive after the HTTP response. In local dev (supabase functions
    // serve), the server process is long-lived so background promises continue
    // even after the response is sent — no need to block.
    const monitorPromise = monitorInBackground({
      supabase,
      apiKey: DIFY_API_KEY,
      baseUrl: selectedBaseUrl,
      proposalId,
      saveOpts: {
        jobmapOnly,
        journeyKey: requestedJourneyKey || "customer",
        jobPerformer,
        primaryJob,
      },
    }).catch(async (err) => {
      const msg = String((err as Error)?.message ?? err);
      console.error("[run-mojo-analysis] monitor error:", msg);
      await markFailed(supabase, proposalId, msg);
    });

    const registered = waitUntil(monitorPromise);
    if (!registered) {
      // Local dev: supabase functions serve keeps the server alive, so the
      // background promise will continue running after we return the response.
      console.log("[run-mojo-analysis] local dev: waitUntil unavailable; monitor running in background (server is long-lived)");
    }

    return jsonResponse({ proposal_id: proposalId, status: "queued", trigger_type: triggerLabel });
  } catch (err) {
    console.error("[run-mojo-analysis] error:", err);
    return jsonResponse({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
