import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  JTBD_CHECKPOINT_COUNT,
  JTBD_ODI_CHECKPOINTS,
  containsNonOdiProcessLanguage,
  containsSolutionPrescriptiveLanguage,
  normalizeToEightCheckpointSpine,
  validateEightCheckpointSpine,
} from "../_shared/jtbdProcess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const OLLAMA_TIMEOUT_MS = 120_000;
const STANDARD_MARKET_CATEGORY_LIST =
  "B2B SaaS, B2C SaaS, Marketplace, E-commerce, Professional Services, Healthcare Services, Financial Services, Education Services, Nonprofit Services, Hospitality/Foodservice, Logistics/Transportation, Manufacturing, Public Sector/Government";

type SelectedJobMap = {
  journey_key: string;
  journey_title: string;
  journey_subtitle: string;
};

type NormalizedStep = {
  step_number: number;
  step_label: string;
  description: string;
  designed: boolean;
  has_gap: boolean;
  evidence_status: "evidenced" | "implied" | "unclear";
  evidence_basis: string;
  evidence_confidence: number;
  gap_note: string;
};

type NormalizedJourney = {
  journey_key: string;
  journey_title: string;
  journey_subtitle: string;
  steps: NormalizedStep[];
};

type LocalNeed = {
  desired_outcome: string;
  step_number: number;
  step_label: string;
  importance: number;
  satisfaction: number;
  opportunity_score: number;
  evidence_basis: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLocalOllamaUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const host = String(url.hostname || "").trim().toLowerCase();
    return LOCAL_HOST_ALLOWLIST.has(host);
  } catch {
    return false;
  }
}

function normalizeJourneyKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isCustomerJourneyKey(key: string) {
  return key === "customer" || key.startsWith("customer-");
}

function defaultJourneyTitle(key: string) {
  if (key === "customer") return "Job Map: Customer Progress";
  if (key === "revenue") return "Job Map: Securing Revenue Outcomes";
  if (key === "operations") return "Job Map: Delivering Consistent Service";
  const pretty = key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return pretty ? `Job Map: ${pretty}` : "Job Map: Customer Progress";
}

function defaultJourneySubtitle(key: string) {
  if (key === "customer") return "How the primary job performer moves through all 8 customer checkpoints.";
  if (key === "revenue") return "How demand turns into recurring economic outcomes.";
  if (key === "operations") return "How delivery operations coordinate execution and quality.";
  return "How this journey progresses from clear intent to measurable outcomes.";
}

function parseSelectedJobMaps(raw: unknown) {
  const rows = Array.isArray(raw) ? raw : [];
  const byKey = new Map<string, SelectedJobMap>();

  for (const row of rows) {
    const obj = asRecord(row);
    const key = normalizeJourneyKey(obj?.journey_key);
    if (!key) continue;
    if (byKey.has(key)) continue;
    const title = safeText(obj?.journey_title) || defaultJourneyTitle(key);
    const subtitle = safeText(obj?.journey_subtitle) || defaultJourneySubtitle(key);
    byKey.set(key, {
      journey_key: key,
      journey_title: title,
      journey_subtitle: subtitle,
    });
  }

  if (byKey.size === 0) {
    byKey.set("customer", {
      journey_key: "customer",
      journey_title: defaultJourneyTitle("customer"),
      journey_subtitle: defaultJourneySubtitle("customer"),
    });
  }

  if (![...byKey.keys()].some((key) => isCustomerJourneyKey(key))) {
    byKey.set("customer", {
      journey_key: "customer",
      journey_title: defaultJourneyTitle("customer"),
      journey_subtitle: defaultJourneySubtitle("customer"),
    });
  }

  return [...byKey.values()];
}

function sanitizeEvidenceStatus(value: unknown): "evidenced" | "implied" | "unclear" {
  const normalized = safeText(value).toLowerCase();
  if (normalized === "evidenced" || normalized === "implied") return normalized;
  return "unclear";
}

function audienceFromJourneyTitle(title: string) {
  const cleaned = safeText(title)
    .replace(/^job\s*map\s*:\s*/i, "")
    .replace(/^customer\s+/i, "")
    .replace(/\s+journey$/i, "")
    .trim();
  const lower = cleaned.toLowerCase();
  if (!cleaned || lower === "progress" || lower === "customer progress" || lower === "unknown") {
    return "Primary job performer";
  }
  return cleaned;
}

function fallbackJtbd(executor: string) {
  const actor = safeText(executor) || "primary job performer";
  return `When the ${actor.toLowerCase()} is trying to move a critical decision forward, they need clear evidence, shared confidence, and a repeatable process so progress does not stall.`;
}

const WEAK_NEED_TERMS = /\b(strategic alignment|operational excellence|synergy|leverage|holistic|transformation|best practice|framework|optimization)\b/i;
const NEED_PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bstrategic alignment\b/gi, "fit with strategy"],
  [/\boperational excellence\b/gi, "consistent execution"],
  [/\bleverage\b/gi, "use"],
  [/\boptimi[sz]e\b/gi, "improve"],
  [/\butili[sz]e\b/gi, "use"],
  [/\s+/g, " "],
];

function normalizeNeedLanguage(value: string) {
  let text = safeText(value);
  if (!text) return "";
  for (const [pattern, replacement] of NEED_PHRASE_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function isWeakNeedLanguage(value: string) {
  const text = safeText(value).toLowerCase();
  if (!text) return true;
  if (WEAK_NEED_TERMS.test(text)) return true;
  if (text.split(/\s+/).length < 7) return true;
  if (!/^(minimize|reduce|increase|improve|maximize|avoid)\b/.test(text)) return true;
  return false;
}

function compactContextHint(value: string) {
  const cleaned = safeText(value)
    .replace(/^when\s+/i, "")
    .replace(/^how\s+/i, "")
    .replace(/^whether\s+/i, "")
    .replace(/^to\s+/i, "")
    .replace(/\.$/, "");
  if (!cleaned) return "";
  return cleaned.split(/\s+/).slice(0, 12).join(" ");
}

function extractOutcomeContext(statement: string, companyName = "") {
  const text = safeText(statement);
  if (!text) return "";

  const withoutCompany = companyName
    ? text.replace(new RegExp(String(companyName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").trim()
    : text;

  const patterns = [
    /proof that\s+([^.;]+)/i,
    /difficult to\s+([^.;]+)/i,
    /slows\s+([^,.;]+)/i,
    /risk\s+([^.;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = withoutCompany.match(pattern);
    if (!match?.[1]) continue;
    const candidate = compactContextHint(match[1]);
    if (candidate) return candidate;
  }

  return compactContextHint(withoutCompany);
}

function normalizeContextTopic(value: string) {
  let topic = compactContextHint(value)
    .replace(/^the\s+system\s+/i, "")
    .replace(/^system\s+/i, "")
    .replace(/^consistently\s+/i, "");

  if (/decision[- ]making/.test(topic.toLowerCase()) && /outcomes?/.test(topic.toLowerCase())) {
    return "better client decisions and outcomes";
  }

  topic = topic
    .replace(/^improves?\s+/i, "improving ")
    .replace(/^increase[s]?\s+/i, "increasing ")
    .replace(/^reduce[s]?\s+/i, "reducing ")
    .replace(/^minimize[s]?\s+/i, "minimizing ")
    .replace(/^the\s+/i, "");

  return topic || "the core customer job";
}

function buildContextHint(args: {
  companyName: string;
  strategicProblems: unknown[];
  inputs: unknown[];
  marketJtbd?: string;
}) {
  const strategicRows = Array.isArray(args.strategicProblems) ? args.strategicProblems : [];
  const inputRows = Array.isArray(args.inputs) ? args.inputs : [];

  const topProblem = strategicRows
    .map((row) => safeText(asRecord(row)?.statement))
    .find(Boolean);
  if (topProblem) {
    const extracted = extractOutcomeContext(topProblem, args.companyName);
    if (extracted) {
      const normalized = normalizeContextTopic(extracted);
      if (/mojomap/i.test(topProblem) && normalized === "better client decisions and outcomes") {
        return "improved client decisions and outcomes with MojoMap";
      }
      return normalized;
    }
  }

  const topInput = inputRows
    .map((row) => {
      const rec = asRecord(row);
      return safeText(rec?.description) || safeText(rec?.why_it_matters);
    })
    .find(Boolean);
  if (topInput) return normalizeContextTopic(topInput);

  const rawMarketHint = safeText(args.marketJtbd);
  if (rawMarketHint) return normalizeContextTopic(rawMarketHint);

  const companyName = safeText(args.companyName);
  if (companyName) return `${companyName} customer progress`;

  return "the core customer job";
}

function shortPhrase(value: string, maxWords = 10) {
  const cleaned = safeText(value)
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.split(/\s+/).slice(0, maxWords).join(" ");
}

function extractStepFocus(args: {
  strategicProblems: unknown[];
  inputs: unknown[];
  contextHint: string;
}) {
  const statements = (Array.isArray(args.strategicProblems) ? args.strategicProblems : [])
    .map((row) => safeText(asRecord(row)?.statement))
    .filter(Boolean);
  const inputMap = new Map<string, string>();
  for (const row of (Array.isArray(args.inputs) ? args.inputs : [])) {
    const rec = asRecord(row);
    const key = safeText(rec?.input_key).toLowerCase();
    if (!key || inputMap.has(key)) continue;
    inputMap.set(key, safeText(rec?.description) || safeText(rec?.why_it_matters));
  }

  const allProblemText = statements.join(" ");
  const pickProblem = (pattern: RegExp) => {
    const hit = statements.find((line) => pattern.test(line));
    if (hit) return shortPhrase(hit, 11);
    const fallback = allProblemText.match(pattern);
    return shortPhrase(fallback?.[0] || "", 11);
  };
  const pickInput = (key: string) => shortPhrase(inputMap.get(key) || "", 10);

  const base = shortPhrase(args.contextHint, 9) || "improved client decisions and outcomes";
  return {
    1: pickProblem(/(lack|without).{0,80}(proof|quantified|evidence)|improves?.{0,50}(decision|outcome)/i) ||
      pickInput("outcome-data") || base,
    2: pickInput("needs-assessment") || pickInput("referral-map") || base,
    3: pickInput("outcome-data") || pickInput("program-model") || base,
    4: pickProblem(/friction in sales|slows adoption|difficult to productize/i) || pickInput("brand-narrative") || base,
    5: pickInput("program-model") || pickProblem(/high-touch|repeatability|scalable system/i) || base,
    6: pickInput("family-satisfaction") || pickInput("donor-retention") || base,
    7: pickProblem(/slows adoption|friction in sales|risk/i) || pickInput("grant-pipeline") || base,
    8: pickProblem(/productize|scalable system|high-touch consulting/i) || pickInput("market-cat") || base,
  } as Record<number, string>;
}

function fallbackNeedFromStep(
  step: NormalizedStep,
  index: number,
  contextHint = "",
  stepFocus?: Record<number, string>,
) {
  const stepNumber = clampInt(Number(step.step_number), 1, JTBD_CHECKPOINT_COUNT);
  const focus = shortPhrase(stepFocus?.[stepNumber] || "", 10);
  const context = focus || normalizeContextTopic(contextHint);
  const templatesByCheckpoint: Record<number, string[]> = {
    1: [
      `Minimize the time it takes to agree on measurable success criteria for ${context}.`,
      `Increase confidence that teams define success for ${context} the same way.`,
    ],
    2: [
      `Minimize the time it takes to find the strongest evidence for ${context}.`,
      `Increase confidence that the chosen path for ${context} fits the real customer need.`,
    ],
    3: [
      `Minimize delays caused by missing ownership or data before work on ${context} starts.`,
      `Increase confidence that owners are ready before execution on ${context} begins.`,
    ],
    4: [
      `Reduce the risk of committing to a weak approach for ${context}.`,
      `Increase confidence that the selected approach for ${context} will hold up in real use.`,
    ],
    5: [
      `Minimize mistakes while executing the core work tied to ${context}.`,
      `Increase first-pass success while executing the core work tied to ${context}.`,
    ],
    6: [
      `Increase visibility into live progress signals for ${context}.`,
      `Minimize the time it takes to detect when ${context} is drifting off track.`,
    ],
    7: [
      `Minimize the time to adjust when ${context} is not producing expected results.`,
      `Increase confidence that course corrections improve ${context} quickly.`,
    ],
    8: [
      `Minimize the time to confirm whether the work delivered ${context}.`,
      `Increase clarity on what to repeat next cycle for ${context}.`,
    ],
  };
  const templates = templatesByCheckpoint[stepNumber] || templatesByCheckpoint[1];
  return templates[index % templates.length];
}

function serviceState(importance: number, satisfaction: number) {
  if (importance >= 7 && satisfaction <= 4) return "underserved";
  if (importance <= 4 && satisfaction >= 8) return "overserved";
  return "served";
}

function contextualStepDescription(
  stepNumber: number,
  contextHint: string,
  stepFocus?: Record<number, string>,
) {
  const context = shortPhrase(stepFocus?.[stepNumber] || "", 10) || compactContextHint(contextHint) || "the target customer outcome";
  const byStep: Record<number, string> = {
    1: `Define clear, measurable success criteria for ${context}.`,
    2: `Locate the strongest evidence sources to guide decisions on ${context}.`,
    3: `Prepare owners, inputs, and timing before execution on ${context}.`,
    4: `Confirm the planned approach for ${context} is credible before committing.`,
    5: `Execute the core actions tied to ${context} in a consistent way.`,
    6: `Monitor live progress and evidence quality signals for ${context}.`,
    7: `Adjust quickly when results for ${context} are weaker than expected.`,
    8: `Conclude what was proven about ${context} and what should repeat next cycle.`,
  };
  return byStep[clampInt(stepNumber, 1, JTBD_CHECKPOINT_COUNT)] || byStep[1];
}

function safeParseJsonObject(input: unknown): Record<string, unknown> | null {
  if (input && typeof input === "object" && !Array.isArray(input)) return input as Record<string, unknown>;
  const text = safeText(input);
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // continue
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  return null;
}

async function callLocalSynthesis(args: {
  ollamaUrl: string;
  ollamaModel: string;
  companyName: string;
  website: string;
  selectedJobMaps: SelectedJobMap[];
  contextJson: Record<string, unknown>;
}) {
  const systemText =
    "You are a local JTBD/ODI analyst running only on private local inference. " +
    "Use only the provided context JSON and do not invent external evidence. " +
    "Output must be clean JSON only. " +
    "Use April Dunford framing for market context: frame of reference first (market category), then differentiation context. " +
    "For customer journeys, enforce the 8 ODI checkpoints in exact order: Define, Locate, Prepare, Confirm, Execute, Monitor, Modify, Conclude. " +
    "Keep step labels action-oriented and solution-agnostic. Avoid feature prescriptions. " +
    "Use plain language a client can read quickly; avoid consulting jargon, placeholders, and generic filler. " +
    "For market_definition.market_context, use a standard category anchor from common categories before any custom wording.";

  const userText =
    `Company: ${args.companyName}\n` +
    `Website: ${args.website || "unknown"}\n` +
    `Selected job maps: ${JSON.stringify(args.selectedJobMaps)}\n\n` +
    `Context JSON:\n${JSON.stringify(args.contextJson)}\n\n` +
    "Return JSON with keys: market_definition, journeys, needs, summary.\n" +
    "market_definition: { job_executor, chooser, jtbd, market_context }\n" +
    "journeys: array of { journey_key, journey_title, journey_subtitle, steps }\n" +
    "step shape: { step_number, step_label, description, evidence_status, evidence_basis, evidence_confidence, has_gap, gap_note, designed }\n" +
    "needs: array of { desired_outcome, step_number, importance, satisfaction, opportunity_score, evidence_basis }\n" +
    `market_definition rules:\n` +
    `- market_context must start with \"Category: <well-known category>\".\n` +
    `- Use one of these category anchors when possible: ${STANDARD_MARKET_CATEGORY_LIST}.\n` +
    `- If a custom niche is needed, format as \"<well-known category> for <specific job executor/job>\".\n` +
    `- Keep market_context to 1-2 sentences and tie it to job executor + ODI job.\n` +
    "Customer journeys must contain exactly 8 checkpoints numbered 1..8.\n" +
    "Desired outcomes must be clear ODI-style statements in common language: directional verb (Minimize/Increase/Reduce/Improve) + measurable object + context.";

  const payload = {
    model: args.ollamaModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userText },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(`${args.ollamaUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ollama",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Local synthesis model failed (${resp.status}): ${text}`);
    }

    const data = await resp.json().catch(() => ({}));
    const content = data?.choices?.[0]?.message?.content;
    const parsed = safeParseJsonObject(content);
    if (!parsed) throw new Error("Local synthesis model returned invalid JSON.");
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeCustomerJourney(args: {
  map: SelectedJobMap;
  rawJourney: Record<string, unknown> | null;
  evidenceBasis: string;
  contextHint?: string;
  forceContextualDescriptions?: boolean;
}) {
  const rawSteps = Array.isArray(args.rawJourney?.steps) ? args.rawJourney?.steps : [];
  const contextTopic = normalizeContextTopic(args.contextHint || "");
  const contextualGapNote = `Capture direct customer evidence showing where delivery of ${contextTopic} breaks down in this step.`;
  const normalized = normalizeToEightCheckpointSpine(
    rawSteps.map((step) => {
      const record = asRecord(step);
      return {
        step_number: Number(record?.step_number) || null,
        step_label: safeText(record?.step_label),
        description: safeText(record?.description),
        designed: record?.designed === true,
        has_gap: record?.has_gap === true,
        evidence_status: sanitizeEvidenceStatus(record?.evidence_status),
        evidence_basis: safeText(record?.evidence_basis),
        evidence_confidence: Number(record?.evidence_confidence),
        gap_note: safeText(record?.gap_note),
      };
    }),
    {
      defaultEvidenceBasis: args.evidenceBasis,
      defaultConfidence: 52,
      defaultGapNote: contextualGapNote,
    },
  ).map((step, index) => {
    const checkpoint = JTBD_ODI_CHECKPOINTS[index];
    const label = safeText(step.step_label) || checkpoint.canonicalLabel;
    const rawDescription = safeText(step.description);
    const contextualDescription = contextualStepDescription(checkpoint.stepNumber, contextTopic);
    const description = rawDescription || contextualDescription;
    const repairedLabel = containsSolutionPrescriptiveLanguage(label) || containsNonOdiProcessLanguage(label)
      ? checkpoint.canonicalLabel
      : label;
    const shouldUseContextual =
      args.forceContextualDescriptions ||
      !rawDescription ||
      rawDescription === checkpoint.description ||
      containsSolutionPrescriptiveLanguage(rawDescription);
    const repairedDescription = shouldUseContextual ? contextualDescription : description;

    return {
      step_number: checkpoint.stepNumber,
      step_label: repairedLabel,
      description: repairedDescription,
      designed: Boolean(step.designed) && sanitizeEvidenceStatus(step.evidence_status) !== "unclear",
      has_gap: typeof step.has_gap === "boolean" ? step.has_gap : true,
      evidence_status: sanitizeEvidenceStatus(step.evidence_status),
      evidence_basis: safeText(step.evidence_basis) || args.evidenceBasis,
      evidence_confidence: clampInt(Number(step.evidence_confidence), 0, 100),
      gap_note: Boolean(step.has_gap)
        ? safeText(step.gap_note) || contextualGapNote
        : "",
    } as NormalizedStep;
  });

  const validated = validateEightCheckpointSpine(normalized);
  const finalSteps = validated.isValid
    ? normalized
    : normalizeToEightCheckpointSpine([], {
      defaultEvidenceBasis: `${args.evidenceBasis} The first pass produced invalid steps, so this map was reset to the required 8-step customer sequence.`,
      defaultConfidence: 45,
      defaultGapNote: contextualGapNote,
    }).map((step) => ({
      step_number: Number(step.step_number) || 1,
      step_label: safeText(step.step_label),
      description: safeText(step.description),
      designed: false,
      has_gap: true,
      evidence_status: sanitizeEvidenceStatus(step.evidence_status),
      evidence_basis: safeText(step.evidence_basis) || args.evidenceBasis,
      evidence_confidence: clampInt(Number(step.evidence_confidence), 0, 100),
      gap_note: safeText(step.gap_note) || contextualGapNote,
    }));

  return {
    journey_key: args.map.journey_key,
    journey_title: safeText(args.rawJourney?.journey_title) || args.map.journey_title,
    journey_subtitle: safeText(args.rawJourney?.journey_subtitle) || args.map.journey_subtitle,
    steps: finalSteps,
  } as NormalizedJourney;
}

function normalizeNonCustomerJourney(args: {
  map: SelectedJobMap;
  rawJourney: Record<string, unknown> | null;
  evidenceBasis: string;
}) {
  const rawSteps = Array.isArray(args.rawJourney?.steps) ? args.rawJourney?.steps : [];
  const parsed: NormalizedStep[] = rawSteps
    .map((entry, index) => {
      const row = asRecord(entry);
      const fallback = JTBD_ODI_CHECKPOINTS[Math.min(index, JTBD_ODI_CHECKPOINTS.length - 1)];
      const stepNumber = clampInt(Number(row?.step_number) || (index + 1), 1, 8);
      const label = safeText(row?.step_label) || fallback.canonicalLabel;
      const description = safeText(row?.description) || fallback.description;
      return {
        step_number: stepNumber,
        step_label: containsSolutionPrescriptiveLanguage(label) ? fallback.canonicalLabel : label,
        description,
        designed: row?.designed === true,
        has_gap: row?.has_gap !== false,
        evidence_status: sanitizeEvidenceStatus(row?.evidence_status),
        evidence_basis: safeText(row?.evidence_basis) || args.evidenceBasis,
        evidence_confidence: clampInt(Number(row?.evidence_confidence), 0, 100),
        gap_note: safeText(row?.gap_note),
      };
    })
    .sort((a, b) => a.step_number - b.step_number)
    .slice(0, 8);

  const withFallback = parsed.length >= 6
    ? parsed
    : JTBD_ODI_CHECKPOINTS.slice(0, 6).map((checkpoint) => ({
      step_number: checkpoint.stepNumber,
      step_label: checkpoint.canonicalLabel,
      description: checkpoint.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear" as const,
      evidence_basis: args.evidenceBasis,
      evidence_confidence: 40,
      gap_note: "Validate this step with direct evidence.",
    }));

  return {
    journey_key: args.map.journey_key,
    journey_title: safeText(args.rawJourney?.journey_title) || args.map.journey_title,
    journey_subtitle: safeText(args.rawJourney?.journey_subtitle) || args.map.journey_subtitle,
    steps: withFallback.map((step, index) => ({
      ...step,
      step_number: index + 1,
    })),
  } as NormalizedJourney;
}

function normalizeNeeds(args: {
  rawNeeds: unknown;
  customerJourney: NormalizedJourney;
  evidenceBasis: string;
  contextHint?: string;
}) {
  const contextHint = compactContextHint(args.contextHint || "");
  const stepByNumber = new Map(args.customerJourney.steps.map((step) => [step.step_number, step]));
  const parsed = (Array.isArray(args.rawNeeds) ? args.rawNeeds : [])
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => !!entry)
    .map((entry, index) => {
      const stepNumber = clampInt(Number(entry.step_number) || ((index % JTBD_CHECKPOINT_COUNT) + 1), 1, JTBD_CHECKPOINT_COUNT);
      const stepLabel = safeText(stepByNumber.get(stepNumber)?.step_label) || JTBD_ODI_CHECKPOINTS[stepNumber - 1].canonicalLabel;
      const importance = clampInt(Number(entry.importance) || 7, 1, 10);
      const satisfaction = clampInt(Number(entry.satisfaction) || 4, 1, 10);
      const computedOpp = clampInt(Number(entry.opportunity_score) || (importance + (10 - satisfaction)), 0, 20);
      const rawOutcome = safeText(entry.desired_outcome);
      const cleanedOutcome = normalizeNeedLanguage(rawOutcome);
      const desiredOutcome = cleanedOutcome && !containsSolutionPrescriptiveLanguage(cleanedOutcome) && !isWeakNeedLanguage(cleanedOutcome)
        ? cleanedOutcome
        : fallbackNeedFromStep(stepByNumber.get(stepNumber) || args.customerJourney.steps[stepNumber - 1], index, contextHint);

      return {
        desired_outcome: desiredOutcome,
        step_number: stepNumber,
        step_label: stepLabel,
        importance,
        satisfaction,
        opportunity_score: computedOpp,
        evidence_basis: safeText(entry.evidence_basis) || args.evidenceBasis,
      } as LocalNeed;
    });

  if (parsed.length >= JTBD_CHECKPOINT_COUNT) {
    return parsed
      .sort((a, b) => b.opportunity_score - a.opportunity_score || b.importance - a.importance)
      .slice(0, 14);
  }

  const generated = [...parsed];
  for (const step of args.customerJourney.steps) {
    if (generated.some((need) => need.step_number === step.step_number)) continue;
    const importance = clampInt(8 - ((step.step_number - 1) % 3), 5, 9);
    const satisfaction = clampInt(4 + ((step.step_number + 1) % 3), 2, 7);
    generated.push({
      desired_outcome: fallbackNeedFromStep(step, step.step_number, contextHint),
      step_number: step.step_number,
      step_label: step.step_label,
      importance,
      satisfaction,
      opportunity_score: clampInt(importance + (10 - satisfaction), 0, 20),
      evidence_basis: args.evidenceBasis,
    });
  }

  return generated
    .sort((a, b) => b.opportunity_score - a.opportunity_score || b.importance - a.importance)
    .slice(0, 14);
}

function isJobStepEvidenceColumnError(message: string) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("evidence_status") ||
    lower.includes("evidence_basis") ||
    lower.includes("evidence_confidence")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Only POST is supported." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRole || !anonKey) {
      return json({ error: "Missing Supabase env vars" }, 500);
    }

    const ollamaUrl = Deno.env.get("OLLAMA_BASE_URL") ?? "http://host.docker.internal:11434/v1";
    const ollamaModel = Deno.env.get("OLLAMA_MODEL") ?? "llama3:70b";
    if (!isLocalOllamaUrl(ollamaUrl)) {
      return json(
        { error: "Local-only policy violation: OLLAMA_BASE_URL must resolve to localhost/host.docker.internal." },
        412,
      );
    }

    const body = await req.json().catch(() => ({}));
    const companyId = safeText((body as Record<string, unknown>)?.company_id);
    const trigger = safeText((body as Record<string, unknown>)?.trigger) || "manual";
    const requestedMaps = parseSelectedJobMaps((body as Record<string, unknown>)?.selected_job_maps);
    if (!companyId) return json({ error: "company_id is required" }, 400);

    const supabase = createClient(supabaseUrl, serviceRole);
    const authHeader = req.headers.get("Authorization");
    const anonClient = createClient(
      supabaseUrl,
      anonKey,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {},
    );

    let requesterUserId: string | null = null;
    if (authHeader) {
      const { data: authData } = await anonClient.auth.getUser();
      requesterUserId = authData?.user?.id ?? null;
    }

    const { data: companyRow, error: companyErr } = await supabase
      .from("companies")
      .select("id,name,website,created_by")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr || !companyRow) {
      return json({ error: companyErr?.message || "Company not found" }, 404);
    }

    const runUserId = requesterUserId || safeText((companyRow as Record<string, unknown>)?.created_by);
    if (!runUserId) return json({ error: "Could not resolve acting user." }, 500);

    const [{ data: baselineRow }, { data: strategicProblemsData }, { data: inputRows }] = await Promise.all([
      supabase
        .from("public_baseline_runs")
        .select("id,created_at,result_json")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("strategy_problem_statements")
        .select("statement,status,source,reconciliation_note")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("inputs")
        .select("id,input_key,input_label,sub_group,description,why_it_matters,status,completeness,updated_at")
        .eq("company_id", companyId)
        .order("updated_at", { ascending: false })
        .limit(60),
    ]);

    const inputIds = Array.isArray(inputRows)
      ? inputRows.map((row) => safeText((row as Record<string, unknown>)?.id)).filter(Boolean)
      : [];
    const { data: inputFiles } = inputIds.length > 0
      ? await supabase
          .from("input_files")
          .select("input_id,file_name,tags,uploaded_at")
          .in("input_id", inputIds)
          .order("uploaded_at", { ascending: false })
          .limit(180)
      : { data: [] as unknown[] };

    const baseline = asRecord((baselineRow as Record<string, unknown> | null)?.result_json);
    const lensCard = asRecord(baseline?.lens_card);
    const evidenceLedger = Array.isArray(baseline?.evidence_ledger) ? baseline?.evidence_ledger : [];
    const strategicProblems = Array.isArray(strategicProblemsData) ? strategicProblemsData : [];
    const inputs = Array.isArray(inputRows) ? inputRows : [];
    const files = Array.isArray(inputFiles) ? inputFiles : [];

    const evidenceContext = {
      strategic_problems: strategicProblems.map((row) => ({
        statement: safeText((row as Record<string, unknown>)?.statement),
        status: safeText((row as Record<string, unknown>)?.status) || "open",
        source: safeText((row as Record<string, unknown>)?.source) || "unknown",
      })),
      inputs: inputs.map((row) => ({
        input_key: safeText((row as Record<string, unknown>)?.input_key),
        input_label: safeText((row as Record<string, unknown>)?.input_label),
        sub_group: safeText((row as Record<string, unknown>)?.sub_group),
        description: safeText((row as Record<string, unknown>)?.description),
        why_it_matters: safeText((row as Record<string, unknown>)?.why_it_matters),
        status: safeText((row as Record<string, unknown>)?.status),
        completeness: Number((row as Record<string, unknown>)?.completeness) || 0,
      })),
      files: files.map((row) => ({
        input_id: safeText((row as Record<string, unknown>)?.input_id),
        file_name: safeText((row as Record<string, unknown>)?.file_name),
        tags: Array.isArray((row as Record<string, unknown>)?.tags)
          ? ((row as Record<string, unknown>)?.tags as unknown[]).map((tag) => safeText(tag)).filter(Boolean)
          : [],
        uploaded_at: safeText((row as Record<string, unknown>)?.uploaded_at),
      })),
      baseline_lens: {
        primary_buyer: safeText(lensCard?.primary_buyer),
        chooser: safeText(lensCard?.chooser),
        user: safeText(lensCard?.user),
        value_chain: safeText(lensCard?.value_chain),
        economic_engine: safeText(lensCard?.economic_engine),
      },
      baseline_signals: evidenceLedger
        .slice(0, 18)
        .map((item) => ({
          bucket: safeText((item as Record<string, unknown>)?.bucket),
          snippet: safeText((item as Record<string, unknown>)?.snippet),
        }))
        .filter((item) => item.bucket || item.snippet),
    };

    const contextHint = buildContextHint({
      companyName: safeText((companyRow as Record<string, unknown>)?.name),
      strategicProblems,
      inputs,
      marketJtbd: safeText(lensCard?.economic_engine),
    });

    let llmOutput: Record<string, unknown> = {};
    let synthesisMode: "model" | "fallback" = "model";
    try {
      llmOutput = await callLocalSynthesis({
        ollamaUrl,
        ollamaModel,
        companyName: safeText((companyRow as Record<string, unknown>)?.name) || "Unknown company",
        website: safeText((companyRow as Record<string, unknown>)?.website),
        selectedJobMaps: requestedMaps,
        contextJson: evidenceContext,
      });
    } catch (error) {
      synthesisMode = "fallback";
      console.error("[local-jobmap-synthesis] local model failed, falling back to deterministic synthesis", error);
      llmOutput = {};
    }

    const rawJourneys = Array.isArray(llmOutput?.journeys) ? llmOutput?.journeys : [];
    const rawJourneyByKey = new Map<string, Record<string, unknown>>();
    for (const journey of rawJourneys) {
      const obj = asRecord(journey);
      const key = normalizeJourneyKey(obj?.journey_key);
      if (!key) continue;
      if (!rawJourneyByKey.has(key)) rawJourneyByKey.set(key, obj || {});
    }

    const basis = "Local synthesis from uploaded evidence, company context, and baseline signals.";
    const normalizedJourneys: NormalizedJourney[] = requestedMaps.map((map) => {
      const rawJourney = rawJourneyByKey.get(map.journey_key) || null;
      if (isCustomerJourneyKey(map.journey_key)) {
        return normalizeCustomerJourney({
          map,
          rawJourney,
          evidenceBasis: basis,
          contextHint,
          forceContextualDescriptions: synthesisMode === "fallback",
        });
      }
      return normalizeNonCustomerJourney({ map, rawJourney, evidenceBasis: basis });
    });

    const primaryCustomerJourney =
      normalizedJourneys.find((journey) => isCustomerJourneyKey(journey.journey_key)) ||
      normalizeCustomerJourney({
        map: {
          journey_key: "customer",
          journey_title: defaultJourneyTitle("customer"),
          journey_subtitle: defaultJourneySubtitle("customer"),
        },
        rawJourney: null,
        evidenceBasis: basis,
        contextHint,
        forceContextualDescriptions: true,
      });
    if (!normalizedJourneys.some((journey) => isCustomerJourneyKey(journey.journey_key))) {
      normalizedJourneys.unshift(primaryCustomerJourney);
    }

    const rawMarket = asRecord(llmOutput?.market_definition);
    const existingMarketRes = await supabase
      .from("odi_market_definitions")
      .select("id,source_path,job_executor,chooser,jtbd")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const existingMarket = asRecord(existingMarketRes.data ?? null);
    const preserveManualMarket = safeText(existingMarket?.source_path).toLowerCase().includes("manual");

    const inferredExecutor = audienceFromJourneyTitle(primaryCustomerJourney.journey_title);
    const synthesizedExecutor = safeText(rawMarket?.job_executor) || inferredExecutor;
    const synthesizedChooser = safeText(rawMarket?.chooser) || safeText(rawMarket?.job_executor) || inferredExecutor;
    const synthesizedJtbd = safeText(rawMarket?.jtbd) || fallbackJtbd(synthesizedExecutor);

    const marketDefinition = {
      job_executor: preserveManualMarket
        ? safeText(existingMarket?.job_executor) || synthesizedExecutor
        : synthesizedExecutor,
      chooser: preserveManualMarket
        ? safeText(existingMarket?.chooser) || synthesizedChooser
        : synthesizedChooser,
      jtbd: preserveManualMarket
        ? safeText(existingMarket?.jtbd) || synthesizedJtbd
        : synthesizedJtbd,
    };

    const normalizedNeeds = normalizeNeeds({
      rawNeeds: llmOutput?.needs,
      customerJourney: primaryCustomerJourney,
      evidenceBasis: basis,
      contextHint,
    });

    const journeyKeys = [...new Set(normalizedJourneys.map((journey) => journey.journey_key))];
    if (journeyKeys.length > 0) {
      const { error: deleteStepsError } = await supabase
        .from("job_steps")
        .delete()
        .eq("company_id", companyId)
        .in("journey_key", journeyKeys);
      if (deleteStepsError) {
        return json({ error: `Failed clearing previous journey rows: ${deleteStepsError.message}` }, 500);
      }
    }

    let stepsInserted = 0;
    for (const journey of normalizedJourneys) {
      for (const step of journey.steps) {
        const stepPayload = {
          company_id: companyId,
          user_id: runUserId,
          frameworks_used: ["JTBD", "ODI", "local_ollama", "local_jobmap_synthesis"],
          journey_key: journey.journey_key,
          journey_title: journey.journey_title,
          journey_subtitle: journey.journey_subtitle,
          step_number: step.step_number,
          step_label: step.step_label,
          description: step.description,
          designed: step.designed,
          has_gap: step.has_gap,
          evidence_status: step.evidence_status,
          evidence_basis: step.evidence_basis,
          evidence_confidence: clampInt(step.evidence_confidence, 0, 100),
          gap_note: step.has_gap ? safeText(step.gap_note) : "",
        };

        let { error: stepInsertError } = await supabase.from("job_steps").insert(stepPayload);
        if (stepInsertError && isJobStepEvidenceColumnError(stepInsertError.message || "")) {
          const fallback = await supabase.from("job_steps").insert({
            company_id: companyId,
            user_id: runUserId,
            frameworks_used: ["JTBD", "ODI", "local_ollama", "local_jobmap_synthesis"],
            journey_key: journey.journey_key,
            journey_title: journey.journey_title,
            journey_subtitle: journey.journey_subtitle,
            step_number: step.step_number,
            step_label: step.step_label,
            description: step.description,
            designed: step.designed,
            has_gap: step.has_gap,
            gap_note: step.has_gap ? safeText(step.gap_note) : "",
          });
          stepInsertError = fallback.error;
        }

        if (stepInsertError) {
          return json({ error: `Failed inserting synthesized step: ${stepInsertError.message}` }, 500);
        }
        stepsInserted += 1;
      }
    }

    const customerKeys = [...new Set(journeyKeys.filter((key) => isCustomerJourneyKey(key)).concat("customer"))];
    const { error: deleteNeedsError } = await supabase
      .from("odi_needs")
      .delete()
      .eq("company_id", companyId)
      .in("journey_key", customerKeys);
    if (deleteNeedsError) {
      return json({ error: `Failed clearing previous ODI needs: ${deleteNeedsError.message}` }, 500);
    }

    let needsInserted = 0;
    for (let index = 0; index < normalizedNeeds.length; index += 1) {
      const need = normalizedNeeds[index];
      const { error: needInsertError } = await supabase.from("odi_needs").insert({
        company_id: companyId,
        user_id: runUserId,
        tier: "need",
        desired_outcome: need.desired_outcome,
        journey_key: primaryCustomerJourney.journey_key,
        step_number: need.step_number,
        step_label: need.step_label,
        importance: need.importance,
        satisfaction: need.satisfaction,
        opportunity_score: need.opportunity_score,
        sort_order: index + 1,
        service_state: serviceState(need.importance, need.satisfaction),
        source_path: "local_jobmap_synthesis",
        frameworks_used: ["JTBD", "ODI", "local_ollama", "local_jobmap_synthesis"],
      });
      if (needInsertError) {
        return json({ error: `Failed inserting synthesized ODI need: ${needInsertError.message}` }, 500);
      }
      needsInserted += 1;
    }

    let marketDefinitionAction = "inserted";
    if (existingMarket?.id) {
      const { error: marketUpdateError } = await supabase
        .from("odi_market_definitions")
        .update({
          job_executor: marketDefinition.job_executor,
          chooser: marketDefinition.chooser,
          jtbd: marketDefinition.jtbd,
          source_path: preserveManualMarket ? safeText(existingMarket?.source_path) : "local_jobmap_synthesis",
          frameworks_used: ["JTBD", "ODI", "local_ollama", "local_jobmap_synthesis"],
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", safeText(existingMarket?.id));
      if (marketUpdateError) {
        return json({ error: `Failed updating ODI market definition: ${marketUpdateError.message}` }, 500);
      }
      marketDefinitionAction = "updated";
    } else {
      const { error: marketInsertError } = await supabase.from("odi_market_definitions").insert({
        company_id: companyId,
        user_id: runUserId,
        job_executor: marketDefinition.job_executor,
        chooser: marketDefinition.chooser,
        jtbd: marketDefinition.jtbd,
        source_path: "local_jobmap_synthesis",
        frameworks_used: ["JTBD", "ODI", "local_ollama", "local_jobmap_synthesis"],
      });
      if (marketInsertError) {
        return json({ error: `Failed inserting ODI market definition: ${marketInsertError.message}` }, 500);
      }
    }

    return json({
      status: "ok",
      trigger,
      company_id: companyId,
      provider: "ollama_local",
      model: ollamaModel,
      synthesis_mode: synthesisMode,
      summary: {
        selected_maps: requestedMaps.length,
        journeys_generated: normalizedJourneys.length,
        steps_inserted: stepsInserted,
        odi_needs_inserted: needsInserted,
        market_definition: marketDefinitionAction,
      },
      artifacts: {
        journeys: normalizedJourneys.map((journey) => ({
          journey_key: journey.journey_key,
          journey_title: journey.journey_title,
          step_count: journey.steps.length,
        })),
        customer_checkpoint_count: primaryCustomerJourney.steps.length,
        customer_step_numbers: primaryCustomerJourney.steps.map((step) => step.step_number),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
