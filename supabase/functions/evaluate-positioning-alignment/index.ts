// evaluate-positioning-alignment: classify a company's positioning canvas
// against its current strategy cascade.
//
// Input: { company_id }
// Output: { classification, reason } or { error }
//
// On success, writes strategy_alignment + strategy_alignment_reason +
// strategy_alignment_evaluated_at to the positioning_canvases row.
// On LLM/parse failure, leaves the row unchanged and returns { error }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";
import { gateStrategyArtifactForExternal } from "../_shared/strategyArtifactGate.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const alignmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    classification: {
      type: "string",
      enum: ["aligned", "off_strategy", "unknown"],
    },
    reason: { type: "string" },
  },
  required: ["classification", "reason"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  let body: { company_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { company_id } = body;
  if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);

  const db = createClient(supabaseUrl, supabaseKey);

  // Fetch most recent positioning canvas for this company
  const { data: canvasData, error: canvasError } = await db
    .from("positioning_canvases")
    .select("id, best_fit_customers, market_category, value_for_customer, unique_attributes_json, competitive_alternatives_json, current_tagline, artifact_role, provenance_type")
    .eq("company_id", company_id)
    .eq("artifact_role", "market_read")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (canvasError || !canvasData) {
    return jsonResponse({ error: canvasError?.message ?? "No positioning canvas found" }, 404);
  }

  // Gate 3a: external-bound artifact content passes the strategy-artifact gate.
  const canvasDataGate = await gateStrategyArtifactForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    artifact: canvasData as { artifact_role?: string | null; provenance_type?: string | null },
    artifactKind: "positioning_canvas",
    consumer: "evaluate-positioning-alignment",
  });
  if (!canvasDataGate.admissible) {
    return jsonResponse({ error: "No externally admissible positioning canvas found" }, 404);
  }

  // Fetch most recent strategy cascade
  const { data: cascadeData, error: cascadeError } = await db
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cascadeError || !cascadeData) {
    return jsonResponse({ error: cascadeError?.message ?? "No strategy cascade found" }, 404);
  }

  const cascadeDataGate = await gateStrategyArtifactForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    artifact: cascadeData as { artifact_role?: string | null; provenance_type?: string | null },
    artifactKind: "strategy_cascade",
    consumer: "evaluate-positioning-alignment",
  });
  if (!cascadeDataGate.admissible) {
    return jsonResponse({ error: "No externally admissible strategy cascade found" }, 404);
  }

  const cascade = cascadeData as {
    winning_aspiration: string;
    where_to_play: string;
    how_to_win: string;
  };

  const canvas = canvasData as {
    id: string;
    best_fit_customers: string;
    market_category: string;
    value_for_customer: string;
    unique_attributes_json: unknown;
    competitive_alternatives_json: unknown;
    current_tagline: string;
  };

  // Flatten unique_attributes
  const attrs = Array.isArray(canvas.unique_attributes_json)
    ? (canvas.unique_attributes_json as Array<{ attribute?: string; name?: string; description?: string }>)
        .map((a, i) => {
          const name = a.attribute ?? a.name ?? `Attribute ${i + 1}`;
          return a.description ? `${name}: ${a.description}` : name;
        })
        .join("; ")
    : "(none)";

  // Flatten competitive_alternatives
  const alts = Array.isArray(canvas.competitive_alternatives_json)
    ? (canvas.competitive_alternatives_json as Array<{ name?: string; reason?: string }>)
        .map((a) => a.name ?? "(unnamed)")
        .join(", ")
    : "(none)";

  const systemText = `You are a strategy alignment classifier. Given a company's strategy cascade and its positioning canvas, classify whether the positioning is aligned with the cascade's where-to-play, winning aspiration, and how-to-win choices.

Return JSON with:
- classification: one of "aligned", "off_strategy", or "unknown"
- reason: 1–2 sentences in plain language. Name the specific match or mismatch — which field of the positioning contradicts or confirms the cascade.

Classification guide:
- "aligned": The positioning targets the same customer segment the cascade specifies (where to play), articulates a value proposition consistent with the cascade's winning mechanism (how to win), and operates in the same market category the cascade implies. The positioning would help this company win within its stated strategy.
- "off_strategy": The positioning targets a different customer segment, claims a different basis to win, or operates in a market category that contradicts the cascade's choices. For example: a positioning aimed at individual consumers when the cascade targets B2B operators, or a positioning that claims to win on price when the cascade specifies winning through quality partnership.
- "unknown": The positioning or cascade is too vague to classify, or the fit is genuinely ambiguous.

ALIGNMENT AXIS: Focus on three signals in order of importance:
1. Customer segment match — does "best fit customers" match "where to play"?
2. Value proposition match — does "value for customer" reflect "how to win"?
3. Market category match — does "market category" reflect the cascade's implied arena?`;

  const userText = `CASCADE:
Winning aspiration: ${cascade.winning_aspiration}
Where to play: ${cascade.where_to_play}
How to win: ${cascade.how_to_win}

POSITIONING CANVAS:
Best fit customers: ${canvas.best_fit_customers || "(none)"}
Market category: ${canvas.market_category || "(none)"}
Value for customer: ${canvas.value_for_customer || "(none)"}
Key differentiators: ${attrs}
Competitive alternatives: ${alts}
Current tagline: ${canvas.current_tagline || "(none)"}`;

  let result: { classification: string; reason: string };
  try {
    result = await callOpenAIJSON({
      apiKey,
      model: "gpt-4.1-mini",
      schemaName: "positioning_alignment",
      schema: alignmentSchema,
      systemText,
      userText,
      maxOutputTokens: 300,
      temperature: 0.1,
    }) as { classification: string; reason: string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[evaluate-positioning-alignment] LLM error:", message);
    return jsonResponse({ error: `LLM evaluation failed: ${message}` }, 500);
  }

  const { classification, reason } = result;
  if (!["aligned", "off_strategy", "unknown"].includes(classification)) {
    return jsonResponse({ error: `Invalid classification from LLM: ${classification}` }, 500);
  }

  const { error: updateError } = await db
    .from("positioning_canvases")
    .update({
      strategy_alignment: classification,
      strategy_alignment_reason: reason,
      strategy_alignment_evaluated_at: new Date().toISOString(),
    })
    .eq("id", canvas.id);

  if (updateError) {
    return jsonResponse({ error: `DB update failed: ${updateError.message}` }, 500);
  }

  return jsonResponse({ classification, reason, canvas_id: canvas.id });
});