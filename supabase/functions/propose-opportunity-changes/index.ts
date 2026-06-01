// propose-opportunity-changes: generates a proposed update for a single opportunity
// based on current evidence (cascade + active signals).
//
// Input: { opportunity_id, company_id }
// Output:
//   { proposal_id, reason }     — proposal written
//   { skipped: true, reason }   — proposed_state identical to current_state
//   { error }                   — LLM or DB failure
//
// Supersede is opportunity-scoped: only pending proposals for THIS opportunity_id
// are superseded. Proposals for other opportunities are unaffected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";

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

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    desired_outcome: { type: "string" },
    odi_canonical_statement: { type: "string" },
    proposal_reason: { type: "string" },
  },
  required: ["desired_outcome", "odi_canonical_statement", "proposal_reason"],
};

type OpportunityRow = {
  id: string;
  desired_outcome: string;
  odi_canonical_statement: string | null;
  tier: string;
  step_label: string;
  journey_key: string;
  service_state: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  strategy_alignment: string | null;
};

type Generated = {
  desired_outcome: string;
  odi_canonical_statement: string;
  proposal_reason: string;
};

function buildCurrentSnapshot(opp: OpportunityRow): Record<string, unknown> {
  return {
    desired_outcome: String(opp.desired_outcome ?? ""),
    odi_canonical_statement: String(opp.odi_canonical_statement ?? ""),
  };
}

function buildProposedSnapshot(generated: Generated): Record<string, unknown> {
  return {
    desired_outcome: String(generated.desired_outcome ?? ""),
    odi_canonical_statement: String(generated.odi_canonical_statement ?? ""),
  };
}

function snapshotsAreIdentical(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return (
    String(a.desired_outcome ?? "") === String(b.desired_outcome ?? "") &&
    String(a.odi_canonical_statement ?? "") === String(b.odi_canonical_statement ?? "")
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  let body: { opportunity_id?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { opportunity_id, company_id } = body;
  if (!opportunity_id || !company_id) {
    return jsonResponse({ error: "opportunity_id and company_id are required" }, 400);
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // --- Fetch opportunity ---
  const { data: oppData, error: oppError } = await db
    .from("odi_needs")
    .select("id, desired_outcome, odi_canonical_statement, tier, step_label, journey_key, service_state, importance, satisfaction, opportunity_score, strategy_alignment")
    .eq("id", opportunity_id)
    .eq("company_id", company_id)
    .maybeSingle();

  if (oppError || !oppData) {
    return jsonResponse({ error: oppError?.message ?? "Opportunity not found" }, 404);
  }
  const opp = oppData as OpportunityRow;
  const currentState = buildCurrentSnapshot(opp);

  // --- Fetch strategy cascade ---
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
  const cascade = cascadeData as { winning_aspiration: string; where_to_play: string; how_to_win: string };

  // --- Fetch active signals (narrowed to company; limit 20) ---
  const { data: signalRows } = await db
    .from("signals")
    .select("claim_text, evidence_excerpt, topic, signal_band")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(20);

  const signals = Array.isArray(signalRows) ? signalRows : [];
  const signalsBrief = signals.length > 0
    ? signals.map((s, i) => {
        const entry = s as Record<string, unknown>;
        const claim = String(entry.claim_text ?? "");
        const excerpt = String(entry.evidence_excerpt ?? "");
        const topic = String(entry.topic ?? "");
        return `${i + 1}. [${topic}] ${claim}${excerpt ? ` — "${excerpt.slice(0, 120)}"` : ""}`;
      }).join("\n")
    : "No signals available.";

  // --- Build prompts ---
  const systemText =
    `You are a strategy advisor improving a single customer opportunity statement for a company.\n` +
    `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n\n` +
    `The opportunity is documented in two forms:\n` +
    `1. HUMAN FORM (desired_outcome): plain English, what the customer wants to achieve\n` +
    `2. ODI CANONICAL FORM (odi_canonical_statement): follows the strict ODI formula:\n` +
    `   "[Minimize/Maximize/Increase/Decrease] the [variable] when [job context/situation]"\n\n` +
    `CRITICAL COHERENCE RULE: Both forms MUST describe the same underlying customer need.\n` +
    `The odi_canonical_statement must be the formula-translation of desired_outcome — not a different concept.\n` +
    `If you change the human form, the ODI form must reflect that same change. They cannot diverge.\n\n` +
    `Your job: Review the opportunity statement against the current strategy cascade and available evidence.\n` +
    `Propose improved versions that are more precise, evidence-grounded, and aligned with the cascade.\n\n` +
    `Rules:\n` +
    `- desired_outcome: clear plain-English customer outcome (1 sentence, action-oriented)\n` +
    `- odi_canonical_statement: strict ODI formula translation of the same desired_outcome\n` +
    `- proposal_reason: 1-2 sentences explaining what changed and why (operator-facing)\n` +
    `- If the current statements are already precise and evidence-aligned, preserve them and note minimal changes\n`;

  const userText =
    `STRATEGY CASCADE:\n` +
    `Winning aspiration: ${cascade.winning_aspiration}\n` +
    `Where to play: ${cascade.where_to_play}\n` +
    `How to win: ${cascade.how_to_win}\n\n` +
    `CURRENT OPPORTUNITY:\n` +
    `Human form: ${opp.desired_outcome}\n` +
    `ODI canonical form: ${opp.odi_canonical_statement ?? "(not set)"}\n` +
    `Job step context: ${opp.step_label || "(not set)"}\n` +
    `Journey: ${opp.journey_key}\n` +
    `Service state: ${opp.service_state} (importance: ${opp.importance}/10, satisfaction: ${opp.satisfaction}/10)\n` +
    `Strategy alignment: ${opp.strategy_alignment ?? "unknown"}\n\n` +
    `RECENT EVIDENCE SIGNALS:\n${signalsBrief}\n\n` +
    `Based on the cascade and signals, propose improved opportunity statements (both forms, coherent with each other).\n` +
    `Return the full updated opportunity in JSON.`;

  // --- LLM call ---
  let generated: Generated;
  try {
    generated = await callOpenAIJSON({
      apiKey,
      model: (Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini") as string,
      schemaName: "opportunity_proposal_v1",
      schema: proposalSchema,
      systemText,
      userText,
      maxOutputTokens: 600,
      temperature: 0.2,
    }) as Generated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[propose-opportunity-changes] LLM error:", message);
    return jsonResponse({ error: `LLM generation failed: ${message}` }, 500);
  }

  const proposedState = buildProposedSnapshot(generated);
  const reason = String(generated.proposal_reason ?? "");

  // --- No-op check ---
  if (snapshotsAreIdentical(currentState, proposedState)) {
    return jsonResponse({ skipped: true, reason: "No meaningful changes from current evidence." });
  }

  // --- Supersede any existing pending proposal for THIS opportunity only ---
  const { error: supersedeError } = await db
    .from("surface_proposals")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("surface_type", "opportunity")
    .eq("surface_id", opportunity_id)
    .eq("status", "pending");

  if (supersedeError) {
    console.warn("[propose-opportunity-changes] supersede error (non-fatal):", supersedeError.message);
  }

  // --- Insert new proposal ---
  const { data: inserted, error: insertError } = await db
    .from("surface_proposals")
    .insert({
      company_id,
      surface_type: "opportunity",
      surface_id: opportunity_id,
      status: "pending",
      current_state: currentState,
      proposed_state: proposedState,
      reason,
      created_by: null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return jsonResponse({ error: insertError?.message ?? "Failed to insert proposal" }, 500);
  }

  return jsonResponse({ proposal_id: (inserted as Record<string, unknown>).id, reason });
});
