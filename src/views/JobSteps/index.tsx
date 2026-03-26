import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import TopNav from "@/components/layout/TopNav";
import AiBoundaryNote from "@/components/AiBoundaryNote";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { useJobSteps, type JobStepRow } from "@/hooks/useJobSteps";
import { useOdiNeeds, type OdiMarketDefinitionRow, type OdiNeedRow } from "@/hooks/useOdiNeeds";
import { usePublicBaseline } from "@/hooks/usePublicBaseline";
import { useStrategyCascade } from "@/hooks/useStrategyCascade";
import { useStrategicProblems } from "@/hooks/useStrategicProblems";
import { useInputs } from "@/hooks/useInputs";
import { useLatestLocalAlignment, useRunLocalAlignment } from "@/hooks/useLocalAlignment";
import { useSourceConfidence } from "@/hooks/useSourceConfidence";
import type { InputItem } from "@/lib/types";
import { MetaBadge, ScoreChip, StateBadge } from "@/components/ui/semantic-badges";
import PageContextStatus from "@/components/layout/PageContextStatus";
import { AreaAlignmentPanel } from "@/components/alignment/AreaAlignmentPanel";

const c = {
  bg: "#faf7f6",
  panel: "#FFFFFF",
  card: "#ffffff",
  paper: "#FFFFFF",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  faint: "#C8D8CA",
  coral: "#FF7D2D",
  teal: "#5F9B8C",
  slate: "#233C4B",
  gap: "#FF7D2D",
  empty: "#E7EEDC",
  designedDot: "#7B8F66",
};

const STEP_CARD_WIDTH = "250px";
const STEP_DETAIL_BLOCK_HEIGHT = "96px";

type JourneyKey = string;

type JourneyGroup = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  steps: JobStepRow[];
};

type SuggestedJourneyOption = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  confidence: number;
  rationale: string;
};

type JourneyDraftMap = Record<string, { title: string; subtitle: string }>;

const JOURNEY_STYLE: Record<
  string,
  { rail: string; dot: string; preview?: string }
> = {
  customer: { rail: c.coral, dot: c.coral },
  revenue: { rail: c.teal, dot: c.teal, preview: "Project preview" },
  operations: { rail: c.slate, dot: c.slate },
};

function safeText(value: string | null | undefined, fallback = "") {
  return value?.trim() || fallback;
}

function isPublicSourcePath(sourcePath?: string | null) {
  return String(sourcePath || "").toLowerCase().includes("public");
}

function sourcePathLabel(sourcePath?: string | null) {
  const value = String(sourcePath || "").trim();
  if (!value) return "Unknown source";
  return isPublicSourcePath(value) ? `Public: ${value}` : `Uploaded/company: ${value}`;
}

function normalizeAudienceSignal(value: string | null | undefined) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!normalized) return "";
  if (/^(unknown|n\/a|na|none|unset)$/i.test(normalized)) return "";
  return normalized;
}

function isGenericAudienceLabel(value: string | null | undefined) {
  const normalized = normalizeAudienceSignal(value).toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "core audience" ||
    normalized === "audience" ||
    normalized === "target audience" ||
    normalized === "customer" ||
    normalized === "customers" ||
    normalized === "primary customer" ||
    normalized === "primary buyer" ||
    normalized === "user" ||
    normalized === "users" ||
    normalized === "buyer" ||
    normalized === "buyers" ||
    normalized === "decision maker" ||
    normalized === "decision-maker" ||
    normalized === "unknown from public evidence" ||
    normalized === "unknown from uploaded evidence"
  );
}

function isGenericJtbdStatement(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("when trying to complete this job") ||
    normalized.includes("move from defining outcomes to executing and monitoring progress") ||
    normalized === "understand and complete the core job progress for this offering"
  );
}

function isGenericJourneySubtitle(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("how the primary job performer") ||
    normalized.includes("define, locate, prepare, execute, monitor, and conclude progress")
  );
}

function audienceFromJourneyTitle(title: string | null | undefined) {
  const raw = safeText(title, "");
  if (!raw) return "";
  const withoutMapPrefix = raw.replace(/^job\s*map\s*:\s*/i, "").trim();
  const withoutCustomerPrefix = withoutMapPrefix.replace(/^customer\s+/i, "").trim();
  const withoutJourneySuffix = withoutCustomerPrefix.replace(/\s+journey$/i, "").trim();
  const candidate = normalizeAudienceSignal(withoutJourneySuffix || withoutCustomerPrefix || withoutMapPrefix || raw);
  return isGenericAudienceLabel(candidate) ? "" : candidate;
}

function jtbdFromJourneyTitle(title: string | null | undefined) {
  const audience = audienceFromJourneyTitle(title);
  if (!audience) return "";
  const lower = audience.toLowerCase();

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "When choosing and managing a coffee partner, cafe owners and specialty venue buyers want to secure consistent quality, reliable supply, and responsive support, so they can deliver a strong guest experience and protect margins.";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return `When seeking growth capital, ${lower} want to identify, evaluate, and win the right funding partner, so they can execute their strategy on workable terms.`;
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return `When securing mission funding, ${lower} want to win and retain aligned donors and grant partners, so they can sustain impact without constant funding risk.`;
  }

  return `When trying to complete this job, ${lower} want to move from defining outcomes to executing and monitoring progress, so they can achieve the intended result with less risk and rework.`;
}

function chooserFromJourneyTitle(title: string | null | undefined) {
  const audience = audienceFromJourneyTitle(title);
  const lower = audience.toLowerCase();
  if (!audience) return "";

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "Cafe owner, beverage lead, or venue operator";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return "CEO, CFO, or finance lead";
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return "Executive director, development lead, or board sponsor";
  }
  return audience;
}

function marketContextFromJourney(args: {
  title?: string | null;
  subtitle?: string | null;
  fallback?: string | null;
}) {
  const title = audienceFromJourneyTitle(args.title);
  const subtitleRaw = safeText(args.subtitle, "");
  const subtitle = isGenericJourneySubtitle(subtitleRaw) ? "" : subtitleRaw;
  const fallback = safeText(args.fallback, "");

  if (title && subtitle) return `${title}: ${subtitle}`;
  if (subtitle) return subtitle;
  if (title) return title;
  return fallback;
}

function isDraftPlaceholderStep(step: JobStepRow) {
  const basis = safeText(step.evidence_basis, "").toLowerCase();
  return (
    step.evidence_status === "unclear" &&
    Number(step.evidence_confidence ?? 0) <= 25 &&
    basis.includes("local draft step generated without external model run")
  );
}

function hasAssessedGap(step: JobStepRow) {
  return Boolean(step.has_gap) && !isDraftPlaceholderStep(step);
}

function normalizeJourneyKey(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function titleFromKey(key: JourneyKey) {
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return `${titleCaseFromKey(key)} Journey`;
}

function subtitleFromKey(key: JourneyKey) {
  if (key === "customer") return "How a customer experiences the end-to-end service.";
  if (key === "revenue") return "How the company secures and grows revenue.";
  if (key === "operations") return "How the company builds and operates the service.";
  return `How ${titleCaseFromKey(key).toLowerCase()} progress through the work from start to finish.`;
}

function titleCaseFromKey(key: string) {
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Custom Journey";
}

function fallbackStyleForJourney(key: string) {
  const palette = [
    { rail: c.coral, dot: c.coral },
    { rail: c.teal, dot: c.teal },
    { rail: c.slate, dot: c.slate },
    { rail: "#A0C382", dot: "#A0C382" },
    { rail: "#FAC846", dot: "#FAC846" },
  ];
  const hash = Array.from(key).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

async function describeJobMapInvokeError(error: unknown) {
  const maybeContext = (() => {
    if (!error || typeof error !== "object") return null;
    const candidate = (error as { context?: { text?: () => Promise<string> } }).context;
    if (!candidate || typeof candidate.text !== "function") return null;
    return candidate;
  })();

  if (error instanceof FunctionsHttpError || maybeContext) {
    const payloadText = await (maybeContext?.text?.() ?? Promise.resolve("")).catch(() => "");
    const payload = (() => {
      if (!payloadText) return null;
      try {
        return JSON.parse(payloadText) as {
          error?: string;
          status?: string;
          message?: string;
        };
      } catch {
        return null;
      }
    })();

    const status = String(payload?.status || "");
    if (status === "job_map_selection_required") {
      return "Choose at least one job map, then run research.";
    }
    if (status === "customer_job_map_required") {
      return "Include a customer job map so opportunities can anchor to the primary job performer.";
    }

    return String(payload?.message || payload?.error || payloadText || error.message);
  }

  return error instanceof Error ? error.message : String(error);
}

function shouldUseLocalMapFallback(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("missing openai_api_key") ||
    text.includes("edge function returned a non-2xx status code") ||
    text.includes("public baseline is not strong enough") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("customer_job_map_required")
  );
}

function shouldAttemptBaselineRetry(message: string) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("baseline review needed") ||
    text.includes("public baseline") ||
    text.includes("insufficient_public_evidence") ||
    text.includes("ambiguous_public_evidence") ||
    text.includes("not enough extractable evidence")
  );
}

function isMissingTableError(message: string, tableName: string) {
  const text = String(message || "").toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return (
    (text.includes("could not find the table") && text.includes(table)) ||
    (text.includes(table) && text.includes("schema cache"))
  );
}

class InvokeTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvokeTimeoutError";
  }
}

async function invokeFunctionWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new InvokeTimeoutError(
              "Map generation is still running in the background. This can take a few minutes for full evidence-backed generation.",
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const LOCAL_ODI_STEP_SEED = [
  { label: "Define desired outcome", description: "Clarify the primary progress target and constraints before evaluating alternatives." },
  { label: "Locate best options", description: "Identify and compare available options relevant to this job context." },
  { label: "Prepare to execute", description: "Gather prerequisites, resources, and decision criteria needed to act." },
  { label: "Execute core action", description: "Perform the core action sequence that advances the job toward completion." },
  { label: "Monitor progress", description: "Track results, quality, and confidence signals while progressing through the job." },
  { label: "Adjust and conclude", description: "Resolve issues, confirm outcomes, and close the loop for repeatable success." },
];

function groupJourneys(items: JobStepRow[]): JourneyGroup[] {
  const byKey = new Map<string, JobStepRow[]>();
  for (const item of items) {
    const key = safeText(item.journey_key, "").toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }

  const preferredOrder = ["customer", "revenue", "operations"];
  const orderedKeys = [
    ...preferredOrder.filter((key) => byKey.has(key)),
    ...Array.from(byKey.keys())
      .filter((key) => !preferredOrder.includes(key))
      .sort((a, b) => a.localeCompare(b)),
  ];

  return orderedKeys.map((key) => {
    const steps = (byKey.get(key) ?? []).slice().sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0));
    const first = steps[0];
    return {
      key,
      title: safeText(first?.journey_title, key === "customer" || key === "revenue" || key === "operations" ? titleFromKey(key) : `Job Map: ${titleCaseFromKey(key)}`),
      subtitle: safeText(first?.journey_subtitle, key === "customer" || key === "revenue" || key === "operations" ? subtitleFromKey(key) : `How ${titleCaseFromKey(key).toLowerCase()} define, prepare, execute, monitor, and improve progress.`),
      steps,
    };
  });
}

function normalizeRoleLabel(value: string) {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "")
    .trim();
  if (!cleaned) return "Primary Job Performer";
  return cleaned.length > 48 ? `${cleaned.slice(0, 45).trim()}…` : cleaned;
}

function inferRevenueMapTitle(economicEngine: string, publicSignalText: string, allowNonprofitFunding: boolean) {
  const text = `${economicEngine} ${publicSignalText}`.toLowerCase();
  if (/(investment|investor|capital|funding|raise)/.test(text)) {
    return "Job Map: Getting Financial Investment";
  }
  if (allowNonprofitFunding && /(donor|grant|philanthrop|fundraising)/.test(text)) {
    return "Job Map: Securing Donor and Grant Support";
  }
  if (/(referral|pipeline|conversion|enrollment)/.test(text)) {
    return "Job Map: Converting Qualified Demand";
  }
  return "Job Map: Securing Revenue Outcomes";
}

function inferSuggestedJourneyOptions(args: {
  baselineRun: { result_json?: unknown } | null;
  journeys: JourneyGroup[];
  inputs: InputItem[];
  strategicProblems: Array<{ statement: string; status?: string; source?: string }>;
  whereToPlay?: string | null;
  howToWin?: string | null;
}): SuggestedJourneyOption[] {
  const existingJourneyKeys = new Set(args.journeys.map((journey) => journey.key));
  const baseline = args.baselineRun?.result_json as {
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      value_chain?: string;
      economic_engine?: string;
      adoption_constraints?: string;
      risk_surface?: string;
    };
    evidence_ledger?: Array<{ bucket?: string; snippet?: string }>;
  } | null;

  const lens = baseline?.lens_card ?? {};
  const ledger = Array.isArray(baseline?.evidence_ledger) ? baseline.evidence_ledger : [];

  const uploadedSignalText = args.inputs
    .flatMap((input) => [
      input.input_label,
      input.sub_group,
      input.description,
      input.why_it_matters,
      ...input.files.flatMap((file) => [file.file_name, ...(file.tags ?? [])]),
    ])
    .join(" ")
    .toLowerCase();
  const strategicProblemText = args.strategicProblems
    .map((item) => String(item?.statement || ""))
    .join(" ")
    .toLowerCase();

  const publicSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(lens.adoption_constraints || ""),
    String(lens.risk_surface || ""),
    ...ledger.slice(0, 14).map((entry) => `${String(entry?.bucket || "")} ${String(entry?.snippet || "")}`),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    uploadedSignalText,
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();

  const marketSignalText = [
    String(lens.user || ""),
    String(lens.primary_buyer || ""),
    String(lens.chooser || ""),
    String(lens.value_chain || ""),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();
  const nonprofitSignalText = [
    String(lens.value_chain || ""),
    String(lens.economic_engine || ""),
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
    strategicProblemText,
  ]
    .join(" ")
    .toLowerCase();
  const hasNonprofitFundingSignal = /\b(nonprofit|charity|foundation|mission|philanthrop|donor|grant|fundraising)\b/.test(nonprofitSignalText);
  const hasCommercialMarketSignal = /\b(saas|software|telecom|enterprise|b2b|subscription|arr|contract|procurement|retail|cafe|restaurant|venue)\b/.test(nonprofitSignalText);
  const allowDonorGrantRevenueMap = hasNonprofitFundingSignal && !hasCommercialMarketSignal;

  const fileSignals = args.inputs.flatMap((input) =>
    input.files.map((file) => ({
      fileName: String(file.file_name || ""),
      tags: (file.tags ?? []).map((tag) => String(tag || "")),
    })),
  );

  const matchingProblemSnippets = (matcher: RegExp) =>
    args.strategicProblems
      .map((problem) => String(problem?.statement || "").trim())
      .filter((statement) => matcher.test(statement))
      .map((statement) => statement.split(/\n+/)[0].trim())
      .filter(Boolean)
      .slice(0, 2);

  const matchingFileSnippets = (matcher: RegExp) =>
    fileSignals
      .map((file) => `${file.fileName} ${file.tags.join(" ")}`.trim())
      .filter((snippet) => matcher.test(snippet))
      .map((snippet) => snippet.split(/\s+/).slice(0, 10).join(" "))
      .slice(0, 2);

  const countMatches = (terms: string[]) =>
    terms.reduce((sum, term) => (publicSignalText.includes(term) ? sum + 1 : sum), 0);

  const options: SuggestedJourneyOption[] = [];
  const addOption = (option: SuggestedJourneyOption) => {
    if (existingJourneyKeys.has(option.key)) return;
    if (options.some((item) => item.key === option.key)) return;
    options.push(option);
  };

  if (!existingJourneyKeys.has("customer")) {
    const customerSignalRaw = safeText(lens.user || lens.primary_buyer || lens.chooser, "");
    const normalizedCustomerSignal = normalizeAudienceSignal(customerSignalRaw);
    const customerSignal = normalizedCustomerSignal && !isGenericAudienceLabel(normalizedCustomerSignal)
      ? normalizeRoleLabel(normalizedCustomerSignal)
      : "Primary Job Performer";
    addOption({
      key: "customer",
      title: `Job Map: ${customerSignal}`,
      subtitle: `How ${customerSignal.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
      confidence: normalizedCustomerSignal && !isGenericAudienceLabel(normalizedCustomerSignal) ? 95 : 80,
      rationale: normalizedCustomerSignal && !isGenericAudienceLabel(normalizedCustomerSignal)
        ? `Public signal identifies primary job performer context: ${normalizedCustomerSignal}`
        : "Customer job map is required first and should define the core functional job performer.",
    });
  }

  if (!existingJourneyKeys.has("revenue")) {
    const revenueMatches = countMatches([
      "revenue",
      "pricing",
      "contract",
      "renewal",
      "payer",
      "reimbursement",
      "referral",
      "pipeline",
      "conversion",
    ]);
    const nonprofitRevenueMatches = allowDonorGrantRevenueMap
      ? countMatches(["donor", "fundraising", "grant", "philanthrop"])
      : 0;
    const revenueSignalScore = revenueMatches + nonprofitRevenueMatches;
    const economicEngine = safeText(lens.economic_engine, "");
    const hasEconomicSignal =
      economicEngine.length > 0 && economicEngine.toLowerCase() !== "unknown";

    if (revenueSignalScore >= 2 || hasEconomicSignal) {
      const revenueTitle = inferRevenueMapTitle(economicEngine, publicSignalText, allowDonorGrantRevenueMap);
      addOption({
        key: "revenue",
        title: revenueTitle,
        subtitle: "How the company secures, converts, and retains economic value for the chosen market.",
        confidence: Math.min(92, 50 + revenueSignalScore * 8 + (hasEconomicSignal ? 12 : 0)),
        rationale: hasEconomicSignal
          ? `Public signal in economic engine: ${economicEngine}`
          : "Public signals suggest monetization, funding, or referral conversion dynamics.",
      });
    }
  }

  if (!existingJourneyKeys.has("operations")) {
    const operationsMatches = countMatches([
      "operations",
      "delivery",
      "capacity",
      "workflow",
      "staffing",
      "compliance",
      "quality",
      "handoff",
      "throughput",
      "support",
      "service continuity",
    ]);
    const adoptionConstraints = safeText(lens.adoption_constraints, "");
    const riskSurface = safeText(lens.risk_surface, "");
    const hasOpsSignal =
      (adoptionConstraints.length > 0 && adoptionConstraints.toLowerCase() !== "unknown") ||
      (riskSurface.length > 0 && riskSurface.toLowerCase() !== "unknown");

    if (operationsMatches >= 2 || hasOpsSignal) {
      addOption({
        key: "operations",
        title: "Job Map: Delivering Consistent Service",
        subtitle: "How delivery systems coordinate define, prepare, execute, monitor, and adjust work at quality.",
        confidence: Math.min(92, 50 + operationsMatches * 8 + (hasOpsSignal ? 10 : 0)),
        rationale: hasOpsSignal
          ? `Public signal in constraints/risk: ${safeText(adoptionConstraints || riskSurface)}`
          : "Public signals suggest delivery, quality, or operational coordination risk.",
      });
    }
  }

  const audienceCandidates = new Set<string>();
  const baselineRoleCandidates = [lens.user, lens.primary_buyer, lens.chooser]
    .map((value) => normalizeAudienceSignal(String(value || "")))
    .filter((value) => Boolean(value) && !isGenericAudienceLabel(value))
    .map((value) => normalizeRoleLabel(value));
  for (const role of baselineRoleCandidates) {
    audienceCandidates.add(role);
  }
  if (/\binvestor|investment committee|capital partner\b/.test(marketSignalText)) {
    audienceCandidates.add("Investors and Investment Committee");
  }
  if (/\bchannel partner|distribution partner|reseller|procurement lead\b/.test(marketSignalText)) {
    audienceCandidates.add("Channel and Distribution Partners");
  }

  for (const candidate of audienceCandidates) {
    const key = `customer-${candidate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48)}`;
    const roleMatcher = new RegExp(candidate.split(/\s+/).slice(0, 3).join("|"), "i");
    const candidateEvidence = [
      ...matchingProblemSnippets(roleMatcher).map((source) => `Problem: ${source}`),
      ...matchingFileSnippets(roleMatcher).map((source) => `File: ${source}`),
    ].slice(0, 3);
    const rationale = candidateEvidence.length > 0
      ? `Derived from uploaded/client evidence: ${candidateEvidence.join(" • ")}`
      : "Derived from baseline role signals and market context.";
    addOption({
      key,
      title: `Job Map: ${candidate}`,
      subtitle: `How ${candidate.toLowerCase()} define, evaluate, select, execute, and monitor progress.`,
      confidence: candidateEvidence.length > 0 ? 90 : 78,
      rationale,
    });
  }

  return options.sort((a, b) => b.confidence - a.confidence);
}

function TimelineRow({
  steps,
  color,
}: {
  steps: JobStepRow[];
  color: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-4">
      {steps.map((step, index) => {
        const evidenced = step.evidence_status === "evidenced";
        const implied = step.evidence_status === "implied";
        const active = evidenced || implied || !!step.designed;
        const bg = evidenced ? color : implied ? `${color}B3` : c.empty;
        const text = evidenced || implied ? "#fff" : c.muted;

        return (
          <div key={step.id} className="w-[250px] shrink-0" style={{ width: STEP_CARD_WIDTH }}>
            <div className="flex items-center">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-bold"
                style={{ background: bg, color: text }}
              >
                {step.step_number ?? "—"}
              </div>
              {index < steps.length - 1 ? (
                <div
                  className="ml-2 h-[3px] flex-1 rounded-full"
                  style={{ background: active ? `${color}40` : c.line }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StepCard({
  step,
  onSaveText,
  saving,
}: {
  step: JobStepRow;
  onSaveText?: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  saving?: boolean;
}) {
  const draftPlaceholder = isDraftPlaceholderStep(step);
  const assessedGap = hasAssessedGap(step);
  const [isEditing, setIsEditing] = useState(false);
  const [labelDraft, setLabelDraft] = useState(safeText(step.step_label, "Untitled step"));
  const [descriptionDraft, setDescriptionDraft] = useState(safeText(step.description, ""));

  useEffect(() => {
    if (isEditing) return;
    setLabelDraft(safeText(step.step_label, "Untitled step"));
    setDescriptionDraft(safeText(step.description, ""));
  }, [step.step_label, step.description, isEditing]);

  const handleSaveEdit = async () => {
    if (!onSaveText) {
      setIsEditing(false);
      return;
    }
    const nextLabel = labelDraft.trim();
    if (!nextLabel) {
      toast.error("Step label cannot be empty.");
      return;
    }
    try {
      await onSaveText(step.id, {
        step_label: nextLabel,
        description: descriptionDraft.trim(),
      });
      setIsEditing(false);
      toast.success("Step updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update step.");
    }
  };

  const evidenceTone =
    draftPlaceholder
      ? { label: "Not Assessed", color: c.muted, bg: "#F3F4EF", border: c.line }
      : step.evidence_status === "evidenced"
      ? { label: "Evidenced", color: c.teal, bg: "#EEF6E7", border: "#BDD8CF" }
      : step.evidence_status === "implied"
        ? { label: "Implied", color: c.slate, bg: "#EDF4F6", border: "#C4D7DE" }
        : { label: "Unclear", color: c.gap, bg: "#FFF0E6", border: "#FFD1B4" };

  return (
    <div
      className="flex h-full w-[250px] shrink-0 flex-col overflow-hidden rounded-2xl"
      style={{
        width: STEP_CARD_WIDTH,
        background: c.paper,
        border: `1px solid ${assessedGap ? "#E7C3A4" : c.line}`,
        boxShadow: assessedGap ? "0 0 0 1px rgba(255,125,45,0.08) inset" : "none",
      }}
    >
      <div className="flex min-h-[440px] flex-1 flex-col p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: c.muted }}>
              Step {step.step_number ?? "—"}
            </p>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                disabled={!!saving}
                className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setLabelDraft(safeText(step.step_label, "Untitled step"));
                    setDescriptionDraft(safeText(step.description, ""));
                  }}
                  disabled={!!saving}
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={!!saving}
                  className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
          {!isEditing ? (
            <>
              <p className="mt-2 font-sans text-[14px] font-bold leading-tight" style={{ color: c.charcoal }}>
                {safeText(step.step_label, "Untitled step")}
              </p>
              <p className="mt-2 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
                {safeText(step.description, "No description yet.")}
              </p>
            </>
          ) : (
            <div className="mt-2 space-y-2">
              <input
                value={labelDraft}
                onChange={(event) => setLabelDraft(event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Step title"
              />
              <textarea
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                className="min-h-[74px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] leading-[1.5] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Step description"
              />
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
            style={{ color: evidenceTone.color, background: evidenceTone.bg, borderColor: evidenceTone.border }}
          >
            {evidenceTone.label}
          </span>
          <MetaBadge>Conf {step.evidence_confidence ?? 0}</MetaBadge>
        </div>

        <div
          className="mt-3 rounded-xl border px-3 py-2"
          style={{ borderColor: c.line, background: c.lineFaint, minHeight: STEP_DETAIL_BLOCK_HEIGHT }}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Evidence Basis
          </p>
          <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
            {safeText(
              step.evidence_basis,
              draftPlaceholder
                ? "Template step only. Run research to replace with evidence-backed rationale."
                : "No evidence rationale captured.",
            )}
          </p>
        </div>

        {assessedGap ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2"
            style={{
              borderColor: "#E7C3A4",
              background: "#FFF7F0",
              minHeight: STEP_DETAIL_BLOCK_HEIGHT,
            }}
          >
            <p
              className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: c.gap }}
            >
              Gap Identified
            </p>
            <p
              className="mt-1 font-sans text-[12px] leading-[1.55]"
              style={{ color: c.gap }}
            >
              {safeText(step.gap_note, "Gap present, but no rationale captured yet.")}
            </p>
          </div>
        ) : draftPlaceholder ? (
          <div
            className="mt-3 rounded-xl border px-3 py-2"
            style={{ borderColor: c.line, background: c.lineFaint, minHeight: STEP_DETAIL_BLOCK_HEIGHT }}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: c.muted }}>
              Needs Assessment
            </p>
            <p className="mt-1 font-sans text-[12px] leading-[1.55]" style={{ color: c.secondary }}>
              This step is a draft placeholder. Run research to determine whether a real gap exists.
            </p>
          </div>
        ) : (
          <div style={{ minHeight: STEP_DETAIL_BLOCK_HEIGHT }} className="mt-3" />
        )}
      </div>

      <div
        className="flex min-h-[34px] items-center border-t px-4 py-2"
        style={{ borderColor: c.line }}
      >
        {assessedGap ? (
          <span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: c.gap }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c.gap }} />
            Gap
          </span>
        ) : draftPlaceholder ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            Draft
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
            {step.designed ? "Designed" : evidenceTone.label}
          </span>
        )}
      </div>
    </div>
  );
}

function titleCaseJourney(key: string) {
  if (key === "customer") return "Customer";
  if (key === "revenue") return "Revenue";
  if (key === "operations") return "Operations";
  return titleCaseFromKey(key);
}

function OdiContextSection({
  companyName,
  marketDefinition,
  odiError,
  needs,
  marketContext,
  activeCustomerJourneyTitle,
  activeCustomerJourneySubtitle,
  onRemovePublicMarketContext,
  onRemovePublicMarketContextAndRerun,
  removingPublicMarketContextAction,
  hasUploadedFiles,
  onResetPublicResearchArtifacts,
  resettingPublicResearchArtifacts,
}: {
  companyName?: string | null;
  marketDefinition: OdiMarketDefinitionRow | null;
  odiError?: string | null;
  needs: OdiNeedRow[];
  marketContext?: string;
  activeCustomerJourneyTitle?: string | null;
  activeCustomerJourneySubtitle?: string | null;
  onRemovePublicMarketContext?: () => void;
  onRemovePublicMarketContextAndRerun?: () => void;
  removingPublicMarketContextAction?: "remove" | "remove_and_rerun" | null;
  hasUploadedFiles?: boolean;
  onResetPublicResearchArtifacts?: () => void;
  resettingPublicResearchArtifacts?: boolean;
}) {
  const derivedExecutor = audienceFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedJtbd = jtbdFromJourneyTitle(activeCustomerJourneyTitle);
  const derivedChooser = chooserFromJourneyTitle(activeCustomerJourneyTitle);
  const storedExecutor = safeText(marketDefinition?.job_executor, "");
  const storedChooser = safeText(marketDefinition?.chooser, "");
  const storedJtbd = safeText(marketDefinition?.jtbd, "");
  const companyExecutorFallback = safeText(companyName, "")
    ? `${safeText(companyName, "")} customer`
    : "Primary job performer";

  const jobExecutor = safeText(
    derivedExecutor,
    safeText(isGenericAudienceLabel(storedExecutor) ? "" : storedExecutor, companyExecutorFallback),
  );
  const chooser = safeText(
    derivedChooser,
    safeText(isGenericAudienceLabel(storedChooser) ? "" : storedChooser, "Buying/decision lead"),
  );
  const jtbd = safeText(
    derivedJtbd,
    safeText(
      isGenericJtbdStatement(storedJtbd) ? "" : storedJtbd,
      "Complete the end-to-end customer job with reliable outcomes."
    ),
  );
  const market = safeText(
    marketContextFromJourney({
      title: activeCustomerJourneyTitle,
      subtitle: activeCustomerJourneySubtitle,
      fallback: marketContext || marketDefinition?.jtbd,
    }),
    "No market context captured yet.",
  );
  const marketSource = sourcePathLabel(marketDefinition?.source_path);
  const publicNeedCount = needs.filter((item) => isPublicSourcePath(item.source_path)).length;
  const uploadedNeedCount = Math.max(0, needs.length - publicNeedCount);
  const hasPublicMarketContext = Boolean(marketDefinition?.source_path) && isPublicSourcePath(marketDefinition?.source_path);

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h2 className="font-sans text-[24px] font-semibold" style={{ color: c.charcoal }}>
            ODI Needs & Market Context
          </h2>
          <MetaBadge>{marketSource}</MetaBadge>
          <MetaBadge>{`Needs: ${publicNeedCount} public / ${uploadedNeedCount} uploaded`}</MetaBadge>
        </div>
        <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
          Public and uploaded-company signals are shown side by side through local alignment. Use this panel to spot mismatches before trusting ODI priorities.
        </p>
        {odiError ? (
          <p className="mt-2 font-sans text-[13px]" style={{ color: c.gap }}>
            ODI data load warning: {odiError}
          </p>
        ) : null}
        {hasPublicMarketContext && onRemovePublicMarketContext ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {hasUploadedFiles && onRemovePublicMarketContextAndRerun ? (
              <button
                type="button"
                onClick={onRemovePublicMarketContextAndRerun}
                disabled={Boolean(removingPublicMarketContextAction)}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.charcoal, background: c.card }}
              >
                {removingPublicMarketContextAction === "remove_and_rerun"
                  ? "Removing + Re-running…"
                  : "Remove + Re-run Uploaded Files"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onRemovePublicMarketContext}
              disabled={Boolean(removingPublicMarketContextAction)}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
            >
              {removingPublicMarketContextAction === "remove"
                ? "Removing…"
                : hasUploadedFiles && onRemovePublicMarketContextAndRerun
                  ? "Remove Only"
                  : "Remove Public Market Context"}
            </button>
          </div>
        ) : null}
        {onResetPublicResearchArtifacts ? (
          <div className="mt-3">
            <button
              type="button"
              onClick={onResetPublicResearchArtifacts}
              disabled={Boolean(removingPublicMarketContextAction) || !!resettingPublicResearchArtifacts}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: "#E6CFC2", color: "#915E46", background: "#FFF8F5" }}
              title="Remove generated public-research artifacts (map, opportunities, routes, baseline snapshots) while keeping uploaded files"
            >
              {resettingPublicResearchArtifacts ? "Resetting…" : "Reset False Public Research Artifacts"}
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Market Context
          </p>
          <p className="mt-2 font-sans text-[13px] leading-[1.55]" style={{ color: c.secondary }}>
            {market}
          </p>
        </div>

        <div className="rounded-2xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job Executor
          </p>
          <p className="mt-2 font-sans text-[15px] font-semibold" style={{ color: c.charcoal }}>
            {jobExecutor}
          </p>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Chooser
          </p>
          <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
            {chooser}
          </p>
        </div>

        <div className="rounded-2xl border p-4 lg:col-span-1" style={{ borderColor: c.line, background: c.paper }}>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
            Job to Be Done
          </p>
          <p className="mt-2 font-sans text-[15px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
            {jtbd}
          </p>
          <p className="mt-2 font-sans text-[12px] italic leading-[1.6]" style={{ color: c.muted }}>
            Note: ODI needs should be written as stable, solution-free desired outcome statements. The current set and its scores are inferred from generated opportunities plus available public/uploaded evidence, not from validated ODI survey responses.
          </p>
        </div>
      </div>
    </section>
  );
}

function OdiNeedsListSection({
  needs,
  onRemoveNeed,
  removingNeedId,
  onRemovePublicNeeds,
  removingPublicNeeds,
  onReorderNeeds,
  reorderingNeeds,
  onUpdateNeedText,
  updatingNeedId,
}: {
  needs: OdiNeedRow[];
  onRemoveNeed?: (needId: string) => void;
  removingNeedId?: string | null;
  onRemovePublicNeeds?: () => void;
  removingPublicNeeds?: boolean;
  onReorderNeeds?: (orderedNeedIds: string[]) => Promise<void>;
  reorderingNeeds?: boolean;
  onUpdateNeedText?: (needId: string, values: { desired_outcome: string }) => Promise<void>;
  updatingNeedId?: string | null;
}) {
  type NeedOrderMode = "suggested" | "custom";
  const sortNeedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const aSort = Number.isFinite(Number(a.sort_order)) ? Number(a.sort_order) : Number.MAX_SAFE_INTEGER;
    const bSort = Number.isFinite(Number(b.sort_order)) ? Number(b.sort_order) : Number.MAX_SAFE_INTEGER;
    if (aSort !== bSort) return aSort - bSort;
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.importance ?? 0) - (a.importance ?? 0);
  });
  const sortSuggestedItems = (rows: OdiNeedRow[]) => [...rows].sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const importanceDiff = (b.importance ?? 0) - (a.importance ?? 0);
    if (importanceDiff !== 0) return importanceDiff;
    const satisfactionDiff = (a.satisfaction ?? 0) - (b.satisfaction ?? 0);
    if (satisfactionDiff !== 0) return satisfactionDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  const [needItems, setNeedItems] = useState<OdiNeedRow[]>(() => sortNeedItems(needs));
  const [orderMode, setOrderMode] = useState<NeedOrderMode>("custom");
  const [draggingNeedId, setDraggingNeedId] = useState<string | null>(null);
  const [dragOverNeedId, setDragOverNeedId] = useState<string | null>(null);
  const [editingNeedId, setEditingNeedId] = useState<string | null>(null);
  const [needDrafts, setNeedDrafts] = useState<Record<string, string>>({});
  const reorderNeedItems = (items: OdiNeedRow[], fromId: string, toId: string) => {
    const fromIndex = items.findIndex((item) => item.id === fromId);
    const toIndex = items.findIndex((item) => item.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next.map((item, index) => ({ ...item, sort_order: index + 1 }));
  };

  useEffect(() => {
    setNeedItems(sortNeedItems(needs));
    setDraggingNeedId(null);
    setDragOverNeedId(null);
    setEditingNeedId(null);
  }, [needs]);

  const suggestedItems = useMemo(() => sortSuggestedItems(needs), [needs]);
  const suggestedOrderIds = suggestedItems.map((item) => item.id);
  const customOrderIds = needItems.map((item) => item.id);
  const needNumberById = useMemo(
    () =>
      new Map<string, string>(
        suggestedItems.map((item, index) => [item.id, String(index + 1).padStart(3, "0")]),
      ),
    [suggestedItems],
  );
  const hasCustomOrder =
    suggestedOrderIds.length === customOrderIds.length &&
    suggestedOrderIds.some((id, index) => customOrderIds[index] !== id);
  const visibleNeedItems = orderMode === "suggested" ? suggestedItems : needItems;

  const publicNeedCount = visibleNeedItems.filter((item) => isPublicSourcePath(item.source_path)).length;

  return (
    <section
      className="rounded-[28px] border px-6 py-6"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ borderColor: c.line, background: c.paper }}
      >
        <div className="h-[5px] w-full" style={{ background: c.coral }} />
        <div className="p-4">
          <div className="mb-3">
            <h3 className="font-sans text-[20px] font-semibold" style={{ color: c.charcoal }}>
              Needs
            </h3>
            <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
              Desired outcome statements from both public and uploaded evidence. Use source labels to remove inaccurate public rows and keep company-grounded needs.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOrderMode("suggested")}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  borderColor: orderMode === "suggested" ? "#E6CFC2" : c.line,
                  color: orderMode === "suggested" ? c.charcoal : c.secondary,
                  background: orderMode === "suggested" ? "#FFF4EC" : c.card,
                }}
              >
                Suggested Priority
              </button>
              <button
                type="button"
                onClick={() => setOrderMode("custom")}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{
                  borderColor: orderMode === "custom" ? "#D8E4D6" : c.line,
                  color: orderMode === "custom" ? c.charcoal : c.secondary,
                  background: orderMode === "custom" ? "#EEF6E7" : c.card,
                }}
              >
                Your Priority
              </button>
              {hasCustomOrder ? (
                <MetaBadge>Custom order saved</MetaBadge>
              ) : (
                <MetaBadge>Using suggested order</MetaBadge>
              )}
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              {orderMode === "suggested"
                ? "Viewing system-suggested rank"
                : reorderingNeeds
                  ? "Saving your order…"
                  : "Drag needs to reorder your priority"}
            </p>
            {publicNeedCount > 0 && onRemovePublicNeeds ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={onRemovePublicNeeds}
                  disabled={!!removingPublicNeeds}
                  className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                  style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
                >
                  {removingPublicNeeds ? "Removing…" : `Remove Public Needs (${publicNeedCount})`}
                </button>
              </div>
            ) : null}
          </div>

          {visibleNeedItems.length === 0 ? (
            <p className="font-sans text-[13px]" style={{ color: c.secondary }}>
              No ODI needs identified yet from current evidence.
            </p>
          ) : (
            <div className="space-y-3">
              {visibleNeedItems.map((item) => (
                <div
                  key={item.id}
                  draggable={orderMode === "custom" && !reorderingNeeds && editingNeedId !== item.id}
                  onDragStart={() => {
                    if (orderMode !== "custom" || reorderingNeeds || editingNeedId === item.id) return;
                    setDraggingNeedId(item.id);
                  }}
                  onDragOver={(event) => {
                    if (orderMode !== "custom" || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) return;
                    event.preventDefault();
                    setDragOverNeedId(item.id);
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    if (orderMode !== "custom" || !onReorderNeeds || reorderingNeeds || !draggingNeedId || draggingNeedId === item.id) {
                      setDragOverNeedId(null);
                      return;
                    }
                    const next = reorderNeedItems(needItems, draggingNeedId, item.id);
                    setNeedItems(next);
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                    try {
                      await onReorderNeeds(next.map((entry) => entry.id));
                    } catch (err) {
                      setNeedItems(sortNeedItems(needs));
                      toast.error(err instanceof Error ? err.message : "Failed to reorder needs.");
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingNeedId(null);
                    setDragOverNeedId(null);
                  }}
                  className="rounded-xl border p-3"
                  style={{
                    borderColor: c.line,
                    background: c.card,
                    cursor: orderMode !== "custom" || reorderingNeeds ? "default" : "grab",
                    boxShadow: dragOverNeedId === item.id ? "0 0 0 2px rgba(255,125,45,0.32) inset" : "none",
                    opacity: draggingNeedId === item.id ? 0.72 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    {editingNeedId === item.id ? (
                      <textarea
                        value={needDrafts[item.id] ?? item.desired_outcome}
                        onChange={(event) =>
                          setNeedDrafts((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        className="min-h-[78px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] leading-[1.5] outline-none"
                        style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                        placeholder="Desired outcome"
                      />
                    ) : (
                      <p className="font-sans text-[13px] font-semibold leading-[1.45]" style={{ color: c.charcoal }}>
                        {item.desired_outcome}
                      </p>
                    )}
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                      style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      title="Stable need number based on suggested priority"
                    >
                      {needNumberById.get(item.id) || "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateBadge tone={item.service_state} />
                    <MetaBadge>{titleCaseJourney(item.journey_key)}</MetaBadge>
                    <MetaBadge>{item.step_label || "Unassigned step"}</MetaBadge>
                    <MetaBadge>{sourcePathLabel(item.source_path)}</MetaBadge>
                    <ScoreChip label="Est. I" value={item.importance} />
                    <ScoreChip label="Est. S" value={item.satisfaction} />
                  </div>
                  {onRemoveNeed ? (
                    <div className="mt-3 flex justify-end gap-2">
                      {editingNeedId === item.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNeedId(null);
                              setNeedDrafts((current) => {
                                const next = { ...current };
                                delete next[item.id];
                                return next;
                              });
                            }}
                            disabled={updatingNeedId === item.id}
                            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                            style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!onUpdateNeedText) return;
                              const draftValue = String(needDrafts[item.id] ?? item.desired_outcome).trim();
                              if (!draftValue) {
                                toast.error("Need text cannot be empty.");
                                return;
                              }
                              try {
                                await onUpdateNeedText(item.id, { desired_outcome: draftValue });
                                setNeedItems((current) =>
                                  current.map((row) =>
                                    row.id === item.id ? { ...row, desired_outcome: draftValue } : row,
                                  ),
                                );
                                setEditingNeedId(null);
                                setNeedDrafts((current) => {
                                  const next = { ...current };
                                  delete next[item.id];
                                  return next;
                                });
                                toast.success("Need updated.");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Failed to update need.");
                              }
                            }}
                            disabled={updatingNeedId === item.id}
                            className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                            style={{ borderColor: c.line, color: "#1F6A5B", background: "#EEF6E7" }}
                          >
                            {updatingNeedId === item.id ? "Saving…" : "Save"}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNeedId(item.id);
                            setNeedDrafts((current) => ({
                              ...current,
                              [item.id]: current[item.id] ?? item.desired_outcome,
                            }));
                          }}
                          disabled={updatingNeedId === item.id}
                          className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                          style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveNeed(item.id)}
                        disabled={removingNeedId === item.id || updatingNeedId === item.id}
                        className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                        style={{ borderColor: "#F1C3AC", color: c.coral, background: c.card }}
                      >
                        {removingNeedId === item.id ? "Removing…" : "Remove Need"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function JourneySection({
  journey,
  onRemove,
  removing,
  onUpdateStepText,
  updatingStepId,
}: {
  journey: JourneyGroup;
  onRemove: (key: JourneyKey) => void;
  removing: boolean;
  onUpdateStepText: (stepId: string, values: { step_label: string; description: string }) => Promise<void>;
  updatingStepId: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const style = JOURNEY_STYLE[journey.key] ?? fallbackStyleForJourney(journey.key);
  const { rail, dot, preview } = style;
  const designedCount = journey.steps.filter((step) => step.designed).length;
  const evidencedCount = journey.steps.filter((step) => step.evidence_status === "evidenced").length;
  const gapsCount = journey.steps.filter((step) => hasAssessedGap(step)).length;
  const pendingAssessmentCount = journey.steps.filter((step) => isDraftPlaceholderStep(step)).length;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const checkScroll = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };

    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [journey.steps.length]);

  const scrollByCards = (direction: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: direction * 340, behavior: "smooth" });
  };

  return (
    <section
      className="overflow-hidden rounded-[28px] border p-0"
      style={{
        background: "#FFFFFF",
        borderColor: c.line,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
      }}
    >
      <div className="h-full w-[6px]" style={{ background: rail, float: "left" }} />
      <div className="ml-[6px] px-6 py-6">
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            {preview ? (
              <div
                className="mb-2 inline-flex rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                style={{ background: "#2c2925", color: "#fff" }}
              >
                {preview}
              </div>
            ) : null}
            <h2 className="font-sans text-[24px] font-semibold leading-tight" style={{ color: c.charcoal }}>
              {journey.title}
            </h2>
            <p className="mt-1 max-w-4xl font-sans text-[14px]" style={{ color: c.secondary }}>
              {journey.subtitle}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-5 whitespace-nowrap">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.designedDot }} />
              {designedCount} designed
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.teal }} />
              {evidencedCount} evidenced
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.gap }} />
              {gapsCount} gaps
            </span>
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.muted }} />
              {pendingAssessmentCount} pending
            </span>
            <button
              type="button"
              onClick={() => onRemove(journey.key)}
              disabled={removing}
              className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              {removing ? "Removing…" : "Remove Map"}
            </button>
          </div>
        </div>

        <div className="relative mt-1">
          {canScrollLeft ? (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scrollByCards(-1)}
              className="absolute left-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          ) : null}

          <div ref={scrollRef} className="overflow-x-auto pb-1">
            <div className="inline-block min-w-full">
              <TimelineRow steps={journey.steps} color={dot} />

              <div className="flex gap-3 px-5">
              {journey.steps.map((step) => (
                <StepCard
                  key={step.id}
                  step={step}
                  onSaveText={onUpdateStepText}
                  saving={updatingStepId === step.id}
                />
              ))}
              </div>
            </div>
          </div>

          {canScrollRight ? (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scrollByCards(1)}
              className="absolute right-2 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border"
              style={{ background: c.card, borderColor: c.line, color: c.secondary }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SuggestedMapsSection({
  options,
  drafts,
  onDraftChange,
  onAddMap,
  runningKey,
}: {
  options: SuggestedJourneyOption[];
  drafts: JourneyDraftMap;
  onDraftChange: (key: string, field: "title" | "subtitle", value: string) => void;
  onAddMap: (key: string) => void;
  runningKey: string | null;
}) {
  if (options.length === 0) return null;

  return (
    <section
      className="rounded-[24px] border px-6 py-5"
      style={{ borderColor: c.line, background: c.panel }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
            Choose Job Maps
          </p>
          <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
            Add maps one at a time. You can edit title/subtitle first, then click add.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        {options.map((option) => (
          <div
            key={option.key}
            className="rounded-xl border p-3"
            style={{ borderColor: c.line, background: c.paper }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MetaBadge>{titleCaseJourney(option.key)}</MetaBadge>
              <ScoreChip label="Confidence" value={option.confidence} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="font-sans text-[14px] font-semibold" style={{ color: c.charcoal }}>
                {drafts[option.key]?.title || option.title}
              </p>
              <MetaBadge>Public signal</MetaBadge>
            </div>
            <p className="mt-2 font-sans text-[12px] leading-[1.5]" style={{ color: c.secondary }}>
              {option.rationale}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={drafts[option.key]?.title || option.title}
                onChange={(event) => onDraftChange(option.key, "title", event.target.value)}
                className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                placeholder="Map title"
              />
              <textarea
                value={drafts[option.key]?.subtitle || option.subtitle}
                onChange={(event) => onDraftChange(option.key, "subtitle", event.target.value)}
                className="min-h-[62px] w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                placeholder="Map subtitle"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span />
              <button
                type="button"
                onClick={() => onAddMap(option.key)}
                disabled={runningKey !== null}
                className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                style={{ borderColor: c.line, color: c.secondary, background: c.card }}
              >
                {runningKey === option.key ? "Adding…" : "Add Map"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function JobStepsView() {
  const { activeCompany } = useCompany();
  const activeCompanyId = activeCompany?.id ?? null;
  const {
    loading,
    items,
    error,
    updatingStepId,
    updateStepText,
    removingJourneyKey,
    removeJourneyMap,
    refetch: refetchJobSteps,
  } = useJobSteps(activeCompanyId ?? undefined);
  const { run: baselineRun, refetch: refetchBaseline } = usePublicBaseline(activeCompanyId ?? undefined);
  const { item: strategyCascade } = useStrategyCascade(activeCompanyId ?? undefined);
  const { items: strategicProblems } = useStrategicProblems(activeCompanyId ?? undefined);
  const { query: inputsQuery } = useInputs(activeCompanyId ?? undefined);
  const [odiRefreshKey, setOdiRefreshKey] = useState(0);
  const { marketDefinition, needs, error: odiError } = useOdiNeeds(activeCompanyId ?? undefined, odiRefreshKey);
  const { data: localAlignment } = useLatestLocalAlignment(activeCompanyId ?? undefined);
  const runLocalAlignment = useRunLocalAlignment(activeCompanyId ?? undefined);
  const { signals: sourceSignals } = useSourceConfidence({
    companyId: activeCompanyId ?? undefined,
    areaScoresJson: activeCompany?.area_scores_json,
  });
  const [journeyDrafts, setJourneyDrafts] = useState<JourneyDraftMap>({});
  const [customMapDraft, setCustomMapDraft] = useState({ key: "", title: "", subtitle: "" });
  const [runningJourneyKey, setRunningJourneyKey] = useState<string | null>(null);
  const [showChooseMaps, setShowChooseMaps] = useState(true);
  const [showCustomMapForm, setShowCustomMapForm] = useState(false);
  const [recentlyRemovedKeysByCompany, setRecentlyRemovedKeysByCompany] = useState<Record<string, string[]>>({});
  const [removingNeedId, setRemovingNeedId] = useState<string | null>(null);
  const [updatingNeedId, setUpdatingNeedId] = useState<string | null>(null);
  const [reorderingNeeds, setReorderingNeeds] = useState(false);
  const [removingPublicNeeds, setRemovingPublicNeeds] = useState(false);
  const [removingPublicMarketContextAction, setRemovingPublicMarketContextAction] = useState<"remove" | "remove_and_rerun" | null>(null);
  const [resettingPublicResearchArtifacts, setResettingPublicResearchArtifacts] = useState(false);

  const scopedBaselineRun = useMemo(() => {
    if (!activeCompanyId || !baselineRun) return null;
    return baselineRun?.company_id === activeCompanyId ? baselineRun : null;
  }, [activeCompanyId, baselineRun]);

  const recentlyRemovedKeys = useMemo(() => {
    if (!activeCompanyId) return [];
    return recentlyRemovedKeysByCompany[activeCompanyId] ?? [];
  }, [activeCompanyId, recentlyRemovedKeysByCompany]);
  const marketAlignment = localAlignment?.areas?.market ?? null;
  const odiAlignment = localAlignment?.areas?.odi ?? null;
  const uploadedFileCount = useMemo(
    () => (inputsQuery.data ?? []).reduce((sum, input) => sum + input.files.length, 0),
    [inputsQuery.data],
  );

  useEffect(() => {
    setJourneyDrafts({});
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
    setRunningJourneyKey(null);
    setShowChooseMaps(true);
    setShowCustomMapForm(false);
  }, [activeCompanyId]);

  const journeys = useMemo(() => groupJourneys(items), [items]);
  const activeCustomerJourneyTitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.title;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.title ?? null;
  }, [journeys]);
  const activeCustomerJourneySubtitle = useMemo(() => {
    const customerJourney = journeys.find((journey) => journey.key === "customer");
    if (customerJourney) return customerJourney.subtitle;
    const customCustomerJourney = journeys.find((journey) => journey.key.startsWith("customer-"));
    return customCustomerJourney?.subtitle ?? null;
  }, [journeys]);
  const totalGaps = useMemo(
    () => journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => hasAssessedGap(step)).length, 0),
    [journeys]
  );
  const pendingAssessmentTotal = useMemo(
    () =>
      journeys.reduce((sum, journey) => sum + journey.steps.filter((step) => isDraftPlaceholderStep(step)).length, 0),
    [journeys],
  );
  const suggestedJourneyOptions = useMemo(() => {
    const inferred = inferSuggestedJourneyOptions({
      baselineRun: scopedBaselineRun,
      journeys,
      inputs: inputsQuery.data ?? [],
      strategicProblems,
      whereToPlay: strategyCascade?.where_to_play ?? "",
      howToWin: strategyCascade?.how_to_win ?? "",
    });
    const byKey = new Map<JourneyKey, SuggestedJourneyOption>(inferred.map((option) => [option.key, option]));
    for (const key of recentlyRemovedKeys) {
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          title: titleFromKey(key),
          subtitle: subtitleFromKey(key),
          confidence: 70,
          rationale: "Previously removed map. Add it again any time.",
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => b.confidence - a.confidence);
  }, [scopedBaselineRun, journeys, recentlyRemovedKeys, inputsQuery.data, strategicProblems, strategyCascade?.where_to_play, strategyCascade?.how_to_win]);
  useEffect(() => {
    setJourneyDrafts((previous) => {
      const next = { ...previous };
      for (const option of suggestedJourneyOptions) {
        const current = next[option.key] || { title: "", subtitle: "" };
        next[option.key] = {
          title: safeText(current.title, option.title),
          subtitle: safeText(current.subtitle, option.subtitle),
        };
      }
      return next;
    });
  }, [suggestedJourneyOptions]);

  const updateJourneyDraft = (key: string, field: "title" | "subtitle", value: string) => {
    setJourneyDrafts((previous) => ({
      ...previous,
      [key]: {
        ...previous[key],
        [field]: value,
      },
    }));
  };

  const insertLocalDraftMap = async (args: {
    key: string;
    title: string;
    subtitle: string;
  }) => {
    if (!activeCompanyId) throw new Error("No active company selected.");
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user?.id) {
      throw new Error("Sign in required to add a local job map draft.");
    }

    const { data: existingRows, error: existingErr } = await supabase
      .from("job_steps")
      .select("id")
      .eq("company_id", activeCompanyId)
      .eq("journey_key", args.key)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message || "Failed to verify existing map.");
    if ((existingRows ?? []).length > 0) return false;

    const rows = LOCAL_ODI_STEP_SEED.map((seed, index) => ({
      company_id: activeCompanyId,
      user_id: authData.user.id,
      journey_key: args.key,
      journey_title: args.title,
      journey_subtitle: args.subtitle,
      step_number: index + 1,
      step_label: seed.label,
      description: seed.description,
      designed: false,
      has_gap: true,
      evidence_status: "unclear",
      evidence_basis: "Local draft step generated without external model run.",
      evidence_confidence: 20,
      gap_note: "Awaiting evidence-backed research and validation.",
    }));

    const { error: insertErr } = await supabase.from("job_steps").insert(rows);
    if (insertErr) throw new Error(insertErr.message || "Failed to insert local job map draft.");
    return true;
  };

  const runAddMap = async (args: {
    key: string;
    title?: string;
    subtitle?: string;
    source?: "suggested" | "custom";
  }) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before running journey research.");
      return;
    }
    const key = normalizeJourneyKey(args.key);
    if (!key) {
      toast.error("Enter a valid map key.");
      return;
    }

    try {
      setRunningJourneyKey(key);
      const { data: activeLock } = await supabase
        .from("company_run_locks")
        .select("operation, started_at, expires_at")
        .eq("company_id", activeCompany.id)
        .maybeSingle();

      if (activeLock?.operation === "research") {
        const started = activeLock.started_at
          ? new Date(activeLock.started_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : "recently";
        toast.message(`Research is already running (started ${started}). We’ll keep this map request queued after it completes.`);
        return;
      }

      const jobMap = {
        journey_key: key,
        journey_title: safeText(args.title, titleFromKey(key)),
        journey_subtitle: safeText(args.subtitle, subtitleFromKey(key)),
        source: args.source || "custom",
      };
      const existingCustomerJourney = journeys.find((journey) => journey.key === "customer");
      const customerSupportMap =
        key !== "customer" && existingCustomerJourney
          ? {
              journey_key: "customer",
              journey_title: safeText(existingCustomerJourney.title, titleFromKey("customer")),
              journey_subtitle: safeText(existingCustomerJourney.subtitle, subtitleFromKey("customer")),
              source: "existing" as const,
            }
          : null;
      const jobMapsPayload = customerSupportMap ? [customerSupportMap, jobMap] : [jobMap];

      const runResearchMap = async () =>
        invokeFunctionWithTimeout(
          () =>
            supabase.functions.invoke("research-company", {
              body: {
                company_id: activeCompany.id,
                company_name: activeCompany.name,
                website: activeCompany.website ?? "",
                journeys_to_generate: [key],
                job_maps: jobMapsPayload,
                review_mode: "advisory",
              },
            }),
          90_000,
        );

      let data: { error?: unknown; message?: unknown } | null = null;
      let invokeError: unknown;
      try {
        const first = await runResearchMap();
        data =
          first?.data && typeof first.data === "object"
            ? (first.data as { error?: unknown; message?: unknown })
            : null;
        invokeError = first?.error;
      } catch (err) {
        if (err instanceof InvokeTimeoutError) {
          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          toast.message(err.message);
          return;
        }
        throw err;
      }
      let invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";

      if (invokeError && shouldAttemptBaselineRetry(invokeMessage)) {
        toast.message("Refreshing public baseline, then retrying map generation once.");
        const { error: baselineErr } = await supabase.functions.invoke("public-baseline", {
          body: {
            company_id: activeCompany.id,
            company_name: activeCompany.name,
            website: activeCompany.website ?? "",
          },
        });
        if (!baselineErr) {
          await refetchBaseline();
          try {
            const retry = await runResearchMap();
            data =
              retry?.data && typeof retry.data === "object"
                ? (retry.data as { error?: unknown; message?: unknown })
                : null;
            invokeError = retry?.error;
          } catch (retryErr) {
            if (retryErr instanceof InvokeTimeoutError) {
              await Promise.all([refetchJobSteps(), refetchBaseline()]);
              toast.message(retryErr.message);
              return;
            }
            throw retryErr;
          }
          invokeMessage = invokeError ? await describeJobMapInvokeError(invokeError) : "";
        } else {
          const baselineMessage = await describeJobMapInvokeError(baselineErr);
          invokeMessage = `${invokeMessage}. Baseline refresh failed: ${baselineMessage}`;
        }
      }

      if (invokeError) {
        if (shouldUseLocalMapFallback(invokeMessage)) {
          const inserted = await insertLocalDraftMap({
            key,
            title: jobMap.journey_title,
            subtitle: jobMap.journey_subtitle,
          });
          await Promise.all([refetchJobSteps(), refetchBaseline()]);
          if (inserted) {
            toast.success(`${titleCaseJourney(key)} map added as a local draft.`);
            toast.message("Evidence-backed generation could not run yet. Baseline and model access are required.");
          } else {
            toast.message(`${titleCaseJourney(key)} map already exists.`);
          }
          return;
        }
        throw new Error(invokeMessage);
      }
      if (data?.error) {
        throw new Error(String(data.message || data.error));
      }

      await Promise.all([refetchJobSteps(), refetchBaseline()]);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => ({
          ...previous,
          [activeCompanyId]: (previous[activeCompanyId] ?? []).filter((removed) => removed !== key),
        }));
      }
      toast.success(`${titleCaseJourney(key)} map added.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add job map.");
    } finally {
      setRunningJourneyKey(null);
    }
  };

  const addMap = async (key: string) => {
    const draft = journeyDrafts[key];
    const suggested = suggestedJourneyOptions.find((option) => option.key === key);
    const fallbackTitle = suggested?.title || titleFromKey(key);
    const fallbackSubtitle = suggested?.subtitle || subtitleFromKey(key);
    await runAddMap({
      key,
      title: safeText(draft?.title, fallbackTitle),
      subtitle: safeText(draft?.subtitle, fallbackSubtitle),
      source: draft?.title || draft?.subtitle ? "custom" : "suggested",
    });
  };

  const addCustomMap = async () => {
    const derivedKey = normalizeJourneyKey(customMapDraft.key || customMapDraft.title);
    if (!derivedKey) {
      toast.error("Enter a custom map key or title.");
      return;
    }
    await runAddMap({
      key: derivedKey,
      title: safeText(customMapDraft.title, titleFromKey(derivedKey)),
      subtitle: safeText(customMapDraft.subtitle, subtitleFromKey(derivedKey)),
      source: "custom",
    });
    setCustomMapDraft({ key: "", title: "", subtitle: "" });
  };

  const handleUpdateStepText = async (
    stepId: string,
    values: { step_label: string; description: string },
  ) => {
    await updateStepText(stepId, values);
  };

  const handleReorderNeeds = async (orderedNeedIds: string[]) => {
    if (!activeCompanyId) throw new Error("Select a company before reordering needs.");
    const ids = Array.isArray(orderedNeedIds)
      ? orderedNeedIds.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];
    if (ids.length === 0) return;

    const expectedNeedIds = needs.map((item) => item.id).sort();
    const sortedIds = [...ids].sort();
    if (
      expectedNeedIds.length !== sortedIds.length ||
      expectedNeedIds.some((id, index) => id !== sortedIds[index])
    ) {
      throw new Error("Need reorder payload did not match current needs.");
    }

    setReorderingNeeds(true);
    try {
      const updateCalls = ids.map((id, index) =>
        supabase
          .from("odi_needs")
          .update({ sort_order: index + 1 })
          .eq("company_id", activeCompanyId)
          .eq("id", id),
      );
      const results = await Promise.all(updateCalls);
      const errors = results
        .map((result) => result.error?.message)
        .filter((message): message is string => Boolean(message));
      if (errors.length > 0) {
        throw new Error(errors.join(" | "));
      }
    } finally {
      setReorderingNeeds(false);
    }
  };

  const handleUpdateNeedText = async (
    needId: string,
    values: { desired_outcome: string },
  ) => {
    if (!activeCompanyId) throw new Error("Select a company before editing needs.");
    const id = String(needId || "").trim();
    if (!id) throw new Error("Missing need id.");
    const desiredOutcome = String(values.desired_outcome || "").trim();
    if (!desiredOutcome) throw new Error("Need text cannot be empty.");

    setUpdatingNeedId(id);
    try {
      const { error: updateError } = await supabase
        .from("odi_needs")
        .update({ desired_outcome: desiredOutcome })
        .eq("company_id", activeCompanyId)
        .eq("id", id);
      if (updateError) {
        throw new Error(updateError.message || "Failed to update need.");
      }
    } finally {
      setUpdatingNeedId(null);
    }
  };

  const handleRemoveJourneyMap = async (key: string) => {
    if (!activeCompany?.id) {
      toast.error("Select a company before removing a job map.");
      return;
    }

    const confirmed = window.confirm(
      `Remove the ${titleCaseJourney(key)} job map from this company? This deletes its current step map.`,
    );
    if (!confirmed) return;

    try {
      await removeJourneyMap(key);
      if (activeCompanyId) {
        setRecentlyRemovedKeysByCompany((previous) => {
          const current = previous[activeCompanyId] ?? [];
          return {
            ...previous,
            [activeCompanyId]: current.includes(key) ? current : [...current, key],
          };
        });
      }
      toast.success(
        key === "customer"
          ? "Customer job map and related opportunities, ODI needs, outcomes, and routes removed."
          : `${titleCaseJourney(key)} job map and related opportunities/ODI needs removed.`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove job map.");
    }
  };

  const refreshOdi = () => setOdiRefreshKey((current) => current + 1);

  const runResearchFromUploadedEvidence = async () => {
    if (!activeCompany?.id) {
      throw new Error("Select a company before regenerating research artifacts.");
    }

    const formatLockTime = (value?: string | null) => {
      if (!value) return "soon";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    };

    const { data: existingLock } = await supabase
      .from("company_run_locks")
      .select("operation,started_at,expires_at")
      .eq("company_id", activeCompany.id)
      .maybeSingle();
    if (existingLock?.operation === "research") {
      throw new Error(
        `Artifact regeneration is already running (started ${formatLockTime(existingLock.started_at)}; lock expires ${formatLockTime(existingLock.expires_at)}).`,
      );
    }

    let invokeRes:
      | { error: unknown; data: unknown }
      | null = null;

    try {
      invokeRes = await invokeFunctionWithTimeout(
        () =>
          supabase.functions.invoke("research-company", {
            body: {
              company_id: activeCompany.id,
              company_name: activeCompany.name,
              website: activeCompany.website ?? "",
              review_mode: "advisory",
              allow_review_block_save: true,
              context_mode: "uploaded_only",
            },
          }),
        95_000,
      );
    } catch (error) {
      if (error instanceof InvokeTimeoutError) {
        const { data: lockAfterTimeout } = await supabase
          .from("company_run_locks")
          .select("operation,started_at,expires_at")
          .eq("company_id", activeCompany.id)
          .maybeSingle();
        if (lockAfterTimeout?.operation === "research") {
          throw new Error(
            `Artifact regeneration is still running (started ${formatLockTime(lockAfterTimeout.started_at)}; lock expires ${formatLockTime(lockAfterTimeout.expires_at)}).`,
          );
        }
      }
      throw error;
    }

    const researchErr = invokeRes?.error;
    const researchData = invokeRes?.data;

    const researchPayload =
      researchData && typeof researchData === "object"
        ? (researchData as { error?: unknown; message?: unknown })
        : null;
    if (researchErr) {
      throw new Error(await describeJobMapInvokeError(researchErr));
    }
    if (researchPayload?.error) {
      throw new Error(String(researchPayload.message || researchPayload.error));
    }
  };

  const handleRemoveNeed = async (needId: string) => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing a need.");
      return;
    }
    setRemovingNeedId(needId);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .eq("id", needId);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove need.");
      refreshOdi();
      toast.success("Need removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove need.");
    } finally {
      setRemovingNeedId(null);
    }
  };

  const handleRemovePublicNeeds = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public needs.");
      return;
    }
    const publicNeedIds = needs.filter((item) => isPublicSourcePath(item.source_path)).map((item) => item.id);
    if (publicNeedIds.length === 0) {
      toast.message("No public-source needs to remove.");
      return;
    }
    setRemovingPublicNeeds(true);
    try {
      const { error: deleteErr } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("id", publicNeedIds);
      if (deleteErr) throw new Error(deleteErr.message || "Failed to remove public needs.");
      refreshOdi();
      toast.success(`Removed ${publicNeedIds.length} public ODI need${publicNeedIds.length === 1 ? "" : "s"}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove public needs.");
    } finally {
      setRemovingPublicNeeds(false);
    }
  };

  const removePublicMarketContextRecord = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before removing public market context.");
      return false;
    }
    if (!marketDefinition?.id || !isPublicSourcePath(marketDefinition.source_path)) {
      toast.message("No public-source market context row to remove.");
      return false;
    }
    const { error: deleteErr } = await supabase
      .from("odi_market_definitions")
      .delete()
      .eq("company_id", activeCompanyId)
      .eq("id", marketDefinition.id);
    if (deleteErr) {
      throw new Error(deleteErr.message || "Failed to remove market context.");
    }
    refreshOdi();
    return true;
  };

  const handleRemovePublicMarketContext = async () => {
    setRemovingPublicMarketContextAction("remove");
    try {
      const removed = await removePublicMarketContextRecord();
      if (!removed) return;
      toast.success("Public market context removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove market context.");
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleRemovePublicMarketContextAndRerun = async () => {
    setRemovingPublicMarketContextAction("remove_and_rerun");
    let removed = false;
    try {
      removed = await removePublicMarketContextRecord();
      if (!removed) return;

      if (uploadedFileCount <= 0) {
        toast.success("Public market context removed.");
        toast.message("No uploaded files found, so rerun was skipped.");
        return;
      }

      await runLocalAlignment.mutateAsync({
        areas: ["positioning", "strategy", "market", "odi"],
        trigger: "public_market_context_removed",
        applyScoreUpdate: true,
        ignorePublicBaseline: true,
      });
      await runResearchFromUploadedEvidence();
      await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
      refreshOdi();
      toast.success("Public market context removed. Re-ran local comparison and regenerated artifacts from uploaded files.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rerun failed.";
      if (removed) {
        if (/still running|already running/i.test(message)) {
          toast.message(`Public market context was removed. ${message}`);
        } else {
          toast.error(`Public market context was removed, but rerun failed: ${message}`);
        }
      } else {
        toast.error(message);
      }
    } finally {
      setRemovingPublicMarketContextAction(null);
    }
  };

  const handleResetPublicResearchArtifacts = async () => {
    if (!activeCompanyId) {
      toast.error("Select a company before resetting public research artifacts.");
      return;
    }

    const confirmed = window.confirm(
      "Reset false public research artifacts for this company?\n\nThis removes generated job steps, opportunities, routes, strategy/positioning drafts, and public research snapshots.\nUploaded files stay in place.",
    );
    if (!confirmed) return;

    setResettingPublicResearchArtifacts(true);
    try {
      const errors: string[] = [];
      const captureError = (table: string, error: { message?: string } | null) => {
        if (!error) return;
        if (isMissingTableError(error.message || "", table)) return;
        errors.push(`${table}: ${error.message || "unknown error"}`);
      };

      const runDelete = async (table: string) => {
        const { error } = await supabase.from(table as never).delete().eq("company_id", activeCompanyId);
        captureError(table, error);
      };

      await runDelete("job_steps");
      await runDelete("opportunities");
      await runDelete("routes");
      await runDelete("strategy_cascades");
      await runDelete("positioning_canvases");

      const { error: needsError } = await supabase
        .from("odi_needs")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_needs", needsError);

      const { error: marketDefError } = await supabase
        .from("odi_market_definitions")
        .delete()
        .eq("company_id", activeCompanyId)
        .or("source_path.ilike.%public%");
      captureError("odi_market_definitions", marketDefError);

      const spClient = supabase as unknown as {
        from: (table: string) => {
          delete: () => {
            eq: (
              column: string,
              value: string,
            ) => {
              in: (
                column: string,
                values: string[],
              ) => Promise<{ error: { message?: string } | null }>;
            };
          };
        };
      };
      const { error: strategicProblemsError } = await spClient
        .from("strategy_problem_statements")
        .delete()
        .eq("company_id", activeCompanyId)
        .in("source", ["public", "evidence"]);
      captureError("strategy_problem_statements", strategicProblemsError);

      const { error: reviewRunsError } = await supabase
        .from("research_review_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_review_runs", reviewRunsError);

      const { error: artifactRunsError } = await supabase
        .from("research_artifact_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("research_artifact_runs", artifactRunsError);

      const { error: baselineRunsError } = await supabase
        .from("public_baseline_runs")
        .delete()
        .eq("company_id", activeCompanyId);
      captureError("public_baseline_runs", baselineRunsError);

      const { error: companyUpdateError } = await supabase
        .from("companies")
        .update({
          mojo_score: 0,
          potential_score: 0,
          projected_score: 0,
          evidence_status: "no_public_evidence",
          evidence_note:
            "Public research artifacts were reset because public evidence was inaccurate or too weak. Continue from uploaded company files.",
        })
        .eq("id", activeCompanyId);
      captureError("companies", companyUpdateError);

      if (errors.length > 0) {
        throw new Error(`Reset completed with issues: ${errors.join(" | ")}`);
      }

      await Promise.all([
        refetchJobSteps(),
        refetchBaseline(),
        inputsQuery.refetch(),
      ]);
      refreshOdi();

      if (uploadedFileCount > 0) {
        try {
          await runLocalAlignment.mutateAsync({
            areas: ["positioning", "strategy", "market", "odi"],
            trigger: "public_artifacts_reset",
            applyScoreUpdate: true,
            ignorePublicBaseline: true,
          });
          await runResearchFromUploadedEvidence();
          await Promise.all([refetchJobSteps(), refetchBaseline(), inputsQuery.refetch()]);
          refreshOdi();
          toast.success("False public artifacts removed. Regenerated map, ODI, market context, and strategy from uploaded evidence.");
        } catch (rerunError) {
          const rerunMessage = rerunError instanceof Error ? rerunError.message : "unknown error";
          if (/still running|already running/i.test(rerunMessage)) {
            toast.message(`False public artifacts removed. ${rerunMessage}`);
            return;
          }
          toast.error(
            `False public artifacts removed, but rerun failed: ${
              rerunMessage
            }`,
          );
        }
      } else {
        toast.success("False public artifacts removed. Upload files to rebuild local evidence.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset public research artifacts.");
    } finally {
      setResettingPublicResearchArtifacts(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: c.bg,
        backgroundImage:
          'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23000\' fill-opacity=\'0.025\'%3E%3Cpath d=\'M5 0h1L0 5V4zM6 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
      }}
    >
      <TopNav />

      <main className="max-w-[1440px] mx-auto px-4 pb-12 pt-6 sm:px-6 md:px-8">
        <div className="mb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
                {activeCompany?.name || "No company selected"}
              </div>
              <h1 className="mt-1 font-sans text-[28px] font-semibold" style={{ color: c.charcoal }}>
                Job Steps Map
              </h1>
              <p className="mojo-under-title font-sans text-[14px] mojo-desc" style={{ color: c.secondary }}>
                Select and define ODI-style job maps first, then run research to generate steps and aligned opportunities.
              </p>
            </div>

            <Link
              to="/"
              className="rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em]"
              style={{ borderColor: c.line, color: c.secondary, background: c.card }}
            >
              Back to Map
            </Link>
          </div>
          <PageContextStatus className="mt-4" lastScoredAt={activeCompany?.last_scored_at} sourceSignals={sourceSignals} />
        </div>

        <AiBoundaryNote
          label="Public Research"
          tone="public"
          className="mb-6 max-w-[780px]"
          detail="Map suggestions are inferred from public baseline signals. No job map is generated until you explicitly choose or define it."
        />

        {!activeCompany?.id ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
              Select a company to view its job-step journey map.
            </p>
          </div>
        ) : loading ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-mono text-[12px] uppercase tracking-[0.08em]" style={{ color: c.muted }}>
              Loading job steps…
            </p>
          </div>
        ) : error ? (
          <div
            className="rounded-[24px] border px-6 py-12 text-center"
            style={{ borderColor: c.line, background: c.panel }}
          >
            <p className="font-sans text-[15px]" style={{ color: c.gap }}>
              Failed to load job steps: {error}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <OdiContextSection
              companyName={activeCompany?.name}
              marketDefinition={marketDefinition}
              odiError={odiError}
              needs={needs}
              marketContext={strategyCascade?.where_to_play}
              activeCustomerJourneyTitle={activeCustomerJourneyTitle}
              activeCustomerJourneySubtitle={activeCustomerJourneySubtitle}
              onRemovePublicMarketContext={handleRemovePublicMarketContext}
              onRemovePublicMarketContextAndRerun={handleRemovePublicMarketContextAndRerun}
              removingPublicMarketContextAction={removingPublicMarketContextAction}
              hasUploadedFiles={uploadedFileCount > 0}
              onResetPublicResearchArtifacts={handleResetPublicResearchArtifacts}
              resettingPublicResearchArtifacts={resettingPublicResearchArtifacts}
            />

            <AreaAlignmentPanel
              title="Market Context"
              area={marketAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <AreaAlignmentPanel
              title="ODI Needs"
              area={odiAlignment}
              run={localAlignment}
              lineColor={c.line}
              panelColor={c.panel}
              textColor={c.charcoal}
              mutedColor={c.muted}
            />

            <section
              className="rounded-[24px] border px-6 py-5"
              style={{ borderColor: c.line, background: c.panel }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-sans text-[18px] font-semibold" style={{ color: c.charcoal }}>
                    Job Map Selection
                  </p>
                  <p className="mt-1 font-sans text-[13px]" style={{ color: c.secondary }}>
                    Selected maps are shown first. Choose suggested maps or add a custom one as needed.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChooseMaps((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showChooseMaps ? "Hide Choose Job Maps" : "Show Choose Job Maps"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCustomMapForm((current) => !current)}
                    className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em]"
                    style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                  >
                    {showCustomMapForm ? "Hide Add Custom" : "Show Add Custom"}
                  </button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border px-4 py-3" style={{ borderColor: c.line, background: c.paper }}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                  Selected Job Maps
                </p>
                {journeys.length === 0 ? (
                  <p className="mt-2 font-sans text-[13px]" style={{ color: c.secondary }}>
                    No job map selected yet.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {journeys.map((journey) => (
                      <span
                        key={`selected-${journey.key}`}
                        className="rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]"
                        style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      >
                        {journey.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {showChooseMaps ? (
                <div className="mt-4">
                  <SuggestedMapsSection
                    options={suggestedJourneyOptions}
                    drafts={journeyDrafts}
                    onDraftChange={updateJourneyDraft}
                    onAddMap={addMap}
                    runningKey={runningJourneyKey}
                  />
                </div>
              ) : null}

              {showCustomMapForm ? (
                <div className="mt-4 rounded-xl border p-4" style={{ borderColor: c.line, background: c.paper }}>
                  <p className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: c.muted }}>
                    Add Custom Job Map
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <input
                      value={customMapDraft.key}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, key: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map key (optional, e.g. cafe-owner)"
                    />
                    <input
                      value={customMapDraft.title}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, title: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.charcoal, background: "#fff" }}
                      placeholder="Map title (e.g. Job Map: Cafe Owner Buying)"
                    />
                    <input
                      value={customMapDraft.subtitle}
                      onChange={(event) => setCustomMapDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                      className="w-full rounded-lg border px-2.5 py-2 font-sans text-[12px] outline-none"
                      style={{ borderColor: c.line, color: c.secondary, background: "#fff" }}
                      placeholder="Subtitle"
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={addCustomMap}
                      disabled={runningJourneyKey !== null}
                      className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] disabled:opacity-50"
                      style={{ borderColor: c.line, color: c.secondary, background: c.card }}
                    >
                      {runningJourneyKey ? "Adding…" : "Add Custom Map"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            {journeys.length === 0 ? (
              <div
                className="rounded-[24px] border px-6 py-12 text-center"
                style={{ borderColor: c.line, background: c.panel }}
              >
                <p className="font-sans text-[15px]" style={{ color: c.secondary }}>
                  No job map exists yet. Choose or define at least one map above, then run research.
                </p>
              </div>
            ) : (
              <>
                {journeys.map((journey) => (
                  <JourneySection
                    key={journey.key}
                    journey={journey}
                    onRemove={handleRemoveJourneyMap}
                    removing={removingJourneyKey === journey.key}
                    onUpdateStepText={handleUpdateStepText}
                    updatingStepId={updatingStepId}
                  />
                ))}

                <div
                  className="rounded-[24px] border px-6 py-5"
                  style={{ borderColor: c.line, background: c.panel }}
                >
                  <p className="font-sans text-[14px] leading-[1.6]" style={{ color: c.secondary }}>
                    <strong style={{ color: c.charcoal }}>{totalGaps} steps have active gaps</strong> across the current map{journeys.length === 1 ? "" : "s"}.
                    {pendingAssessmentTotal > 0
                      ? ` ${pendingAssessmentTotal} step${pendingAssessmentTotal === 1 ? "" : "s"} are pending assessment and need an evidence-backed research run.`
                      : " Use this page to confirm the sequence and then move to Inputs and Opportunities to close the highest-impact issues."}
                  </p>
                </div>
              </>
            )}

            <OdiNeedsListSection
              needs={needs}
              onRemoveNeed={handleRemoveNeed}
              removingNeedId={removingNeedId}
              onRemovePublicNeeds={handleRemovePublicNeeds}
              removingPublicNeeds={removingPublicNeeds}
              onReorderNeeds={handleReorderNeeds}
              reorderingNeeds={reorderingNeeds}
              onUpdateNeedText={handleUpdateNeedText}
              updatingNeedId={updatingNeedId}
            />
          </div>
        )}
      </main>
    </div>
  );
}
