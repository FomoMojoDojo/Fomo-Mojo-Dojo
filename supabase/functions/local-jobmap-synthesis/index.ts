import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { regenerateJobMapJourney } from "../_shared/jobMapRegeneration.ts";
import { protectedJourneyKeys } from "../_shared/journeyProtection.ts";
import { fireMarketReconcile } from "../_shared/marketReconcileTrigger.ts";
import {
  JTBD_CHECKPOINT_COUNT,
  JTBD_ODI_CHECKPOINTS,
  buildCompanyVocabExclusions,
  containsNonOdiProcessLanguage,
  containsSolutionPrescriptiveLanguage,
  normalizeToEightCheckpointSpine,
  validateEightCheckpointSpine,
} from "../_shared/jtbdProcess.ts";
import {
  type IndustryStepAnchor,
  anchorsToPromptBlock,
  getIndustryStepAnchors,
  inferStandardMarketCategory,
} from "../_shared/industryStepAnchors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

const LOCAL_HOST_ALLOWLIST = new Set(["localhost", "127.0.0.1", "::1", "host.docker.internal"]);
const OLLAMA_TIMEOUT_MS = 120_000;
// Gate 2a: declared-direction runs generate a long JSON on the 70b model — 120s is
// not enough; deterministic fallback is prohibited on those runs, so the longer
// window is the honest alternative to silently writing a non-document-derived set.
const OLLAMA_REQUIRE_MODEL_TIMEOUT_MS = 300_000;
// Gate 2a sidecar budget (operator-amended): B2B_-prefixed core documents get up to
// 2,000 chars each; remaining files share the rest of the 12,000-char total.
const SIDECAR_TOTAL_BUDGET = 12_000;
const SIDECAR_CORE_CAP = 2_000;
// Abort-over-truncate: if the assembled user prompt exceeds this, fail loudly
// rather than silently dropping context below the per-file caps.
const USER_TEXT_ABORT_CHARS = 28_000;
const DECLARED_EVIDENCE_BASIS =
  "Declared direction, derived from your internal documents. Not yet validated by market or customer evidence.";
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
  evidence_status: "evidenced" | "implied" | "unclear" | "declared";
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
  if (key === "customer") return "How the primary job performer moves through the stable ODI steps required to accomplish the job.";
  if (key === "revenue") return "How demand turns into recurring economic outcomes.";
  if (key === "operations") return "How delivery operations coordinate execution and quality.";
  return "How this journey progresses from clear intent to measurable outcomes.";
}

function parseSelectedJobMaps(raw: unknown, injectCustomerDefault = true) {
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

  // Gate 2a incident fix: under selected_maps_only the caller's keys are the WHOLE
  // write universe — this injection put "customer" into requestedMaps even when the
  // caller asked only for another key, and regeneration's delete-per-journey_key
  // then destroyed an existing customer spine. Injection now only happens when the
  // caller has not constrained the map set.
  if (injectCustomerDefault && byKey.size === 0) {
    byKey.set("customer", {
      journey_key: "customer",
      journey_title: defaultJourneyTitle("customer"),
      journey_subtitle: defaultJourneySubtitle("customer"),
    });
  }

  if (injectCustomerDefault && ![...byKey.keys()].some((key) => isCustomerJourneyKey(key))) {
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
      pickInput("outcome-evidence") || base,
    2: pickInput("customer-research") || pickInput("acquisition-map") || base,
    3: pickInput("outcome-evidence") || pickInput("operating-model") || base,
    4: pickProblem(/friction in sales|slows adoption|difficult to productize/i) || pickInput("brand-narrative") || base,
    5: pickInput("operating-model") || pickProblem(/high-touch|repeatability|scalable system/i) || base,
    6: pickInput("customer-signals") || pickInput("retention-signals") || base,
    7: pickProblem(/slows adoption|friction in sales|risk/i) || pickInput("demand-pipeline") || base,
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
    1: `Determine what a successful outcome looks like for ${context}.`,
    2: `Identify which available options best serve ${context}.`,
    3: `Validate that the right inputs, dependencies, and conditions are in place for ${context}.`,
    4: `Confirm the approach is sound before fully committing to ${context}.`,
    5: `Carry out the work in a way that reliably achieves ${context}.`,
    6: `Detect early signals of whether the desired outcome for ${context} is being achieved.`,
    7: `Adjust the approach when signals suggest ${context} is at risk.`,
    8: `Evaluate what worked for ${context} and determine what should carry forward.`,
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
  industryLabel?: string;
  industryAnchors?: IndustryStepAnchor | null;
  timeoutMs?: number;
  skipNeeds?: boolean;
}) {
  const industryBlock = args.industryAnchors
    ? "\n\nIndustry step hypotheses for this company's market category: " +
      args.industryLabel +
      ".\n" +
      "The industry_step_anchors field in the context JSON provides starting hypotheses for each ODI checkpoint. " +
      "Use these as your initial step labels and refine each label and description to fit this specific company's job executor, market context, and evidence. " +
      "You may deviate where the company's evidence clearly calls for it, but preserve the ODI job-progression structure:\n" +
      anchorsToPromptBlock(args.industryAnchors)
    : "";

  const systemText =
    "You are a local JTBD/ODI analyst running only on private local inference. " +
    "Use only the provided context JSON and do not invent external evidence. " +
    "Output must be clean JSON only. " +
    "Use April Dunford framing for market context: frame of reference first (market category), then differentiation context. " +
    "For customer journeys, generate exactly 8 stable job-progression checkpoints numbered 1 to 8. " +
    "Each step label must answer: what is the actor trying to accomplish at this point in the job? " +
    "Use verbs like: determine, identify, evaluate, validate, confirm, detect, adjust. " +
    "Avoid: execute, launch, deploy, implement, rollout, negotiate, integrate, promote, supplier, campaign, UI, MVP, onboarding, pricing, partnership. " +
    "Labels must be solution-agnostic, stable over time, and tied to the actual job — not operational phases, implementation stages, or startup workflow. " +
    "Describe what the actor is trying to accomplish, not what the company is doing. " +
    "Use plain language a client can read quickly; avoid consulting jargon, placeholders, and generic filler. " +
    "For market_definition.market_context, frame around the job executor and their primary goal — who is trying to accomplish what outcome. Do not start with 'Category:' — job-defined framing is preferred." +
    industryBlock;

  const odiCtx = (args.contextJson as Record<string, unknown>)?.odi_context as Record<string, string> | undefined;
  const odiContextBlock = odiCtx && (odiCtx.job_performer || odiCtx.primary_job || odiCtx.desired_outcome)
    ? `\nODI grounding inputs (use these as the foundation — do not invent a different job or performer):\n` +
      (odiCtx.job_performer ? `- Job performer: ${odiCtx.job_performer}\n` : "") +
      (odiCtx.primary_job ? `- Primary job: ${odiCtx.primary_job}\n` : "") +
      (odiCtx.desired_outcome ? `- Primary desired outcome: ${odiCtx.desired_outcome}\n` : "") +
      (odiCtx.recurring_progress_challenge ? `- Recurring progress challenge: ${odiCtx.recurring_progress_challenge}\n` : "")
    : "";

  const userText =
    `Company: ${args.companyName}\n` +
    `Website: ${args.website || "unknown"}\n` +
    `Selected job maps: ${JSON.stringify(args.selectedJobMaps)}\n` +
    odiContextBlock +
    `\nContext JSON:\n${JSON.stringify(args.contextJson)}\n\n` +
    "Return JSON with keys: market_definition, journeys, needs, summary.\n" +
    "market_definition: { job_executor, chooser, jtbd, market_context }\n" +
    "journeys: array of { journey_key, journey_title, journey_subtitle, steps }\n" +
    "step shape: { step_number, step_label, description, evidence_status, evidence_basis, evidence_confidence, has_gap, gap_note, designed }\n" +
    (args.skipNeeds
      // This function never writes synthesized needs; on declared-direction runs the
      // output-token budget goes to the journey instead.
      ? "needs: return an empty array.\n"
      : "needs: array of { desired_outcome, step_number, importance, satisfaction, opportunity_score, evidence_basis }\n") +
    `market_definition rules:\n` +
    `- market_context must be framed around the job executor and the job they are trying to accomplish — not a product category.\n` +
    `- Format: \"[Job executor plural] trying to [accomplish the job]\" — e.g. \"Independent cafe operators trying to create a repeatable premium coffee experience.\"\n` +
    `- Do NOT start market_context with \"Category:\" or name a product/industry category.\n` +
    `- Keep market_context to 1-2 sentences.\n` +
    "Customer journeys must contain exactly 8 checkpoints numbered 1..8.\n" +
    "Desired outcomes must be clear ODI-style statements in common language: directional verb (Minimize/Increase/Reduce/Improve) + measurable object + context.";

  if (userText.length > USER_TEXT_ABORT_CHARS) {
    throw new Error(
      `Assembled synthesis prompt is ${userText.length} chars (> ${USER_TEXT_ABORT_CHARS}) — aborting rather than truncating below the approved per-file caps.`,
    );
  }
  console.log(`[local-jobmap-synthesis] assembled prompt chars: system=${systemText.length} user=${userText.length}`);

  // The /v1 OpenAI-compat endpoint ignores `options`, so num_ctx cannot be raised
  // there — the native /api/chat endpoint is the only way to guarantee the full
  // prompt fits the context window instead of being silently truncated.
  const nativeBase = args.ollamaUrl.replace(/\/v1\/?$/, "");
  const payload = {
    model: args.ollamaModel,
    format: "json",
    stream: false,
    options: { num_ctx: 8192 },
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: userText },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), args.timeoutMs ?? OLLAMA_TIMEOUT_MS);
  try {
    const resp = await fetch(`${nativeBase}/api/chat`, {
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
    const content = data?.message?.content;
    const parsed = safeParseJsonObject(content);
    if (!parsed) {
      const contentStr = typeof content === "string" ? content : "";
      throw new Error(
        `Local synthesis model returned invalid JSON (done_reason=${data?.done_reason ?? "unknown"}, eval_count=${data?.eval_count ?? "?"}, prompt_eval_count=${data?.prompt_eval_count ?? "?"}, content_tail=${JSON.stringify(contentStr.slice(-160))}).`,
      );
    }
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
  industryExclusions?: Set<string>;
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
    const repairedLabel = containsSolutionPrescriptiveLanguage(label, args.industryExclusions) || containsNonOdiProcessLanguage(label)
      ? checkpoint.canonicalLabel
      : label;
    const shouldUseContextual =
      args.forceContextualDescriptions ||
      !rawDescription ||
      rawDescription === checkpoint.description ||
      containsSolutionPrescriptiveLanguage(rawDescription, args.industryExclusions) ||
      containsNonOdiProcessLanguage(rawDescription);
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

  const validated = validateEightCheckpointSpine(normalized, args.industryExclusions);
  // Fallback: if validation still fails (e.g. LLM step count wrong), build a
  // customer-contextual skeleton rather than emitting the generic checkpoint
  // descriptions. Uses canonical labels (stable Ulwick anchors) with
  // per-step descriptions derived from the company's context.
  const finalSteps = validated.isValid
    ? normalized
    : JTBD_ODI_CHECKPOINTS.map((checkpoint) => ({
      step_number: checkpoint.stepNumber,
      step_label: checkpoint.canonicalLabel,
      description: contextualStepDescription(checkpoint.stepNumber, contextTopic),
      designed: false,
      has_gap: true,
      evidence_status: "unclear" as NormalizedStep["evidence_status"],
      evidence_basis: args.evidenceBasis,
      evidence_confidence: 45,
      gap_note: contextualGapNote,
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
  industryExclusions?: Set<string>;
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
        step_label: containsSolutionPrescriptiveLanguage(label, args.industryExclusions) ? fallback.canonicalLabel : label,
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
  industryExclusions?: Set<string>;
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
      const desiredOutcome = cleanedOutcome && !containsSolutionPrescriptiveLanguage(cleanedOutcome, args.industryExclusions) && !isWeakNeedLanguage(cleanedOutcome)
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
    // Gate 2a flags (operator-approved):
    // selected_maps_only — write ONLY the caller-sent journey keys; neither the
    //   parser's customer-default injection nor the post-normalization unshift may
    //   add keys, so existing spines under other keys are structurally untouchable
    //   (regeneration deletes per journey_key).
    // require_model — model failure/timeout is a loud error with ZERO writes;
    //   deterministic fallback is prohibited (it would write a set not derived from
    //   the documents while looking like success).
    // declared_direction — written steps carry the operator-signed declared-direction
    //   evidence wording, applied after normalization so the sanitizer cannot coerce it.
    const selectedMapsOnly = Boolean((body as Record<string, unknown>)?.selected_maps_only);
    const requireModel = Boolean((body as Record<string, unknown>)?.require_model);
    const declaredDirection = Boolean((body as Record<string, unknown>)?.declared_direction);
    const requestedMaps = parseSelectedJobMaps(
      (body as Record<string, unknown>)?.selected_job_maps,
      !selectedMapsOnly,
    );
    if (!companyId) return json({ error: "company_id is required" }, 400);
    if (selectedMapsOnly && requestedMaps.length === 0) {
      return json({ error: "selected_maps_only requires at least one valid selected_job_maps entry." }, 400);
    }

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
      .select("id,name,website,created_by,manual_industry_vocab")
      .eq("id", companyId)
      .maybeSingle();
    if (companyErr || !companyRow) {
      return json({ error: companyErr?.message || "Company not found" }, 404);
    }

    const runUserId = requesterUserId || safeText((companyRow as Record<string, unknown>)?.created_by);
    if (!runUserId) return json({ error: "Could not resolve acting user." }, 500);

    const [
      { data: baselineRow },
      { data: strategicProblemsData },
      { data: inputRows },
      { data: marketDefRow },
      { data: primaryOutcomeRow },
    ] = await Promise.all([
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
      supabase
        .from("odi_market_definitions")
        .select("job_executor,chooser,jtbd,market_context")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("managed_outcomes")
        .select("outcome_statement,leading_indicator,context")
        .eq("company_id", companyId)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const inputIds = Array.isArray(inputRows)
      ? inputRows.map((row) => safeText((row as Record<string, unknown>)?.id)).filter(Boolean)
      : [];
    const { data: inputFiles } = inputIds.length > 0
      ? await supabase
          .from("input_files")
          .select("input_id,file_name,file_path,tags,uploaded_at")
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
    const marketDef = asRecord(marketDefRow as Record<string, unknown> | null);
    const primaryOutcome = asRecord(primaryOutcomeRow as Record<string, unknown> | null);

    // Gate 2a: .extracted.txt sidecar excerpts join the synthesis context — a new
    // LOCAL read (Supabase storage download) with no boundary change. Uneven budget
    // per the operator amendment: B2B_-prefixed core docs up to SIDECAR_CORE_CAP
    // chars each; the rest share what remains of SIDECAR_TOTAL_BUDGET.
    const sidecarOrder = [
      ...files.filter((row) => safeText((row as Record<string, unknown>)?.file_name).startsWith("B2B_")),
      ...files.filter((row) => !safeText((row as Record<string, unknown>)?.file_name).startsWith("B2B_")),
    ];
    const coreCount = sidecarOrder.filter((row) =>
      safeText((row as Record<string, unknown>)?.file_name).startsWith("B2B_")
    ).length;
    const remainderCount = Math.max(1, sidecarOrder.length - coreCount);
    const perFileRemainderCap = Math.max(
      200,
      Math.floor((SIDECAR_TOTAL_BUDGET - coreCount * SIDECAR_CORE_CAP) / remainderCount),
    );
    const internalDocuments: Array<{ file_name: string; excerpt: string }> = [];
    for (const row of sidecarOrder) {
      const filePath = safeText((row as Record<string, unknown>)?.file_path);
      const fileName = safeText((row as Record<string, unknown>)?.file_name);
      if (!filePath) continue;
      const cap = fileName.startsWith("B2B_") ? SIDECAR_CORE_CAP : perFileRemainderCap;
      try {
        const { data: sidecar, error: sidecarErr } = await supabase.storage
          .from("input-files")
          .download(`${filePath}.extracted.txt`);
        if (sidecarErr || !sidecar) continue;
        const text = (await sidecar.text()).replace(/\s+/g, " ").trim();
        if (!text) continue;
        internalDocuments.push({ file_name: fileName, excerpt: text.slice(0, cap) });
      } catch {
        // Missing sidecar = that document simply contributes nothing; the file list
        // itself still appears in the `files` block below.
      }
    }
    console.log(
      `[local-jobmap-synthesis] internal_documents: ${internalDocuments.length}/${sidecarOrder.length} sidecars, ${internalDocuments.reduce((sum, d) => sum + d.excerpt.length, 0)} chars (core=${coreCount}@${SIDECAR_CORE_CAP}, rest@${perFileRemainderCap})`,
    );

    const industryLabel = inferStandardMarketCategory(
      safeText(baseline?.category_archetype),
      safeText(lensCard?.economic_engine),
      ...evidenceLedger
        .slice(0, 18)
        .map((item) => safeText((item as Record<string, unknown>)?.snippet)),
    );
    const industryAnchors: IndustryStepAnchor | null = industryLabel
      ? getIndustryStepAnchors(industryLabel)
      : null;

    const evidenceContext = {
      // Explicit ODI context — job performer, primary job, desired outcome, recurring challenge
      // These are the four inputs the ODI stage needs to generate a grounded job map
      odi_context: {
        job_performer: safeText(marketDef?.job_executor),
        primary_job: safeText(marketDef?.jtbd),
        market_context: safeText(marketDef?.market_context),
        chooser: safeText(marketDef?.chooser),
        desired_outcome: safeText(primaryOutcome?.outcome_statement),
        outcome_leading_indicator: safeText(primaryOutcome?.leading_indicator),
        recurring_progress_challenge: safeText(
          strategicProblems[0]
            ? (strategicProblems[0] as Record<string, unknown>)?.statement
            : undefined
        ),
      },
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
      // Declared-direction context-window fit (measured: prompt_eval 7,190 of 8,192
      // left the JSON output truncated at done_reason=length): the files metadata
      // block is fully redundant with internal_documents on declared runs, and the
      // public-baseline ledger is context, not source, for an internal derivation.
      // The signed sidecar budget is untouched by these trims.
      files: declaredDirection ? [] : files.map((row) => ({
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
        .slice(0, declaredDirection ? 10 : 18)
        .map((item) => ({
          bucket: safeText((item as Record<string, unknown>)?.bucket),
          snippet: declaredDirection
            ? safeText((item as Record<string, unknown>)?.snippet).slice(0, 160)
            : safeText((item as Record<string, unknown>)?.snippet),
        }))
        .filter((item) => item.bucket || item.snippet),
      industry_label: industryLabel || "",
      industry_step_anchors: industryAnchors || null,
      internal_documents: internalDocuments,
    };

    const contextHint = buildContextHint({
      companyName: safeText((companyRow as Record<string, unknown>)?.name),
      strategicProblems,
      inputs,
      marketJtbd: safeText(lensCard?.economic_engine),
    });

    const industryExclusions = buildCompanyVocabExclusions([
      safeText((companyRow as Record<string, unknown>)?.name),
      safeText(marketDef?.job_executor),
      safeText(marketDef?.jtbd),
      safeText(marketDef?.chooser),
      safeText(marketDef?.market_context),
    ]);
    const manualVocab = (companyRow as Record<string, unknown>)?.manual_industry_vocab;
    if (Array.isArray(manualVocab)) {
      for (const term of manualVocab) {
        const normalized = String(term).toLowerCase().trim();
        if (normalized) industryExclusions.add(normalized);
      }
    }

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
        industryLabel: industryLabel || undefined,
        industryAnchors: industryAnchors || undefined,
        timeoutMs: requireModel ? OLLAMA_REQUIRE_MODEL_TIMEOUT_MS : undefined,
        skipNeeds: declaredDirection,
      });
    } catch (error) {
      if (requireModel) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[local-jobmap-synthesis] require_model set — model failure is terminal, nothing written", error);
        return json(
          { error: `Local synthesis model failed and require_model is set — nothing was written: ${message}` },
          502,
        );
      }
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

    const basis = industryAnchors
      ? `industry_anchor:${industryLabel}`
      : "industry_unresolved";
    const normalizedJourneys: NormalizedJourney[] = requestedMaps.map((map) => {
      const rawJourney = rawJourneyByKey.get(map.journey_key) || null;
      if (isCustomerJourneyKey(map.journey_key)) {
        return normalizeCustomerJourney({
          map,
          rawJourney,
          evidenceBasis: basis,
          contextHint,
          forceContextualDescriptions: synthesisMode === "fallback",
          industryExclusions,
        });
      }
      return normalizeNonCustomerJourney({ map, rawJourney, evidenceBasis: basis, industryExclusions });
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
        industryExclusions,
      });
    // selected_maps_only: the synthesized customer journey stays available as
    // context (executor inference, needs grounding, response stats) but is never
    // injected into the write set — regeneration deletes per journey_key, so an
    // unrequested "customer" write would destroy an existing spine under that key.
    if (!selectedMapsOnly && !normalizedJourneys.some((journey) => isCustomerJourneyKey(journey.journey_key))) {
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
      industryExclusions,
    });

    // Per-journey write: check for Dify-sourced steps before overwriting.
    // If a journey was generated by run-mojo-analysis (Dify), local synthesis skips it
    // to prevent lower-quality Ollama output from clobbering the Dify output.
    // Gate 2b (operator-approved Option A, absolute — supersedes difyProtectedKeys):
    // a journey key holding internal_derived or operator_authored rows is never a
    // regeneration target at any pipeline path. The legacy Dify rows this used to
    // shield by frameworks marker are provenance-stamped internal_derived since
    // migration 20260612000003, so provenance covers them mechanically.
    const { data: existingProvRows } = await supabase
      .from("job_steps")
      .select("journey_key, provenance_type")
      .eq("company_id", companyId);
    const provenanceProtectedKeys = protectedJourneyKeys(
      (existingProvRows ?? []) as Array<{ journey_key?: unknown; provenance_type?: string | null }>,
    );
    if (provenanceProtectedKeys.size > 0) {
      console.log(`[local-jobmap-synthesis] provenance-protected journey keys (never written): ${[...provenanceProtectedKeys].join(", ")}`);
    }

    const sourceRunId = crypto.randomUUID();
    const requestedMapKeys = new Set(requestedMaps.map((map) => map.journey_key));
    const journeysToWrite = normalizedJourneys
      .filter((j) => !provenanceProtectedKeys.has(j.journey_key.toLowerCase()))
      .filter((j) => !selectedMapsOnly || requestedMapKeys.has(j.journey_key))
      .sort((a, b) => Number(isCustomerJourneyKey(a.journey_key)) - Number(isCustomerJourneyKey(b.journey_key)));
    if (declaredDirection) {
      // Operator-signed declared-direction wording, applied after normalization so
      // sanitizeEvidenceStatus cannot coerce it back to "unclear".
      for (const journey of journeysToWrite) {
        journey.steps = journey.steps.map((step) => ({
          ...step,
          evidence_status: "declared" as NormalizedStep["evidence_status"],
          evidence_basis: DECLARED_EVIDENCE_BASIS,
        }));
      }
    }
    let stepsInserted = 0;
    let affectedArtifactsMarked = 0;
    let dependenciesCreated = 0;
    for (const journey of journeysToWrite) {
      const result = await regenerateJobMapJourney({
        supabase,
        companyId,
        userId: runUserId,
        actorType: "system",
        actorId: runUserId,
        journeyKey: journey.journey_key,
        journeyTitle: journey.journey_title,
        journeySubtitle: journey.journey_subtitle,
        steps: journey.steps,
        sourceRunId,
        sourceLabel: "local_jobmap_synthesis",
        frameworksUsed: [
          "JTBD", "ODI", "local_ollama", "local_jobmap_synthesis",
          ...(industryAnchors ? ["industry_anchored"] : []),
        ],
        claimTopic: "job",
      });
      stepsInserted += result.insertedStepCount;
      affectedArtifactsMarked += result.affectedArtifactCount;
      dependenciesCreated += result.dependencyCount;
      console.log(`[local-jobmap-synthesis] wrote journey "${journey.journey_key}" with ${result.insertedStepCount} steps | affected artifacts: ${result.affectedArtifactCount}`);
    }

    if (normalizedNeeds.length > 0) {
      console.log("[local-jobmap-synthesis] synthesized ODI needs were computed for context only and not written.");
    }

    let marketDefinitionAction = "inserted";
    if (existingMarket?.id) {
      const { error: marketUpdateError } = await supabase
        .from("odi_market_definitions")
        .update({
          job_executor: marketDefinition.job_executor,
          chooser: marketDefinition.chooser,
          jtbd: marketDefinition.jtbd,
          // Gate 2a addendum: declared-direction runs must not leave internally
          // derived content under a borrowed label — internal_declared is the
          // honest enum value (widened by migration 20260612000002).
          provenance_type: declaredDirection ? "internal_declared" : "framework_adjudicated",
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
        provenance_type: declaredDirection ? "internal_declared" : "framework_adjudicated",
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
    // Reconciler trigger (c): the INTERNAL side of the market comparison changed
    // (update and insert branches both reach here). Fire-and-forget.
    await fireMarketReconcile({
      supabase: supabase as unknown as { from: (t: string) => any },
      companyId: String(companyId),
      source: "definition_change",
    });

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
        odi_needs_inserted: 0,
        affected_artifacts_marked: affectedArtifactsMarked,
        dependencies_created: dependenciesCreated,
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
