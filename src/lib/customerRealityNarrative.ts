/**
 * Customer reality narrative synthesis.
 *
 * Answers: Is this strategy grounded in real customer behavior?
 *
 * Inputs: customer needs (ODI), routes, cascade.
 * Outputs: structured reasoning objects for three inspect lenses:
 *   - NeedRealityCard     → NeedInspectPanel CustomerRealityLens
 *   - RouteCustomerImplication → RouteInspectPanel CustomerRealityLens
 *   - CustomerRealityNarrative → StrategicDirectionInspectPanel CustomerRealityLens
 *
 * Compression rules:
 * - No JTBD essays. No ODI tables.
 * - Short consequence statements, grouped patterns, confidence-aware summaries.
 * - Never expose internal schema names or framework labels.
 */

import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { StrategyCascade } from "@/lib/types";


// ─── Public types ───────────────────────────────────────────────────────────────

/**
 * Six mutually exclusive customer reality postures.
 * Derived from validated need count, route-customer coherence, and contradiction density.
 */
export type CustomerRealityPosture =
  | "inferred"     // all customer signals from outside research only
  | "directional"  // strategic direction running ahead of customer proof
  | "converging"   // multiple needs pointing to same friction; validation building
  | "grounded"     // multiple validated needs confirmed by routes and evidence
  | "fragmented"   // needs scattered, conflicting priorities, no thematic pattern
  | "contradicted"; // routes solving internal problems more than customer problems

/** Whether a specific need is backed by direct customer research. */
export type ValidationStatus = "validated" | "directional" | "inferred";

/**
 * What kind of friction a route is primarily removing.
 * User-facing — never expose to user as an internal label.
 */
export type FrictionKind =
  | "customer"          // friction customers feel directly
  | "operational"       // internal execution friction
  | "strategic"         // advances internal strategic priorities
  | "market_perception"; // improves market perception of an offering

export type NeedRealityCard = {
  needId: string;
  /** Whether this need is backed by direct research or inferred from outside signals. */
  validationStatus: ValidationStatus;
  /** What customer behavior this need reflects — short, no jargon. */
  behaviorSummary: string;
  /** IDs of routes that appear to address this need. */
  improvingRouteIds: string[];
  /** Short note on what evidence exists. */
  evidenceNote: string;
  /** What customer uncertainty still exists for this need. */
  uncertaintyNote: string;
  /** 1–2 actions that would materially strengthen confidence. */
  wouldStrengthenConfidence: string[];
};

export type RouteCustomerImplication = {
  routeId: string;
  /** What customer behavior this route is trying to change. */
  behaviorTargeted: string;
  /** Is the behavior this route targets confirmed by real customer research? */
  behaviorValidated: boolean;
  frictionKind: FrictionKind;
  /** Short user-facing label for friction kind. */
  frictionLabel: string;
  /** Short evidence note. */
  evidenceNote: string;
  /** Customer uncertainty that still exists, if any. */
  customerUncertainty: string | null;
};

export type CustomerRealityConflict = {
  description: string;
  severity: "warning" | "notice";
};

export type CustomerRealityNarrative = {
  posture: CustomerRealityPosture;
  postureHeadline: string;
  validatedNeedCount: number;
  inferredNeedCount: number;
  /** Top needs by opportunity score with validation status. */
  highPriorityGaps: { needId: string; outcome: string; score: number; status: ValidationStatus }[];
  /** 1–3 thematic patterns across the full need set. */
  frictionPatterns: string[];
  /** How well the cascade maps to validated customer needs. */
  directionGrounding: string;
  /** 1–3 customer questions that remain unresolved. */
  unresolved: string[];
  /** Tensions between customer evidence and strategic emphasis. */
  conflicts: CustomerRealityConflict[];
  /** 1–3 actions that would improve customer grounding. */
  wouldResolve: string[];
};

// ─── Posture headlines ──────────────────────────────────────────────────────────

const POSTURE_HEADLINES: Record<CustomerRealityPosture, string> = {
  inferred:     "Customer reality is still mostly inferred.",
  directional:  "Strategic direction is running ahead of customer proof.",
  converging:   "Multiple needs are pointing toward the same customer friction.",
  grounded:     "Routes and direction are grounded in validated customer behavior.",
  fragmented:   "Customer needs remain fragmented — no clear priority pattern.",
  contradicted: "Routes are solving internal alignment problems more than customer problems.",
};

const FRICTION_LABELS: Record<FrictionKind, string> = {
  customer:          "Removes direct customer friction",
  operational:       "Removes internal execution friction",
  strategic:         "Advances internal strategic priorities",
  market_perception: "Improves market perception",
};

// ─── Text utilities (local, mirrors other narrative libs) ───────────────────────

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
  "minimize", "increase", "reduce", "ensure", "avoid", "help",
  "ability", "need", "needs", "want", "wants", "get", "gets",
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

// ─── Validation status ──────────────────────────────────────────────────────────

const CUSTOMER_FRAMEWORKS = new Set([
  "odi", "jtbd", "customer_interviews", "primary_research",
  "customer", "interviews", "user_research",
]);

const OUTSIDE_SOURCES = ["baseline", "public", "benchmark", "report", "external", "outside"];

/**
 * Classifies how directly a need is grounded in customer research.
 *
 * "validated" — direct customer research (ODI sessions, interviews, etc.)
 * "inferred"  — derived from outside signals only (baselines, public reports)
 * "directional" — in between; some signal, not primary research
 */
export function deriveValidationStatus(need: OdiNeedRow): ValidationStatus {
  const src = (need.source_path ?? "").toLowerCase();
  const frameworks = (need.frameworks_used ?? []).map((f) => f.toLowerCase());

  const isCustomerSource =
    frameworks.some((f) => CUSTOMER_FRAMEWORKS.has(f)) ||
    src.includes("customer") ||
    src.includes("interview") ||
    src.includes("primary");

  if (isCustomerSource) return "validated";

  const isOutsideOnly = OUTSIDE_SOURCES.some((kw) => src.includes(kw));
  if (isOutsideOnly) return "inferred";

  return "directional";
}

// ─── Need-level narrative ────────────────────────────────────────────────────────

function deriveBehaviorSummary(need: OdiNeedRow): string {
  const outcome = need.desired_outcome?.trim() ?? "";
  if (!outcome) return "No customer behavior statement recorded for this need.";
  const first = outcome.split(/[.!?\n]/)[0].trim();
  return first.length > 120 ? first.slice(0, 117) + "…" : first;
}

function deriveNeedEvidenceNote(status: ValidationStatus): string {
  switch (status) {
    case "validated":
      return "Backed by direct customer research.";
    case "inferred":
      return "Signal comes from outside research — not yet confirmed with customer interviews.";
    case "directional":
      return "Origin of this signal is not fully classified. Treat as directional until confirmed.";
  }
}

function deriveUncertaintyNote(need: OdiNeedRow, status: ValidationStatus): string {
  const imp = need.importance ?? 0;
  const sat = need.satisfaction ?? 0;
  const state = (need.service_state ?? "").toLowerCase();

  if (status === "inferred") {
    return "This need has not been validated with direct customer research — it comes from outside signals.";
  }
  if (state === "overserved" && imp >= 6) {
    return "It's unclear whether over-served reflects genuine customer satisfaction or insufficient measurement.";
  }
  if (imp >= 7 && sat >= 7) {
    return "Both importance and satisfaction are high — this balance may shift as the business evolves.";
  }
  if (imp <= 3) {
    return "Low importance makes it hard to prioritize — confirm whether customers consistently agree.";
  }
  return "Further customer interviews would sharpen the importance and satisfaction signal.";
}

function deriveNeedWouldStrengthen(need: OdiNeedRow, status: ValidationStatus): string[] {
  const imp = need.importance ?? 0;
  const sat = need.satisfaction ?? 0;
  const state = (need.service_state ?? "").toLowerCase();
  const out: string[] = [];

  if (status === "inferred") {
    out.push("Customer interviews would replace the outside signal with direct evidence.");
  } else if (status === "directional") {
    out.push("Documenting the source of this signal would clarify how much to trust it.");
  }

  if (imp >= 7 && sat <= 4 && out.length < 2) {
    out.push("Revisiting this need with more customer interviews would confirm the gap size.");
  }
  if (state === "overserved" && out.length < 2) {
    out.push("Checking whether over-serving reflects a real customer feeling or a measurement artifact.");
  }
  if (out.length === 0) {
    out.push("Updating importance and satisfaction scores with fresh customer data.");
  }

  return out.slice(0, 2);
}

/**
 * Builds a per-need reasoning card for the CustomerRealityLens.
 * Pure — no side effects.
 */
export function deriveNeedRealityCard(need: OdiNeedRow, routes: RouteRow[]): NeedRealityCard {
  const status = deriveValidationStatus(need);
  const outcomeTokens = normalizeTokens(need.desired_outcome ?? "");

  const improvingRouteIds = routes
    .filter((r) => {
      if (outcomeTokens.length === 0) return false;
      const routeTokens = normalizeTokens(
        [r.title, ...(r.why_this_matters_json ?? [])].join(" "),
      );
      if (tokenCoverage(outcomeTokens, routeTokens) >= 0.20) return true;
      return (r.evidence_json ?? []).some((ev) => {
        const evTokens = normalizeTokens(ev.title);
        return evTokens.some((t) => outcomeTokens.includes(t));
      });
    })
    .map((r) => r.id);

  return {
    needId:                  need.id,
    validationStatus:        status,
    behaviorSummary:         deriveBehaviorSummary(need),
    improvingRouteIds,
    evidenceNote:            deriveNeedEvidenceNote(status),
    uncertaintyNote:         deriveUncertaintyNote(need, status),
    wouldStrengthenConfidence: deriveNeedWouldStrengthen(need, status),
  };
}

// ─── Route-level derivation ─────────────────────────────────────────────────────

const OPERATIONAL_KEYWORDS = [
  "process", "workflow", "backlog", "latency", "deployment", "delay", "timeout",
  "error", "bug", "sync", "delivery", "cycle", "pipeline", "throughput", "queue",
  "handoff", "bottleneck", "rollout", "incident", "reliability", "uptime",
];

type OppSignal = {
  outcome?: string;
  importance?: number | null;
  satisfaction?: number | null;
  opportunity_score?: number | null;
};

function deriveFrictionKind(route: RouteRow, rankedOpps: OppSignal[]): FrictionKind {
  const frameworks = (route.frameworks_used ?? []).map((f) => f.toLowerCase());
  const cat = String(route.category || "improve").toLowerCase();
  const text = [route.title, ...(route.why_this_matters_json ?? [])].join(" ").toLowerCase();

  if (frameworks.some((f) => CUSTOMER_FRAMEWORKS.has(f))) return "customer";
  if (rankedOpps.length > 0) return "customer";

  if (frameworks.includes("strategy_cascade")) return "strategic";

  const hasOperationalKeyword = OPERATIONAL_KEYWORDS.some((kw) => text.includes(kw));
  if (cat === "fix" && hasOperationalKeyword) return "operational";
  if (cat === "fix") return "operational";

  if (cat === "create") return "market_perception";

  return "operational";
}

function deriveBehaviorTargeted(route: RouteRow, rankedOpps: OppSignal[]): string {
  // Use the most relevant opp outcome first
  if (rankedOpps.length > 0 && rankedOpps[0].outcome?.trim()) {
    const out = rankedOpps[0].outcome!.trim();
    return out.length > 120 ? out.slice(0, 117) + "…" : out;
  }

  // Fall back to first sentence of why_this_matters
  const firstWhy = (route.why_this_matters_json ?? [])[0]?.trim();
  if (firstWhy) {
    const sentence = firstWhy.split(/[.!?]/)[0].trim();
    return sentence.length > 120 ? sentence.slice(0, 117) + "…" : sentence;
  }

  const cat = String(route.category || "improve").toLowerCase();
  if (cat === "fix")    return "Closes a known execution gap affecting delivery.";
  if (cat === "create") return "Opens access to a capability customers don't currently have.";
  return "Deepens an existing capability that customers already rely on.";
}

function deriveRouteEvidenceNote(route: RouteRow, rankedOpps: OppSignal[]): string {
  const ev = route.evidence_json ?? [];
  const complete = ev.filter((e) => e.status === "complete").length;
  const missing  = ev.filter((e) => e.status === "missing").length;

  if (complete === 0 && missing === 0 && rankedOpps.length === 0) {
    return "No evidence items linked.";
  }
  if (rankedOpps.length > 0 && complete === 0) {
    const highPri = rankedOpps.filter(
      (o) => (o.opportunity_score ?? 0) >= 10,
    ).length;
    return highPri > 0
      ? `${rankedOpps.length} customer signal${rankedOpps.length !== 1 ? "s" : ""} linked (${highPri} high-priority).`
      : `${rankedOpps.length} customer signal${rankedOpps.length !== 1 ? "s" : ""} linked.`;
  }
  if (complete >= 2 && missing === 0) return `${complete} evidence items confirmed.`;
  if (complete >= 1) return `${complete} confirmed, ${missing > 0 ? `${missing} still missing` : "no gaps flagged"}.`;
  return `${missing > 0 ? `${missing} evidence item${missing !== 1 ? "s" : ""} flagged as missing` : "No evidence confirmed yet"}.`;
}

function deriveCustomerUncertainty(
  route: RouteRow,
  frictionKind: FrictionKind,
  rankedOpps: OppSignal[],
): string | null {
  const frameworks = (route.frameworks_used ?? []).map((f) => f.toLowerCase());
  const isOutsideOnly =
    frameworks.length > 0 &&
    frameworks.every((f) => ["public_research", "public_baseline", "baseline"].includes(f));

  if (frictionKind === "strategic" || frictionKind === "operational") {
    return "No direct customer signal links this route to a customer job. Treat the customer impact as assumed until validated.";
  }
  if (isOutsideOnly && rankedOpps.length === 0) {
    return "Relies on outside signals only — direct customer validation is missing.";
  }
  if (rankedOpps.length === 0 && frictionKind === "customer") {
    return "The customer connection is inferred — no linked customer signals confirm this route's impact.";
  }
  return null;
}

/**
 * Derives the customer implication of a single route.
 * `rankedOpps` is the OpportunityRow slice from RouteInspectDetail — pass [] if unavailable.
 */
export function deriveRouteCustomerImplication(
  route: RouteRow,
  rankedOpps: OppSignal[],
  linkedNeeds: OdiNeedRow[],
): RouteCustomerImplication {
  const frictionKind = deriveFrictionKind(route, rankedOpps);
  const behaviorTargeted = deriveBehaviorTargeted(route, rankedOpps);

  const ev = route.evidence_json ?? [];
  const hasCompleteEvidence = ev.some((e) => e.status === "complete");
  const hasHighPriorityOpp = rankedOpps.some((o) =>
    (o.importance ?? 0) >= 7 && (o.satisfaction ?? 0) <= 4,
  );
  const behaviorValidated = frictionKind === "customer" && (hasHighPriorityOpp || hasCompleteEvidence);

  return {
    routeId:             route.id,
    behaviorTargeted,
    behaviorValidated,
    frictionKind,
    frictionLabel:       FRICTION_LABELS[frictionKind],
    evidenceNote:        deriveRouteEvidenceNote(route, rankedOpps),
    customerUncertainty: deriveCustomerUncertainty(route, frictionKind, rankedOpps),
  };
}

// ─── Full narrative (direction-level) ──────────────────────────────────────────

function deriveImportanceVariance(needs: OdiNeedRow[]): number {
  if (needs.length < 2) return 0;
  const scores = needs.map((n) => n.importance ?? 5);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return scores.reduce((acc, v) => acc + (v - mean) ** 2, 0) / scores.length;
}

function hasThematicClustering(needs: OdiNeedRow[]): boolean {
  if (needs.length < 2) return false;
  const tokenSets = needs.map((n) => new Set(normalizeTokens(n.desired_outcome ?? "")));
  let clusterPairs = 0;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const shared = [...tokenSets[i]].filter((t) => tokenSets[j].has(t)).length;
      if (shared >= 2) clusterPairs++;
    }
  }
  return clusterPairs >= 2;
}

function derivePosture(
  needs: OdiNeedRow[],
  routes: RouteRow[],
  cascade: StrategyCascade | null,
): CustomerRealityPosture {
  if (needs.length === 0) return "inferred";

  const validatedNeeds = needs.filter((n) => deriveValidationStatus(n) === "validated");
  const inferredNeeds  = needs.filter((n) => deriveValidationStatus(n) === "inferred");

  // Contradicted: routes framing as customer-facing but all signals are outside, OR
  // most routes solve internal alignment problems (no customer frameworks, no opps)
  const routesWithCustomerFramework = routes.filter((r) =>
    (r.frameworks_used ?? []).some((f) => CUSTOMER_FRAMEWORKS.has(f.toLowerCase())),
  );
  const allNeedsInferred = needs.length > 0 && inferredNeeds.length === needs.length;
  const mostRoutesInternal =
    routes.length >= 2 && routesWithCustomerFramework.length === 0 && allNeedsInferred;
  if (mostRoutesInternal && cascade) return "contradicted";

  // Fragmented: high variance + no thematic clustering
  const variance = deriveImportanceVariance(needs);
  const clustered = hasThematicClustering(needs);
  if (needs.length >= 4 && variance > 6 && !clustered) return "fragmented";

  // Grounded: multiple validated needs + at least one route with customer evidence
  if (validatedNeeds.length >= 2 && routesWithCustomerFramework.length >= 1) return "grounded";

  // Converging: thematic clustering or 1 validated need building toward grounded
  if (clustered || validatedNeeds.length >= 1) return "converging";

  // Directional: at least some non-inferred signal
  if (validatedNeeds.length === 0 && inferredNeeds.length < needs.length) return "directional";

  return "inferred";
}

function deriveDirectionGrounding(
  needs: OdiNeedRow[],
  cascade: StrategyCascade | null,
): string {
  if (!cascade) return "No strategic direction defined to ground against.";

  const validatedNeeds = needs.filter((n) => deriveValidationStatus(n) !== "inferred");
  if (validatedNeeds.length === 0) {
    return needs.length > 0
      ? "All customer needs come from outside signals — no direct customer grounding for the strategic direction."
      : "No customer needs recorded — the strategic direction is ungrounded.";
  }

  const cascadeTokens = normalizeTokens(`${cascade.winning_aspiration} ${cascade.how_to_win}`);
  const validatedNeedTokens = validatedNeeds.flatMap((n) =>
    normalizeTokens(n.desired_outcome ?? ""),
  );
  const coverage = tokenCoverage(cascadeTokens, validatedNeedTokens);

  if (coverage >= 0.20) return "The strategic direction maps well to validated customer needs.";
  if (coverage >= 0.10) return "The direction partially overlaps with validated customer needs.";
  return "The strategic direction does not yet align with the validated customer needs on record.";
}

function deriveFrictionPatterns(needs: OdiNeedRow[], validatedCount: number): string[] {
  const patterns: string[] = [];

  const highGaps = needs.filter((n) => (n.opportunity_score ?? 0) >= 14);
  if (highGaps.length >= 2) {
    patterns.push(
      `${highGaps.length} needs show a consistent gap between importance and delivery.`,
    );
  }

  const overServed = needs.filter(
    (n) => (n.service_state ?? "").toLowerCase() === "overserved",
  );
  if (overServed.length > 0) {
    patterns.push(
      `${overServed.length} need${overServed.length !== 1 ? "s" : ""} ${overServed.length !== 1 ? "are" : "is"} over-served — potential misallocation of effort.`,
    );
  }

  if (validatedCount === 0 && needs.length > 0) {
    patterns.push("All needs come from outside signals — customer voice is not yet in the data.");
  }

  return patterns.slice(0, 3);
}

function deriveConflicts(
  needs: OdiNeedRow[],
  routes: RouteRow[],
  cascade: StrategyCascade | null,
): CustomerRealityConflict[] {
  const conflicts: CustomerRealityConflict[] = [];
  const validatedNeeds = needs.filter((n) => deriveValidationStatus(n) !== "inferred");
  const inferredNeeds  = needs.filter((n) => deriveValidationStatus(n) === "inferred");

  // 1. Routes claimed as customer-facing but all needs are inferred
  const customerFrameworkRoutes = routes.filter((r) =>
    (r.frameworks_used ?? []).some((f) => CUSTOMER_FRAMEWORKS.has(f.toLowerCase())),
  );
  if (customerFrameworkRoutes.length > 0 && inferredNeeds.length === needs.length && needs.length > 0) {
    conflicts.push({
      description: "Routes reference customer signals, but all recorded customer needs come from outside research. The customer grounding may be overstated.",
      severity: "warning",
    });
  }

  // 2. Direction runs ahead of customer proof
  if (cascade && validatedNeeds.length === 0 && needs.length > 0) {
    conflicts.push({
      description: "The strategic direction is not grounded in any validated customer needs — it is running ahead of customer proof.",
      severity: "warning",
    });
  }

  // 3. Over-served needs with significant routes targeting them
  const overServedNeeds = needs.filter(
    (n) => (n.service_state ?? "").toLowerCase() === "overserved" && (n.importance ?? 0) >= 6,
  );
  if (overServedNeeds.length > 0) {
    const overServedTokenSets = overServedNeeds.map((n) =>
      new Set(normalizeTokens(n.desired_outcome ?? "")),
    );
    const hasRoutePushingOverServed = routes.some((r) => {
      const routeTokens = normalizeTokens(
        [r.title, ...(r.why_this_matters_json ?? [])].join(" "),
      );
      return overServedTokenSets.some((ts) =>
        routeTokens.filter((t) => ts.has(t)).length >= 2,
      );
    });
    if (hasRoutePushingOverServed) {
      conflicts.push({
        description: "At least one route appears to push harder on a need customers already consider over-served. This may misallocate effort.",
        severity: "notice",
      });
    }
  }

  return conflicts.slice(0, 3);
}

function deriveUnresolved(
  needs: OdiNeedRow[],
  routes: RouteRow[],
  cascade: StrategyCascade | null,
  posture: CustomerRealityPosture,
): string[] {
  const items: string[] = [];

  if (posture === "inferred") {
    items.push("Customer research hasn't been conducted — all signals come from outside data.");
  }

  const overServedHighImp = needs.some(
    (n) => (n.service_state ?? "").toLowerCase() === "overserved" && (n.importance ?? 0) >= 6,
  );
  if (overServedHighImp) {
    items.push("It's unclear whether over-served areas reflect genuine customer satisfaction or measurement gaps.");
  }

  if (cascade && items.length < 3) {
    const cascadeTokens = normalizeTokens(`${cascade.winning_aspiration} ${cascade.how_to_win}`);
    const allNeedTokens = needs.flatMap((n) => normalizeTokens(n.desired_outcome ?? ""));
    if (cascadeTokens.length > 3 && tokenCoverage(cascadeTokens, allNeedTokens) < 0.08) {
      items.push("The strategic direction references concepts that don't appear in the customer need statements.");
    }
  }

  const noCompleteRouteEvidence = routes.length > 0 && routes.every(
    (r) => !(r.evidence_json ?? []).some((e) => e.status === "complete"),
  );
  if (noCompleteRouteEvidence && items.length < 3) {
    items.push("No route has confirmed supporting evidence — customer impact is entirely assumed.");
  }

  if (items.length === 0) {
    items.push("Updated customer research would sharpen the confidence picture across all needs.");
  }

  return items.slice(0, 3);
}

function deriveWouldResolve(posture: CustomerRealityPosture, validatedCount: number): string[] {
  switch (posture) {
    case "inferred":
      return ["Primary customer interviews on the top 3 needs would replace inference with direct evidence."];
    case "fragmented":
      return [
        "Clustering customer needs by job-to-be-done would reveal whether fragmentation is real or a measurement artifact.",
        "Prioritizing needs by consistent importance scores across multiple customer segments.",
      ];
    case "contradicted":
      return [
        "Resolving the gap between internal strategic language and customer need statements would reduce the contradiction signal.",
        "Conducting customer interviews to anchor the strategic direction to real customer behavior.",
      ];
    case "converging":
      return validatedCount >= 1
        ? ["Validating the highest-priority needs with additional customer interviews would confirm or challenge the current picture."]
        : ["Validating the most critical needs with direct customer interviews would confirm or challenge current assumptions."];
    case "directional":
      return ["Validating the highest-priority needs with direct customer interviews would confirm or challenge the current picture."];
    case "grounded":
      return ["Continuously refreshing customer interviews as routes advance keeps the grounding accurate."];
  }
}

/**
 * Builds a full customer reality reasoning narrative for the strategic direction panel.
 * Pure — no side effects.
 */
export function buildCustomerRealityNarrative(
  needs: OdiNeedRow[],
  routes: RouteRow[],
  cascade: StrategyCascade | null,
): CustomerRealityNarrative {
  const posture        = derivePosture(needs, routes, cascade);
  const validatedNeeds = needs.filter((n) => deriveValidationStatus(n) === "validated");
  const inferredNeeds  = needs.filter((n) => deriveValidationStatus(n) === "inferred");

  const highPriorityGaps = needs
    .filter((n) => (n.opportunity_score ?? 0) >= 10)
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    .slice(0, 3)
    .map((n) => ({
      needId:  n.id,
      outcome: n.desired_outcome ?? "Unknown need",
      score:   Math.round(n.opportunity_score ?? 0),
      status:  deriveValidationStatus(n),
    }));

  return {
    posture,
    postureHeadline:   POSTURE_HEADLINES[posture],
    validatedNeedCount: validatedNeeds.length,
    inferredNeedCount:  inferredNeeds.length,
    highPriorityGaps,
    frictionPatterns:  deriveFrictionPatterns(needs, validatedNeeds.length),
    directionGrounding: deriveDirectionGrounding(needs, cascade),
    unresolved:        deriveUnresolved(needs, routes, cascade, posture),
    conflicts:         deriveConflicts(needs, routes, cascade),
    wouldResolve:      deriveWouldResolve(posture, validatedNeeds.length),
  };
}
