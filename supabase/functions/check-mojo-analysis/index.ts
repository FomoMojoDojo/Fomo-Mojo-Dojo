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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { proposal_id } = await req.json() as { proposal_id?: string };
    if (!proposal_id) return jsonResponse({ error: "proposal_id is required" }, 400);

    const apiKeyEnv = Deno.env.get("DIFY_MOJO_ANALYSIS_API_KEY");
    const apiKeyFile = apiKeyEnv ? undefined : await readLocalEnvValue("DIFY_MOJO_ANALYSIS_API_KEY");
    const DIFY_API_KEY = apiKeyEnv ?? apiKeyFile;
    if (!DIFY_API_KEY) return jsonResponse({ error: "DIFY_MOJO_ANALYSIS_API_KEY not configured" }, 503);

    const baseUrlEnv = Deno.env.get("DIFY_API_BASE_URL");
    const baseUrlFile = baseUrlEnv ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_BASE_URL = (baseUrlEnv ?? baseUrlFile ?? "https://api.dify.ai").replace(/\/$/, "");

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

    const res = await fetch(`${DIFY_BASE_URL}/workflows/run/${runId}`, {
      headers: { "Authorization": `Bearer ${DIFY_API_KEY}` },
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
