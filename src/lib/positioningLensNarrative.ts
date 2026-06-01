/**
 * Positioning lens narrative synthesis.
 *
 * Turns raw positioning canvas + cascade + routes into a structured reasoning
 * output for the PositioningLens in both the direction and route inspect panels.
 *
 * Compression rules (enforced here, not in the UI):
 * - postureHeadline is a single sentence.
 * - tensions are at most 3 items.
 * - wouldStrengthen is at most 3 items.
 * - Narrative blocks are factual, not promotional.
 *
 * No framework jargon. No generic brand language.
 */

import type { PositioningCanvas } from "@/lib/types";
import type { StrategyCascade } from "@/lib/types";
import type { RouteRow } from "@/views/Routes/useRoutes";
import { getCategoryHighlightWords } from "@/lib/positioningStrength";

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * Five mutually exclusive posture states for the positioning system.
 * Derived from route coherence, cascade alignment, and external/customer signal gaps.
 */
export type PositioningPosture =
  | "inherited"    // identity comes from legacy perception, not strategic intent
  | "emerging"     // direction is shifting; coherence not yet established
  | "coherent"     // cascade + positioning + routes point the same way
  | "fragmented"   // routes pull positioning in conflicting directions
  | "contradicted"; // explicit conflict between strategic and market identity

export type CustomerProofStatus = "present" | "partial" | "missing";

/** How a route affects the coherence of the overall positioning. */
export type CoherenceSignal = "reinforces" | "weakens" | "mixed" | "neutral";

export type ContradictionNote = {
  /** Short label for the first side of the conflict. */
  between: string;
  /** Short label for the second side of the conflict. */
  and: string;
  /** Plain-language description — one sentence max. */
  description: string;
};

export type RoutePositioningImplication = {
  routeId: string;
  routeTitle: string;
  category: string;
  /** What positioning claim this route reinforces or opens. */
  claimReinforced: string;
  /** What positioning tension this route navigates, if any. */
  tensionNavigated: string | null;
  coherenceSignal: CoherenceSignal;
  /** Short user-facing label (e.g. "reinforces direction"). */
  displayLabel: string;
};

export type PositioningLensNarrative = {
  posture: PositioningPosture;
  /** One-sentence headline characterising the current positioning state. */
  postureHeadline: string;
  /** What the market currently knows this company as. */
  marketPerception: string | null;
  /** What the strategic direction is moving toward. */
  intendedIdentity: string | null;
  customerProofStatus: CustomerProofStatus;
  /** One-sentence note on customer proof state. */
  customerProofNote: string;
  /** Specific contradictions between identity layers (max 3). */
  tensions: ContradictionNote[];
  /** Routes whose emphasis aligns with the positioning direction (max 4). */
  reinforcingRoutes: RoutePositioningImplication[];
  /** Routes whose emphasis conflicts with positioning coherence (max 3). */
  contradictingRoutes: RoutePositioningImplication[];
  /** Short actions that would materially strengthen positioning (max 3). */
  wouldStrengthen: string[];
};

// ─── Posture headlines ──────────────────────────────────────────────────────────

const POSTURE_HEADLINES: Record<PositioningPosture, string> = {
  inherited:    "Positioning is still inherited from public perception.",
  emerging:     "Strategic direction is shifting faster than market understanding.",
  coherent:     "Positioning is coherent across routes and strategic direction.",
  fragmented:   "Routes are reinforcing conflicting positioning signals.",
  contradicted: "Strategic identity and market positioning are pulling in opposite directions.",
};

// ─── Text utilities (local — mirrors strategicObjectRelationships.ts) ───────────

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "to", "of", "in", "on", "at", "by", "for", "with", "and", "or", "but",
  "not", "this", "that", "it", "its", "our", "we", "they", "their", "you",
  "can", "will", "would", "should", "could", "may", "might",
  "do", "does", "did", "have", "has", "had",
  "how", "what", "when", "where", "which", "who", "why",
  "from", "into", "through", "during", "before", "after", "above", "below",
  "more", "most", "also", "just", "any", "all", "each", "both", "very",
  "so", "than", "then", "now", "as", "up", "out", "if", "about",
]);

function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function tokenCoverage(source: string[], target: string[]): number {
  if (!source.length || !target.length) return 0;
  const targetSet = new Set(target);
  const shared = source.filter((t) => targetSet.has(t)).length;
  return shared / Math.min(source.length, target.length);
}

// ─── Positioning theme clusters (for claim derivation) ─────────────────────────

type PositioningTheme = {
  keywords: string[];
  claim: (category: string) => string;
};

const POSITIONING_THEMES: PositioningTheme[] = [
  {
    keywords: ["trust", "proof", "credibility", "reliable", "reliability", "consistent", "consistent"],
    claim: (cat) =>
      cat === "fix"
        ? "Reinforces an operational reliability position."
        : cat === "create"
        ? "Claims territory in a trust-first market position."
        : "Strengthens the reliability and credibility position.",
  },
  {
    keywords: ["speed", "fast", "faster", "velocity", "latency", "quick", "immediate", "instant"],
    claim: (cat) =>
      cat === "fix"
        ? "Addresses a known execution speed gap."
        : cat === "create"
        ? "Claims new territory in speed-to-value delivery."
        : "Strengthens the speed and execution position.",
  },
  {
    keywords: ["customer", "experience", "satisfaction", "outcome", "success", "relationship"],
    claim: (cat) =>
      cat === "fix"
        ? "Closes a customer experience gap in the current position."
        : cat === "create"
        ? "Opens a customer-outcome-focused market claim."
        : "Deepens the customer success position.",
  },
  {
    keywords: ["data", "insight", "analytics", "intelligence", "knowledge", "evidence", "research"],
    claim: (_cat) => "Claims an evidence-backed expertise position.",
  },
  {
    keywords: ["partner", "network", "ecosystem", "integration", "interop"],
    claim: (_cat) => "Reinforces a partner and ecosystem positioning angle.",
  },
  {
    keywords: ["price", "cost", "affordable", "value", "savings", "roi", "efficiency"],
    claim: (_cat) => "Stakes out a value-efficiency positioning angle.",
  },
  {
    keywords: ["onboard", "onboarding", "adoption", "setup", "deploy", "implement"],
    claim: (cat) =>
      cat === "fix"
        ? "Closes an adoption and onboarding gap in the current position."
        : "Strengthens the time-to-value and adoption position.",
  },
  {
    keywords: ["scale", "enterprise", "large", "global", "growth", "expand"],
    claim: (_cat) => "Claims territory in enterprise-scale positioning.",
  },
];

function derivePositioningClaim(route: RouteRow): string {
  const text = [route.title, ...(route.why_this_matters_json ?? [])].join(" ").toLowerCase();
  const cat  = String(route.category || "improve").toLowerCase();

  for (const theme of POSITIONING_THEMES) {
    if (theme.keywords.some((k) => text.includes(k))) {
      return theme.claim(cat);
    }
  }

  if (cat === "fix")    return "Addresses a known execution gap in the current position.";
  if (cat === "create") return "Opens a new capability or market claim.";
  return "Strengthens an existing capability in the current position.";
}

// ─── Route-level derivation ─────────────────────────────────────────────────────

function deriveCoherenceSignal(
  route: RouteRow,
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
): CoherenceSignal {
  // Explicit cascade generation → always reinforces
  const frameworks = (route.frameworks_used ?? []).map((f) => f.toLowerCase());
  if (frameworks.includes("strategy_cascade")) return "reinforces";

  if (!positioning && !cascade) return "neutral";

  const routeTokens = normalizeTokens(
    [route.title, ...(route.why_this_matters_json ?? [])].join(" "),
  );
  const targetTokens = normalizeTokens(
    [
      cascade?.winning_aspiration ?? "",
      cascade?.how_to_win         ?? "",
      positioning?.value_for_customer ?? "",
      positioning?.market_category    ?? "",
    ].join(" "),
  );
  const coverage = tokenCoverage(routeTokens, targetTokens);
  const cat = String(route.category || "improve").toLowerCase();

  if (coverage >= 0.25) return "reinforces";
  if (cat === "create" && coverage < 0.10) return "weakens";
  if (cat === "fix" && coverage >= 0.10) return "reinforces";
  if (coverage >= 0.10) return "mixed";
  return "neutral";
}

function deriveTensionNavigated(
  route: RouteRow,
  positioning: PositioningCanvas | null,
): string | null {
  const evidence = route.evidence_json ?? [];
  const hasComplete = evidence.some((e) => e.status === "complete");
  const hasMissing  = evidence.some((e) => e.status === "missing");
  const frameworks  = (route.frameworks_used ?? []).map((f) => f.toLowerCase());
  const isOutsideOnly =
    frameworks.length > 0 &&
    frameworks.every((f) => ["public_research", "public_baseline", "baseline"].includes(f));

  if (isOutsideOnly && !hasComplete) {
    return "Relies on outside signals — not yet validated with direct customer evidence.";
  }
  if (hasMissing && !hasComplete) {
    return "Navigates without complete supporting evidence.";
  }

  const hasTaglineShift =
    positioning?.proposed_tagline?.trim() &&
    positioning.proposed_tagline.trim() !== positioning?.current_tagline?.trim();
  if (hasTaglineShift) {
    return "Operates during an identity transition — current market signal may lag the intended direction.";
  }

  return null;
}

function coherenceDisplayLabel(signal: CoherenceSignal): string {
  switch (signal) {
    case "reinforces": return "Reinforces positioning direction";
    case "weakens":    return "Creates contradictory positioning signal";
    case "mixed":      return "Sends mixed positioning signals";
    case "neutral":    return "Positioning impact unclear";
  }
}

/**
 * Derives a positioning implication for a single route.
 * Used in both the route-level and direction-level lenses.
 */
export function buildRoutePositioningImplication(
  route: RouteRow,
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
): RoutePositioningImplication {
  const coherenceSignal = deriveCoherenceSignal(route, positioning, cascade);
  return {
    routeId:         route.id,
    routeTitle:      route.title,
    category:        String(route.category || "improve").toLowerCase(),
    claimReinforced: derivePositioningClaim(route),
    tensionNavigated: deriveTensionNavigated(route, positioning),
    coherenceSignal,
    displayLabel:    coherenceDisplayLabel(coherenceSignal),
  };
}

// ─── Full narrative derivation ──────────────────────────────────────────────────

function deriveMarketPerception(positioning: PositioningCanvas): string | null {
  const tagline  = positioning.current_tagline?.trim();
  const category = positioning.market_category?.trim();
  if (tagline && category) return `${tagline} — positioned in ${category}`;
  if (tagline)   return tagline;
  if (category)  return `Positioned in the ${category} space`;
  return null;
}

function deriveIntendedIdentity(cascade: StrategyCascade): string | null {
  const aspiration = cascade.winning_aspiration?.trim();
  const where = cascade.where_to_play?.trim();
  if (aspiration && where) {
    const whereSnippet = where.split(/[.,;]/)[0].trim();
    return `${aspiration} — competing in ${whereSnippet}`;
  }
  if (aspiration) return aspiration;
  if (where)      return `Competing in ${where.split(/[.,;]/)[0].trim()}`;
  return null;
}

function deriveCustomerProofStatus(routes: RouteRow[]): CustomerProofStatus {
  const allEvidence = routes.flatMap((r) => r.evidence_json ?? []);
  if (allEvidence.length === 0) return "missing";

  const hasComplete = allEvidence.some((e) => e.status === "complete");
  const hasCustomerFramework = routes.some((r) =>
    (r.frameworks_used ?? []).some((f) =>
      ["odi", "jtbd", "customer_interviews", "primary_research"].includes(f.toLowerCase()),
    ),
  );

  if (hasComplete && hasCustomerFramework) return "present";
  if (hasComplete)                         return "partial";
  return "missing";
}

function deriveCustomerProofNote(
  status: CustomerProofStatus,
  routes: RouteRow[],
): string {
  switch (status) {
    case "present":
      return "At least one route is backed by customer evidence.";
    case "partial": {
      const completeCount = routes
        .flatMap((r) => r.evidence_json ?? [])
        .filter((e) => e.status === "complete").length;
      return `${completeCount} evidence item${completeCount !== 1 ? "s" : ""} confirmed, but no direct customer validation linked.`;
    }
    case "missing":
      return "No supporting evidence confirmed across any route. Customer validation is entirely absent.";
  }
}

function derivePosture(
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
  routes: RouteRow[],
): PositioningPosture {
  // No data at all → inherited (pure legacy perception)
  if (!positioning && !cascade) return "inherited";

  // Contradiction check: cascade and positioning use fundamentally different language
  if (cascade && positioning) {
    const cascadeTokens = normalizeTokens(
      `${cascade.winning_aspiration} ${cascade.how_to_win}`,
    );
    const posTokens = normalizeTokens(
      `${positioning.value_for_customer} ${positioning.market_category}`,
    );
    if (
      cascadeTokens.length > 4 &&
      posTokens.length > 4 &&
      tokenCoverage(cascadeTokens, posTokens) < 0.08
    ) {
      return "contradicted";
    }
  }

  // Fragmentation check: fix AND create routes are both present at meaningful scale
  if (routes.length >= 3) {
    const cats = routes.map((r) => String(r.category || "improve").toLowerCase());
    const hasFix    = cats.includes("fix");
    const hasCreate = cats.includes("create");
    const fixCount    = cats.filter((c) => c === "fix").length;
    const createCount = cats.filter((c) => c === "create").length;
    if (hasFix && hasCreate && fixCount >= 1 && createCount >= 1 && routes.length >= 4) {
      return "fragmented";
    }
  }

  // Emerging: tagline shift in progress
  const current  = positioning?.current_tagline?.trim();
  const proposed = positioning?.proposed_tagline?.trim();
  if (proposed && current && proposed !== current) return "emerging";

  // Coherent: cascade and positioning themes align meaningfully
  if (cascade && positioning) {
    const cascadeTokens = normalizeTokens(
      `${cascade.winning_aspiration} ${cascade.how_to_win}`,
    );
    const posTokens = normalizeTokens(
      `${positioning.value_for_customer} ${positioning.market_category}`,
    );
    if (tokenCoverage(cascadeTokens, posTokens) >= 0.18 && cascade.winning_aspiration.trim().length > 10) {
      return "coherent";
    }
  }

  return "inherited";
}

function deriveTensions(
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
  routes: RouteRow[],
): ContradictionNote[] {
  const tensions: ContradictionNote[] = [];

  // 1. Identity transition
  const current  = positioning?.current_tagline?.trim();
  const proposed = positioning?.proposed_tagline?.trim();
  if (current && proposed && current !== proposed) {
    tensions.push({
      between: "current market signal",
      and:     "intended identity",
      description:
        "Identity is in transition. The current tagline still defines how the market knows this company, but the intended direction is already shifting.",
    });
  }

  // 2. Generic market category
  if (positioning?.market_category && getCategoryHighlightWords(positioning.market_category).length > 0) {
    tensions.push({
      between: "market category",
      and:     "strategic specificity",
      description: `"${positioning.market_category.trim()}" is too broad to anchor a distinct position — buyers can't orient to it.`,
    });
  }

  // 3. Cascade vs. positioning language mismatch
  if (cascade && positioning) {
    const cascadeTokens = normalizeTokens(`${cascade.winning_aspiration} ${cascade.how_to_win}`);
    const posTokens     = normalizeTokens(`${positioning.value_for_customer} ${positioning.market_category}`);
    if (
      cascadeTokens.length > 4 &&
      posTokens.length > 4 &&
      tokenCoverage(cascadeTokens, posTokens) < 0.12
    ) {
      tensions.push({
        between: "strategic narrative",
        and:     "external positioning story",
        description:
          "The internal strategic language and the external positioning story diverge. They may be evolving independently.",
      });
    }
  }

  // 4. Route mix creating contradictory market signals
  if (routes.length >= 4) {
    const cats        = routes.map((r) => String(r.category || "improve").toLowerCase());
    const fixCount    = cats.filter((c) => c === "fix").length;
    const createCount = cats.filter((c) => c === "create").length;
    if (fixCount >= 2 && createCount >= 1) {
      tensions.push({
        between: "route emphasis",
        and:     "market signal",
        description:
          "Multiple routes are closing execution gaps while others are opening new market claims. Competitors and buyers may read this as an uncertain position.",
      });
    }
  }

  return tensions.slice(0, 3);
}

function deriveWouldStrengthen(
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
  posture: PositioningPosture,
  customerProofStatus: CustomerProofStatus,
  routes: RouteRow[],
): string[] {
  const items: string[] = [];

  if (customerProofStatus === "missing") {
    items.push("Customer interviews that validate the core positioning claim.");
  }

  if (
    positioning?.market_category &&
    getCategoryHighlightWords(positioning.market_category).length > 0
  ) {
    items.push("Narrowing the market category to a specific buyer segment and context.");
  }

  if (posture === "fragmented") {
    items.push("Consolidating route emphasis under a single coherent positioning theme.");
  }

  if (posture === "emerging" && positioning?.proposed_tagline) {
    items.push("Completing the identity transition by retiring the current market tagline.");
  }

  if (
    posture === "contradicted" ||
    (cascade && positioning && items.length < 2)
  ) {
    items.push("Aligning the strategic narrative language with the external positioning story.");
  }

  if (items.length === 0) {
    items.push("Documenting how each route directly supports the current positioning claim.");
  }

  return items.slice(0, 3);
}

// ─── Main public function ───────────────────────────────────────────────────────

/**
 * Synthesizes a full positioning reasoning narrative from raw positioning,
 * cascade, and route data. Used by the PositioningLens in
 * StrategicDirectionInspectPanel.
 */
export function buildPositioningLensNarrative(
  positioning: PositioningCanvas | null,
  cascade: StrategyCascade | null,
  routes: RouteRow[],
): PositioningLensNarrative {
  const posture          = derivePosture(positioning, cascade, routes);
  const customerStatus   = deriveCustomerProofStatus(routes);
  const routeImplications = routes.map((r) =>
    buildRoutePositioningImplication(r, positioning, cascade),
  );

  const reinforcing    = routeImplications.filter((r) => r.coherenceSignal === "reinforces");
  const contradicting  = routeImplications.filter((r) => r.coherenceSignal === "weakens");

  return {
    posture,
    postureHeadline:     POSTURE_HEADLINES[posture],
    marketPerception:    positioning ? deriveMarketPerception(positioning) : null,
    intendedIdentity:    cascade     ? deriveIntendedIdentity(cascade)     : null,
    customerProofStatus: customerStatus,
    customerProofNote:   deriveCustomerProofNote(customerStatus, routes),
    tensions:            deriveTensions(positioning, cascade, routes),
    reinforcingRoutes:   reinforcing.slice(0, 4),
    contradictingRoutes: contradicting.slice(0, 3),
    wouldStrengthen:     deriveWouldStrengthen(positioning, cascade, posture, customerStatus, routes),
  };
}
