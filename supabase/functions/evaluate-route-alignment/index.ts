// evaluate-route-alignment: classify a single route against the company's
// current strategy cascade.
//
// Input: { route_id, company_id }
// Output: { classification, reason } or { error }
//
// On success, writes strategy_alignment + strategy_alignment_reason +
// strategy_alignment_evaluated_at to the routes row. On LLM/parse failure,
// leaves the row unchanged and returns { error }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAIJSON } from "../_shared/openaiClient.ts";
import { gateStrategyArtifactForExternal } from "../_shared/strategyArtifactGate.ts";
import { gateSubjectForExternal, gateSubjectForLocal } from "../_shared/driftExternalGate.ts";
import { judgeRouteAlignmentLocal } from "../_shared/localRouteAlignmentJudge.ts";
import { FROZEN_COMPANY_IDS } from "../_shared/frozenCompanies.ts";

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

  // Read but DON'T require yet — the local (internal-route) lane needs no OpenAI key.
  // The external path guards on it just before its callOpenAIJSON.
  const apiKey = Deno.env.get("OPENAI_API_KEY");

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
  if (!route_id || !company_id) {
    return jsonResponse({ error: "route_id and company_id are required" }, 400);
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // Fetch route
  const { data: routeData, error: routeError } = await db
    .from("routes")
    .select("id, title, short_description, category, rejected_alternatives, what_would_have_to_be_true, provenance_type")
    .eq("id", route_id)
    .eq("company_id", company_id)
    .maybeSingle();

  if (routeError || !routeData) {
    return jsonResponse({ error: routeError?.message ?? "Route not found" }, 404);
  }

  // DECL-OPP 1a.1 — Option-B subject gate: an internal (declared/NULL-provenance)
  // route must never have its text sent to an external model. Inadmissible → skip
  // (no OpenAI, no strategy_alignment write), recording an excluded-by-rule row.
  const subjectGate = await gateSubjectForExternal({
    supabase: db as unknown as { from: (t: string) => any },
    companyId: String(company_id),
    surfaceType: "route",
    surfaceId: String(route_id),
    provenance: (routeData as { provenance_type?: string | null }).provenance_type,
    consumer: "evaluate-route-alignment",
  });
  if (!subjectGate.admissible) {
    // LOCAL LANE 3b — internal/NULL-provenance routes are judged LOCALLY (llama3:70b,
    // direct Ollama); route text never reaches OpenAI. Frozen reference fixtures
    // (CB1/CB2) are excluded BEFORE any write — their internal routes stay NULL.
    if (FROZEN_COMPANY_IDS.has(String(company_id))) {
      return jsonResponse({ skipped: true, reason: "frozen reference fixture — not evaluated", route_id });
    }
    const localGate = await gateSubjectForLocal({
      supabase: db as unknown as { from: (t: string) => any },
      companyId: String(company_id),
      surfaceType: "route",
      surfaceId: String(route_id),
      provenance: (routeData as { provenance_type?: string | null }).provenance_type,
      consumer: "evaluate-route-alignment",
    });
    if (!localGate.admissible) {
      return jsonResponse({ error: "subject admitted by neither lane (partition violation)", route_id }, 500);
    }
    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    try {
      const verdict = await judgeRouteAlignmentLocal({
        supabase: db as unknown as { from: (t: string) => any },
        companyId: String(company_id),
        routeId: String(route_id),
        route: routeData as Record<string, unknown>,
        ollamaUrl,
      });
      const { error: updErr } = await db
        .from("routes")
        .update({
          strategy_alignment: verdict.classification,
          strategy_alignment_reason: verdict.reason,
          strategy_alignment_evaluated_at: new Date().toISOString(),
        })
        .eq("id", route_id)
        .eq("company_id", company_id);
      if (updErr) return jsonResponse({ error: `DB update failed: ${updErr.message}`, route_id }, 500);
      return jsonResponse({ classification: verdict.classification, reason: verdict.reason, route_id, lane: "local" });
    } catch (err) {
      // Fail-closed: the judge already recorded the failure integrity row. Surface it.
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: `local route alignment failed: ${message}`, route_id, lane: "local" }, 502);
    }
  }

  if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY not configured" }, 500);

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
    consumer: "evaluate-route-alignment",
  });
  if (!cascadeDataGate.admissible) {
    return jsonResponse({ error: "No externally admissible strategy cascade found" }, 404);
  }

  const cascade = cascadeData as {
    winning_aspiration: string;
    where_to_play: string;
    how_to_win: string;
  };

  const route = routeData as {
    id: string;
    title: string;
    short_description?: string | null;
    category: string;
    rejected_alternatives?: Array<{ alternative_title?: string; rejection_reason: string }> | null;
    what_would_have_to_be_true?: Array<{ condition: string; satisfied_flag: boolean }> | null;
  };

  const raText = Array.isArray(route.rejected_alternatives) && route.rejected_alternatives.length > 0
    ? route.rejected_alternatives
        .map((r, i) => `${i + 1}. ${r.alternative_title ? `${r.alternative_title} — ` : ""}${r.rejection_reason}`)
        .join("\n")
    : "None documented.";

  const wwhtbtText = Array.isArray(route.what_would_have_to_be_true) && route.what_would_have_to_be_true.length > 0
    ? route.what_would_have_to_be_true
        .map((c, i) => `${i + 1}. ${c.condition}${c.satisfied_flag ? " [satisfied]" : " [unproven]"}`)
        .join("\n")
    : "None documented.";

  const systemText = `You are a strategy alignment classifier. Given a company's strategy cascade and a candidate route (a recommended action area), classify whether the route is aligned with the cascade's where-to-play and how-to-win choices.

Return JSON with:
- classification: one of "aligned", "off_strategy", or "unknown"
- reason: 1–2 sentences explaining the classification in plain language. Be specific about WHY the route is or isn't aligned — name the customer segment mismatch or mechanism conflict directly.

Classification guide:
- "aligned": The route's focus directly serves the same customer segment and winning mechanism the cascade specifies. The company wins by pursuing this route within the chosen arena.
- "off_strategy": The route targets a DIFFERENT customer segment or a DIFFERENT winning mechanism than the cascade specifies. This includes: routes aimed at end consumers when the cascade targets B2B operators; routes focused on e-commerce/online channels when the cascade targets in-person partnerships; routes that help the wrong buyer. Do not let indirect downstream benefits ("this might help cafes") rescue a route that is fundamentally aimed at a different customer. Classify the route by who directly benefits, not who might indirectly benefit.
- "unknown": Insufficient information to classify confidently — the route or cascade is too vague, or the fit is genuinely ambiguous.

TWO-STEP TEST before classifying:
1. Who is the DIRECT beneficiary of this route? (Not "who might eventually benefit" — who directly does the work or receives the capability the route delivers?) Compare to the cascade's target segment.
2. What must the company BUILD or DO to execute this route? Does that capability match how the cascade says the company wins?

If the route's WWHTBT conditions mention the customer "wanting," "needing," or "using" something that looks like an individual consumer behavior (tracking personal preferences, home brewing, buying coffee for personal use), the primary beneficiary is likely an end consumer — even if the company also serves B2B operators.

Be willing to classify as "off_strategy" when the route targets a different level of the value chain than the cascade specifies. A route that requires building B2C touchpoints (customer-facing apps, education tools for end buyers) is off_strategy for a company whose cascade wins through B2B partnership mechanisms (operator selectivity, documented process, partner success track record).`;

  const userText = `CASCADE:
Winning aspiration: ${cascade.winning_aspiration}
Where to play: ${cascade.where_to_play}
How to win: ${cascade.how_to_win}

ROUTE:
Title: ${route.title}
Category: ${route.category}
Description: ${route.short_description ?? "(none)"}

Rejected alternatives (why other approaches were ruled out):
${raText}

What would have to be true for this route to succeed:
${wwhtbtText}`;

  let result: { classification: string; reason: string };
  try {
    result = await callOpenAIJSON({
      apiKey,
      model: "gpt-4.1-mini",
      schemaName: "route_alignment",
      schema: alignmentSchema,
      systemText,
      userText,
      maxOutputTokens: 300,
      temperature: 0.1,
    }) as { classification: string; reason: string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[evaluate-route-alignment] LLM error:", message);
    return jsonResponse({ error: `LLM evaluation failed: ${message}` }, 500);
  }

  const { classification, reason } = result;
  if (!["aligned", "off_strategy", "unknown"].includes(classification)) {
    return jsonResponse({ error: `Invalid classification from LLM: ${classification}` }, 500);
  }

  const { error: updateError } = await db
    .from("routes")
    .update({
      strategy_alignment: classification,
      strategy_alignment_reason: reason,
      strategy_alignment_evaluated_at: new Date().toISOString(),
    })
    .eq("id", route_id)
    .eq("company_id", company_id);

  if (updateError) {
    return jsonResponse({ error: `DB update failed: ${updateError.message}` }, 500);
  }

  return jsonResponse({ classification, reason, route_id });
});
