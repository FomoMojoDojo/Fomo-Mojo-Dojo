// evaluate-opportunity-alignment: classify a single ODI need/opportunity
// against the company's current strategy cascade.
//
// Input: { need_id, company_id }
// Output: { classification, reason } or { error }
//
// On success, writes strategy_alignment + strategy_alignment_reason +
// strategy_alignment_evaluated_at to the odi_needs row. On LLM/parse failure,
// leaves the row unchanged and returns { error }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";
import { gateStrategyArtifactForExternal } from "../_shared/strategyArtifactGate.ts";
import { gateSubjectForExternal } from "../_shared/driftExternalGate.ts";

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

  let body: { need_id?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { need_id, company_id } = body;
  if (!need_id || !company_id) {
    return jsonResponse({ error: "need_id and company_id are required" }, 400);
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // Fetch need/opportunity
  const { data: needData, error: needError } = await db
    .from("odi_needs")
    .select("id, desired_outcome, odi_canonical_statement, tier, step_label, journey_key, provenance_type")
    .eq("id", need_id)
    .eq("company_id", company_id)
    .maybeSingle();

  if (needError || !needData) {
    return jsonResponse({ error: needError?.message ?? "Need not found" }, 404);
  }

  // DECL-OPP 1a.1 — Option-B subject gate: an internal (declared/manual/NULL-
  // provenance) opportunity must never have its text sent to an external model.
  // Inadmissible → skip the evaluation entirely (no OpenAI, no strategy_alignment
  // write), recording an excluded-by-rule integrity row.
  const subjectGate = await gateSubjectForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    surfaceType: "opportunity",
    surfaceId: String(need_id),
    provenance: (needData as { provenance_type?: string | null }).provenance_type,
    consumer: "evaluate-opportunity-alignment",
  });
  if (!subjectGate.admissible) {
    return jsonResponse({ skipped: true, reason: "internal subject — not externally evaluated", need_id });
  }

  // Fetch most recent strategy cascade
  const { data: cascadeData, error: cascadeError } = await db
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win, artifact_role, provenance_type")
    .eq("company_id", company_id)
    .eq("artifact_role", "market_read")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cascadeError || !cascadeData) {
    return jsonResponse({ error: cascadeError?.message ?? "No strategy cascade found" }, 404);
  }

  // Gate 3a: external-bound cascade content passes the strategy-artifact gate.
  const cascadeDataGate = await gateStrategyArtifactForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    artifact: cascadeData as { artifact_role?: string | null; provenance_type?: string | null },
    artifactKind: "strategy_cascade",
    consumer: "evaluate-opportunity-alignment",
  });
  if (!cascadeDataGate.admissible) {
    return jsonResponse({ error: "No externally admissible strategy cascade found" }, 404);
  }

  const cascade = cascadeData as {
    winning_aspiration: string;
    where_to_play: string;
    how_to_win: string;
  };

  const need = needData as {
    id: string;
    desired_outcome: string;
    odi_canonical_statement?: string | null;
    tier: string;
    step_label: string;
    journey_key: string;
  };

  // Prefer odi_canonical_statement if available; fall back to desired_outcome
  const primaryStatement = need.odi_canonical_statement?.trim() || need.desired_outcome?.trim() || "(not specified)";
  const hasDualForm = !!(need.odi_canonical_statement?.trim() && need.desired_outcome?.trim() &&
    need.odi_canonical_statement.trim() !== need.desired_outcome.trim());

  const statementBlock = hasDualForm
    ? `Canonical statement: ${need.odi_canonical_statement!.trim()}\nDesired outcome (raw): ${need.desired_outcome.trim()}`
    : `Statement: ${primaryStatement}`;

  const systemText = `You are a strategy alignment classifier. Given a company's strategy cascade and a customer opportunity (an ODI-style desired outcome or need statement), classify whether addressing this opportunity directly supports the cascade's where-to-play and how-to-win choices.

Return JSON with:
- classification: one of "aligned", "off_strategy", or "unknown"
- reason: 1–2 sentences explaining the classification in plain language. Name the customer segment or mechanism mismatch directly when relevant.

THREE-AXIS EVALUATION:

AXIS 1 — CUSTOMER RELEVANCE: Is the customer described in this opportunity the same customer the cascade targets? If the opportunity describes needs of an end consumer (personal preferences, home use, individual purchasing decisions) but the cascade targets B2B operators (cafes, retailers, institutional buyers), the opportunity is off_strategy.

AXIS 2 — STRATEGIC MECHANISM: Does addressing this opportunity build or reinforce the company's stated how-to-win mechanism? If the cascade wins by making B2B partners measurably successful through documented processes and partner relationships, then opportunities requiring investment in consumer-facing education, e-commerce experience, or individual preference tracking are off_strategy — they build different capabilities entirely.

AXIS 3 — ASPIRATIONAL FIT: Does this opportunity, if well-served, move the company toward its winning aspiration? Or does it pull resources toward a different market position (e.g., becoming a DTC consumer brand when the aspiration is to be the essential B2B partner for independent operators)?

Classification guide:
- "aligned": All three axes point toward the same customer and winning mechanism the cascade specifies.
- "off_strategy": The opportunity targets a DIFFERENT customer (end consumer vs. B2B operator), or requires building capabilities outside the cascade's how-to-win, or pulls toward a different market position. Indirect downstream benefits do not rescue an off_strategy classification — classify by who directly holds the need, not who might eventually benefit.
- "unknown": Insufficient information to classify confidently — the opportunity or cascade is too vague, or the fit is genuinely ambiguous on multiple axes.

DIRECT BENEFICIARY TEST: Before classifying, ask: who is the person or organization that directly holds this need? If the need is "increase clarity of desired coffee flavor preferences before purchase" or "reduce time finding specialty coffee options locally and online," the direct holder is an individual consumer making personal purchase decisions — not a cafe operator managing their business. Classify accordingly.`;

  const userText = `CASCADE:
Winning aspiration: ${cascade.winning_aspiration}
Where to play: ${cascade.where_to_play}
How to win: ${cascade.how_to_win}

OPPORTUNITY:
Journey: ${need.journey_key} / ${need.step_label}
Tier: ${need.tier}
${statementBlock}`;

  let result: { classification: string; reason: string };
  try {
    result = await callOpenAIJSON({
      apiKey,
      model: "gpt-4.1-mini",
      schemaName: "opportunity_alignment",
      schema: alignmentSchema,
      systemText,
      userText,
      maxOutputTokens: 300,
      temperature: 0.1,
    }) as { classification: string; reason: string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[evaluate-opportunity-alignment] LLM error:", message);
    return jsonResponse({ error: `LLM evaluation failed: ${message}` }, 500);
  }

  const { classification, reason } = result;
  if (!["aligned", "off_strategy", "unknown"].includes(classification)) {
    return jsonResponse({ error: `Invalid classification from LLM: ${classification}` }, 500);
  }

  const { error: updateError } = await db
    .from("odi_needs")
    .update({
      strategy_alignment: classification,
      strategy_alignment_reason: reason,
      strategy_alignment_evaluated_at: new Date().toISOString(),
    })
    .eq("id", need_id)
    .eq("company_id", company_id);

  if (updateError) {
    return jsonResponse({ error: `DB update failed: ${updateError.message}` }, 500);
  }

  return jsonResponse({ classification, reason, need_id });
});
