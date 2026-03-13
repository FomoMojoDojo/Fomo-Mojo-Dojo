// supabase/functions/research-company/index.ts
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function extractResponsesOutputText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const out = Array.isArray(data?.output) ? data.output : [];
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

function buildBaselineBrief(baselineResultJson: unknown): string {
  const baseline = baselineResultJson as {
    category_archetype?: string;
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      adoption_constraints?: string;
      value_chain?: string;
      risk_surface?: string;
      economic_engine?: string;
    };
    evidence_ledger?: Array<{
      bucket?: string;
      snippet?: string;
      signal_strength?: string;
      confidence?: number;
    }>;
    top_hypotheses?: string[];
    open_questions?: string[];
  } | null;

  if (!baseline) return "No public baseline available.";

  const lens = baseline.lens_card ?? {};
  const evidence = Array.isArray(baseline.evidence_ledger)
    ? baseline.evidence_ledger.slice(0, 8)
    : [];
  const hypotheses = Array.isArray(baseline.top_hypotheses)
    ? baseline.top_hypotheses.slice(0, 4)
    : [];
  const openQuestions = Array.isArray(baseline.open_questions)
    ? baseline.open_questions.slice(0, 3)
    : [];

  return [
    `Category archetype: ${baseline.category_archetype || "unknown"}`,
    `Primary buyer: ${lens.primary_buyer || "unknown"}`,
    `Chooser: ${lens.chooser || "unknown"}`,
    `User: ${lens.user || "unknown"}`,
    `Adoption constraints: ${lens.adoption_constraints || "unknown"}`,
    `Value chain: ${lens.value_chain || "unknown"}`,
    `Risk surface: ${lens.risk_surface || "unknown"}`,
    `Economic engine: ${lens.economic_engine || "unknown"}`,
    evidence.length
      ? `Evidence:\n${evidence
          .map(
            (item, index) =>
              `${index + 1}. [${item.bucket || "signal"} | ${item.signal_strength || "unknown"} | conf ${item.confidence ?? "?"}] ${item.snippet || "No snippet"}`
          )
          .join("\n")}`
      : "Evidence: none",
    hypotheses.length ? `Top hypotheses:\n- ${hypotheses.join("\n- ")}` : "Top hypotheses: none",
    openQuestions.length ? `Open questions:\n- ${openQuestions.join("\n- ")}` : "Open questions: none",
  ].join("\n");
}

function buildJourneyBrief(journeys: unknown): string {
  const items = Array.isArray(journeys) ? journeys : [];

  return items
    .map((journey, journeyIndex) => {
      const entry = journey as {
        journey_key?: string;
        journey_title?: string;
        journey_subtitle?: string;
        steps?: Array<{
          step_number?: number;
          step_label?: string;
          description?: string;
          designed?: boolean;
          has_gap?: boolean;
          evidence_status?: string;
          evidence_basis?: string;
          evidence_confidence?: number;
        }>;
      };

      const steps = Array.isArray(entry.steps) ? entry.steps : [];

      return [
        `${journeyIndex + 1}. ${entry.journey_key || "unknown"} :: ${entry.journey_title || "Untitled journey"}`,
        `Subtitle: ${entry.journey_subtitle || "unknown"}`,
        ...steps.map((step) => {
          const typedStep = step as {
            step_number?: number;
            step_label?: string;
            description?: string;
            designed?: boolean;
            has_gap?: boolean;
            evidence_status?: string;
            evidence_basis?: string;
            evidence_confidence?: number;
          };

          return `- Step ${typedStep.step_number ?? "?"}: ${typedStep.step_label || "Untitled"} | designed=${typedStep.designed ? "yes" : "no"} | gap=${typedStep.has_gap ? "yes" : "no"} | evidence=${typedStep.evidence_status || "unknown"} | conf=${typedStep.evidence_confidence ?? "?"} | basis=${typedStep.evidence_basis || "unknown"} | ${typedStep.description || "No description"}`;
        }),
      ].join("\n");
    })
    .join("\n\n");
}

function buildOpportunityBrief(opportunities: unknown): string {
  const items = Array.isArray(opportunities) ? opportunities : [];

  return items
    .slice(0, 20)
    .map((opportunity, index) => {
      const entry = opportunity as {
        outcome?: string;
        journey_key?: string;
        step_number?: number;
        step_label?: string;
        importance?: number;
        satisfaction?: number;
        opportunity_score?: number;
        priority_tier?: string;
      };

      return `${index + 1}. ${entry.outcome || "Untitled"} | ${entry.journey_key || "unknown"} | step ${entry.step_number ?? "?"} ${entry.step_label || ""} | score ${entry.opportunity_score ?? "?"} | ${entry.priority_tier || "unknown"} | importance ${entry.importance ?? "?"} | satisfaction ${entry.satisfaction ?? "?"}`;
    })
    .join("\n");
}

function buildInputBrief(inputs: unknown): string {
  const items = Array.isArray(inputs) ? inputs : [];

  return items
    .map((input, index) => {
      const entry = input as {
        input_key?: string;
        input_label?: string;
        sub_group?: string;
        description?: string;
        why_it_matters?: string;
      };

      return `${index + 1}. ${entry.input_key || "unknown"} | ${entry.input_label || "Untitled"} | ${entry.sub_group || "unknown"} | ${entry.description || "No description"} | why: ${entry.why_it_matters || "No rationale"}`;
    })
    .join("\n");
}

function buildRouteBrief(routes: unknown) {
  const items = Array.isArray(routes) ? routes : [];

  return items
    .slice(0, 20)
    .map((route, index) => {
      const entry = route as {
        category?: string;
        title?: string;
        short_description?: string;
        pts_value?: number;
        effort?: string;
      };

      return `${index + 1}. ${entry.category || "unknown"} | ${entry.title || "Untitled"} | ${entry.short_description || "No description"} | pts ${entry.pts_value ?? "?"} | ${entry.effort || "unknown"} effort`;
    })
    .join("\n");
}

function buildPositioningBrief(positioning: unknown) {
  const entry = (positioning ?? {}) as {
    competitive_alternatives?: Array<{ name?: string; description?: string; highlighted?: boolean }>;
    unique_attributes?: Array<{ name?: string; description?: string; highlighted?: boolean }>;
    value_for_customer?: string;
    best_fit_customers?: string;
    market_category?: string;
    category_rationale?: string;
    current_tagline?: string;
    proposed_tagline?: string;
  };

  const alternatives = Array.isArray(entry.competitive_alternatives)
    ? entry.competitive_alternatives.slice(0, 6)
    : [];
  const attributes = Array.isArray(entry.unique_attributes)
    ? entry.unique_attributes.slice(0, 6)
    : [];

  return [
    alternatives.length
      ? `Competitive alternatives:\n${alternatives.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.description || "No description"} | highlighted=${item.highlighted ? "yes" : "no"}`).join("\n")}`
      : "Competitive alternatives: none",
    attributes.length
      ? `Unique attributes:\n${attributes.map((item, index) => `${index + 1}. ${item.name || "Unknown"} | ${item.description || "No description"} | highlighted=${item.highlighted ? "yes" : "no"}`).join("\n")}`
      : "Unique attributes: none",
    `Value for customer: ${entry.value_for_customer || "unknown"}`,
    `Best fit customers: ${entry.best_fit_customers || "unknown"}`,
    `Market category: ${entry.market_category || "unknown"}`,
    `Category rationale: ${entry.category_rationale || "unknown"}`,
    `Current tagline: ${entry.current_tagline || "unknown"}`,
    `Proposed tagline: ${entry.proposed_tagline || "unknown"}`,
  ].join("\n");
}

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    severity: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    findings: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          artifact: {
            type: "string",
            enum: ["baseline", "inputs", "journeys", "opportunities", "routes", "positioning", "strategy"],
          },
          field: { type: "string" },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["artifact", "field", "issue", "suggestion"],
      },
    },
  },
  required: ["pass", "severity", "summary", "findings"],
};

async function runConsistencyReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  inputs: unknown;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  positioning: unknown;
  strategy: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Public baseline context:\n${opts.baselineBrief}\n\n` +
    `Inputs:\n${buildInputBrief(opts.inputs)}\n\n` +
    `Journeys:\n${buildJourneyBrief(opts.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Routes:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Positioning:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Strategy:\n${JSON.stringify(opts.strategy)}\n\n` +
    `Review the full draft bundle for cross-artifact consistency.`;

  const systemText =
    `You are a strict strategy QA reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- buyer / chooser / user consistency across baseline, journeys, positioning, and strategy\n` +
    `- market category consistency across baseline, positioning, and strategy\n` +
    `- opportunity rows correctly tied to journey steps\n` +
    `- routes that meaningfully connect to opportunities and job-step gaps\n` +
    `- any sign of wrong-company drift, adjacent-market drift, or contradictory language\n` +
    `Do NOT treat ordinary capability gaps, missing measurement systems, incomplete governance, or nonprofit operating weaknesses as high-severity review failures by themselves.\n` +
    `Those kinds of weaknesses are expected outputs of strategy work and should usually be medium or low severity unless they directly contradict the baseline or other generated artifacts.\n` +
    `Use severity=high only when there is wrong-company drift, market/category contradiction, buyer/user contradiction, or a material cross-artifact inconsistency that makes the draft unsafe to save.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_consistency_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1600,
    temperature: 0.1,
  });
}

async function runPositioningReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  positioning: unknown;
  opportunities: unknown;
  routes: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Public baseline context:\n${opts.baselineBrief}\n\n` +
    `Positioning draft:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Opportunity context:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Route context:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Review the positioning draft for category fit, audience fit, alternative relevance, differentiation quality, and generic wording.`;

  const systemText =
    `You are a strict positioning reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- market category credibility and alignment with baseline evidence\n` +
    `- best-fit customers matching the buyer/job context\n` +
    `- competitive alternatives serving the same job context\n` +
    `- unique attributes being specific and credible rather than generic\n` +
    `- current/proposed tagline quality and company fit\n` +
    `Use severity=high only when the positioning should not be saved without correction.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_positioning_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1400,
    temperature: 0.1,
  });
}

async function runEvidenceReview(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  baselineBrief: string;
  journeys: unknown;
  opportunities: unknown;
  routes: unknown;
  positioning: unknown;
  strategy: unknown;
}) {
  const userText =
    `Company: ${opts.companyName}\nWebsite: ${opts.website || "unknown"}\n\n` +
    `Public baseline context:\n${opts.baselineBrief}\n\n` +
    `Journeys:\n${buildJourneyBrief(opts.journeys)}\n\n` +
    `Opportunities:\n${buildOpportunityBrief(opts.opportunities)}\n\n` +
    `Routes:\n${buildRouteBrief(opts.routes)}\n\n` +
    `Positioning:\n${buildPositioningBrief(opts.positioning)}\n\n` +
    `Strategy:\n${JSON.stringify(opts.strategy)}\n\n` +
    `Review the draft bundle for evidence grounding and overclaiming.`;

  const systemText =
    `You are a strict evidence reviewer.\n` +
    `Return ONLY valid JSON matching the schema. No prose.\n` +
    `Your job is to review, not rewrite.\n` +
    `Check for:\n` +
    `- claims that go beyond the baseline evidence ledger or open questions\n` +
    `- invented specifics such as channels, buyer types, operating details, or differentiators not supported by evidence\n` +
    `- excessive certainty where baseline evidence is thin\n` +
    `- downstream artifacts that should say unknown, developing, or uncertain instead of asserting facts\n` +
    `Use severity=high only when the draft materially overclaims or presents unsupported specifics as fact.\n`;

  return await callOpenAIJSON({
    apiKey: opts.apiKey,
    model: opts.model,
    schemaName: "mojo_evidence_review_v1",
    schema: reviewSchema,
    systemText,
    userText,
    maxOutputTokens: 1400,
    temperature: 0.1,
  });
}

function frameworkKeysFor(artifact: "inputs" | "journeys" | "opportunities" | "routes") {
  return getFrameworkRoutingPlan(artifact).map((framework) => framework.key);
}

function odiServiceState(importance: number, satisfaction: number) {
  const delta = importance - satisfaction;
  if (delta >= 3) return "underserved";
  if (delta <= -2) return "overserved";
  return "served";
}

async function callOpenAIJSON(opts: {
  apiKey: string;
  model: string;
  schemaName: string;
  schema: any;
  systemText: string;
  userText: string;
  maxOutputTokens?: number;
  temperature?: number;
}) {
  const {
    apiKey,
    model,
    schemaName,
    schema,
    systemText,
    userText,
    maxOutputTokens = 2000,
    temperature = 0.2,
  } = opts;

  const buildBody = (outputBudget: number, retryNote = "") => ({
    model,
    temperature,
    max_output_tokens: outputBudget,
    input: [
      {
        role: "system",
        content: [{
          type: "input_text",
          text: `${systemText}${retryNote ? `\n\n${retryNote}` : ""}`,
        }],
      },
      { role: "user", content: [{ type: "input_text", text: userText }] },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema,
      },
    },
  });

  const budgets = [maxOutputTokens, Math.round(maxOutputTokens * 1.75)];

  for (let attempt = 0; attempt < budgets.length; attempt++) {
    const retryNote =
      attempt === 0
        ? ""
        : "Your previous response was truncated or invalid JSON. Return the full JSON object in one complete response that exactly matches the schema.";

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildBody(budgets[attempt], retryNote)),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`OpenAI error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const text = extractResponsesOutputText(data);
    if (!text) {
      console.log("[research-company] OpenAI response missing output_text. keys=", Object.keys(data || {}));
      throw new Error("OpenAI response missing output_text");
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.log("[research-company] OpenAI JSON parse failed. first200=", text.slice(0, 200));
      console.log("[research-company] OpenAI JSON parse failed. last200=", text.slice(-200));

      const parseMessage = e instanceof Error ? e.message : String(e);
      const looksTruncated =
        parseMessage.toLowerCase().includes("unterminated") ||
        parseMessage.toLowerCase().includes("unexpected end") ||
        text.trim().length > 0 && !text.trim().endsWith("}");

      if (attempt < budgets.length - 1 && looksTruncated) {
        console.log("[research-company] retrying OpenAI JSON parse with larger token budget", {
          schemaName,
          previousBudget: budgets[attempt],
          nextBudget: budgets[attempt + 1],
        });
        continue;
      }

      throw e;
    }
  }

  throw new Error("OpenAI JSON generation failed after retries");
}

const POSITIONING_KEYS = new Set([
  "comp-alt",
  "unique-attr",
  "val-prop",
  "target-aud",
  "market-cat",
]);
const CUSTOMER_KEYS = new Set(["needs-assessment", "family-satisfaction"]);
const STRATEGY_KEYS = new Set(["program-model", "outcome-data"]);
const GTM_KEYS = new Set([
  "referral-map",
  "brand-narrative",
  "channel-strat",
  "donor-retention",
  "grant-pipeline",
]);

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function normalizeJourneyKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSignalStrength(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "high") return 1;
  if (raw === "medium") return 0.66;
  if (raw === "low") return 0.33;
  return 0.5;
}

function normalizeConfidence(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value <= 1) return clamp(value, 0, 1);
  if (value <= 10) return clamp(value / 10, 0, 1);
  return clamp(value / 100, 0, 1);
}

function ratio(count: number, max: number) {
  if (max <= 0) return 0;
  return clamp(count / max, 0, 1);
}

function isJobStepEvidenceColumnError(message: unknown) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("evidence_status") ||
    lower.includes("evidence_basis") ||
    lower.includes("evidence_confidence")
  );
}

function averageCompleteness(items: Array<{ completeness?: unknown }>) {
  const values = items
    .map((item) => Number(item?.completeness))
    .filter((value) => Number.isFinite(value) && value > 0) as number[];

  if (!values.length) return 0;
  return clamp(avg(values), 0, 100) / 100;
}

function journeyHealth(steps: Array<{ designed?: unknown; has_gap?: unknown }>) {
  if (!steps.length) return 0;

  const designedRatio = steps.filter((step) => step?.designed === true).length / steps.length;
  const nonGapRatio = steps.filter((step) => step?.has_gap !== true).length / steps.length;
  return clamp(0.55 * designedRatio + 0.45 * nonGapRatio, 0, 1);
}

function weightedHarmonicMean(entries: Array<{ value: number; weight: number }>) {
  const valid = entries
    .map((entry) => ({
      weight: entry.weight,
      value: clamp(entry.value, 1, 100),
    }))
    .filter((entry) => entry.weight > 0);

  if (!valid.length) return 0;

  const denom = valid.reduce((sum, entry) => sum + entry.weight / entry.value, 0);
  if (denom <= 0) return 0;

  const weightSum = valid.reduce((sum, entry) => sum + entry.weight, 0);
  return weightSum / denom;
}

function computePotentialProjected(mojo_score: number) {
  const current = clamp(mojo_score, 0, 100);
  const headroom = 100 - current;

  const potential_score = Math.round(
    clamp(current + Math.min(22, headroom * 0.35), 0, 100),
  );
  const projected_score = Math.round(
    clamp(
      Math.max(potential_score + 10, current + Math.min(42, headroom * 0.62)),
      0,
      100,
    ),
  );

  return { potential_score, projected_score };
}

function scoreCompanyMojo(args: {
  baselineResultJson: any | null;
  inputs: Array<{ input_key?: unknown; completeness?: unknown }>;
  jobSteps: Array<{ journey_key?: unknown; designed?: unknown; has_gap?: unknown }>;
  opportunities: Array<{
    journey_key?: unknown;
    importance?: unknown;
    satisfaction?: unknown;
    priority_tier?: unknown;
  }>;
  gamma?: number;
}) {
  const safeInputs = Array.isArray(args.inputs) ? args.inputs : [];
  const safeSteps = Array.isArray(args.jobSteps) ? args.jobSteps : [];
  const safeOpps = Array.isArray(args.opportunities) ? args.opportunities : [];
  const ledger = Array.isArray(args.baselineResultJson?.evidence_ledger)
    ? args.baselineResultJson.evidence_ledger
    : [];

  const ledgerCount = ledger.length;
  const avgConfidence = avg(
    ledger
      .map((item: any) => Number(item?.confidence))
      .filter((value: number) => Number.isFinite(value)),
  );
  const confNorm = normalizeConfidence(avgConfidence);
  const strengthNorm = avg(ledger.map((item: any) => normalizeSignalStrength(item?.signal_strength)));
  const baselineSupport = clamp(0.6 * confNorm + 0.4 * strengthNorm, 0, 1);

  const customerSteps = safeSteps.filter((step) => normalizeJourneyKey(step?.journey_key) === "customer");
  const revenueSteps = safeSteps.filter((step) => normalizeJourneyKey(step?.journey_key) === "revenue");
  const opsSteps = safeSteps.filter((step) => normalizeJourneyKey(step?.journey_key) === "operations");

  const customerOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp?.journey_key) === "customer");
  const revenueOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp?.journey_key) === "revenue");
  const opsOpps = safeOpps.filter((opp) => normalizeJourneyKey(opp?.journey_key) === "operations");

  const underservedNorm = clamp(
    avg(
      safeOpps.map((opp) =>
        clamp((Number(opp?.importance) - Number(opp?.satisfaction)) / 9, 0, 1),
      ),
    ),
    0,
    1,
  );
  const oppCoverageNorm = ratio(safeOpps.length, 20);
  const focusNorm = safeOpps.length
    ? safeOpps.filter((opp) => String(opp?.priority_tier || "").toLowerCase() === "focus").length / safeOpps.length
    : 0;

  const positioningInputs = safeInputs.filter((input) => POSITIONING_KEYS.has(String(input?.input_key || "").trim()));
  const customerInputs = safeInputs.filter((input) => CUSTOMER_KEYS.has(String(input?.input_key || "").trim()));
  const strategyInputs = safeInputs.filter((input) => STRATEGY_KEYS.has(String(input?.input_key || "").trim()));
  const gtmInputs = safeInputs.filter((input) => GTM_KEYS.has(String(input?.input_key || "").trim()));

  const positioningCoverage = ratio(positioningInputs.length, POSITIONING_KEYS.size);
  const customerCoverage = ratio(customerInputs.length, CUSTOMER_KEYS.size);
  const strategyCoverage = ratio(strategyInputs.length, STRATEGY_KEYS.size);
  const gtmCoverage = ratio(gtmInputs.length, GTM_KEYS.size);

  const positioning = round1(
    100 * (
      0.5 * positioningCoverage +
      0.25 * baselineSupport +
      0.15 * ratio(ledgerCount, 8) +
      0.1 * averageCompleteness(positioningInputs)
    ),
  );
  const customer_insight = round1(
    100 * (
      0.2 * customerCoverage +
      0.25 * oppCoverageNorm +
      0.2 * underservedNorm +
      0.2 * journeyHealth(customerSteps) +
      0.15 * ratio(customerOpps.length, 8)
    ),
  );
  const strategy_cascade = round1(
    100 * (
      0.25 * strategyCoverage +
      0.2 * journeyHealth(revenueSteps) +
      0.2 * journeyHealth(opsSteps) +
      0.15 * baselineSupport +
      0.1 * ratio(revenueOpps.length + opsOpps.length, 12) +
      0.1 * averageCompleteness(strategyInputs)
    ),
  );
  const gtm_execution = round1(
    100 * (
      0.3 * gtmCoverage +
      0.2 * journeyHealth(revenueSteps) +
      0.15 * ratio(revenueOpps.length, 8) +
      0.15 * ratio(opsOpps.length, 8) +
      0.1 * focusNorm +
      0.1 * averageCompleteness(gtmInputs)
    ),
  );

  const perGateScores = {
    positioning: clamp(positioning, 0, 100),
    customer_insight: clamp(customer_insight, 0, 100),
    strategy_cascade: clamp(strategy_cascade, 0, 100),
    gtm_execution: clamp(gtm_execution, 0, 100),
  };

  const inputsCount = safeInputs.length;
  const stepsCount = safeSteps.length;
  const oppsCount = safeOpps.length;

  const baselineStrength = clamp(
    0.55 * ratio(ledgerCount, 12) + 0.45 * confNorm,
    0,
    1,
  );
  const artifactCoverage = clamp(
    0.35 * ratio(inputsCount, 14) +
      0.3 * ratio(stepsCount, 18) +
      0.35 * ratio(oppsCount, 20),
    0,
    1,
  );
  const evidenceMultiplier = round1(
    clamp(0.6 + 0.18 * baselineStrength + 0.22 * artifactCoverage, 0.6, 1.0),
  );

  let evidence_status =
    ledgerCount === 0 && artifactCoverage === 0
      ? "no_public_evidence"
      : ledgerCount === 0
        ? "generated_no_baseline"
        : baselineStrength < 0.35
          ? "public_evidence_thin"
          : baselineStrength < 0.65
            ? "public_evidence_partial"
            : artifactCoverage >= 0.45
              ? "baseline_plus_artifacts"
              : "public_evidence_strong";

  const gateScore = round1(weightedHarmonicMean([
    { value: perGateScores.positioning, weight: 0.3 },
    { value: perGateScores.customer_insight, weight: 0.25 },
    { value: perGateScores.strategy_cascade, weight: 0.25 },
    { value: perGateScores.gtm_execution, weight: 0.2 },
  ]));

  const gamma = Number.isFinite(args.gamma) ? Number(args.gamma) : 2.2;
  const p_raw = clamp((gateScore / 100) * evidenceMultiplier, 0, 1);
  const mojo_score = Math.round(clamp(100 * Math.pow(p_raw, gamma), 0, 100));
  const { potential_score, projected_score } = computePotentialProjected(mojo_score);

  const evidence_note =
    ledgerCount > 0
      ? `ledger=${ledgerCount}, avg_conf=${avgConfidence.toFixed(1)}, artifacts=${Math.round(artifactCoverage * 100)}%`
      : `no baseline ledger, artifacts=${Math.round(artifactCoverage * 100)}%`;

  const area_scores_json = {
    scoring_version: "mojo_v2",
    gate_weights: {
      positioning: 0.3,
      customer_insight: 0.25,
      strategy_cascade: 0.25,
      gtm_execution: 0.2,
    },
    gate_score: gateScore,
    per_gate_scores: {
      positioning: {
        label: "Positioning",
        score: perGateScores.positioning,
      },
      customer_insight: {
        label: "Customer Insight",
        score: perGateScores.customer_insight,
      },
      strategy_cascade: {
        label: "Strategy Cascade",
        score: perGateScores.strategy_cascade,
      },
      gtm_execution: {
        label: "GTM Execution",
        score: perGateScores.gtm_execution,
      },
    },
    evidence: {
      multiplier: evidenceMultiplier,
      status: evidence_status,
      note: evidence_note,
      baseline_strength: round1(baselineStrength * 100),
      artifact_coverage: round1(artifactCoverage * 100),
      ledger_count: ledgerCount,
      avg_confidence: round1(avgConfidence),
    },
    counts: {
      inputs: inputsCount,
      job_steps: stepsCount,
      opportunities: oppsCount,
      evidence_ledger: ledgerCount,
    },
    calibration: {
      gamma,
      p_raw: round1(p_raw * 100) / 100,
    },
    outputs: {
      mojo_score,
      potential_score,
      projected_score,
    },
  };

  return {
    mojo_score,
    potential_score,
    projected_score,
    evidence_status,
    evidence_note,
    area_scores_json,
  };
}

/**
 * Deterministic grouping: ignore model group_key/group_label entirely.
 */
const INPUT_GROUP_BY_KEY: Record<string, "foundation" | "execution" | "market_evidence"> = {
  // foundation (7)
  "comp-alt": "foundation",
  "unique-attr": "foundation",
  "val-prop": "foundation",
  "target-aud": "foundation",
  "market-cat": "foundation",
  "program-model": "foundation",
  "needs-assessment": "foundation",

  // execution (4)
  "outcome-data": "execution",
  "referral-map": "execution",
  "brand-narrative": "execution",
  "channel-strat": "execution",

  // market evidence (3)
  "donor-retention": "market_evidence",
  "grant-pipeline": "market_evidence",
  "family-satisfaction": "market_evidence",
};

function groupLabelForKey(groupKey: "foundation" | "execution" | "market_evidence") {
  if (groupKey === "execution") return "Execution";
  if (groupKey === "market_evidence") return "Market Evidence";
  return "Foundation";
}

/**
 * Fixed input key order (always 14)
 */
const INPUT_KEYS: string[] = [
  "comp-alt",
  "unique-attr",
  "val-prop",
  "target-aud",
  "market-cat",
  "program-model",
  "needs-assessment",
  "outcome-data",
  "referral-map",
  "brand-narrative",
  "channel-strat",
  "donor-retention",
  "grant-pipeline",
  "family-satisfaction",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    console.log("[research-company] method", req.method);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

    if (!supabaseUrl || !serviceRoleKey || !anonKey) return jsonResponse({ error: "Missing Supabase env vars" }, 500);
    if (!openaiKey) return jsonResponse({ error: "Missing OPENAI_API_KEY" }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate user session (even if served with --no-verify-jwt)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "No auth header" }, 401);

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    const user = userRes?.user;
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const company_id = body?.company_id;
    const company_name = body?.company_name;
    const website = typeof body?.website === "string" ? body.website : "";

    if (!company_id || !company_name) {
      return jsonResponse({ error: "company_id and company_name required" }, 400);
    }

    // ✅ Option A: fetch latest public baseline once, reuse later
    const { data: baselineRun, error: baselineErr } = await supabase
      .from("public_baseline_runs")
      .select("id, created_at, result_json")
      .eq("company_id", company_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (baselineErr) console.log("[research-company] baseline fetch error:", baselineErr.message);

    const baselineStatus = String((baselineRun?.result_json as { status?: string } | null)?.status || "ok");
    const baselineReason = String((baselineRun?.result_json as { reason?: string } | null)?.reason || "");

    if (baselineStatus === "ambiguous_public_evidence" || baselineStatus === "insufficient_public_evidence") {
      console.log("[research-company] blocked by baseline status", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        baselineStatus,
        baselineReason,
      });

      return jsonResponse({
        error: "Public baseline is not strong enough to generate company research",
        status: baselineStatus,
        reason: baselineReason || "Latest public baseline does not have enough trustworthy evidence.",
        baseline_run_id: baselineRun?.id ?? null,
      }, 422);
    }

    // -------------------------
    // 1) Generate INPUTS (14) — schema does NOT include group fields
    // -------------------------
    const inputsSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        inputs: {
          type: "array",
          minItems: 14,
          maxItems: 14,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              input_key: { type: "string", enum: INPUT_KEYS },
              input_label: { type: "string" },
              sub_group: { type: "string" },
              description: { type: "string" },
              why_it_matters: { type: "string" },
            },
            required: ["input_key", "input_label", "sub_group", "description", "why_it_matters"],
          },
        },
      },
      required: ["inputs"],
    };

    const baselineBrief = buildBaselineBrief(baselineRun?.result_json ?? null);

    const inputsUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Return EXACTLY 14 input objects, one per input_key in this list.\n` +
      `Do not omit any.\n\n` +
      `Keys:\n` +
      INPUT_KEYS.map((k) => `- ${k}`).join("\n");

    const inputsSystemText =
      `You are a strategy analyst using the Mojo Strategy Map.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("inputs", getFrameworkRoutingPlan("inputs"))}\n\n` +
      `Constraints:\n` +
      `- Stay strictly consistent with the public baseline, website, buyer context, and company category\n` +
      `- Never switch industries, populations, service models, or buyer types from the baseline evidence\n` +
      `- If evidence indicates youth mental health, do not output elder care, senior living, home care, or adjacent sectors\n` +
      `- When evidence is weak, use cautious wording instead of inventing specifics\n` +
      `- input_label max 5 words\n` +
      `- sub_group max 4 words\n` +
      `- description max 10 words\n` +
      `- why_it_matters max 10 words\n`;

    const inputsResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_inputs_v2",
      schema: inputsSchema,
      systemText: inputsSystemText,
      userText: inputsUserText,
      maxOutputTokens: 1400,
      temperature: 0.2,
    });

    const inputsRaw: any[] = Array.isArray(inputsResult?.inputs) ? inputsResult.inputs : [];
    if (inputsRaw.length !== 14) return jsonResponse({ error: `Expected 14 inputs, got ${inputsRaw.length}` }, 500);

    // Ensure: exactly one per key, and order them
    const byKey: Record<string, any> = {};
    for (const it of inputsRaw) {
      const k = String(it?.input_key || "").trim();
      if (!k) continue;
      byKey[k] = it;
    }
    const inputs: any[] = INPUT_KEYS.map((k) => byKey[k]).filter(Boolean);
    if (inputs.length !== 14) return jsonResponse({ error: "Inputs missing one or more required keys" }, 500);
    const inputFrameworkKeys = frameworkKeysFor("inputs");

    // -------------------------
    // 2) Generate JOURNEYS (customer/revenue/operations)
    // -------------------------
    const journeysSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        journeys: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              journey_key: { type: "string", enum: ["customer", "revenue", "operations"] },
              journey_title: { type: "string" },
              journey_subtitle: { type: "string" },
              steps: {
                type: "array",
                minItems: 5,
                maxItems: 8,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    step_number: { type: "integer" },
                    step_label: { type: "string" },
                    description: { type: "string" },
                    designed: { type: "boolean" },
                    has_gap: { type: "boolean" },
                    evidence_status: { type: "string", enum: ["evidenced", "implied", "unclear"] },
                    evidence_basis: { type: "string" },
                    evidence_confidence: { type: "integer" },
                    gap_note: { type: "string" },
                  },
                  required: ["step_number", "step_label", "description", "designed", "has_gap", "evidence_status", "evidence_basis", "evidence_confidence", "gap_note"],
                },
              },
            },
            required: ["journey_key", "journey_title", "journey_subtitle", "steps"],
          },
        },
      },
      required: ["journeys"],
    };

    const journeyFrameworks = getFrameworkRoutingPlan("journeys");
    const journeyFrameworkBrief = buildFrameworkBrief("journeys", journeyFrameworks);
    const journeyFrameworkKeys = journeyFrameworks.map((framework) => framework.key);

    const journeysSystemText =
      `You are generating an executive-quality journey map for a strategy platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Write content that reads like a real end-to-end operating journey, not generic placeholders.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${journeyFrameworkBrief}\n\n` +
      `Constraints:\n` +
      `- journey_title should be specific to the company context\n` +
      `- journey_subtitle should explain the full journey in one sentence\n` +
      `- customer journey = external user/buyer experience from discovery to post-use\n` +
      `- revenue journey = how the company wins, funds, contracts, renews, or monetizes demand\n` +
      `- operations journey = how the company delivers, operates, manufactures, certifies, or supports the offering\n` +
      `- Never switch industries, populations, service models, or buyer types from the public baseline\n` +
      `- step_label 2–5 words\n` +
      `- description 18–40 words, concrete and sequential\n` +
      `- evidence_status must be one of evidenced, implied, or unclear\n` +
      `- evidenced = directly supported by public evidence\n` +
      `- implied = strongly suggested by the business model or multiple signals, but not directly proven\n` +
      `- unclear = weak, missing, or ambiguous evidence\n` +
      `- evidence_basis 8–24 words explaining the evidence or inference behind the step status\n` +
      `- evidence_confidence 0..100 based on how grounded the step is in public evidence\n` +
      `- gap_note 6–18 words and specific when there is a gap\n` +
      `- designed=true only when the step appears intentionally supported and evidence_status is evidenced or implied\n` +
      `- designed=false when evidence_status is unclear\n` +
      `- has_gap=true when there is a visible weakness, missing capability, or unclear handoff\n` +
      `- if has_gap=false, set gap_note to an empty string\n`;

    const journeysUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Create 3 journeys: customer, revenue, operations.\n` +
      `For each journey: 5–8 steps, numbered 1..N.\n` +
      `Make the sequence realistic for this exact company category and economic model.\n` +
      `Do not use generic labels like "Engagement" or "Operations" unless they are qualified.\n` +
      `Mark designed=false and has_gap=true when unclear from public info.\n`;

    const journeysResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_journeys_v1",
      schema: journeysSchema,
      systemText: journeysSystemText,
      userText: journeysUserText,
      maxOutputTokens: 2400,
      temperature: 0.2,
    });

    const journeys: any[] = Array.isArray(journeysResult?.journeys) ? journeysResult.journeys : [];
    if (journeys.length !== 3) return jsonResponse({ error: `Expected 3 journeys, got ${journeys.length}` }, 500);

    // -------------------------
    // 3) Generate OPPORTUNITIES (15–30)
    // -------------------------
    const oppsSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        opportunities: {
          type: "array",
          minItems: 15,
          maxItems: 30,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              outcome: { type: "string" },
              step_number: { type: "integer" },
              step_label: { type: "string" },
              journey_key: { type: "string", enum: ["customer", "revenue", "operations"] },
              importance: { type: "integer" },
              satisfaction: { type: "integer" },
              opportunity_score: { type: "integer" },
              priority_tier: { type: "string", enum: ["focus", "monitor", "defer"] },
            },
            required: ["outcome", "step_number", "step_label", "journey_key", "importance", "satisfaction", "opportunity_score", "priority_tier"],
          },
        },
      },
      required: ["opportunities"],
    };

    const oppsSystemText =
      `You are generating opportunity records for a strategy platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("opportunities", getFrameworkRoutingPlan("opportunities"))}\n\n` +
      `Rules:\n` +
      `- Use the provided journeys and steps exactly; do not invent unrelated step labels\n` +
      `- Opportunities should target bottlenecks, missing capabilities, weak transitions, or unclear handoffs in those journeys\n` +
      `- outcome must read like an ODI desired outcome statement, not a feature idea or recommendation\n` +
      `- Use a structured formula close to: direction + metric + object + context\n` +
      `- Use verbs like minimize, reduce, increase, improve, maximize, or avoid when appropriate\n` +
      `- Keep outcomes solution-free, stable over time, and measurable in spirit\n` +
      `- Never switch industries, populations, service models, or buyer types from the public baseline\n` +
      `- Good example style: "Minimize the time it takes to complete intake during a family crisis"\n` +
      `- Bad example style: "Build a better intake form" or "Add referral dashboard"\n` +
      `- importance/satisfaction 1..10\n` +
      `- opportunity_score = importance + (10 - satisfaction)\n` +
      `- priority_tier: focus if >= 12, monitor if >= 7, defer if < 7\n` +
      `- Bias toward higher importance / lower satisfaction when a referenced step has has_gap=true or designed=false\n` +
      `- Treat high-importance, low-satisfaction outcomes as underserved opportunities\n`;

    const oppsUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Generated journeys and steps:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generate 15–30 opportunities across customer/revenue/operations.\n` +
      `Tie each opportunity to an existing step_number + step_label from the generated journeys above.\n` +
      `Cover all three journeys.\n`;

    const oppsResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_opps_v1",
      schema: oppsSchema,
      systemText: oppsSystemText,
      userText: oppsUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    const opportunities: any[] = Array.isArray(oppsResult?.opportunities) ? oppsResult.opportunities : [];
    if (opportunities.length < 15) return jsonResponse({ error: `Expected >=15 opportunities, got ${opportunities.length}` }, 500);
    const opportunityFrameworkKeys = frameworkKeysFor("opportunities");
    const odiFrameworkKeys = Array.from(new Set([
      ...getFrameworkRoutingPlan("journeys").map((framework) => framework.key),
      ...getFrameworkRoutingPlan("opportunities").map((framework) => framework.key),
    ]));

    // -------------------------
    // 4) Generate ROUTES (9–18)
    // -------------------------
    const routesSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        routes: {
          type: "array",
          minItems: 9,
          maxItems: 18,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              category: { type: "string", enum: ["fix", "improve", "create"] },
              title: { type: "string" },
              short_description: { type: "string" },
              pts_value: { type: "integer" },
              effort: { type: "string", enum: ["low", "medium", "high"] },
              type: { type: "string", enum: ["Fix", "Improve", "Create"] },
              sort_order: { type: "integer" },
            },
            required: ["category", "title", "short_description", "pts_value", "effort", "type", "sort_order"],
          },
        },
      },
      required: ["routes"],
    };

    const routesSystemText =
      `You are generating strategy routes for a consulting platform.\n` +
      `Return ONLY valid JSON that matches the schema. No prose.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("routes", getFrameworkRoutingPlan("routes"))}\n\n` +
      `Rules:\n` +
      `- Create 9-18 routes total across fix, improve, create\n` +
      `- Use the journey and opportunity context provided; routes should feel like logical initiatives, not raw issues\n` +
      `- title should be 3-7 words and action-oriented\n` +
      `- short_description should be 16-32 words and mention why the route matters\n` +
      `- pts_value should be 1..10 and reflect likely score impact\n` +
      `- sort_order should rank strongest routes first within the whole set\n` +
      `- Never switch industries, populations, service models, or buyer types from the public baseline\n` +
      `- Fix = remove blockers/gaps, Improve = strengthen existing systems, Create = build net-new strategic assets\n` +
      `- type must match category in title case\n`;

    const routesUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Generated journeys:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generate routes that synthesize these into coherent strategic workstreams.\n`;

    const routesResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_routes_v1",
      schema: routesSchema,
      systemText: routesSystemText,
      userText: routesUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    const routes: any[] = Array.isArray(routesResult?.routes) ? routesResult.routes : [];
    if (routes.length < 9) return jsonResponse({ error: `Expected >=9 routes, got ${routes.length}` }, 500);
    const routeFrameworkKeys = frameworkKeysFor("routes");

    // -------------------------
    // 5) Generate POSITIONING CANVAS
    // -------------------------
    const positioningCanvasSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        competitive_alternatives: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              highlighted: { type: "boolean" },
            },
            required: ["id", "name", "description", "highlighted"],
          },
        },
        unique_attributes: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              description: { type: "string" },
              highlighted: { type: "boolean" },
            },
            required: ["id", "name", "description", "highlighted"],
          },
        },
        value_for_customer: { type: "string" },
        best_fit_customers: { type: "string" },
        market_category: { type: "string" },
        category_rationale: { type: "string" },
        current_tagline: { type: "string" },
        proposed_tagline: { type: "string" },
      },
      required: [
        "competitive_alternatives",
        "unique_attributes",
        "value_for_customer",
        "best_fit_customers",
        "market_category",
        "category_rationale",
        "current_tagline",
        "proposed_tagline",
      ],
    };

    const positioningFrameworkKeys = getFrameworkRoutingPlan("positioning").map((framework) => framework.key);

    const positioningCanvasSystemText =
      `You are generating an April Dunford style positioning canvas for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Apply the framework guidance below as decision rules, not as output headings.\n\n` +
      `Framework guidance:\n${buildFrameworkBrief("positioning", getFrameworkRoutingPlan("positioning"))}\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the provided website, evidence, category, audience, and company context\n` +
      `- Never switch industries, populations, or buyer types; if the evidence says youth mental healthcare, do not output elder care, senior living, or adjacent but different markets\n` +
      `- competitive_alternatives should be real alternatives, including manual workarounds or doing nothing when relevant\n` +
      `- competitive_alternatives must serve the same customer/job context as the company; do not list alternatives from unrelated sectors\n` +
      `- unique_attributes should be specific and credible, not vague marketing claims\n` +
      `- value_for_customer should describe what customers can do or achieve that they could not before\n` +
      `- best_fit_customers should describe the clearest-fit audience in one paragraph\n` +
      `- market_category should be the category the company should claim or reshape\n` +
      `- market_category and best_fit_customers must align with the public baseline and website evidence\n` +
      `- category_rationale should explain why this category framing helps buyers understand the company\n` +
      `- current_tagline should be an exact homepage or website phrase if publicly evidenced; if not clearly present, return 'unknown'\n` +
      `- proposed_tagline should be a strategist-quality direction, not a generic slogan\n` +
      `- highlighted=true only for the strongest or most differentiating items\n`;

    const positioningCanvasUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputs)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generated routes:\n${routes
        .slice(0, 10)
        .map((route: any, index: number) =>
          `${index + 1}. ${route?.category || "improve"} | ${route?.title || "Untitled"} | ${route?.short_description || "No description"}`
        )
        .join("\n")}\n\n` +
      `Generate a positioning canvas for this exact company.`;

    const positioningCanvasResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_positioning_canvas_v1",
      schema: positioningCanvasSchema,
      systemText: positioningCanvasSystemText,
      userText: positioningCanvasUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    // -------------------------
    // 6) Generate STRATEGY CASCADE
    // -------------------------
    const strategyCascadeSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        winning_aspiration: { type: "string" },
        where_to_play: { type: "string" },
        how_to_win: { type: "string" },
        capabilities: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["strong", "developing", "gap"] },
              note: { type: "string" },
            },
            required: ["name", "status", "note"],
          },
        },
        management_systems: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              status: { type: "string", enum: ["strong", "developing", "gap"] },
              note: { type: "string" },
            },
            required: ["name", "status", "note"],
          },
        },
        assumptions: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              assumption: { type: "string" },
              tested: { type: "boolean" },
              note: { type: "string" },
            },
            required: ["assumption", "tested", "note"],
          },
        },
      },
      required: [
        "winning_aspiration",
        "where_to_play",
        "how_to_win",
        "capabilities",
        "management_systems",
        "assumptions",
      ],
    };

    const strategyFrameworkKeys = positioningFrameworkKeys;

    const strategyCascadeSystemText =
      `You are generating a strategy cascade for a strategy platform.\n` +
      `Return ONLY valid JSON matching the schema. No prose outside the JSON.\n` +
      `Synthesize the evidence into a clear Roger Martin style cascade.\n` +
      `Use strong, executive-quality language, but stay tethered to the supplied evidence.\n` +
      `If evidence is thin, make the uncertainty explicit through status and assumptions rather than pretending certainty.\n\n` +
      `Rules:\n` +
      `- Stay strictly consistent with the public baseline, website, buyer context, and company category\n` +
      `- Never switch industries, populations, service models, or buyer types from the baseline evidence\n` +
      `- If evidence indicates youth mental health, do not output elder care, senior living, home care, or adjacent sectors\n` +
      `- winning_aspiration, where_to_play, and how_to_win should each be one well-written paragraph\n` +
      `- capabilities should be concrete operational or strategic abilities, not departments\n` +
      `- management_systems should be recurring operating loops, measurement systems, governance, planning, or resource systems\n` +
      `- status=strong only when the capability or system is meaningfully evidenced\n` +
      `- status=developing when there is some evidence but it appears incomplete or immature\n` +
      `- status=gap when it appears important but weak, missing, or unproven\n` +
      `- note should be a short evidence-based explanation, 6-16 words\n` +
      `- assumptions should read like untested strategic beliefs or claims implied by the company story\n` +
      `- assumptions.note should explain why the assumption is untested or what would validate it\n`;

    const strategyCascadeUserText =
      `Company: ${company_name}\nWebsite: ${website || "unknown"}\n\n` +
      `Public baseline context:\n${baselineBrief}\n\n` +
      `Generated strategy inputs:\n${buildInputBrief(inputs)}\n\n` +
      `Generated journeys:\n${buildJourneyBrief(journeys)}\n\n` +
      `Generated opportunities:\n${buildOpportunityBrief(opportunities)}\n\n` +
      `Generated routes:\n${routes
        .slice(0, 12)
        .map((route: any, index: number) =>
          `${index + 1}. ${route?.category || "improve"} | ${route?.title || "Untitled"} | ${route?.short_description || "No description"}`
        )
        .join("\n")}\n\n` +
      `Generate a full strategy cascade for this exact company in the supplied schema.`;

    const strategyCascadeResult = await callOpenAIJSON({
      apiKey: openaiKey,
      model: openaiModel,
      schemaName: "mojo_strategy_cascade_v1",
      schema: strategyCascadeSchema,
      systemText: strategyCascadeSystemText,
      userText: strategyCascadeUserText,
      maxOutputTokens: 2200,
      temperature: 0.2,
    });

    const consistencyReview = await runConsistencyReview({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      inputs,
      journeys,
      opportunities,
      routes,
      positioning: positioningCanvasResult,
      strategy: strategyCascadeResult,
    });

    const positioningReview = await runPositioningReview({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      positioning: positioningCanvasResult,
      opportunities,
      routes,
    });

    const evidenceReview = await runEvidenceReview({
      apiKey: openaiKey,
      model: openaiModel,
      companyName: company_name,
      website,
      baselineBrief,
      journeys,
      opportunities,
      routes,
      positioning: positioningCanvasResult,
      strategy: strategyCascadeResult,
    });

    const reviewResults = [
      { key: "consistency", review: consistencyReview },
      { key: "positioning", review: positioningReview },
      { key: "evidence", review: evidenceReview },
    ];
    const highSeverityReviews = reviewResults.filter(
      (entry) => String(entry.review?.severity || "low").toLowerCase() === "high",
    );

    if (highSeverityReviews.length > 0) {
      console.log("[research-company] blocked by reviewer findings", {
        company_id,
        baseline_run_id: baselineRun?.id ?? null,
        reviews: highSeverityReviews.map((entry) => ({
          key: entry.key,
          severity: entry.review?.severity,
          summary: entry.review?.summary,
          findings: Array.isArray(entry.review?.findings) ? entry.review.findings.length : 0,
        })),
      });

      return jsonResponse({
        error: "Generated draft needs review before it can be saved",
        status: "review_blocked",
        baseline_run_id: baselineRun?.id ?? null,
        reviews: reviewResults,
      }, 422);
    }

    // -------------------------
    // 7) Clear old rows for company
    // -------------------------
    const { data: existingInputs } = await supabase.from("inputs").select("id").eq("company_id", company_id);
    const existingIds = (existingInputs || []).map((r: any) => r.id);

    if (existingIds.length > 0) {
      await supabase.from("input_subitems").delete().in("input_id", existingIds);
      await supabase.from("input_files").delete().in("input_id", existingIds);
      await supabase.from("inputs").delete().in("id", existingIds);
    }

    await supabase.from("job_steps").delete().eq("company_id", company_id);
    await supabase.from("opportunities").delete().eq("company_id", company_id);
    await supabase.from("routes").delete().eq("company_id", company_id);
    await supabase.from("odi_needs").delete().eq("company_id", company_id);
    await supabase.from("odi_market_definitions").delete().eq("company_id", company_id);
    await supabase.from("positioning_canvases").delete().eq("company_id", company_id);
    await supabase.from("strategy_cascades").delete().eq("company_id", company_id);

    // -------------------------
    // 8) Insert inputs / steps / opps / routes
    // -------------------------
    let inputsInserted = 0;
    let stepsInserted = 0;
    let oppsInserted = 0;
    let routesInserted = 0;
    let odiNeedsInserted = 0;
    let positioningCanvasInserted = 0;
    let strategyCascadeInserted = 0;

    // Inputs: FORCE deterministic group assignment
    for (const input of inputs) {
      const key = String(input?.input_key || "").trim();
      if (!key) continue;

      const derivedGroupKey = INPUT_GROUP_BY_KEY[key] ?? "foundation";
      const derivedGroupLabel = groupLabelForKey(derivedGroupKey);

      const { data: row, error: insertErr } = await supabase
        .from("inputs")
        .insert({
          input_key: key,
          input_label: String(input?.input_label || "Unnamed Input"),
          frameworks_used: inputFrameworkKeys,
          group_key: derivedGroupKey,
          group_label: derivedGroupLabel,
          sub_group: String(input?.sub_group || ""),
          description: String(input?.description || ""),
          why_it_matters: String(input?.why_it_matters || ""),
          score_impact: 5,
          impact_tier: "med",
          completeness: 0,
          status: "not_started",
          user_id: user.id,
          company_id,
        })
        .select("id")
        .single();

      if (insertErr) {
        console.error("[research-company] insert input error:", insertErr);
        continue;
      }

      if (row?.id) {
        await supabase.from("input_subitems").insert({
          input_id: row.id,
          name: String(input?.input_label || "Checklist item"),
          done: false,
          sort_order: 0,
        });
      }

      inputsInserted++;
    }

    // Job steps
    for (const journey of journeys) {
      const journeyKey = ["customer", "revenue", "operations"].includes(journey?.journey_key)
        ? journey.journey_key
        : "customer";

      const steps = Array.isArray(journey?.steps) ? journey.steps : [];
      for (const step of steps) {
        const stepPayload = {
          company_id,
          user_id: user.id,
          frameworks_used: journeyFrameworkKeys,
          journey_key: journeyKey,
          journey_title: String(journey?.journey_title || ""),
          journey_subtitle: String(journey?.journey_subtitle || ""),
          step_number: Number(step?.step_number) || 1,
          step_label: String(step?.step_label || ""),
          description: String(step?.description || ""),
          designed: !!step?.designed,
          has_gap: !!step?.has_gap,
          evidence_status: ["evidenced", "implied", "unclear"].includes(String(step?.evidence_status))
            ? String(step?.evidence_status)
            : "unclear",
          evidence_basis: String(step?.evidence_basis || ""),
          evidence_confidence: clamp(Number(step?.evidence_confidence) || 0, 0, 100),
          gap_note: String(step?.gap_note || ""),
        };

        let { error: stepErr } = await supabase.from("job_steps").insert(stepPayload);

        if (stepErr && isJobStepEvidenceColumnError(stepErr.message || "")) {
          const fallback = await supabase.from("job_steps").insert({
            company_id,
            user_id: user.id,
            frameworks_used: journeyFrameworkKeys,
            journey_key: journeyKey,
            journey_title: String(journey?.journey_title || ""),
            journey_subtitle: String(journey?.journey_subtitle || ""),
            step_number: Number(step?.step_number) || 1,
            step_label: String(step?.step_label || ""),
            description: String(step?.description || ""),
            designed: !!step?.designed,
            has_gap: !!step?.has_gap,
            gap_note: String(step?.gap_note || ""),
          });
          stepErr = fallback.error;
        }

        if (stepErr) console.error("[research-company] job step insert error:", stepErr);
        else stepsInserted++;
      }
    }

    // Opportunities: recompute tier from score to keep consistent
    for (const opp of opportunities) {
      const journeyKey = ["customer", "revenue", "operations"].includes(opp?.journey_key)
        ? opp.journey_key
        : "customer";

      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(
        Number(opp?.opportunity_score) || (importance + (10 - satisfaction)),
        0,
        20,
      );

      const priority_tier =
        opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";

      const { error: oppErr } = await supabase.from("opportunities").insert({
        company_id,
        user_id: user.id,
        frameworks_used: opportunityFrameworkKeys,
        outcome: String(opp?.outcome || ""),
        step_number: Number(opp?.step_number) || 0,
        step_label: String(opp?.step_label || ""),
        journey_key: journeyKey,
        importance,
        satisfaction,
        opportunity_score,
        priority_tier,
      });

      if (oppErr) console.error("[research-company] opportunity insert error:", oppErr);
      else oppsInserted++;
    }

    const customerJourney = journeys.find((journey) => journey?.journey_key === "customer");
    const baselineLens = (baselineRun?.result_json as {
      lens_card?: {
        primary_buyer?: string;
        chooser?: string;
        user?: string;
      };
    } | null)?.lens_card ?? {};

    const job_executor =
      String(baselineLens.user || baselineLens.primary_buyer || "Unknown from public evidence");
    const chooser =
      String(baselineLens.chooser || "Unknown from public evidence");
    const jtbd =
      customerJourney?.journey_title
        ? `Make progress through ${String(customerJourney.journey_title).toLowerCase()}`
        : "Understand and complete the core job progress for this offering";

    const { error: odiMarketErr } = await supabase.from("odi_market_definitions").insert({
      company_id,
      user_id: user.id,
      job_executor,
      chooser,
      jtbd,
      source_path: "public_research",
      frameworks_used: odiFrameworkKeys,
    });
    if (odiMarketErr) {
      console.error("[research-company] odi market definition insert error:", odiMarketErr);
    }

    for (const opp of opportunities) {
      const importance = clamp(Number(opp?.importance) || 5, 1, 10);
      const satisfaction = clamp(Number(opp?.satisfaction) || 5, 1, 10);
      const opportunity_score = clamp(
        Number(opp?.opportunity_score) || (importance + (10 - satisfaction)),
        0,
        20,
      );
      const priority_tier =
        opportunity_score >= 12 ? "focus" : opportunity_score >= 7 ? "monitor" : "defer";

      const { error: odiNeedErr } = await supabase.from("odi_needs").insert({
        company_id,
        user_id: user.id,
        tier: "need",
        desired_outcome: String(opp?.outcome || ""),
        journey_key: ["customer", "revenue", "operations"].includes(opp?.journey_key)
          ? opp.journey_key
          : "customer",
        step_number: Number(opp?.step_number) || 0,
        step_label: String(opp?.step_label || ""),
        importance,
        satisfaction,
        opportunity_score,
        service_state: odiServiceState(importance, satisfaction),
        source_path: "public_research",
        frameworks_used: odiFrameworkKeys,
      });

      if (odiNeedErr) console.error("[research-company] odi need insert error:", odiNeedErr);
      else odiNeedsInserted++;
    }

    // Routes
    for (const route of routes) {
      const category = ["fix", "improve", "create"].includes(String(route?.category))
        ? String(route.category)
        : "improve";

      const routeType = category === "fix" ? "Fix" : category === "create" ? "Create" : "Improve";
      const effort = ["low", "medium", "high"].includes(String(route?.effort))
        ? String(route.effort)
        : "medium";

      const routePayload = {
        company_id,
        user_id: user.id,
        frameworks_used: routeFrameworkKeys,
        category,
        title: String(route?.title || ""),
        short_description: String(route?.short_description || ""),
        pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
        effort,
        type: String(route?.type || routeType),
        sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
      };

      let { error: routeErr } = await supabase.from("routes").insert(routePayload);

      if (routeErr && String(routeErr.message || "").toLowerCase().includes("frameworks_used")) {
        const fallback = await supabase.from("routes").insert({
          company_id,
          user_id: user.id,
          category,
          title: String(route?.title || ""),
          short_description: String(route?.short_description || ""),
          pts_value: clamp(Number(route?.pts_value) || 1, 1, 10),
          effort,
          type: String(route?.type || routeType),
          sort_order: Math.max(1, Number(route?.sort_order) || routesInserted + 1),
        });
        routeErr = fallback.error;
      }

      if (routeErr) console.error("[research-company] route insert error:", routeErr);
      else routesInserted++;
    }

    const positioningPayload = {
      company_id,
      user_id: user.id,
      frameworks_used: positioningFrameworkKeys,
      competitive_alternatives_json: Array.isArray(positioningCanvasResult?.competitive_alternatives)
        ? positioningCanvasResult.competitive_alternatives
        : [],
      unique_attributes_json: Array.isArray(positioningCanvasResult?.unique_attributes)
        ? positioningCanvasResult.unique_attributes
        : [],
      value_for_customer: String(positioningCanvasResult?.value_for_customer || ""),
      best_fit_customers: String(positioningCanvasResult?.best_fit_customers || ""),
      market_category: String(positioningCanvasResult?.market_category || ""),
      category_rationale: String(positioningCanvasResult?.category_rationale || ""),
      current_tagline: String(positioningCanvasResult?.current_tagline || ""),
      proposed_tagline: String(positioningCanvasResult?.proposed_tagline || ""),
    };

    let { error: positioningErr } = await supabase.from("positioning_canvases").insert(positioningPayload);
    if (positioningErr && String(positioningErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase.from("positioning_canvases").insert({
        company_id,
        user_id: user.id,
        competitive_alternatives_json: Array.isArray(positioningCanvasResult?.competitive_alternatives)
          ? positioningCanvasResult.competitive_alternatives
          : [],
        unique_attributes_json: Array.isArray(positioningCanvasResult?.unique_attributes)
          ? positioningCanvasResult.unique_attributes
          : [],
        value_for_customer: String(positioningCanvasResult?.value_for_customer || ""),
        best_fit_customers: String(positioningCanvasResult?.best_fit_customers || ""),
        market_category: String(positioningCanvasResult?.market_category || ""),
        category_rationale: String(positioningCanvasResult?.category_rationale || ""),
        current_tagline: String(positioningCanvasResult?.current_tagline || ""),
        proposed_tagline: String(positioningCanvasResult?.proposed_tagline || ""),
      });
      positioningErr = fallback.error;
    }

    if (positioningErr) console.error("[research-company] positioning canvas insert error:", positioningErr);
    else positioningCanvasInserted++;

    const cascadePayload = {
      company_id,
      user_id: user.id,
      frameworks_used: strategyFrameworkKeys,
      winning_aspiration: String(strategyCascadeResult?.winning_aspiration || ""),
      where_to_play: String(strategyCascadeResult?.where_to_play || ""),
      how_to_win: String(strategyCascadeResult?.how_to_win || ""),
      capabilities_json: Array.isArray(strategyCascadeResult?.capabilities)
        ? strategyCascadeResult.capabilities
        : [],
      management_systems_json: Array.isArray(strategyCascadeResult?.management_systems)
        ? strategyCascadeResult.management_systems
        : [],
      assumptions_json: Array.isArray(strategyCascadeResult?.assumptions)
        ? strategyCascadeResult.assumptions
        : [],
    };

    let { error: cascadeErr } = await supabase.from("strategy_cascades").insert(cascadePayload);
    if (cascadeErr && String(cascadeErr.message || "").toLowerCase().includes("frameworks_used")) {
      const fallback = await supabase.from("strategy_cascades").insert({
        company_id,
        user_id: user.id,
        winning_aspiration: String(strategyCascadeResult?.winning_aspiration || ""),
        where_to_play: String(strategyCascadeResult?.where_to_play || ""),
        how_to_win: String(strategyCascadeResult?.how_to_win || ""),
        capabilities_json: Array.isArray(strategyCascadeResult?.capabilities)
          ? strategyCascadeResult.capabilities
          : [],
        management_systems_json: Array.isArray(strategyCascadeResult?.management_systems)
          ? strategyCascadeResult.management_systems
          : [],
        assumptions_json: Array.isArray(strategyCascadeResult?.assumptions)
          ? strategyCascadeResult.assumptions
          : [],
      });
      cascadeErr = fallback.error;
    }

    if (cascadeErr) console.error("[research-company] strategy cascade insert error:", cascadeErr);
    else strategyCascadeInserted++;

    // -------------------------
    // 9) Use baselineRun (fetched once) + update company scores
    // -------------------------
    const run = baselineRun ?? null;

    const scored = scoreCompanyMojo({
      baselineResultJson: run?.result_json ?? null,
      inputs,
      jobSteps: journeys.flatMap((journey) => Array.isArray(journey?.steps) ? journey.steps.map((step: any) => ({
        journey_key: journey?.journey_key,
        designed: step?.designed,
        has_gap: step?.has_gap,
      })) : []),
      opportunities: opportunities.map((opp) => ({
        journey_key: opp?.journey_key,
        importance: opp?.importance,
        satisfaction: opp?.satisfaction,
        priority_tier: opp?.priority_tier,
      })),
      gamma: 2.2,
    });

    const { error: updErr } = await supabase
      .from("companies")
      .update({
        ...scored,
        last_scored_at: new Date().toISOString(),
      })
      .eq("id", company_id);

    if (updErr) {
      console.log("[research-company] company score update failed:", updErr.message);
    } else {
      console.log("[research-company] scored company", {
        company_id,
        mojo_score: scored.mojo_score,
        evidence_status: scored.evidence_status,
        baseline_run_id: run?.id ?? null,
      });
    }

    return jsonResponse({
      message: "Research complete",
      inputs_inserted: inputsInserted,
      steps_inserted: stepsInserted,
      opportunities_inserted: oppsInserted,
      routes_inserted: routesInserted,
      odi_needs_inserted: odiNeedsInserted,
      positioning_canvas_inserted: positioningCanvasInserted,
      strategy_cascade_inserted: strategyCascadeInserted,
      mojo_score: scored.mojo_score,
      evidence_status: scored.evidence_status,
    });
  } catch (err) {
    console.error("[research-company] error:", err);
    return jsonResponse({ error: String((err as any)?.message || err) }, 500);
  }
});
