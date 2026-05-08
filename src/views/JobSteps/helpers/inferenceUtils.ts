import { safeText, normalizeAudienceSignal, normalizeRoleLabel } from "./textUtils";
import { isInvalidAudienceLabel } from "./validation";
import type { JourneyGroup } from "./journeyUtils";
import { bestFitStrategicMarketCategory, buildMarketFitMapOption } from "@/lib/marketTaxonomy";
import type { InputItem } from "@/lib/types";

type JourneyKey = string;

export type SuggestedJourneyOption = {
  key: JourneyKey;
  title: string;
  subtitle: string;
  confidence: number;
  rationale: string;
};

export function inferRevenueMapTitle(economicEngine: string, publicSignalText: string, allowNonprofitFunding: boolean) {
  const text = `${economicEngine} ${publicSignalText}`.toLowerCase();
  if (/(investment|investor|capital|funding|raise)/.test(text)) {
    return "Checkpoint Map: Getting Financial Investment";
  }
  if (allowNonprofitFunding && /(donor|grant|philanthrop|fundraising)/.test(text)) {
    return "Checkpoint Map: Securing Donor and Grant Support";
  }
  if (/(referral|pipeline|conversion|enrollment)/.test(text)) {
    return "Checkpoint Map: Converting Qualified Demand";
  }
  return "Checkpoint Map: Securing Revenue Outcomes";
}

export function inferSuggestedJourneyOptions(args: {
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
    const customerSignal = normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal)
      ? normalizeRoleLabel(normalizedCustomerSignal)
      : "Primary Job Performer";
    addOption({
      key: "customer",
      title: `Checkpoint Map: ${customerSignal}`,
      subtitle: `How ${customerSignal.toLowerCase()} define, locate, prepare, execute, monitor, and conclude progress.`,
      confidence: normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal) ? 95 : 80,
      rationale: normalizedCustomerSignal && !isInvalidAudienceLabel(normalizedCustomerSignal)
        ? `Public signal identifies primary job performer context: ${normalizedCustomerSignal}`
        : "Customer checkpoint map is required first and should define the core functional job performer.",
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
        title: "Checkpoint Map: Delivering Consistent Service",
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
    .filter((value) => Boolean(value) && !isInvalidAudienceLabel(value))
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
      title: `Checkpoint Map: ${candidate}`,
      subtitle: `How ${candidate.toLowerCase()} define, evaluate, select, execute, and monitor progress.`,
      confidence: candidateEvidence.length > 0 ? 90 : 78,
      rationale,
    });
  }

  const bestFitCategory = bestFitStrategicMarketCategory([
    publicSignalText,
    marketSignalText,
    nonprofitSignalText,
    String(args.whereToPlay || ""),
    String(args.howToWin || ""),
  ].join(" "));
  const marketFitOption = buildMarketFitMapOption(bestFitCategory.label);
  addOption({
    key: marketFitOption.key,
    title: marketFitOption.title,
    subtitle: marketFitOption.subtitle,
    confidence: 86,
    rationale: `Best-fit market category: ${marketFitOption.categoryLabel}. Adds a market-specific checkpoint spine option.`,
  });

  return options.sort((a, b) => b.confidence - a.confidence);
}
