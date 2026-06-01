import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestDifyProposalSignals } from "../_shared/evidencePhase1.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const DIFY_POLL_TIMEOUT_MS = 4000;

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readJsonField(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function extractString(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  const r = asRecord(value);
  if (r) {
    for (const key of ["claim", "text", "signal", "description", "result", "finding"]) {
      if (typeof r[key] === "string" && r[key]) return String(r[key]).trim();
    }
    return JSON.stringify(r);
  }
  return String(value).trim();
}

function resolveEvidence(raw: unknown, frameworkResults: unknown): string[] {
  const candidates = readStringArrayFlexible(raw);
  const corrupted = candidates.every((s) => s === "[object Object]" || !s.trim());
  if (!corrupted) return candidates.filter(Boolean);
  return (Array.isArray(frameworkResults) ? frameworkResults : [])
    .map((r: unknown) => {
      const rec = asRecord(r);
      return rec ? String(rec.result ?? rec.claim ?? rec.text ?? "").trim() : "";
    })
    .filter(Boolean);
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
        if (trimmed.slice(0, eqIndex).trim() === name) return trimmed.slice(eqIndex + 1).trim();
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

async function fetchDifyRunDetailWithFallbacks(params: {
  apiKey: string;
  baseUrls: string[];
  runId: string;
}) {
  const { apiKey, baseUrls, runId } = params;
  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (const baseUrl of baseUrls) {
    try {
      const res = await fetch(`${baseUrl}/workflows/run/${runId}`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(DIFY_POLL_TIMEOUT_MS),
      });
      if (res.ok) return res;
      lastResponse = res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError ?? new Error("Failed to reach Dify run detail endpoint");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { proposal_id } = await req.json() as { proposal_id?: string };
    if (!proposal_id) return jsonResponse({ error: "proposal_id is required" }, 400);

    const DIFY_API_KEY = await resolveMojoAnalysisApiKey();
    if (!DIFY_API_KEY) return jsonResponse({ error: "DIFY_MOJO_ANALYSIS_API_KEY or DIFY_API_KEY not configured" }, 503);

    const baseUrlEnv = Deno.env.get("DIFY_API_BASE_URL");
    const baseUrlFile = baseUrlEnv ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_BASE_URLS = await buildDifyBaseUrlCandidates((baseUrlEnv ?? baseUrlFile ?? "https://api.dify.ai").replace(/\/$/, ""));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: proposal } = await supabase
      .from("file_proposals")
      .select("processing_state, dify_workflow_run_id")
      .eq("id", proposal_id)
      .single();

    if (!proposal) return jsonResponse({ error: "Proposal not found" }, 404);
    if (proposal.processing_state !== "running") {
      return jsonResponse({ status: proposal.processing_state });
    }

    const runId = proposal.dify_workflow_run_id;
    if (!runId) {
      await supabase.from("file_proposals").update({
        processing_state: "failed",
        processing_error: "No Dify run ID on record",
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposal_id);
      return jsonResponse({ status: "failed" });
    }

    const res = await fetchDifyRunDetailWithFallbacks({
      apiKey: DIFY_API_KEY,
      baseUrls: DIFY_BASE_URLS,
      runId,
    });

    if (!res.ok) {
      console.error("[check-mojo-analysis] poll error:", res.status);
      return jsonResponse({ status: "running" });
    }

    const data = asRecord(await res.json()) ?? {};
    const status = asString(data.status).toLowerCase();
    console.log("[check-mojo-analysis] dify status:", status, "run:", runId);
    console.log("[check-mojo-analysis] raw outputs:", JSON.stringify(data.outputs, null, 2));

    if (status === "succeeded" || status === "success" || status === "completed") {
      const outputs = asRecord(data.outputs) ?? {};
      const summary = asString(outputs.summary).trim();
      // Dify sometimes returns succeeded with empty outputs — treat as still running
      if (!summary) {
        console.log("[check-mojo-analysis] succeeded but outputs empty — retrying");
        return jsonResponse({ status: "running" });
      }
      const frameworkResults = readJsonField(outputs.framework_results);
      const evidence = resolveEvidence(outputs.evidence, frameworkResults);
      const contradictions = readJsonField(outputs.contradictions);
      const questionsToVerify = readJsonField(outputs.questions_to_verify);
      const possibleGaps = readJsonField(outputs.possible_gaps);
      const experimentsToRun = readJsonField(outputs.experiments_to_run);
      const confidence = asString(outputs.confidence || "medium").trim();
      const confidenceReason = asString(outputs.confidence_reason).trim();

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
      }).eq("id", proposal_id);

      if (error) {
        console.error("[check-mojo-analysis] save error:", error.message);
        return jsonResponse({ status: "running" });
      }

      const { data: proposalRow } = await supabase
        .from("file_proposals")
        .select("company_id, file_name, source_type")
        .eq("id", proposal_id)
        .maybeSingle();

      if (proposalRow?.company_id) {
        await ingestDifyProposalSignals({
          supabase,
          companyId: String(proposalRow.company_id),
          proposalId: proposal_id,
          sourceType: String(proposalRow.source_type ?? "mojo_analysis"),
          sourceTitle: String(proposalRow.file_name ?? "Mojo analysis proposal"),
          summary,
          evidence,
          contradictions,
          frameworkResults,
          questionsToVerify,
          rawPayload: outputs,
        });
      }
      return jsonResponse({ status: "ready" });
    }

    if (status === "failed" || status === "stopped" || status === "error") {
      const errMsg = asString(data.error) || `Workflow ${status}`;
      await supabase.from("file_proposals").update({
        processing_state: "failed",
        processing_error: errMsg,
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposal_id);
      return jsonResponse({ status: "failed", error: errMsg });
    }

    return jsonResponse({ status: "running" });
  } catch (err) {
    console.error("[check-mojo-analysis] error:", err);
    return jsonResponse({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
