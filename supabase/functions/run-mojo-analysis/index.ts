import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DIFY_MONITOR_MAX_ATTEMPTS = 240;
const DIFY_MONITOR_DELAY_MS = 5000;
const DIFY_STARTUP_TIMEOUT_MS = 180000;

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

// ── Dify helpers ──────────────────────────────────────────────────────────────

function buildWorkflowRunEndpoint(baseUrl: string) {
  return `${baseUrl}/workflows/run`;
}

function buildWorkflowRunDetailEndpoint(baseUrl: string, runId: string) {
  return `${baseUrl}/workflows/run/${runId}`;
}

async function startDifyStream(params: {
  apiKey: string;
  endpoint: string;
  inputs: Record<string, string>;
}): Promise<{ workflowRunId: string; taskId: string }> {
  const { apiKey, endpoint, inputs } = params;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("startup-timeout"), DIFY_STARTUP_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, response_mode: "streaming", user: "run-mojo-analysis" }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new Error(`Dify error (${response.status}): ${raw}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let workflowRunId = "";
    let taskId = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\n\n+/);
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const dataLine = block.split(/\r?\n/).find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        try {
          const payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
          workflowRunId ||= String(payload.workflow_run_id ?? asRecord(payload.data)?.workflow_run_id ?? "").trim();
          taskId ||= String(payload.task_id ?? asRecord(payload.data)?.task_id ?? "").trim();
          if (workflowRunId) { controller.abort("run-id-captured"); return { workflowRunId, taskId }; }
        } catch { /* skip malformed */ }
      }
    }

    throw new Error("Dify stream ended without workflow_run_id");
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("run-id-captured")) return { workflowRunId: "", taskId: "" };
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDifyRunResult(params: {
  apiKey: string;
  baseUrl: string;
  runId: string;
}): Promise<{ status: string; outputs: Record<string, unknown>; error: string }> {
  const { apiKey, baseUrl, runId } = params;
  const res = await fetch(buildWorkflowRunDetailEndpoint(baseUrl, runId), {
    headers: { "Authorization": `Bearer ${apiKey}` },
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

async function saveResult(
  supabase: ReturnType<typeof createClient>,
  proposalId: string,
  outputs: Record<string, unknown>,
) {
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
    processing_state: "ready",
    processing_completed_at: new Date().toISOString(),
    processing_error: null,
  }).eq("id", proposalId);

  if (error) throw new Error(`Failed to save result: ${error.message}`);
  console.log("[run-mojo-analysis] saved proposal:", proposalId);
  console.log("[run-mojo-analysis] raw outputs:", JSON.stringify(outputs, null, 2));
}

// ── Background monitor ────────────────────────────────────────────────────────

async function monitorInBackground(params: {
  supabase: ReturnType<typeof createClient>;
  apiKey: string;
  baseUrl: string;
  proposalId: string;
}) {
  const { supabase, apiKey, baseUrl, proposalId } = params;

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
        await saveResult(supabase, proposalId, outputs);
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
    const body = await req.json() as { company_id?: string; trigger_type?: string };
    const { company_id, trigger_type = "manual" } = body;

    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

    const validTriggers = ["manual", "baseline_complete", "scheduled"];
    const triggerLabel = validTriggers.includes(trigger_type) ? trigger_type : "manual";

    const apiKeyEnv = Deno.env.get("DIFY_MOJO_ANALYSIS_API_KEY");
    const apiKeyFile = apiKeyEnv ? undefined : await readLocalEnvValue("DIFY_MOJO_ANALYSIS_API_KEY");
    const DIFY_API_KEY = apiKeyEnv ?? apiKeyFile;

    if (!DIFY_API_KEY) {
      return jsonResponse({ error: "DIFY_MOJO_ANALYSIS_API_KEY not configured" }, 503);
    }

    const baseUrlEnv = Deno.env.get("DIFY_API_BASE_URL");
    const baseUrlFile = baseUrlEnv ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_BASE_URL = (baseUrlEnv ?? baseUrlFile ?? "https://api.dify.ai").replace(/\/$/, "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Create queued proposal row and return immediately — all Dify work is background
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

    // Keep Dify start + monitoring in one continuous background promise so the
    // runtime (local or production) only needs to honour waitUntil once.
    const backgroundWork = (async () => {
      try {
        const endpoint = buildWorkflowRunEndpoint(DIFY_BASE_URL);
        const { workflowRunId, taskId } = await startDifyStream({
          apiKey: DIFY_API_KEY,
          endpoint,
          inputs: {
            company_id,
            trigger_type: triggerLabel,
            journey_key: "",
            file_url: "",
          },
        });

        if (!workflowRunId) {
          await markFailed(supabase, proposalId, "Failed to start Dify workflow — no run ID returned");
          return;
        }

        console.log("[run-mojo-analysis] dify run started:", workflowRunId);

        await supabase.from("file_proposals").update({
          processing_state: "running",
          dify_workflow_run_id: workflowRunId,
          dify_task_id: taskId || null,
        }).eq("id", proposalId);

        await monitorInBackground({ supabase, apiKey: DIFY_API_KEY, baseUrl: DIFY_BASE_URL, proposalId });
      } catch (err) {
        const msg = String((err as Error)?.message ?? err);
        console.error("[run-mojo-analysis] background error:", msg);
        await markFailed(supabase, proposalId, msg);
      }
    })();

    const registered = waitUntil(backgroundWork);
    if (!registered) {
      // waitUntil unavailable — await inline so the work completes before the response
      await backgroundWork;
    }

    return jsonResponse({ proposal_id: proposalId, status: "queued", trigger_type: triggerLabel });
  } catch (err) {
    console.error("[run-mojo-analysis] error:", err);
    return jsonResponse({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
