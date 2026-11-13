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
import { recordModelCall, openaiRecord } from "../_shared/recordModelCall.ts";   // E4d (2026-11-07)
import { resolveModel, signalProvenance, isPublicProvenance } from "../_shared/modelRouter.ts";   // SP-100 (2026-11-12)
import { capabilityRefusal, identifyCaller } from "../_shared/callerGate.ts";

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

  // ── SP-141 / SP-150 step 1: WHO IS CALLING. The gateway accepts the publishable anon key, which
  // identifies nobody, so this is the boundary. 401 no_user before anything else is read.
  const caller = await identifyCaller(req, corsHeaders);
  if (caller instanceof Response) return caller;

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

  // ── SP-150 step 4: authorise THIS caller for THIS company — admin, or a member of it holding
  // structure.route.generate (SP-154). Admin and trusted-internal callers pass. The refusal is
  // identical whether or not the company exists (SP-144): has_capability is asked either way and
  // the company row is never selected to find out.
  const authzRefused = await capabilityRefusal(caller, corsHeaders, "structure.route.generate", company_id);
  if (authzRefused) return authzRefused;

  const db = createClient(supabaseUrl, supabaseKey);

  // --- Fetch route ---
  const { data: routeData, error: routeError } = await db
    .from("routes")
    .select("id, title, short_description, category, rejected_alternatives, what_would_have_to_be_true, source, provenance_type, operator_edited_at")
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
    operatorEditedAt: (routeData as { operator_edited_at?: string | null }).operator_edited_at,
    consumer: "propose-route-changes",
  });
  if (!subjectGate.admissible) {
    return jsonResponse({ skipped: true, reason: "internal subject — not sent for external proposal" });
  }

  // --- Fetch strategy cascade ---
  const { data: cascadeData, error: cascadeError } = await db
    .from("strategy_cascades")
    .select("winning_aspiration, where_to_play, how_to_win, artifact_role, provenance_type, operator_edited_at")
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
    artifact: cascadeData as { artifact_role?: string | null; provenance_type?: string | null; operator_edited_at?: string | null },
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
    .select("claim_text, evidence_excerpt, topic, signal_band, voice_class")
    .eq("company_id", company_id)
    .order("created_at", { ascending: false })
    .limit(20);

  // ── THE EVIDENCE BLOCK IS GATED (SP-100, 2026-11-12) ───────────────────────
  // Before this, the 20 most recent signals of the company went into the prompt with no band,
  // voice or provenance filter — `signal_band` was selected and used only as a label — and
  // callOpenAIJSON sent them unconditionally. The subject gate above protected the ROUTE; the
  // evidence rode along beside it. Now every row whose claim_text or evidence_excerpt travels
  // must carry a public provenance of its own, by the same signalProvenance the router reads.
  // Non-public rows (an uploaded document's `organization` signal, our own `analysis` voice) are
  // WITHHELD from the prompt and counted, exactly as odi_needs are withheld on the council path.
  const signalsAll = Array.isArray(signalRows) ? signalRows : [];
  const signals = signalsAll.filter((row) => {
    const r = row as { signal_band?: string | null; voice_class?: string | null };
    return isPublicProvenance(signalProvenance(r.signal_band, r.voice_class));
  });
  const signalsWithheld = signalsAll.length - signals.length;
  if (signalsWithheld > 0) {
    console.log(
      `[propose-route-changes] evidence gate: ${signalsWithheld} of ${signalsAll.length} signal(s) withheld ` +
      `(non-public provenance); ${signals.length} sent`,
    );
  }
  // Defence in depth: the retained set is what the router sees, so an empty set is fail-closed and
  // a mislabelled row that slipped the filter would still force the call local — where this
  // function has no lane, so it refuses rather than sending.
  const evidenceChoice = resolveModel({
    role: "judge",
    inputs: signals.map((row) => {
      const r = row as { signal_band?: string | null; voice_class?: string | null };
      return { provenance: signalProvenance(r.signal_band, r.voice_class) };
    }),
  });
  // A proposal built on an EMPTY evidence block, when evidence exists but may not travel, is a
  // silent partial: it reads as "there was nothing to go on" when the truth is "there was something
  // we are not allowed to send". So the refusal fires when withholding emptied the block, and also
  // (defence in depth) if a retained row somehow resolves non-public. When SOME public rows remain,
  // the call proceeds on those and the response states how many were withheld.
  if (signalsWithheld > 0 && signals.length === 0) {
    return jsonResponse({
      skipped: true,
      reason: "evidence withheld — not cleared for an outside model",
      signals_withheld: signalsWithheld,
      signals_sent: 0,
    });
  }
  if (signals.length > 0 && evidenceChoice.provider !== "external_openai") {
    return jsonResponse({
      skipped: true,
      reason: "evidence withheld — not cleared for an outside model",
      signals_withheld: signalsWithheld,
      signals_sent: signals.length,
    });
  }
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
      // E4d (ruling, 2026-11-07): one model_calls row per outside call. This function wrote NONE —
      // Q5 was scoped to research-company and the three evaluate-*, so every call it has ever
      // made is absent from the ledger. The hook fires per HTTP response, before parsing.
      onUsage: (usedModel, usage) =>
        void recordModelCall(db as unknown as { from: (t: string) => any }, {
          companyId: String(company_id),
          callSite: "propose-route-changes",
          usage: openaiRecord(usedModel, usage),
        }),
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
