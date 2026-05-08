import {
  safeText,
  normalizeAudienceSignal,
  normalizeClause,
  normalizeFrameOfReference,
  normalizeRoleLabel,
  concisePhrase,
  parseJtbdParts,
} from "./textUtils";
import {
  isInvalidAudienceLabel,
  isGenericJtbdStatement,
  isGenericJourneySubtitle,
  isTraditionalMarketDefinition,
  isGenericRoleLabel,
  isOrganizationSegmentLabel,
} from "./validation";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { PositioningCanvas } from "@/lib/types";

export function rankedNeedsByOpportunity(needs: OdiNeedRow[]) {
  return needs.slice().sort((a, b) => {
    const scoreDiff = (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    const sortDiff = (a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER);
    if (sortDiff !== 0) return sortDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function audienceFromJourneyTitle(title: string | null | undefined) {
  const raw = safeText(title, "");
  if (!raw) return "";
  const withoutMapPrefix = raw.replace(/^job\s*map\s*:\s*/i, "").trim();
  const withoutCustomerPrefix = withoutMapPrefix.replace(/^customer\s+/i, "").trim();
  const withoutJourneySuffix = withoutCustomerPrefix.replace(/\s+journey$/i, "").trim();
  const candidate = normalizeAudienceSignal(withoutJourneySuffix || withoutCustomerPrefix || withoutMapPrefix || raw);
  return isInvalidAudienceLabel(candidate) ? "" : candidate;
}

export function jtbdFromJourneyTitle(title: string | null | undefined) {
  const audience = audienceFromJourneyTitle(title);
  if (!audience) return "";
  const lower = audience.toLowerCase();

  if (/(cafe|coffee|specialty venue|venue buyer)/.test(lower)) {
    return "When choosing and managing a coffee partner, cafe owners and specialty venue buyers want to secure consistent quality, reliable supply, and responsive support, so they can deliver a strong guest experience and protect margins.";
  }
  if (/(debt|collection|debtor|repayment|arrears|delinquen|past due)/.test(lower)) {
    return "When resolving outstanding debt, consumers want to understand options, choose a workable repayment path, and complete payments with confidence, so they can regain financial control with minimal stress.";
  }
  if (/(financial investment|investor|capital|funding|raise)/.test(lower)) {
    return `When seeking growth capital, ${lower} want to identify, evaluate, and win the right funding partner, so they can execute their strategy on workable terms.`;
  }
  if (/(donor|grant|philanthrop)/.test(lower)) {
    return `When securing mission funding, ${lower} want to win and retain aligned donors and grant partners, so they can sustain impact without constant funding risk.`;
  }

  return `When trying to complete this job, ${lower} want to move from defining outcomes to executing and monitoring progress, so they can achieve the intended result with less risk and rework.`;
}

export function chooserFromJourneyTitle(title: string | null | undefined) {
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

export function marketContextFromJourney(args: {
  title?: string | null;
  subtitle?: string | null;
  fallback?: string | null;
}) {
  const title = audienceFromJourneyTitle(args.title);
  const subtitleRaw = safeText(args.subtitle, "");
  const subtitle = isGenericJourneySubtitle(subtitleRaw) ? "" : subtitleRaw;
  const fallback = safeText(args.fallback, "");

  if (fallback) return fallback;
  if (title && subtitle) return `${title}: ${subtitle}`;
  if (subtitle) return subtitle;
  if (title) return title;
  return "";
}

export function inferRolesFromSignals(args: {
  bestFitCustomers?: string | null;
  valueForCustomer?: string | null;
  marketContext?: string | null;
  needs: OdiNeedRow[];
}) {
  const topNeed = rankedNeedsByOpportunity(args.needs)[0];
  const signal = [
    safeText(args.bestFitCustomers, ""),
    safeText(args.valueForCustomer, ""),
    safeText(args.marketContext, ""),
    safeText(topNeed?.desired_outcome, ""),
    safeText(topNeed?.step_label, ""),
  ]
    .join(" ")
    .toLowerCase();

  if (/\b(strategy|strategic decision|decision framework|consulting|advisory)\b/.test(signal)) {
    return { executor: "Strategy lead", chooser: "Executive sponsor" };
  }
  if (/\bdebt|collection|repayment|delinquen|arrears\b/.test(signal)) {
    return { executor: "Repayment customer", chooser: "Collections manager" };
  }
  if (/\bcafe|coffee|restaurant|foodservice|venue\b/.test(signal)) {
    return { executor: "Operations lead", chooser: "Owner or general manager" };
  }
  if (/\binvestor|investment|capital|funding|raise\b/.test(signal)) {
    return { executor: "Finance lead", chooser: "CEO or founder" };
  }
  if (/\bdonor|grant|philanthrop|fundraising\b/.test(signal)) {
    return { executor: "Development lead", chooser: "Executive director" };
  }
  return { executor: "", chooser: "" };
}

export function inferRoleFromBestFitCustomers(bestFitCustomers: string | null | undefined, options: { chooser: boolean }) {
  const text = safeText(bestFitCustomers, "");
  if (!text) return "";

  const candidates = text
    .split(/[,;/]|\band\b/gi)
    .map((part) => safeText(part, ""))
    .filter(Boolean)
    .slice(0, 8);

  if (options.chooser) {
    const chooserHit = candidates.find((part) =>
      /\b(owner|founder|director|head|vp|chief|officer|manager|lead|buyer|procurement|executive|partner)\b/i.test(part),
    );
    if (chooserHit) return chooserHit;
    const first = candidates[0] || "";
    return isOrganizationSegmentLabel(first) ? "" : first;
  }

  const executorHit = candidates.find((part) =>
    /\b(operator|coordinator|specialist|analyst|team|staff|rep|agent|manager|lead|practitioner|admin)\b/i.test(part),
  );
  if (executorHit) return executorHit;
  const first = candidates[0] || "";
  return isOrganizationSegmentLabel(first) ? "" : first;
}

export function firstSpecificRole(...candidates: Array<string | null | undefined>) {
  const cleaned = candidates.map((value) => safeText(value, "")).filter(Boolean);
  for (const candidate of cleaned) {
    if (
      !isGenericRoleLabel(candidate) &&
      !isInvalidAudienceLabel(candidate) &&
      !isOrganizationSegmentLabel(candidate)
    ) {
      return candidate;
    }
  }
  return "";
}

export function deriveBestGuessJtbd(args: {
  storedJtbd?: string | null;
  derivedJtbd?: string | null;
  executor?: string | null;
  needs: OdiNeedRow[];
  valueForCustomer?: string | null;
}) {
  const stored = safeText(args.storedJtbd, "");
  if (
    stored &&
    !isGenericJtbdStatement(stored) &&
    stored.length <= 200 &&
    /when\b.+\b(want|need)s?\b.+\bso\b.+\bcan\b/i.test(stored)
  ) {
    return stored.replace(/\s+/g, " ").trim();
  }

  const derived = safeText(args.derivedJtbd, "");
  if (
    derived &&
    !isGenericJtbdStatement(derived) &&
    derived.length <= 200 &&
    /when\b.+\b(want|need)s?\b.+\bso\b.+\bcan\b/i.test(derived)
  ) {
    return derived.replace(/\s+/g, " ").trim();
  }

  const rankedNeeds = rankedNeedsByOpportunity(args.needs);
  const topNeed = rankedNeeds[0];
  const topNeedOutcome = normalizeClause(topNeed?.desired_outcome);
  const topNeedStep = normalizeClause(topNeed?.step_label);
  const valueForCustomer = normalizeClause(args.valueForCustomer);
  const executor = safeText(args.executor, "the customer").toLowerCase();

  const situation = concisePhrase(valueForCustomer || topNeedOutcome || topNeedStep || "make progress on the core job", {
    maxWords: 7,
    stripIntro: true,
    fallback: "make progress on the core job",
  });
  const motivation = concisePhrase(topNeedOutcome || valueForCustomer || "achieve the desired outcome with less effort", {
    maxWords: 9,
    stripIntro: true,
    fallback: "achieve the desired outcome with less effort",
  });
  const outcome =
    concisePhrase(valueForCustomer && valueForCustomer !== motivation ? valueForCustomer : "", {
      maxWords: 9,
      stripIntro: true,
      fallback: "",
    }) ||
    "get reliable results with less risk";

  return `When ${executor} needs to ${situation}, they want to ${motivation}, so they can ${outcome}.`;
}

export function deriveOdiDunfordMarketContext(args: {
  marketContext?: string | null;
  jobExecutor?: string | null;
  chooser?: string | null;
  jtbd?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}) {
  const marketContext = safeText(args.marketContext, "");
  const frameOfReference = safeText(args.positioningCanvas?.market_category, "");
  const bestFitCustomers = safeText(args.positioningCanvas?.best_fit_customers, "");
  const valueForCustomer = safeText(args.positioningCanvas?.value_for_customer, "");
  const topNeedOutcome = normalizeClause(rankedNeedsByOpportunity(args.needs)[0]?.desired_outcome);
  const jtbd = safeText(args.jtbd, "");
  const executor = safeText(args.jobExecutor, "primary job performer");
  const chooser = safeText(args.chooser, "buying or decision lead");
  const inferredRoles = inferRolesFromSignals({
    bestFitCustomers,
    valueForCustomer,
    marketContext,
    needs: args.needs,
  });

  const parsedJtbd = parseJtbdParts(jtbd);
  const frame = normalizeFrameOfReference(
    frameOfReference
      || (isTraditionalMarketDefinition(marketContext) ? marketContext : "")
      || marketContext,
  );
  const specificCustomerRole = firstSpecificRole(
    bestFitCustomers,
    inferredRoles.executor,
    parsedJtbd?.executor,
    chooser,
    executor,
  );
  const customers = safeText(
    specificCustomerRole,
    concisePhrase(bestFitCustomers, {
      maxWords: 6,
      stripIntro: true,
      fallback: safeText(inferredRoles.executor, safeText(executor, "target customers")),
    }),
  );
  const value = valueForCustomer || topNeedOutcome || "reliable progress on the core job";
  const coreJob = parsedJtbd?.situation || concisePhrase(valueForCustomer || topNeedOutcome || "", {
    maxWords: 7,
    stripIntro: true,
    fallback: "make progress on the core job",
  });
  const outcome = parsedJtbd?.outcome || concisePhrase(value, {
    maxWords: 8,
    stripIntro: true,
    fallback: "reliable strategic outcomes",
  });

  if (!frame && !jtbd && !valueForCustomer && !topNeedOutcome) {
    return marketContext;
  }

  const compactFrame = concisePhrase(frame || "Current market category", { maxWords: 6 });
  const compactCustomers = concisePhrase(customers, { maxWords: 6 });
  const compactJob = concisePhrase(coreJob, { maxWords: 7, stripIntro: true, fallback: "core job progress" });
  const compactOutcome = concisePhrase(outcome, { maxWords: 8, stripIntro: true, fallback: "reliable strategic outcomes" });
  return `${compactFrame}: ${compactCustomers} trying to ${compactJob}, so they can ${compactOutcome}.`;
}

export function deriveAbstractedExecutor(executor: string) {
  const normalized = safeText(executor, "Primary job performer");
  const lower = normalized.toLowerCase();
  if (/(director|manager|lead|officer|head|vp|chief|owner|founder|coordinator|specialist)/.test(lower)) {
    return "Decision owner";
  }
  if (/(customer|client|buyer|user|member|consumer|participant)/.test(lower)) {
    return "Primary job performer";
  }
  if (/(team|department|organization|organisation|company|staff)/.test(lower)) {
    return "Operating team";
  }
  return "Primary job performer";
}

export function deriveFunctionOfProductStatement(jtbd: string, executor: string) {
  const trimmed = safeText(jtbd, "");
  if (!trimmed) {
    return `Help ${safeText(executor, "the job performer").toLowerCase()} make progress with less risk and rework.`;
  }
  const wantMatch = trimmed.match(/\bwant to\b(.*?)(?:,\s*so they can| so they can|$)/i);
  if (wantMatch?.[1]) {
    const clause = wantMatch[1].replace(/^[\s,:-]+|[\s,:-]+$/g, "");
    if (clause) {
      return `Help ${safeText(executor, "the job performer").toLowerCase()} ${clause}.`;
    }
  }
  return trimmed;
}

export function deriveAbstractedJobStatement(jtbd: string, abstractedExecutor: string) {
  const trimmed = safeText(jtbd, "");
  if (!trimmed) {
    return `${abstractedExecutor} can complete the core job reliably with clear evidence of progress.`;
  }
  const soMatch = trimmed.match(/\bso they can\b(.*?)(?:\.|$)/i);
  if (soMatch?.[1]) {
    const outcomeClause = soMatch[1].replace(/^[\s,:-]+|[\s,:-]+$/g, "");
    if (outcomeClause) {
      return `${abstractedExecutor} can ${outcomeClause}.`;
    }
  }
  return trimmed;
}

export function deriveOtherProductsContext(marketContext: string, needs: OdiNeedRow[]) {
  const context = safeText(marketContext, "");
  if (context) {
    return `Compared against current alternatives in this market context: ${context}`;
  }
  const topNeed = needs
    .slice()
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))[0];
  if (topNeed?.step_label) {
    return `Compared against existing ways teams currently handle "${topNeed.step_label}".`;
  }
  return "Compared against existing alternatives customers use to complete the same job.";
}

export type OtherProductsContextGroup = {
  alternative: string;
  context: string;
  comparisonPressure: string;
};

export function deriveOtherProductsContextGroups(args: {
  marketContext?: string | null;
  needs: OdiNeedRow[];
  positioningCanvas?: PositioningCanvas | null;
}): OtherProductsContextGroup[] {
  const context = safeText(args.marketContext, "");
  const topNeed = rankedNeedsByOpportunity(args.needs)[0];
  const pressure =
    normalizeClause(topNeed?.desired_outcome) ||
    "reliable progress on the core job with less risk and rework";

  const alternatives = (args.positioningCanvas?.competitive_alternatives ?? [])
    .map((entry) => ({
      name: safeText(entry.name, ""),
      description: safeText(entry.description, ""),
    }))
    .filter((entry) => Boolean(entry.name));

  if (alternatives.length > 0) {
    return alternatives.map((entry) => ({
      alternative: entry.name,
      context: entry.description || "No detailed context captured yet for this alternative.",
      comparisonPressure: pressure,
    }));
  }

  if (context) {
    return [
      {
        alternative: "Current market alternatives",
        context,
        comparisonPressure: pressure,
      },
    ];
  }

  if (topNeed?.step_label) {
    return [
      {
        alternative: "Current workaround options",
        context: `Teams currently patch together ways to handle "${topNeed.step_label}".`,
        comparisonPressure: pressure,
      },
    ];
  }

  return [
    {
      alternative: "Existing alternatives",
      context: "Customers use current alternatives to complete the same job.",
      comparisonPressure: pressure,
    },
  ];
}

export function deriveExecutorDetermination(args: {
  activeCustomerJourneyTitle?: string | null;
  marketDefinitionExecutor?: string | null;
  marketDefinitionChooser?: string | null;
}) {
  const titleExecutor = audienceFromJourneyTitle(args.activeCustomerJourneyTitle);
  const storedExecutor = safeText(args.marketDefinitionExecutor, "");
  const chooser = safeText(args.marketDefinitionChooser, "");

  const notes: string[] = [];
  if (titleExecutor) notes.push(`Customer map title suggests "${titleExecutor}".`);
  if (storedExecutor) notes.push(`Strategic Decision System market row currently stores "${storedExecutor}".`);
  if (chooser) notes.push(`Chooser context: "${chooser}".`);
  return notes.join(" ");
}
