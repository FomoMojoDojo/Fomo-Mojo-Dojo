import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  buildFrameworkBrief,
  getFrameworkRoutingPlan,
} from "../_shared/frameworkLibrary.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};
const PLAIN_LANGUAGE_RULES =
  "Writing style rules: Use clear, plain language that a non-expert can understand. " +
  "Avoid consulting jargon, business cliches, and buzzwords. " +
  "Prefer concrete wording over abstract phrasing. Keep sentences short and direct. " +
  "For ODI needs and outcomes, keep one idea per sentence and use plain wording (for example: 'tracked decision results'). " +
  "Never mention framework creator names in labels or recommendations. " +
  "If source evidence includes direct quotes, preserve them verbatim. " +
  "If company-specific phrasing/taglines exist, keep them unchanged and optionally add a second line prefixed exactly with 'Suggested clearer version:' if clarity is needed.";

type RecommendationRow = {
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  source_basis: string;
  references: string[];
};

type CouncilKey = "strategy_council" | "mojo_council";
type ProcessStage = "diagnose" | "focus" | "flow";
type StrategicGoalCardKey = "defend_market_share" | "grow_revenue" | "expand_market_share" | "unclear";

type StrategicGoalCardProfile = {
  key: StrategicGoalCardKey;
  label: string;
  confidence: number;
  rationale: string;
  signals: string[];
};

type CouncilProfile = {
  key: CouncilKey;
  label: string;
  systemText: string;
  userTextTail: string;
  maxOutputTokens: number;
  temperature: number;
  contextMaxChars: number;
  modelTimeoutMs: number;
};

const STRATEGY_COUNCIL_PROFILE: CouncilProfile = {
  key: "strategy_council",
  label: "Strategy Council",
  systemText:
    "You are a five-voice council review panel for business decisions. " +
    "Panel voices: Steve Jobs (visionary), Steven Bartlett (entrepreneur), Alex Hormozi (marketing strategist), Tony Robbins (integration and momentum), Daniel Priestly (key person of influence). " +
    "Have the panel challenge assumptions until they converge on practical consensus recommendations. " +
    "Apply strongest scrutiny to evidence quality, positioning clarity, customer-job clarity, strategy coherence, and execution readiness. " +
    "Use weakest-link reasoning: if one critical area is weak, prioritize that first. " +
    "If evidence conflicts, call out the conflict and likely reason. " +
    "Do not invent evidence. Do not mention framework creator names. " +
    "Do not ask questions or wait for answers. Produce recommendations immediately from available information only.",
  userTextTail:
    "Return only one JSON object with keys summary, panel_discussion, and recommendations. " +
    "summary: include top results for this company and the most important execution focus now. " +
    "panel_discussion: short transcript-style panel debate showing distinct perspectives and where they converged. " +
    "recommendations: array up to 12 items; each item must include title, recommendation, rationale, category, priority, confidence, source_basis, references. " +
    "Focus on company-specific results and suggestions only. " +
    "Never ask clarifying questions in output.",
  maxOutputTokens: 2200,
  temperature: 0.1,
  contextMaxChars: 50_000,
  modelTimeoutMs: 75_000,
};

const MOJO_COUNCIL_PROFILE: CouncilProfile = {
  key: "mojo_council",
  label: "Mojo Council",
  systemText:
    "You are a strategic discussion panel of seven experts helping determine the best way forward for a company from provided evidence. " +
    "Panel members and lenses: " +
    "Chip & Dan Heath (clarity, simplification, stickiness), " +
    "April Dunford (differentiated positioning and market context), " +
    "Roger Martin (where to play/how to win strategic choices), " +
    "Jonah Berger (behavioral adoption, traction, spread), " +
    "Teresa Torres (continuous discovery and evidence gaps), " +
    "Donald Miller (clear customer-facing messaging), " +
    "Tony Ulwick (ODI/JTBD, core job clarity, desired outcomes, underserved needs, opportunity prioritization). " +
    "Run a rigorous panel-style discussion with distinct voices, productive disagreement, and explicit tradeoffs. " +
    "Do not collapse into one blended opinion until final synthesis. " +
    "Do not confuse strategy with goals, positioning with messaging, or tactics with strategy. " +
    "Do not confuse discovery with ODI-based opportunity assessment. " +
    "Separate what is known, assumed, needs validation, and should be decided now. " +
    "If multiple issue types exist, rank them by importance. " +
    "Do not invent evidence. If evidence conflicts, call it out and explain likely cause. " +
    "This workflow is asynchronous: do not ask the user questions, do not request feedback, and do not wait for replies. " +
    "Produce the strongest recommendation from available evidence only.",
  userTextTail:
    "Return only one JSON object with keys summary, panel_discussion, and recommendations. " +
    "summary: provide a concise synthesis with these headings in order: " +
    "1) What the panel thinks is really going on, " +
    "2) Panel discussion, " +
    "3) Core diagnosis, " +
    "4) Key strategic issue, " +
    "5) Main risks and blind spots, " +
    "6) Recommended way forward, " +
    "7) Immediate next actions, " +
    "8) Open questions that still need validation. " +
    "Keep it practical and company-specific. " +
    "panel_discussion: show all seven voices challenging each other, surfacing tradeoffs, and converging on decisions. " +
    "recommendations: array up to 12 items; each item must include title, recommendation, rationale, category, priority, confidence, source_basis, references. " +
    "Do not ask questions in output.",
  maxOutputTokens: 2600,
  temperature: 0.12,
  contextMaxChars: 28_000,
  modelTimeoutMs: 75_000,
};

const COUNCIL_PROFILES: Record<CouncilKey, CouncilProfile> = {
  strategy_council: STRATEGY_COUNCIL_PROFILE,
  mojo_council: MOJO_COUNCIL_PROFILE,
};

function normalizeCouncilKey(value: unknown): CouncilKey {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "mojo_council" ? "mojo_council" : "strategy_council";
}

function normalizePanelDiscussion(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, 12_000);
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 12_000);
  }
  if (value && typeof value === "object") {
    const row = value as Record<string, unknown>;
    const transcript = String(row.transcript || row.discussion || row.content || "").trim();
    return transcript.slice(0, 12_000);
  }
  return "";
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isMissingTableError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  const code = String(err?.code || "").trim();
  const message = String(err?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asText(value: unknown, fallback = "") {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : fallback;
}

function sliceArray<T>(value: unknown, limit: number): T[] {
  return Array.isArray(value) ? (value as T[]).slice(0, limit) : [];
}

function pick(row: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

function truncateText(text: string, maxChars = 120_000) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Context truncated by ${text.length - maxChars} characters]`;
}

function safeParseJsonObject(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object") return input as Record<string, unknown>;
  if (typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    // continue to brace slicing fallback
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1));
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = 90_000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("abort")) {
      throw new Error(`Council model request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractResponsesOutputText(data: unknown): string | null {
  const row = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (typeof row.output_text === "string" && row.output_text.trim()) return row.output_text;

  const out = Array.isArray(row.output) ? row.output : [];
  for (const item of out) {
    if (item?.type !== "message") continue;
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === "output_text" && typeof part?.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  return null;
}

async function callOpenAIJSON(opts: {
  apiKey: string;
  model: string;
  systemText: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}) {
  const {
    apiKey,
    model,
    systemText,
    userText,
    maxOutputTokens = 3500,
    temperature = 0.15,
    timeoutMs = 55_000,
  } = opts;

  const buildBody = (outputBudget: number, retryNote = "") => ({
    model,
    store: false,
    temperature,
    max_output_tokens: outputBudget,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${systemText}\n\n${PLAIN_LANGUAGE_RULES}${retryNote ? `\n\n${retryNote}` : ""}`,
        }],
      },
      { role: "user", content: [{ type: "input_text", text: userText }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "council_response",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: true,
          required: ["summary", "recommendations"],
          properties: {
            summary: { type: "string" },
            panel_discussion: {
              anyOf: [
                { type: "string" },
                { type: "array", items: { type: "string" } },
                { type: "null" },
              ],
            },
            recommendations: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: true,
                required: ["title", "recommendation"],
                properties: {
                  title: { type: "string" },
                  recommendation: { type: "string" },
                  rationale: { type: "string" },
                  category: { type: "string" },
                  priority: { type: "string" },
                  confidence: { type: "number" },
                  source_basis: { type: "string" },
                  references: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  });

  const budgets = [maxOutputTokens, Math.round(maxOutputTokens * 1.7)];

  for (let attempt = 0; attempt < budgets.length; attempt++) {
    const retryNote =
      attempt === 0
        ? ""
        : "Your previous response was truncated or invalid. Return one complete JSON object that exactly matches the schema.";

    const response = await fetchWithTimeout(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(buildBody(budgets[attempt], retryNote)),
      },
      timeoutMs,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI council model error ${response.status}: ${errorText}`);
    }

    const payload = await response.json();
    const text = extractResponsesOutputText(payload);
    const parsed = safeParseJsonObject(text);
    if (parsed) return parsed;

    const lower = String(text || "").toLowerCase();
    const truncated = lower.includes("unterminated") || lower.includes("unexpected end");
    if (attempt < budgets.length - 1 && truncated) continue;
    throw new Error("OpenAI council model returned non-JSON output.");
  }

  throw new Error("OpenAI council JSON generation failed after retries");
}

function toPercent(value: unknown, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return clamp(fallback, 0, 100);
  if (num <= 1 && num >= 0) return clamp(num * 100, 0, 100);
  return clamp(num, 0, 100);
}

function inferSourceTierLabel(inputFiles: Array<Record<string, unknown>>) {
  const tags = inputFiles.flatMap((file) =>
    Array.isArray(file.tags) ? (file.tags as unknown[]).map((tag) => String(tag || "").trim().toLowerCase()) : []
  );
  if (tags.some((tag) => tag.includes("implemented"))) return "implemented_tested";
  if (tags.some((tag) => tag.includes("evidence") || tag.includes("primary"))) return "evidence";
  if (tags.some((tag) => tag.includes("company"))) return "company";
  return "public";
}

function sourceTierCountsFromInputs(inputs: Array<Record<string, unknown>>) {
  const counts = {
    public: 0,
    company: 0,
    evidence: 0,
    implemented_tested: 0,
  };

  for (const input of inputs) {
    const files = sliceArray<Record<string, unknown>>(input.input_files, 100);
    for (const file of files) {
      const tier = inferSourceTierLabel([file]) as keyof typeof counts;
      counts[tier] += 1;
    }
  }

  return counts;
}

function nestedNumber(value: unknown, path: string[]) {
  let cursor: unknown = value;
  for (const key of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return typeof cursor === "number" && Number.isFinite(cursor) ? cursor : null;
}

function detectTestedSignal(areaScoresJson: unknown) {
  return (
    nestedNumber(areaScoresJson, ["evidence", "implementation_tested"]) ??
    nestedNumber(areaScoresJson, ["implementation", "tested"]) ??
    nestedNumber(areaScoresJson, ["execution", "tested"]) ??
    0
  );
}

function inferStrategicGoalCard(args: {
  strategicProblems: Array<Record<string, unknown>>;
  opportunities: Array<Record<string, unknown>>;
  routes: Array<Record<string, unknown>>;
  inputs: Array<Record<string, unknown>>;
}): StrategicGoalCardProfile {
  const corpus = [
    ...args.strategicProblems.flatMap((row) => [
      asText(row.statement, ""),
      asText(row.problem_statement, ""),
      asText(row.title, ""),
      asText(row.description, ""),
    ]),
    ...args.opportunities.flatMap((row) => [
      asText(row.outcome, ""),
      asText(row.description, ""),
      asText(row.journey_key, ""),
    ]),
    ...args.routes.flatMap((row) => [
      asText(row.title, ""),
      asText(row.description, ""),
      asText(row.why_this_matters, ""),
    ]),
    ...args.inputs.flatMap((row) => [
      asText(row.input_label, ""),
      asText(row.description, ""),
      asText(row.why_it_matters, ""),
      asText(row.sub_group, ""),
      asText(row.group_label, ""),
    ]),
  ]
    .map((item) => item.toLowerCase().trim())
    .filter(Boolean)
    .join(" \n ");

  const signalMap: Array<{
    key: Exclude<StrategicGoalCardKey, "unclear">;
    label: string;
    keywords: string[];
  }> = [
    {
      key: "defend_market_share",
      label: "Defend Market Share",
      keywords: [
        "churn",
        "retention",
        "renewal",
        "defend",
        "erosion",
        "price pressure",
        "satisfaction slipping",
        "market share declining",
        "baseline expectations",
        "parity",
      ],
    },
    {
      key: "grow_revenue",
      label: "Grow Revenue",
      keywords: [
        "revenue",
        "pipeline",
        "pricing",
        "monetization",
        "upsell",
        "cross-sell",
        "arpu",
        "margin",
        "willingness to pay",
        "bookings",
      ],
    },
    {
      key: "expand_market_share",
      label: "Expand Market Share",
      keywords: [
        "acquisition",
        "new customers",
        "competitor",
        "new entrants",
        "switch",
        "win rate",
        "category expansion",
        "share growth",
        "differentiat",
      ],
    },
  ];

  const scored = signalMap.map((card) => {
    const hits = card.keywords.filter((keyword) => corpus.includes(keyword));
    return { ...card, score: hits.length, hits };
  });
  const ranked = scored.sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked[1];

  if (!top || top.score <= 0) {
    return {
      key: "unclear",
      label: "Unclear",
      confidence: 35,
      rationale: "Signal mix does not yet indicate one dominant strategic goal card.",
      signals: ["No high-confidence keyword cluster found across current context."],
    };
  }

  const spread = Math.max(0, top.score - (second?.score || 0));
  const confidence = clamp(54 + spread * 9 + Math.min(12, top.score * 2), 54, 92);
  const signalHits = top.hits.slice(0, 6).map((hit) => `Matched signal: ${hit}`);
  const rationale = `Current context most strongly aligns with ${top.label.toLowerCase()} based on observed signal language.`;

  return {
    key: top.key,
    label: top.label,
    confidence: Math.round(confidence),
    rationale,
    signals: signalHits.length > 0 ? signalHits : [`Keyword score: ${top.score}`],
  };
}

function stageLabel(stage: ProcessStage) {
  if (stage === "diagnose") return "Diagnose";
  if (stage === "focus") return "Focus";
  return "Flow";
}

function buildProcessStageProfile(args: {
  company: Record<string, unknown>;
  contextPayload: Record<string, unknown>;
}) {
  const strategicProblems = sliceArray<Record<string, unknown>>(args.contextPayload.strategic_problems, 400);
  const assumptions = sliceArray<Record<string, unknown>>(args.contextPayload.strategy_assumptions, 400);
  const inputs = sliceArray<Record<string, unknown>>(args.contextPayload.inputs, 800);
  const jobSteps = sliceArray<Record<string, unknown>>(args.contextPayload.job_steps, 1000);
  const odiNeeds = sliceArray<Record<string, unknown>>(args.contextPayload.odi_needs, 1200);
  const opportunities = sliceArray<Record<string, unknown>>(args.contextPayload.opportunities, 800);
  const routes = sliceArray<Record<string, unknown>>(args.contextPayload.routes, 800);
  const sourceCounts = sourceTierCountsFromInputs(inputs);
  const testedSignal = detectTestedSignal(args.company.area_scores_json);
  const strategicGoalCard = inferStrategicGoalCard({
    strategicProblems,
    opportunities,
    routes,
    inputs,
  });

  const hasDiagnosisCore = strategicProblems.length > 0 || inputs.length > 0 || assumptions.length > 0;
  const hasCompanyInfo = sourceCounts.company + sourceCounts.evidence + sourceCounts.implemented_tested > 0;
  const hasPrimaryEvidence = sourceCounts.evidence + sourceCounts.implemented_tested > 0;
  const hasTestingEvidence = sourceCounts.implemented_tested > 0 || testedSignal >= 60;
  const hasFocusArtifacts = (jobSteps.length > 0 && odiNeeds.length > 0) || opportunities.length > 0;
  const hasFlowArtifacts = routes.length > 0 || hasTestingEvidence;

  let stage: ProcessStage = "diagnose";
  if (hasFlowArtifacts && hasFocusArtifacts && hasDiagnosisCore && hasPrimaryEvidence) {
    stage = "flow";
  } else if (hasFocusArtifacts || (hasDiagnosisCore && hasCompanyInfo)) {
    stage = "focus";
  }

  const objective =
    stage === "diagnose"
      ? "Find the right strategic problem and highest-risk evidence gaps."
      : stage === "focus"
        ? "Define and prioritize the best opportunities to achieve desired outcomes."
        : "Guide implementation with measurable learning loops, coaching, and execution support.";

  const nextGate =
    stage === "diagnose"
      ? "Agree one decision-level strategic problem and top evidence gaps before solution commitments."
      : stage === "focus"
        ? "Commit one prioritized route tied to ODI outcomes and explicit success metrics."
        : "Run implementation with owner checkpoints and convert testing evidence into score and route updates.";

  const stageGuidance =
    stage === "diagnose"
      ? [
          "Prioritize recommendations that sharpen problem framing and expose weak evidence quickly.",
          "Convert public findings into concrete next evidence actions (interviews, company docs, direct proof).",
          "Avoid premature implementation plans when diagnosis is still weak.",
          strategicGoalCard.key === "unclear"
            ? "Resolve strategic goal card ambiguity (defend, grow, expand) before committing route mix."
            : `Use the inferred strategic goal card (${strategicGoalCard.label}) as a working hypothesis, then validate quickly.`,
        ]
      : stage === "focus"
        ? [
            "Prioritize recommendations that rank opportunities against ODI outcomes and strategic choices.",
            "Integrate public and uploaded company evidence before route selection.",
            "Produce one clear next route with rationale, expected outcome movement, and validation plan.",
            `Keep route sequencing coherent with the strategic goal card: ${strategicGoalCard.label}.`,
          ]
        : [
            "Prioritize recommendations that improve implementation sequencing, enablement, and adoption.",
            "Use tested evidence signals to refine routes and de-risk execution.",
            "Highlight coaching/training actions and measurable checkpoints for sustained execution quality.",
            "Run explicit interest and commitment validation loops before broad scale-up bets.",
          ];

  const evidenceSummary =
    `public:${sourceCounts.public}, company:${sourceCounts.company}, ` +
    `primary:${sourceCounts.evidence}, tested:${sourceCounts.implemented_tested}, tested_signal:${Math.round(testedSignal)}`;

  const rationale =
    stage === "diagnose"
      ? "Current context is still weighted toward early evidence and unresolved framing."
      : stage === "focus"
        ? "There is enough context to prioritize opportunities, but route commitment still needs tighter evidence alignment."
        : "Evidence and execution artifacts indicate readiness to optimize implementation and learning loops.";

  return {
    stage,
    label: stageLabel(stage),
    objective,
    nextGate,
    stageGuidance,
    evidenceSummary,
    rationale,
    sourceCounts,
    testedSignal,
    hasPrimaryEvidence,
    hasTestingEvidence,
    strategicGoalCard,
  };
}

function buildDeterministicCouncilOutput(args: {
  councilProfile: CouncilProfile;
  company: Record<string, unknown>;
  contextPayload: Record<string, unknown>;
  stageProfile: {
    stage: ProcessStage;
    label: string;
    objective: string;
    nextGate: string;
    stageGuidance: string[];
    evidenceSummary: string;
    rationale: string;
    sourceCounts: {
      public: number;
      company: number;
      evidence: number;
      implemented_tested: number;
    };
    testedSignal: number;
    hasPrimaryEvidence: boolean;
    hasTestingEvidence: boolean;
    strategicGoalCard: StrategicGoalCardProfile;
  };
  modelFailure?: string;
}) {
  const companyName = asText(args.company.name, "Company");
  const strategicProblems = sliceArray<Record<string, unknown>>(args.contextPayload.strategic_problems, 400);
  const assumptions = sliceArray<Record<string, unknown>>(args.contextPayload.strategy_assumptions, 400);
  const inputs = sliceArray<Record<string, unknown>>(args.contextPayload.inputs, 800);
  const opportunities = sliceArray<Record<string, unknown>>(args.contextPayload.opportunities, 800);
  const routes = sliceArray<Record<string, unknown>>(args.contextPayload.routes, 800);
  const positioningCanvases = sliceArray<Record<string, unknown>>(args.contextPayload.positioning_canvases, 100);
  const jobSteps = sliceArray<Record<string, unknown>>(args.contextPayload.job_steps, 1000);
  const odiNeeds = sliceArray<Record<string, unknown>>(args.contextPayload.odi_needs, 1200);

  const recommendations: RecommendationRow[] = [];
  const addRecommendation = (row: RecommendationRow) => {
    if (recommendations.length >= 12) return;
    recommendations.push(row);
  };

  const sourceCounts = args.stageProfile.sourceCounts;

  if (args.councilProfile.key === "mojo_council") {
    const openAssumptions = assumptions.filter((row) => asText(row.status, "open").toLowerCase() !== "reconciled");
    const incompleteInputs = inputs
      .map((input) => {
        const done = Boolean(input.done);
        const completion = toPercent(input.completion, done ? 100 : 0);
        return { input, completion };
      })
      .filter((row) => row.completion < 70)
      .sort((a, b) => a.completion - b.completion);

    if (args.stageProfile.stage === "diagnose") {
      addRecommendation({
        title: "Diagnose first: lock the real problem and evidence gaps",
        recommendation:
          "Use this cycle to confirm one decision-level strategic problem, list the top evidence gaps, and define the fastest evidence actions before committing solution routes.",
        rationale:
          "The process is in Diagnose mode, so clarity and evidence quality should lead before execution planning.",
        category: "diagnosis",
        priority: "high",
        confidence: 84,
        source_basis: "process_stage.diagnose",
        references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
      });
    } else if (args.stageProfile.stage === "focus") {
      addRecommendation({
        title: "Focus now: prioritize opportunities tied to outcomes",
        recommendation:
          "Rank opportunities against ODI outcomes and strategic fit, then commit one route with explicit expected outcome movement and validation criteria.",
        rationale:
          "The process is in Focus mode, so decision quality depends on disciplined prioritization, not broad execution.",
        category: "focus",
        priority: "high",
        confidence: 82,
        source_basis: "process_stage.focus",
        references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
      });
    } else {
      addRecommendation({
        title: "Flow now: improve implementation quality and learning cadence",
        recommendation:
          "Run the active route with owner checkpoints, coaching/training support, and test-and-learn loops that feed evidence back into score updates.",
        rationale:
          "The process is in Flow mode, so the highest leverage is execution quality and measurable learning, not re-diagnosis.",
        category: "execution",
        priority: "high",
        confidence: 83,
        source_basis: "process_stage.flow",
        references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
      });
    }

    if (args.stageProfile.strategicGoalCard.key === "unclear") {
      addRecommendation({
        title: "Set one strategic goal card before route expansion",
        recommendation:
          "Pick one dominant near-term goal card (Defend Market Share, Grow Revenue, or Expand Market Share) and use it as the route sequencing anchor.",
        rationale:
          "Without a declared goal card, prioritization tends to mix conflicting tradeoffs and weakens recommendation clarity.",
        category: "Focus",
        priority: "high",
        confidence: 66,
        source_basis: "strategic_goal_card.inference_unclear",
        references: args.stageProfile.strategicGoalCard.signals,
      });
    } else {
      addRecommendation({
        title: `Strategic goal anchor: ${args.stageProfile.strategicGoalCard.label}`,
        recommendation:
          `Treat ${args.stageProfile.strategicGoalCard.label.toLowerCase()} as the current prioritization anchor and align route choices to this tradeoff profile until new evidence suggests a shift.`,
        rationale:
          "A clear goal-card anchor improves route coherence and reduces fragmented prioritization.",
        category: "Focus",
        priority: "medium",
        confidence: args.stageProfile.strategicGoalCard.confidence,
        source_basis: "strategic_goal_card.inference",
        references: args.stageProfile.strategicGoalCard.signals,
      });
    }

    if (strategicProblems.length === 0) {
      addRecommendation({
        title: "Anchor this work to one decision-level problem",
        recommendation:
          "Define one initiative-level strategic problem and one explicit decision ask so every route and score change maps to the same objective.",
        rationale:
          "Without one decision-level anchor, teams often run activity without agreement on what must be true to win.",
        category: "strategy",
        priority: "high",
        confidence: 82,
        source_basis: "strategic_problems_missing",
        references: ["strategy_problem_statements"],
      });
    }

    if (positioningCanvases.length === 0) {
      addRecommendation({
        title: "Tighten competitive context before channel tactics",
        recommendation:
          "Define the real alternatives buyers compare against, the market category to own, and the specific value gap you can prove now.",
        rationale:
          "Positioning ambiguity usually causes low conversion even when outreach volume increases.",
        category: "positioning",
        priority: "high",
        confidence: 79,
        source_basis: "positioning_canvas_missing",
        references: ["positioning_canvases"],
      });
    }

    if (jobSteps.length === 0 || odiNeeds.length === 0) {
      addRecommendation({
        title: "Rebuild customer-job clarity for this initiative",
        recommendation:
          "Select the active customer job map, define ODI-style needs for that job, and link opportunities directly to those unmet outcomes.",
        rationale:
          "If the team is not explicit about the customer job and unmet outcomes, routes tend to be generic and hard to prioritize.",
        category: "jtbd",
        priority: "high",
        confidence: 80,
        source_basis: "job_steps_and_odi_needs",
        references: [`job_steps:${jobSteps.length}`, `odi_needs:${odiNeeds.length}`],
      });
    }

    if (sourceCounts.evidence === 0) {
      addRecommendation({
        title: "Shift from assumptions to primary evidence",
        recommendation:
          "Run primary interviews/surveys with the target buyer group and attach direct evidence so decisions are not driven by public assumptions alone.",
        rationale:
          "Primary evidence is the fastest way to reduce risk and avoid false confidence in projected outcomes.",
        category: "evidence",
        priority: "high",
        confidence: 86,
        source_basis: "input_files.source_tier",
        references: [
          `public:${sourceCounts.public}`,
          `company:${sourceCounts.company}`,
          `evidence:${sourceCounts.evidence}`,
        ],
      });
    }

    if (opportunities.length === 0 || routes.length === 0) {
      addRecommendation({
        title: "Convert diagnosis into one executable path",
        recommendation:
          "Prioritize one route with owner, timeline, and measurable checkpoints tied to the strategic problem and selected job map.",
        rationale:
          "Teams stall when diagnosis exists but there is no single implementation path with measurable checkpoints.",
        category: "routes",
        priority: "medium",
        confidence: 75,
        source_basis: "opportunities_and_routes",
        references: [`opportunities:${opportunities.length}`, `routes:${routes.length}`],
      });
    }

    if (openAssumptions.length > 0) {
      addRecommendation({
        title: "Make messaging testable before broad rollout",
        recommendation:
          "Translate the chosen positioning into one clear message set and test it with target buyers before scaling channel spend.",
        rationale:
          "Message clarity should follow strategy and positioning choices, then be pressure-tested for comprehension and traction.",
        category: "measurement",
        priority: "medium",
        confidence: 73,
        source_basis: "strategy_assumptions",
        references: openAssumptions
          .slice(0, 3)
          .map((row) => asText(row.title, "") || asText(row.assumption, "assumption"))
          .filter(Boolean),
      });
    }

    const lowestNeed = odiNeeds
      .map((need) => ({
        need,
        opportunity: Number(need.opportunity_score) || 0,
      }))
      .filter((row) => Number.isFinite(row.opportunity))
      .sort((a, b) => b.opportunity - a.opportunity)[0];

    if (lowestNeed && lowestNeed.opportunity >= 8) {
      addRecommendation({
        title: "Prioritize the top underserved customer outcome",
        recommendation:
          "Center the next route on the highest-opportunity unmet outcome and define explicit success criteria before solution work.",
        rationale:
          "Outcome-first prioritization reduces feature-first drift and improves odds of product-market fit.",
        category: "jtbd",
        priority: "high",
        confidence: 78,
        source_basis: "odi_needs",
        references: [
          asText(lowestNeed.need.need_statement, "top_odi_need").slice(0, 160),
          `opportunity_score:${Math.round(lowestNeed.opportunity)}`,
        ],
      });
    }

    if (recommendations.length === 0) {
      addRecommendation({
        title: "Document what is known vs assumed before execution",
        recommendation:
          "For each planned action, record one known fact, one assumption, and one validation step before execution starts.",
        rationale:
          "This keeps decisions evidence-led and improves accountability for score movement.",
        category: "measurement",
        priority: "medium",
        confidence: 70,
        source_basis: "company_context",
        references: ["inputs", "routes", "deep_dive_analyses"],
      });
    }

    const summarySections = [
      "1. What the panel thinks is really going on",
      `The company is currently in ${args.stageProfile.label} with objective: ${args.stageProfile.objective}`,
      "",
      "2. Panel discussion",
      "See panel_discussion for the full seven-voice debate and convergence.",
      "",
      "3. Core diagnosis",
      `Evidence profile: ${args.stageProfile.evidenceSummary}. ${args.stageProfile.rationale}`,
      "",
      "4. Key strategic issue",
      strategicProblems.length > 0
        ? "The main issue is strategic sequencing: convert diagnosis into one decision-level route with measurable proof milestones."
        : "The main issue is strategic focus: there is not yet one explicit decision-level problem statement anchoring downstream choices.",
      "",
      "5. Main risks and blind spots",
      `Risks include weak differentiation pressure-testing, incomplete customer-job outcomes, and route execution without validated assumptions.`,
      "",
      "6. Recommended way forward",
      "Run a positioning-and-evidence-first sequence, then commit to one prioritized route with clear ownership and checkpoints.",
      "",
      "7. Immediate next actions",
      "Execute the top recommendations below in order, starting with strategic anchor, evidence capture, and route commitment.",
      "",
      "8. Open questions that still need validation",
      "- Which buyer context produces the strongest conversion signal now?",
      "- Which claim is both most differentiated and provable this cycle?",
      "- Which route milestone should trigger score re-baseline?",
    ];

    const summaryTail = args.modelFailure
      ? `\n\nFallback note: ${args.modelFailure.slice(0, 180)}`
      : "";

    const panelDiscussion = [
      "Chip & Dan Heath: We need one clear decision to reduce complexity and drive team alignment.",
      "April Dunford: Without sharper alternatives/category context, the value story will blur in-market.",
      "Roger Martin: The core choice is where to play first and how to win there with proof, not breadth.",
      "Jonah Berger: Adoption risk is high unless the message is immediately understandable and easy to share.",
      "Teresa Torres: Critical evidence is still missing; run targeted discovery before scaling execution.",
      "Donald Miller: Clarify the customer-facing message only after strategy and positioning choices are explicit.",
      "Tony Ulwick: Start with the core job and prioritized underserved outcomes; do not move to feature choices before outcome priorities are explicit.",
      "Consensus: Anchor one strategic decision, validate with primary evidence, then execute one measurable route.",
    ].join("\n");

    return {
      summary: summarySections.join("\n") + summaryTail,
      panel_discussion: panelDiscussion,
      recommendations,
    };
  }

  if (strategicProblems.length === 0) {
    addRecommendation({
      title: "Capture the strategic problem in one sentence",
      recommendation:
        "Add one client-stated strategic problem so all scoring and route prioritization are anchored to a specific business outcome.",
      rationale:
        "Without a clear problem statement, recommendations drift and score movement is harder to interpret.",
      category: "strategy",
      priority: "high",
      confidence: 80,
      source_basis: "strategic_problems_missing",
      references: ["strategy_problem_statements"],
    });
  }

  if (args.stageProfile.stage === "diagnose") {
    addRecommendation({
      title: "Stage guardrail: Diagnose before route commitment",
      recommendation:
        "Prioritize problem framing and evidence-gap closure this cycle; avoid committing large execution plans until the core diagnosis is evidence-backed.",
      rationale:
        "In Diagnose mode, early execution without evidence alignment often creates rework and weak score movement.",
      category: "diagnosis",
      priority: "high",
      confidence: 81,
      source_basis: "process_stage.diagnose",
      references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
    });
  } else if (args.stageProfile.stage === "focus") {
    addRecommendation({
      title: "Stage guardrail: Focus decisions before scaling work",
      recommendation:
        "Use public plus uploaded company evidence to select one opportunity cluster and one route with clear expected impact before wider rollout.",
      rationale:
        "In Focus mode, disciplined prioritization improves implementation quality and avoids fragmented execution.",
      category: "focus",
      priority: "high",
      confidence: 80,
      source_basis: "process_stage.focus",
      references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
    });
  } else {
    addRecommendation({
      title: "Stage guardrail: Flow with measured implementation",
      recommendation:
        "Drive execution through owner checkpoints, enablement/training actions, and testing evidence that updates priorities and score assumptions.",
      rationale:
        "In Flow mode, sustained progress depends on execution cadence and learning loops from real evidence.",
      category: "execution",
      priority: "high",
      confidence: 82,
      source_basis: "process_stage.flow",
      references: [args.stageProfile.evidenceSummary, args.stageProfile.nextGate],
    });
  }

  const openAssumptions = assumptions.filter((row) => asText(row.status, "open").toLowerCase() !== "reconciled");
  if (openAssumptions.length > 0) {
    addRecommendation({
      title: "Prioritize top untested assumptions",
      recommendation:
        "Select the top 2 open assumptions with highest impact and define one measurable test for each this cycle.",
      rationale:
        "Untested assumptions are usually the fastest way to reduce risk and improve score accuracy.",
      category: "evidence",
      priority: "high",
      confidence: 78,
      source_basis: "strategy_assumptions",
      references: openAssumptions
        .slice(0, 4)
        .map((row) => asText(row.title, "") || asText(row.assumption, "assumption"))
        .filter(Boolean),
    });
  }

  const incompleteInputs = inputs
    .map((input) => {
      const done = Boolean(input.done);
      const completion = toPercent(input.completion, done ? 100 : 0);
      return { input, completion };
    })
    .filter((row) => row.completion < 70)
    .sort((a, b) => a.completion - b.completion);

  if (incompleteInputs.length > 0) {
    const top = incompleteInputs[0];
    addRecommendation({
      title: `Close input gap: ${asText(top.input.label, asText(top.input.input_key, "key input"))}`,
      recommendation:
        "Fill this diagnostic input with evidence-backed detail from uploaded files and market interviews, then re-run analysis.",
      rationale:
        "Low-completion diagnostic inputs often act as weakest links and hold down overall confidence and score lift.",
      category: "execution",
      priority: "high",
      confidence: 76,
      source_basis: asText(top.input.input_key, "input"),
      references: [asText(top.input.group_key, "inputs"), `${Math.round(top.completion)}% complete`],
    });
  }

  if (sourceCounts.evidence === 0) {
    addRecommendation({
      title: "Add primary market evidence",
      recommendation:
        "Run primary interviews or surveys tied to the selected job map and attach the notes so recommendations can move beyond public assumptions.",
      rationale:
        "Primary evidence is required to validate needs and reduce the risk of false confidence.",
      category: "evidence",
      priority: "high",
      confidence: 84,
      source_basis: "input_files.source_tier",
      references: [
        `public:${sourceCounts.public}`,
        `company:${sourceCounts.company}`,
        `evidence:${sourceCounts.evidence}`,
      ],
    });
  }

  if (opportunities.length === 0 || routes.length === 0) {
    addRecommendation({
      title: "Rebuild opportunities and routes from selected job map",
      recommendation:
        "Generate opportunities and routes only from the active customer job map and current strategic problem to keep action plans initiative-specific.",
      rationale:
        "Missing opportunities or routes leaves no reliable path from current reality to projected outcome.",
      category: "routes",
      priority: "medium",
      confidence: 74,
      source_basis: "opportunities_and_routes",
      references: [`opportunities:${opportunities.length}`, `routes:${routes.length}`],
    });
  }

  if (recommendations.length === 0) {
    addRecommendation({
      title: "Strengthen traceability across decisions",
      recommendation:
        "For each top recommendation, attach one supporting source and one measurable expected outcome before execution.",
      rationale:
        "Decision traceability helps teams align quickly and keeps score changes defensible.",
      category: "measurement",
      priority: "medium",
      confidence: 70,
      source_basis: "company_context",
      references: ["inputs", "routes", "deep_dive_analyses"],
    });
  }

  const summaryParts = [
    `${args.councilProfile.label} completed for ${companyName} from available company context.`,
    `Current process stage: ${args.stageProfile.label}. Objective: ${args.stageProfile.objective}`,
    `Evidence profile: ${args.stageProfile.evidenceSummary}`,
    `Generated ${recommendations.length} recommendation${recommendations.length === 1 ? "" : "s"} without waiting for follow-up answers.`,
  ];
  if (args.modelFailure) {
    summaryParts.push(`Used deterministic local fallback because model response failed: ${args.modelFailure.slice(0, 140)}.`);
  }

  return {
    summary: summaryParts.join(" "),
    panel_discussion: `${args.councilProfile.label} fallback: recommendations generated from available company context without live model debate.`,
    recommendations,
  };
}

async function fetchRowsOptional(
  supabase: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
  limit = 300,
) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .limit(limit);

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function fetchOptionalSingleLatest(
  supabase: ReturnType<typeof createClient>,
  table: string,
  companyId: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
  return data ?? null;
}

function normalizeRecommendations(raw: unknown): RecommendationRow[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const priorityRaw = asText(row.priority, "medium").toLowerCase();
      const priority: "high" | "medium" | "low" =
        priorityRaw === "high" || priorityRaw === "low" ? priorityRaw : "medium";
      const confidenceRaw = Number(row.confidence);

      return {
        title: asText(row.title, "Recommendation"),
        recommendation: asText(row.recommendation, ""),
        rationale: asText(row.rationale, ""),
        category: asText(row.category, "strategy").toLowerCase(),
        priority,
        confidence: Number.isFinite(confidenceRaw) ? clamp(Math.round(confidenceRaw), 0, 100) : 60,
        source_basis: asText(row.source_basis, "all_company_context"),
        references: sliceArray<string>(row.references, 8)
          .map((value) => asText(value, ""))
          .filter(Boolean),
      };
    })
    .filter((row) => row.recommendation.length > 0)
    .slice(0, 12);
}

function buildBaselineSummary(latestBaselineRun: Record<string, unknown> | null) {
  if (!latestBaselineRun) return null;

  const result = (latestBaselineRun.result_json && typeof latestBaselineRun.result_json === "object")
    ? latestBaselineRun.result_json as Record<string, unknown>
    : {};

  const evidenceLedger = sliceArray<Record<string, unknown>>(result.evidence_ledger, 8).map((entry) => ({
    bucket: asText(entry.bucket, "signal"),
    signal_strength: asText(entry.signal_strength, "unknown"),
    confidence: Number(entry.confidence) || null,
    snippet: asText(entry.snippet, "").slice(0, 220),
  }));

  return {
    id: latestBaselineRun.id ?? null,
    status: asText(latestBaselineRun.status, "unknown"),
    created_at: latestBaselineRun.created_at ?? null,
    category_archetype: asText(result.category_archetype, "unknown"),
    lens_card: result.lens_card ?? null,
    top_hypotheses: sliceArray<string>(result.top_hypotheses, 5),
    open_questions: sliceArray<string>(result.open_questions, 5),
    outside_voice_signals: sliceArray<Record<string, unknown>>(result.outside_voice_signals, 5).map((signal) => ({
      perspective: asText(signal.perspective, "outside_voice"),
      sentiment: asText(signal.sentiment, "unknown"),
      alignment: asText(signal.alignment, "unknown"),
      signal: asText(signal.signal, "").slice(0, 220),
      confidence: Number(signal.confidence) || null,
    })),
    evidence_ledger: evidenceLedger,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAtIso = new Date().toISOString();
  let runId: string | null = null;
  let sourceSnapshot: Record<string, unknown> = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel =
      Deno.env.get("COUNCIL_OPENAI_MODEL") ??
      Deno.env.get("OPENAI_MODEL") ??
      "gpt-4.1-mini";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    }
    if (!openaiKey) {
      return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return jsonResponse({ error: "Unauthorized" }, 401);
    const userId = userRes.user.id;

    const body = await req.json().catch(() => ({}));
    const companyId = asText(body?.company_id, "");
    const councilKey = normalizeCouncilKey(body?.council_key);
    const councilProfile = COUNCIL_PROFILES[councilKey];
    if (!companyId) return jsonResponse({ error: "company_id is required" }, 400);

    const { data: accessibleCompany, error: accessErr } = await anonClient
      .from("companies")
      .select("id")
      .eq("id", companyId)
      .maybeSingle();

    if (accessErr) return jsonResponse({ error: accessErr.message }, 403);
    if (!accessibleCompany) return jsonResponse({ error: "Company not found or access denied" }, 404);

    const { data: company, error: companyErr } = await serviceClient
      .from("companies")
      .select("id,name,website,archetype,quarter,tier,mojo_score,potential_score,projected_score,evidence_status,evidence_note,area_scores_json,last_scored_at")
      .eq("id", companyId)
      .maybeSingle();

    if (companyErr || !company) {
      return jsonResponse({ error: companyErr?.message || "Company not found" }, 404);
    }

    const { data: runInsert, error: runInsertErr } = await serviceClient
      .from("council_review_runs")
      .insert({
        company_id: companyId,
        user_id: userId,
        model: `openai:${openaiModel}`,
        status: "running",
        summary: "",
        source_snapshot_json: {
          council_key: councilProfile.key,
          council_label: councilProfile.label,
          llm_model: openaiModel,
          llm_provider: "openai_api",
        },
      })
      .select("id")
      .single();

    if (runInsertErr || !runInsert?.id) {
      const errorMessage = runInsertErr?.message || "Failed to create council review run";
      return jsonResponse({ error: errorMessage }, 500);
    }
    runId = runInsert.id as string;

    const [
      latestBaselineRun,
      inputs,
      jobSteps,
      opportunities,
      routes,
      positioningCanvases,
      strategyCascades,
      strategyProblems,
      strategyAssumptions,
      odiMarketDefinitions,
      odiNeeds,
      deepDives,
    ] = await Promise.all([
      fetchOptionalSingleLatest(serviceClient, "public_baseline_runs", companyId),
      (async () => {
        const { data, error } = await serviceClient
          .from("inputs")
          .select("*, input_files(*)")
          .eq("company_id", companyId)
          .limit(500);
        if (error) throw error;
        return Array.isArray(data) ? data : [];
      })(),
      fetchRowsOptional(serviceClient, "job_steps", companyId, 500),
      fetchRowsOptional(serviceClient, "opportunities", companyId, 500),
      fetchRowsOptional(serviceClient, "routes", companyId, 500),
      fetchRowsOptional(serviceClient, "positioning_canvases", companyId, 20),
      fetchRowsOptional(serviceClient, "strategy_cascades", companyId, 20),
      fetchRowsOptional(serviceClient, "strategy_problem_statements", companyId, 200),
      fetchRowsOptional(serviceClient, "strategy_assumptions", companyId, 200),
      fetchRowsOptional(serviceClient, "odi_market_definitions", companyId, 50),
      fetchRowsOptional(serviceClient, "odi_needs", companyId, 500),
      fetchRowsOptional(serviceClient, "deep_dive_analyses", companyId, 200),
    ]);

    const normalizedInputs = inputs.map((item) => {
      const row = item as Record<string, unknown>;
      const files = Array.isArray(row.input_files) ? row.input_files as Record<string, unknown>[] : [];
      return {
        ...pick(row, [
          "id",
          "input_key",
          "label",
          "description",
          "group_key",
          "sub_group",
          "done",
          "completion",
          "frameworks_used",
          "context_summary",
          "source_tier",
          "updated_at",
          "created_at",
        ]),
        input_files: files.slice(0, 12).map((file) => pick(file, [
          "id",
          "file_name",
          "file_type",
          "tags",
          "uploaded_at",
        ])),
      };
    });

    const contextPayload = {
      company,
      baseline: buildBaselineSummary(latestBaselineRun as Record<string, unknown> | null),
      strategic_problems: strategyProblems.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "statement",
          "source",
          "status",
          "decision_ask",
          "summary",
          "reconciliation_note",
          "created_at",
          "updated_at",
        ])
      ),
      strategy_assumptions: strategyAssumptions.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "assumption",
          "title",
          "status",
          "evidence_needed",
          "impact_level",
          "created_at",
          "updated_at",
          "source",
        ])
      ),
      inputs: normalizedInputs,
      job_steps: jobSteps.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "job_map_name",
          "job_step",
          "step_label",
          "title",
          "description",
          "desired_outcome",
          "importance",
          "satisfaction",
          "opportunity_score",
          "source_tier",
          "frameworks_used",
          "created_at",
          "updated_at",
        ])
      ),
      odi_market_definitions: odiMarketDefinitions.map((row) => row as Record<string, unknown>),
      odi_needs: odiNeeds.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "need_statement",
          "job_step",
          "importance",
          "satisfaction",
          "opportunity_score",
          "source_tier",
          "created_at",
          "updated_at",
        ])
      ),
      opportunities: opportunities.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "description",
          "priority",
          "score",
          "impact",
          "effort",
          "source_tier",
          "frameworks_used",
          "created_at",
          "updated_at",
        ])
      ),
      routes: routes.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "title",
          "description",
          "pillar",
          "priority",
          "points",
          "source_tier",
          "frameworks_used",
          "steps",
          "evidence_needed",
          "why_this_matters",
          "created_at",
          "updated_at",
        ])
      ),
      positioning_canvases: positioningCanvases.map((row) => row as Record<string, unknown>),
      strategy_cascades: strategyCascades.map((row) => row as Record<string, unknown>),
      deep_dive_analyses: deepDives.map((row) =>
        pick(row as Record<string, unknown>, [
          "id",
          "area_key",
          "what_we_found",
          "why_it_matters",
          "what_good_looks_like",
          "path_forward",
          "holding_back",
          "generated_at",
          "updated_at",
        ])
      ),
    };

    const processStageProfile = buildProcessStageProfile({
      company: company as Record<string, unknown>,
      contextPayload: contextPayload as Record<string, unknown>,
    });

    sourceSnapshot = {
      started_at: startedAtIso,
      company_id: companyId,
      council_key: councilProfile.key,
      council_label: councilProfile.label,
      process_stage: {
        key: processStageProfile.stage,
        label: processStageProfile.label,
        objective: processStageProfile.objective,
        next_gate: processStageProfile.nextGate,
        guidance: processStageProfile.stageGuidance,
        rationale: processStageProfile.rationale,
        evidence_summary: processStageProfile.evidenceSummary,
        strategic_goal_card: {
          key: processStageProfile.strategicGoalCard.key,
          label: processStageProfile.strategicGoalCard.label,
          confidence: processStageProfile.strategicGoalCard.confidence,
          rationale: processStageProfile.strategicGoalCard.rationale,
          signals: processStageProfile.strategicGoalCard.signals,
        },
      },
      llm_path: {
        provider: "openai_api",
        model: openaiModel,
        endpoint: "https://api.openai.com/v1/responses",
      },
      counts: {
        strategic_problems: contextPayload.strategic_problems.length,
        strategy_assumptions: contextPayload.strategy_assumptions.length,
        inputs: contextPayload.inputs.length,
        input_files: contextPayload.inputs.reduce((sum, row) => sum + ((row.input_files?.length as number) || 0), 0),
        job_steps: contextPayload.job_steps.length,
        odi_market_definitions: contextPayload.odi_market_definitions.length,
        odi_needs: contextPayload.odi_needs.length,
        opportunities: contextPayload.opportunities.length,
        routes: contextPayload.routes.length,
        positioning_canvases: contextPayload.positioning_canvases.length,
        strategy_cascades: contextPayload.strategy_cascades.length,
        deep_dive_analyses: contextPayload.deep_dive_analyses.length,
        has_public_baseline: Boolean(contextPayload.baseline),
      },
    };

    const frameworkGuidance = [
      buildFrameworkBrief("inputs", getFrameworkRoutingPlan("inputs")),
      buildFrameworkBrief("journeys", getFrameworkRoutingPlan("journeys")),
      buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning")),
      buildFrameworkBrief("opportunities", getFrameworkRoutingPlan("opportunities")),
      buildFrameworkBrief("routes", getFrameworkRoutingPlan("routes")),
    ].join("\n\n");

    const contextJson = truncateText(JSON.stringify(contextPayload, null, 2), councilProfile.contextMaxChars);
    const sourceSnapshotJson = JSON.stringify(sourceSnapshot, null, 2);

    const systemText = councilProfile.systemText;
    const stageGuidanceText = [
      `Process stage: ${processStageProfile.label} (${processStageProfile.stage})`,
      `Stage objective: ${processStageProfile.objective}`,
      `Stage next gate: ${processStageProfile.nextGate}`,
      `Evidence profile: ${processStageProfile.evidenceSummary}`,
      `Inferred strategic goal card: ${processStageProfile.strategicGoalCard.label} (confidence ${processStageProfile.strategicGoalCard.confidence})`,
      "Stage-specific recommendation rules:",
      ...processStageProfile.stageGuidance.map((rule, index) => `${index + 1}. ${rule}`),
      "Always drive decisions toward evidence-based progression: Diagnose -> Focus -> Flow.",
    ].join("\n");

    const userText =
      `Company context snapshot:\n${sourceSnapshotJson}\n\n` +
      `Current process stage guidance:\n${stageGuidanceText}\n\n` +
      `Applied framework guidance:\n${frameworkGuidance}\n\n` +
      `Full company context JSON:\n${contextJson}\n\n` +
      councilProfile.userTextTail;

    let parsed: Record<string, unknown>;
    let modelFailure: string | undefined;
    try {
      parsed = await callOpenAIJSON({
        apiKey: openaiKey,
        model: openaiModel,
        systemText,
        userText,
        maxOutputTokens: councilProfile.maxOutputTokens,
        temperature: councilProfile.temperature,
        timeoutMs: councilProfile.modelTimeoutMs,
      });
    } catch (error) {
      modelFailure = error instanceof Error ? error.message : String(error);
      console.log("[council-review] model fallback", modelFailure);
      parsed = buildDeterministicCouncilOutput({
        councilProfile,
        company: company as Record<string, unknown>,
        contextPayload: contextPayload as Record<string, unknown>,
        stageProfile: processStageProfile,
        modelFailure,
      });
    }

    let summary = asText(parsed?.summary, "Council review completed.");
    let panelDiscussion = normalizePanelDiscussion(parsed?.panel_discussion);
    let recommendations = normalizeRecommendations(parsed?.recommendations);
    if (recommendations.length === 0) {
      const fallbackOutput = buildDeterministicCouncilOutput({
        councilProfile,
        company: company as Record<string, unknown>,
        contextPayload: contextPayload as Record<string, unknown>,
        stageProfile: processStageProfile,
        modelFailure: "Model returned empty recommendations.",
      });
      summary = asText(fallbackOutput.summary, summary);
      panelDiscussion = normalizePanelDiscussion(fallbackOutput.panel_discussion);
      recommendations = normalizeRecommendations(fallbackOutput.recommendations);
    }
    if (!panelDiscussion && councilProfile.key === "mojo_council") {
      panelDiscussion =
        "Mojo Council consensus was generated from available evidence. " +
        "No detailed transcript was returned by the model in this run.";
    }

    if (recommendations.length > 0) {
      const insertPayload = recommendations.map((item) => ({
        run_id: runId,
        company_id: companyId,
        user_id: userId,
        title: item.title,
        recommendation: item.recommendation,
        rationale: item.rationale,
        category: item.category,
        priority: item.priority,
        confidence: item.confidence,
        status: "pending",
        source_basis: item.source_basis,
        source_context_json: {
          council_key: councilProfile.key,
          council_label: councilProfile.label,
          references: item.references,
          source_snapshot: sourceSnapshot,
        },
      }));

      const { error: insertRecommendationError } = await serviceClient
        .from("council_recommendations")
        .insert(insertPayload);

      if (insertRecommendationError) throw insertRecommendationError;
    }

    const { error: runUpdateError } = await serviceClient
      .from("council_review_runs")
      .update({
        status: "completed",
        summary,
        source_snapshot_json: {
          ...sourceSnapshot,
          panel_discussion: panelDiscussion,
        },
        recommendation_count: recommendations.length,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    if (runUpdateError) throw runUpdateError;

    return jsonResponse({
      run_id: runId,
      council_key: councilProfile.key,
      summary,
      panel_discussion: panelDiscussion,
      recommendation_count: recommendations.length,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("[council-review] error", message);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (runId && supabaseUrl && serviceRoleKey) {
      const serviceClient = createClient(supabaseUrl, serviceRoleKey);
      await serviceClient
        .from("council_review_runs")
        .update({
          status: "failed",
          summary: message.slice(0, 500),
          source_snapshot_json: sourceSnapshot,
          updated_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }

    return jsonResponse({ error: message }, 500);
  }
});
