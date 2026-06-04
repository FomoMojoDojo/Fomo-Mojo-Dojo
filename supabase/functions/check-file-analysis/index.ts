// Poll a file_proposals proposal's Dify workflow run and ingest on success.
// Uses DIFY_API_KEY (not DIFY_MOJO_ANALYSIS_API_KEY) — file analysis runs are
// started under the base Dify app key, not the mojo-analysis key.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestDifyProposalSignals } from "../_shared/evidencePhase1.ts";
import { snapshotMojoScore } from "../_shared/snapshotMojoScore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const DIFY_POLL_TIMEOUT_MS = 4000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        if (trimmed.slice(0, eq).trim() === name) return trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      }
    } catch { /* ignore */ }
  }
}

function readJsonField(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value;
}

function readStringArrayFlexible(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => typeof v === "string" ? v : String(v)).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => typeof v === "string" ? v : String(v)).filter(Boolean);
    } catch { /* fall through */ }
    return value.trim() ? [value.trim()] : [];
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { proposal_id } = await req.json() as { proposal_id?: string };
    if (!proposal_id) return jsonResponse({ error: "proposal_id is required" }, 400);

    // File analysis runs are started under DIFY_API_KEY, not DIFY_MOJO_ANALYSIS_API_KEY.
    const envKey = Deno.env.get("DIFY_API_KEY");
    const DIFY_API_KEY = envKey ?? await readLocalEnvValue("DIFY_API_KEY");
    if (!DIFY_API_KEY) return jsonResponse({ error: "DIFY_API_KEY not configured" }, 503);

    const envBaseUrl = Deno.env.get("DIFY_API_BASE_URL");
    const DIFY_BASE_URL = (envBaseUrl ?? await readLocalEnvValue("DIFY_API_BASE_URL") ?? "https://api.dify.ai/v1").replace(/\/$/, "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: proposal } = await supabase
      .from("file_proposals")
      .select("processing_state, dify_workflow_run_id, company_id, file_name, source_type")
      .eq("id", proposal_id)
      .single();

    if (!proposal) return jsonResponse({ error: "Proposal not found" }, 404);

    // Idempotent: if already terminal, return current state without re-ingesting.
    if (proposal.processing_state !== "running") {
      return jsonResponse({ status: proposal.processing_state });
    }

    const runId = String(proposal.dify_workflow_run_id ?? "").trim();
    if (!runId) {
      await supabase.from("file_proposals").update({
        processing_state: "failed",
        processing_error: "No Dify run ID on record",
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposal_id);
      return jsonResponse({ status: "failed", error: "No Dify run ID on record" });
    }

    const res = await fetch(`${DIFY_BASE_URL}/workflows/run/${runId}`, {
      headers: { "Authorization": `Bearer ${DIFY_API_KEY}` },
      signal: AbortSignal.timeout(DIFY_POLL_TIMEOUT_MS),
    }).catch((err: unknown) => { throw new Error(`Dify poll failed: ${String((err as Error)?.message ?? err)}`); });

    if (!res.ok) {
      console.error("[check-file-analysis] poll error:", res.status, "| run:", runId);
      // Non-fatal: return running so caller retries.
      return jsonResponse({ status: "running", poll_error: res.status });
    }

    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status ?? "").toLowerCase();
    console.log("[check-file-analysis] dify status:", status, "| run:", runId);

    if (status === "succeeded" || status === "success" || status === "completed") {
      const outputs = (data.outputs ?? {}) as Record<string, unknown>;
      const summary = String(outputs.summary ?? "").trim();
      // Dify occasionally returns succeeded with empty outputs — treat as still running.
      if (!summary) {
        console.log("[check-file-analysis] succeeded but outputs empty — retrying");
        return jsonResponse({ status: "running" });
      }

      const evidence = readStringArrayFlexible(outputs.evidence);
      const frameworkResults = readJsonField(outputs.framework_results);
      const contradictions = readJsonField(outputs.contradictions);
      const questionsToVerify = readJsonField(outputs.questions_to_verify);
      const possibleGaps = readJsonField(outputs.possible_gaps) ?? [];
      const experimentsToRun = readJsonField(outputs.experiments_to_run) ?? [];
      const confidence = ["high", "medium", "low"].includes(String(outputs.confidence ?? "").toLowerCase())
        ? String(outputs.confidence).toLowerCase()
        : "medium";
      const confidenceReason = String(outputs.confidence_reason ?? "").trim();

      const { error: updateError } = await supabase.from("file_proposals").update({
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

      if (updateError) {
        console.error("[check-file-analysis] save error:", updateError.message);
        return jsonResponse({ status: "running" });
      }

      if (proposal.company_id) {
        const companyId = String(proposal.company_id);
        await ingestDifyProposalSignals({
          supabase,
          companyId,
          proposalId: proposal_id,
          sourceType: String(proposal.source_type ?? "uploaded_file"),
          sourceTitle: String(proposal.file_name ?? "File analysis"),
          summary,
          evidence,
          contradictions,
          frameworkResults,
          questionsToVerify,
          rawPayload: outputs,
        });
        await snapshotMojoScore(supabase, companyId);
      }

      return jsonResponse({ status: "ready" });
    }

    if (status === "failed" || status === "stopped" || status === "error") {
      const errMsg = String(data.error ?? `Workflow ${status}`);
      await supabase.from("file_proposals").update({
        processing_state: "failed",
        processing_error: errMsg,
        processing_completed_at: new Date().toISOString(),
      }).eq("id", proposal_id);
      return jsonResponse({ status: "failed", error: errMsg });
    }

    return jsonResponse({ status: "running" });
  } catch (err) {
    console.error("[check-file-analysis] error:", err);
    return jsonResponse({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
