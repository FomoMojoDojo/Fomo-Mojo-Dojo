type FocusLevel = "initiative" | "related" | "other";

export type InitiativeContext = {
  primaryJourneyKey: string;
  primaryJourneyTitle: string;
  keywords: string[];
  source: "stored" | "derived" | "fallback";
};

export type FocusClassification = {
  level: FocusLevel;
  overlap: number;
};

export function alignmentLevelFromFocus(
  focus?: FocusClassification | null,
): 0 | 1 | 2 | 3 | 4 {
  if (!focus || focus.level === "other") return 0;
  if (focus.level === "initiative") {
    if (focus.overlap >= 4) return 4;
    return 3;
  }
  if (focus.overlap >= 2) return 2;
  return 1;
}

type JobStepLike = {
  journey_key?: string | null;
  journey_title?: string | null;
  journey_subtitle?: string | null;
};

type StrategicProblemLike = {
  statement?: string | null;
  status?: string | null;
};

type OpportunityLike = {
  journey_key?: string | null;
  outcome?: string | null;
  step_label?: string | null;
};

type RouteLike = {
  title?: string | null;
  short_description?: string | null;
};

const STOPWORDS = new Set([
  "about",
  "across",
  "after",
  "also",
  "and",
  "are",
  "before",
  "between",
  "for",
  "from",
  "into",
  "just",
  "more",
  "most",
  "over",
  "same",
  "that",
  "their",
  "there",
  "these",
  "this",
  "those",
  "through",
  "with",
  "within",
  "without",
]);

function normalizeJourneyKey(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function isCustomerJourneyKey(value: string | null | undefined) {
  const key = normalizeJourneyKey(value);
  return key === "customer" || key.startsWith("customer-");
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function expandInitiativeKeywords(base: string[]) {
  const expanded = new Set(base.map((item) => item.toLowerCase()));
  const joined = Array.from(expanded).join(" ");

  if (/(investment|investor|funding|capital|revenue|finance|financial|raise)/.test(joined)) {
    [
      "pricing",
      "contract",
      "contracts",
      "compliance",
      "risk",
      "pipeline",
      "conversion",
      "buyer",
      "procurement",
      "confidence",
      "reporting",
      "performance",
    ].forEach((token) => expanded.add(token));
  }

  if (/(cafe|coffee|restaurant|venue|wholesale)/.test(joined)) {
    [
      "menu",
      "quality",
      "sourcing",
      "supply",
      "buyer",
      "partner",
      "distribution",
      "retention",
      "onboarding",
    ].forEach((token) => expanded.add(token));
  }

  if (/(health|mental|care|clinical|patient|family|youth)/.test(joined)) {
    [
      "intake",
      "referral",
      "access",
      "outcome",
      "safety",
      "continuity",
      "capacity",
      "caregiver",
      "support",
    ].forEach((token) => expanded.add(token));
  }

  return Array.from(expanded).slice(0, 40);
}

function overlapCount(text: string, keywords: string[]) {
  if (!keywords.length) return 0;
  const tokenSet = new Set(tokenize(text));
  let overlap = 0;
  for (const keyword of keywords) {
    if (tokenSet.has(keyword)) overlap++;
  }
  return overlap;
}

function titleFromJourneyKey(key: string) {
  if (!key) return "Core Initiative";
  if (key === "customer") return "Customer Journey";
  if (key === "revenue") return "Revenue Journey";
  if (key === "operations") return "Operations Journey";
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeStoredContext(
  areaScoresJson: unknown,
): InitiativeContext | null {
  const raw = (areaScoresJson as { initiative_context?: unknown } | null)
    ?.initiative_context;
  if (!raw || typeof raw !== "object") return null;

  const context = raw as {
    primary_journey_key?: unknown;
    primary_journey_title?: unknown;
    initiative_keywords?: unknown;
  };

  const key = normalizeJourneyKey(String(context.primary_journey_key || ""));
  if (!key) return null;

  const title = String(context.primary_journey_title || "").trim() || titleFromJourneyKey(key);
  const keywords = Array.isArray(context.initiative_keywords)
    ? context.initiative_keywords.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean)
    : tokenize(title);
  const enriched = expandInitiativeKeywords(keywords);

  return {
    primaryJourneyKey: key,
    primaryJourneyTitle: title,
    keywords: enriched,
    source: "stored",
  };
}

export function deriveInitiativeContext(args: {
  areaScoresJson?: unknown;
  jobSteps?: JobStepLike[];
  strategicProblems?: StrategicProblemLike[];
}): InitiativeContext {
  const stored = normalizeStoredContext(args.areaScoresJson);
  if (stored) return stored;

  const steps = Array.isArray(args.jobSteps) ? args.jobSteps : [];
  const grouped = new Map<string, { count: number; title: string; subtitle: string }>();

  for (const step of steps) {
    const key = normalizeJourneyKey(step.journey_key);
    if (!key) continue;

    const existing = grouped.get(key) ?? {
      count: 0,
      title: "",
      subtitle: "",
    };
    existing.count += 1;
    if (!existing.title && String(step.journey_title || "").trim()) {
      existing.title = String(step.journey_title || "").trim();
    }
    if (!existing.subtitle && String(step.journey_subtitle || "").trim()) {
      existing.subtitle = String(step.journey_subtitle || "").trim();
    }
    grouped.set(key, existing);
  }

  if (grouped.size === 0) {
    return {
      primaryJourneyKey: "customer",
      primaryJourneyTitle: "Customer Journey",
      keywords: ["customer", "journey"],
      source: "fallback",
    };
  }

  const ranked = Array.from(grouped.entries())
    .map(([key, value]) => {
      const text = `${value.title} ${value.subtitle}`.toLowerCase();
      const economicSignal = /(revenue|investment|investor|funding|capital|contract|pipeline)/.test(text) ? 2 : 0;
      const customCustomerSignal = key.startsWith("customer-") ? 1 : 0;
      const nonGenericSignal = key !== "customer" ? 2 : 0;
      const score = value.count + economicSignal + customCustomerSignal + nonGenericSignal;
      return { key, value, score };
    })
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0];
  const title = selected.value.title || titleFromJourneyKey(selected.key);
  const strategicProblemText = (Array.isArray(args.strategicProblems) ? args.strategicProblems : [])
    .filter((item) => String(item?.status || "").toLowerCase() !== "inactive")
    .map((item) => String(item?.statement || ""))
    .join(" ");
  const keywords = tokenize(
    `${title} ${selected.value.subtitle} ${selected.key} ${strategicProblemText}`,
  ).slice(0, 24);
  const enriched = expandInitiativeKeywords(
    keywords.length > 0 ? keywords : tokenize(title).slice(0, 12),
  );

  return {
    primaryJourneyKey: selected.key,
    primaryJourneyTitle: title,
    keywords: enriched,
    source: "derived",
  };
}

export function classifyOpportunityFocus(
  item: OpportunityLike,
  context: InitiativeContext,
): FocusClassification {
  const journeyKey = normalizeJourneyKey(item.journey_key);
  const directJourneyMatch =
    journeyKey === context.primaryJourneyKey ||
    (context.primaryJourneyKey === "customer" && isCustomerJourneyKey(journeyKey));
  const text = `${item.outcome || ""} ${item.step_label || ""}`;
  const overlap = overlapCount(text, context.keywords);

  if (directJourneyMatch) {
    if (isCustomerJourneyKey(context.primaryJourneyKey)) {
      if (overlap >= 2) return { level: "initiative", overlap };
      if (overlap >= 1) return { level: "related", overlap };
      return { level: "other", overlap: 0 };
    }
    return { level: overlap >= 3 ? "initiative" : "related", overlap };
  }
  if (overlap >= 3) {
    return { level: "initiative", overlap };
  }
  // Temporary bridge while opportunities are generated on customer journeys only.
  // Do not auto-upgrade everything to related; require at least some lexical overlap.
  if (isCustomerJourneyKey(journeyKey) && !isCustomerJourneyKey(context.primaryJourneyKey)) {
    if (overlap >= 3) return { level: "initiative", overlap };
    if (overlap >= 1) return { level: "related", overlap };
    return { level: "other", overlap: 0 };
  }
  if (overlap >= 1) {
    return { level: "related", overlap };
  }
  return { level: "other", overlap: 0 };
}

export function classifyRouteFocus(args: {
  route: RouteLike;
  context: InitiativeContext;
  linkedOpportunityFocus?: FocusClassification[];
}): FocusClassification {
  const routeText = `${args.route.title || ""} ${args.route.short_description || ""}`;
  const overlap = overlapCount(routeText, args.context.keywords);
  const linked = Array.isArray(args.linkedOpportunityFocus) ? args.linkedOpportunityFocus : [];
  const linkedInitiative = linked.filter((item) => item.level === "initiative").length;
  const linkedRelated = linked.filter((item) => item.level === "related").length;

  if (linkedInitiative >= 2 || overlap >= 3) {
    return { level: "initiative", overlap };
  }
  if (linkedInitiative >= 1 || linkedRelated >= 2 || overlap >= 1) {
    return { level: "related", overlap };
  }
  return { level: "other", overlap: 0 };
}
