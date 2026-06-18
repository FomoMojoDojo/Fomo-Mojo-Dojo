// propose-route-changes: generates a proposed update for a single route
// based on current evidence (cascade + recent signals).
//
// Input: { route_id, company_id }
// Output:
//   { proposal_id, reason }     — proposal written
//   { skipped: true, reason }   — proposed_state identical to current_state
//   { error }                   — LLM or DB failure
//
// Supersede is route-scoped: only pending proposals for THIS route_id
// are superseded. Proposals for other routes are unaffected.

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

const proposalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    short_description: { type: "string" },
    rejected_alternatives: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          alternative_title: { type: "string" },
          rejection_reason: { type: "string" },
        },
        required: ["alternative_title", "rejection_reason"],
      },
    },
    what_would_have_to_be_true: {
      type: "array",
      minItems: 2,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          condition: { type: "string" },
          satisfied_flag: { type: "boolean" },
        },
        required: ["condition", "satisfied_flag"],
      },
    },
    proposal_reason: { type: "string" },
  },
  required: [
    "title",
    "short_description",
    "rejected_alternatives",
    "what_would_have_to_be_true",
    "proposal_reason",
  ],
};

type RouteRow = {
  id: string;
  title: string;
  short_description: string | null;
  category: string;
  rejected_alternatives: unknown;
  what_would_have_to_be_true: unknown;
  source: string | null;
};

type Generated = {
  title: string;
  short_description: string;
  rejected_alternatives: Array<{ alternative_title: string; rejection_reason: string }>;
  what_would_have_to_be_true: Array<{ condition: string; satisfied_flag: boolean }>;
  proposal_reason: string;
};

function buildCurrentSnapshot(route: RouteRow): Record<string, unknown> {
  return {
    title: String(route.title ?? ""),
    short_description: String(route.short_description ?? ""),
    rejected_alternatives: Array.isArray(route.rejected_alternatives) ? route.rejected_alternatives : [],
    what_would_have_to_be_true: Array.isArray(route.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [],
  };
}

function buildProposedSnapshot(generated: Generated): Record<string, unknown> {
  return {
    title: String(generated.title ?? ""),
    short_description: String(generated.short_description ?? ""),
    rejected_alternatives: Array.isArray(generated.rejected_alternatives) ? generated.rejected_alternatives : [],
    what_would_have_to_be_true: Array.isArray(generated.what_would_have_to_be_true) ? generated.what_would_have_to_be_true : [],
  };
}

function listTexts(arr: unknown, key: string): string {
  if (!Array.isArray(arr)) return "";
  return (arr as unknown[])
    .map((item) => (typeof item === "object" && item ? String((item as Record<string, unknown>)[key] ?? "") : ""))
    .filter(Boolean)
    .sort()
    .join("|");
}

function snapshotsAreIdentical(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (String(a.title ?? "") !== String(b.title ?? "")) return false;
  if (String(a.short_description ?? "") !== String(b.short_description ?? "")) return false;
  if (listTexts(a.rejected_alternatives, "rejection_reason") !== listTexts(b.rejected_alternatives, "rejection_reason")) return false;
  if (listTexts(a.what_would_have_to_be_true, "condition") !== listTexts(b.what_would_have_to_be_true, "condition")) return false;
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) return jsonResponse({ error: "Supabase env vars missing" }, 500);

  let body: { route_id?: string; company_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { route_id, company_id } = body;
  if (!route_id || !company_id) return jsonResponse({ error: "route_id and company_id are required" }, 400);

  const db = createClient(supabaseUrl, supabaseKey);

  // --- Fetch route ---
  const { data: routeData, error: routeError } = await db
    .from("routes")
    .select("id, title, short_description, category, rejected_alternatives, what_would_have_to_be_true, source, provenance_type")
    .eq("id", route_id)
    .eq("company_id", company_id)
    .eq("relevance_state", "active")
    .maybeSingle();

  if (routeError || !routeData) {
    return jsonResponse({ error: routeError?.message ?? "Route not found" }, 404);
  }
  const route = routeData as RouteRow;
  const currentState = buildCurrentSnapshot(route);

  // DECL-OPP 1a.1 — Option-B subject gate (load-bearing; direct UI "Generate" path
  // is not drift-gated): an internal (declared/NULL-provenance) route must never
  // have its text sent to OpenAI. Inadmissible → skip (no OpenAI, no proposal
  // insert), recording an excluded-by-rule integrity row.
  const subjectGate = await gateSubjectForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    surfaceType: "route",
    surfaceId: String(route_id),
    provenance: (routeData as { provenance_type?: string | null }).provenance_type,
    consumer: "propose-route-changes",
  });
  if (!subjectGate.admissible) {
    return jsonResponse({ skipped: true, reason: "internal subject — not sent for external proposal" });
  }

  // --- Fetch strategy cascade ---
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
    consumer: "propose-route-changes",
  });
  if (!cascadeDataGate.admissible) {
    return jsonResponse({ error: "No externally admissible strategy cascade found" }, 404);
  }
  const cascade = cascadeData as { winning_aspiration: string; where_to_play: string; how_to_win: string };

  // --- Fetch recent signals (naive for MVP — recent for company) ---
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

  // --- Format current WRAP fields for prompt ---
  const raText = Array.isArray(route.rejected_alternatives) && route.rejected_alternatives.length > 0
    ? (route.rejected_alternatives as Array<{ alternative_title?: string; rejection_reason: string }>)
        .map((r, i) => `${i + 1}. ${r.alternative_title ? `${r.alternative_title} — ` : ""}${r.rejection_reason}`)
        .join("\n")
    : "None documented.";

  const wwhtbtText = Array.isArray(route.what_would_have_to_be_true) && route.what_would_have_to_be_true.length > 0
    ? (route.what_would_have_to_be_true as Array<{ condition: string; satisfied_flag: boolean }>)
        .map((c, i) => `${i + 1}. ${c.condition} [${c.satisfied_flag ? "satisfied" : "unproven"}]`)
        .join("\n")
    : "None documented.";

  // --- Build prompts ---
  const systemText =
    `You are a strategy advisor improving a single recommended action route for a company.\n` +
    `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
    `The route uses a Roger Martin WRAP structure: title, short_description, rejected_alternatives, and what_would_have_to_be_true.\n` +
    `Your job: Review the route against the current strategy cascade and available evidence signals. ` +
    `Propose improved versions of fields that are incomplete, stale, or misaligned with the cascade.\n\n` +
    `Rules:\n` +
    `- title: concise (6-10 words), action-oriented, specific to what the route fixes or creates\n` +
    `- short_description: 1-2 sentences, concrete, grounded in evidence. Keep the same route category intent.\n` +
    `- rejected_alternatives: 2-4 items. Each has alternative_title (short) and rejection_reason (why ruled out). Preserve strong existing alternatives unless clearly outdated by new signals.\n` +
    `- what_would_have_to_be_true: 2-4 testable conditions for this route to succeed. Mark satisfied_flag=true only if signals clearly confirm the condition.\n` +
    `- proposal_reason: 1-2 sentences (operator-facing) explaining what changed versus the current route and why. Focus on the specific signal or cascade context driving the update.\n`;

  const userText =
    `STRATEGY CASCADE:\n` +
    `Winning aspiration: ${cascade.winning_aspiration}\n` +
    `Where to play: ${cascade.where_to_play}\n` +
    `How to win: ${cascade.how_to_win}\n\n` +
    `CURRENT ROUTE:\n` +
    `Title: ${route.title}\n` +
    `Category: ${route.category}\n` +
    `Description: ${route.short_description ?? "(none)"}\n\n` +
    `Current rejected alternatives:\n${raText}\n\n` +
    `Current what would have to be true:\n${wwhtbtText}\n\n` +
    `RECENT EVIDENCE SIGNALS:\n${signalsBrief}\n\n` +
    `Based on the cascade and signals, propose improvements to this route. Return the full updated route in JSON.`;

  // --- LLM call ---
  let generated: Generated;
  try {
    generated = await callOpenAIJSON({
      apiKey,
      model: (Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini") as string,
      schemaName: "route_proposal_v1",
      schema: proposalSchema,
      systemText,
      userText,
      maxOutputTokens: 1200,
      temperature: 0.2,
    }) as Generated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[propose-route-changes] LLM error:", message);
    return jsonResponse({ error: `LLM generation failed: ${message}` }, 500);
  }

  const proposedState = buildProposedSnapshot(generated);
  const reason = String(generated.proposal_reason ?? "");

  // --- No-op check ---
  if (snapshotsAreIdentical(currentState, proposedState)) {
    return jsonResponse({ skipped: true, reason: "No meaningful changes from current evidence." });
  }

  // --- Supersede any existing pending proposal for THIS route only ---
  // Scoped to surface_id=route_id — does NOT affect proposals for other routes.
  const { error: supersedeError } = await db
    .from("surface_proposals")
    .update({ status: "superseded", reviewed_at: new Date().toISOString() })
    .eq("surface_type", "route")
    .eq("surface_id", route_id)
    .eq("status", "pending");

  if (supersedeError) {
    console.warn("[propose-route-changes] supersede error (non-fatal):", supersedeError.message);
  }

  // --- Insert new proposal ---
  const { data: inserted, error: insertError } = await db
    .from("surface_proposals")
    .insert({
      company_id,
      surface_type: "route",
      surface_id: route_id,
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
