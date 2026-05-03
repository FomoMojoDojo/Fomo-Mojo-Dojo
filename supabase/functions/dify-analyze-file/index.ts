import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

// Source types that represent primary customer research — only these may be
// treated as customer-validated in candidate needs outputs.
const CUSTOMER_VALIDATED_SOURCE_TYPES = new Set(["interview", "survey"]);

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
  difyEndpoint: string;
  difyRequestBody: {
    inputs: {
      file_url: string;
      file_name: string;
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

async function runDifyAndPersist({
  supabase,
  difyApiKey,
  difyEndpoint,
  difyRequestBody,
  proposalId,
  sourceType,
}: PersistContext) {
  await supabase
    .from("file_proposals")
    .update({
      processing_state: "running",
      processing_error: null,
      processing_started_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .neq("status", "rejected");

  const difyRes = await fetch(difyEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${difyApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(difyRequestBody),
  });

  const rawResponseText = await difyRes.text();
  console.log("[dify-analyze-file] Dify HTTP status:", difyRes.status);
  console.log("[dify-analyze-file] Dify raw response:", rawResponseText.slice(0, 2000));

  if (!difyRes.ok) {
    await supabase.from("file_proposals").update({
      summary: `Dify workflow error (${difyRes.status})`,
      processing_state: "failed",
      processing_error: rawResponseText.slice(0, 2000),
      processing_completed_at: new Date().toISOString(),
    }).eq("id", proposalId).neq("status", "rejected");
    throw new Error(`Dify workflow error (${difyRes.status}): ${rawResponseText}`);
  }

  let difyResult: Record<string, unknown>;
  try {
    difyResult = JSON.parse(rawResponseText) as Record<string, unknown>;
  } catch {
    await supabase.from("file_proposals").update({
      summary: "Dify returned non-JSON response",
      processing_state: "failed",
      processing_error: "Dify returned non-JSON response",
      processing_completed_at: new Date().toISOString(),
    }).eq("id", proposalId).neq("status", "rejected");
    throw new Error("Dify returned non-JSON response");
  }

  const outputs = (
    (difyResult?.data as Record<string, unknown>)?.outputs ??
    (difyResult?.outputs as Record<string, unknown>) ??
    {}
  ) as Record<string, unknown>;

  const workflowStatus = String(
    ((difyResult?.data as Record<string, unknown>)?.status ?? difyResult?.status ?? "")
  ).trim().toLowerCase();
  const workflowError = String(
    ((difyResult?.data as Record<string, unknown>)?.error ?? difyResult?.error ?? "")
  ).trim();

  if (workflowStatus && workflowStatus !== "succeeded") {
    await supabase.from("file_proposals").update({
      summary: workflowError || `Dify workflow ${workflowStatus}`,
      processing_state: "failed",
      processing_error: workflowError || `Dify workflow ${workflowStatus}`,
      processing_completed_at: new Date().toISOString(),
    }).eq("id", proposalId).neq("status", "rejected");
    throw new Error(`Dify workflow ${workflowStatus}: ${workflowError || "unknown error"}`);
  }

  console.log("[dify-analyze-file] parsed outputs keys:", Object.keys(outputs).join(", ") || "(none)");

  const parsedResult = parseJsonString(outputs.result);
  const resultRecord = asRecord(parsedResult);
  const structuredOutputs = resultRecord ?? outputs;

  const summary = String(
    structuredOutputs.summary ??
    (typeof parsedResult === "string" ? parsedResult : "") ??
    ""
  ).trim();
  const signalType = String(structuredOutputs.signal_type ?? "document").trim().toLowerCase();
  const suggestedAreas = readStringArray(
    structuredOutputs.suggested_areas ?? structuredOutputs.suggested_area
  );
  const rawNeeds: unknown[] = Array.isArray(structuredOutputs.candidate_needs)
    ? (structuredOutputs.candidate_needs as unknown[])
    : [];
  const possibleGaps: unknown[] = Array.isArray(structuredOutputs.possible_gaps)
    ? (structuredOutputs.possible_gaps as unknown[])
    : [];
  const possibleRoutes: unknown[] = Array.isArray(structuredOutputs.possible_routes)
    ? (structuredOutputs.possible_routes as unknown[])
    : [];
  const rawConfidence = String(structuredOutputs.confidence ?? "medium").trim().toLowerCase();
  const confidence = ["high", "medium", "low"].includes(rawConfidence) ? rawConfidence : "medium";
  const questionsToVerify: unknown[] = Array.isArray(structuredOutputs.questions_to_verify)
    ? (structuredOutputs.questions_to_verify as unknown[])
    : [];

  console.log("[dify-analyze-file] parsed — summary length:", summary.length,
    "| areas:", suggestedAreas.length,
    "| needs:", rawNeeds.length,
    "| gaps:", possibleGaps.length,
    "| routes:", possibleRoutes.length,
    "| confidence:", confidence,
  );

  const isCustomerSource = CUSTOMER_VALIDATED_SOURCE_TYPES.has(sourceType ?? "");
  const candidateNeeds = rawNeeds.map((n) => {
    if (typeof n !== "object" || n === null) return n;
    const need = n as Record<string, unknown>;
    if (!isCustomerSource && need.customer_validated !== false) {
      return { ...need, customer_validated: false };
    }
    return need;
  });

  const { error: updateError } = await supabase
    .from("file_proposals")
    .update({
      summary,
      signal_type: signalType,
      suggested_areas: suggestedAreas,
      candidate_needs: candidateNeeds,
      possible_gaps: possibleGaps,
      possible_routes: possibleRoutes,
      confidence,
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

  console.log("[dify-analyze-file] proposal updated, id:", proposalId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json() as {
      fileId?: string;
      filePath?: string;
      fileName?: string;
      fileType?: string;
      companyId?: string;
      sourceType?: string;
    };

    const { fileId, filePath, fileName, fileType, companyId, sourceType } = body;
    console.log("[dify-analyze-file] incoming body:", JSON.stringify({ fileId, filePath: filePath?.slice(0, 40), fileName, fileType, companyId, sourceType }));

    if (!fileId || !filePath || !companyId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fileId, filePath, companyId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const envDifyApiKey = Deno.env.get("DIFY_API_KEY");
    const fileDifyApiKey = envDifyApiKey ? undefined : await readLocalEnvValue("DIFY_API_KEY");
    const DIFY_API_KEY = envDifyApiKey ?? fileDifyApiKey;

    const envDifyBaseUrl = Deno.env.get("DIFY_API_BASE_URL");
    const fileDifyBaseUrl = envDifyBaseUrl ? undefined : await readLocalEnvValue("DIFY_API_BASE_URL");
    const DIFY_API_BASE_URL = (envDifyBaseUrl ?? fileDifyBaseUrl ?? "https://api.dify.ai").replace(/\/$/, "");

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

    if (!DIFY_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Dify is not configured — set DIFY_API_KEY in Supabase secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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

    // Build request body matching the Dify Start node variables:
    // company_id (required), trigger_type, journey_key (required), file_url (required), file_name
    const difyRequestBody = {
      inputs: {
        file_url:     signedData.signedUrl,
        file_name:    fileName ?? "",
        company_id:   companyId,
        trigger_type: "file_analysis",
        journey_key:  "customer",
      },
      response_mode: "blocking",
      user: "system",
    };

    const difyEndpoint = buildDifyWorkflowsRunEndpoint(DIFY_API_BASE_URL);
    console.log("[dify-analyze-file] POST", difyEndpoint);
    console.log("[dify-analyze-file] request body:", JSON.stringify({
      ...difyRequestBody,
      inputs: { ...difyRequestBody.inputs, file_url: difyRequestBody.inputs.file_url.slice(0, 60) + "…" },
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
        signal_type:        "document",
        suggested_areas:    [],
        candidate_needs:    [],
      possible_gaps:      [],
      possible_routes:    [],
      confidence:         "medium",
      questions_to_verify: [],
      status:              "pending",
      processing_state:    "queued",
      processing_error:    null,
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

    const proposalId = String((inserted as Record<string, unknown>)?.id ?? "");

    const backgroundTask = runDifyAndPersist({
      supabase,
      difyApiKey: DIFY_API_KEY,
      difyEndpoint,
      difyRequestBody,
      proposalId,
      sourceType: sourceType ?? "",
    }).catch((error) => {
      console.log("[dify-analyze-file] background error:", String((error as Error)?.message ?? error));
    });

    const registered = waitUntil(backgroundTask);
    console.log("[dify-analyze-file] background task registered:", registered);

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
