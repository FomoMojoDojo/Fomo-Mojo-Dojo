/**
 * Strategic object relationship derivation.
 *
 * Derives typed, strength-classified relationships between routes, needs,
 * and strategic direction from existing data — without schema changes.
 *
 * Honesty rules:
 * - HIGH   — explicit derivation signal (frameworks_used, exact outcome match)
 * - MEDIUM — meaningful token overlap above conservative threshold
 * - LOW    — weak signal; not surfaced as primary relationships in the UI
 * - <LOW   — no relationship emitted
 *
 * Never fakes relationships. When evidence is absent, strength is LOW or absent.
 */

import type { RouteRow } from "@/views/Routes/useRoutes";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { StrategyCascade } from "@/lib/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RelStrength = "high" | "medium" | "low";
export type RelState = "active" | "inferred" | "stale" | "contradicted";
export type DerivedRelType = "serves" | "served_by" | "realizes" | "aligns_with";

export type DerivedRelationship = {
  fromId: string;
  fromKind: "strategic_route" | "customer_need" | "strategic_direction";
  toId: string;
  toKind: "strategic_route" | "customer_need" | "strategic_direction";
  type: DerivedRelType;
  strength: RelStrength;
  state: RelState;
  /** Internal reason — used for debugging only, not surfaced in UI. */
  reason: string;
  /** User-facing label for this relationship. */
  displayLabel: string;
  /** IDs of evidence items that directly justify this link. */
  evidenceRefs?: string[];
};

const STRENGTH_RANK: Record<RelStrength, number> = { high: 3, medium: 2, low: 1 };

// ─── Text normalization ─────────────────────────────────────────────────────────

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

/** Normalize text to a token list. Returns all tokens including duplicates. */
function normalizeTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/** Normalize an outcome string for exact-match comparison. */
function normalizeOutcome(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Coverage score: |sourceTokens ∩ targetSet| / min(|source|, |target|).
 * Measures what proportion of the shorter sequence's tokens appear in the longer.
 * 0 = no overlap, 1 = complete coverage.
 */
function coverageScore(sourceTokens: string[], targetTokens: string[]): number {
  if (sourceTokens.length === 0 || targetTokens.length === 0) return 0;
  const targetSet = new Set(targetTokens);
  const shared = sourceTokens.filter((t) => targetSet.has(t)).length;
  return shared / Math.min(sourceTokens.length, targetTokens.length);
}

// ─── Route / direction token helpers ───────────────────────────────────────────

function routeTextTokens(route: RouteRow): string[] {
  const parts: string[] = [
    route.title,
    route.short_description ?? "",
    ...(route.why_this_matters_json ?? []),
    ...(route.assumptions_json ?? []).map((a) => a.statement),
  ];
  return parts.flatMap(normalizeTokens);
}

function directionTextTokens(cascade: StrategyCascade): string[] {
  return [
    cascade.winning_aspiration,
    cascade.where_to_play,
    cascade.how_to_win,
  ].flatMap(normalizeTokens);
}

function stateForDerived(
  route: RouteRow,
  derivedFrom: "frameworks" | "evidence" | "inference",
): RelState {
  const ds = String(route.dependency_state ?? "").toLowerCase();
  if (ds === "contradicted") return "contradicted";
  if (["stale", "needs_review", "revalidate"].includes(ds)) return "stale";
  if (derivedFrom === "inference") return "inferred";
  return "active";
}

// ─── Thresholds ─────────────────────────────────────────────────────────────────

const ROUTE_NEED_MEDIUM = 0.25;
const ROUTE_NEED_LOW    = 0.12;
const DIR_ROUTE_MEDIUM  = 0.20;
const DIR_ROUTE_LOW     = 0.10;

// ─── Derivation: Need → Routes (served_by) ─────────────────────────────────────

/**
 * For a given need, classify all routes by how well they serve it.
 * Returns only relationships at strength LOW or above.
 * Deduplicated — strongest signal wins per (need, route) pair.
 */
export function deriveNeedServedByRoutes(
  need: OdiNeedRow,
  routes: RouteRow[],
): DerivedRelationship[] {
  const outcomeNorm = normalizeOutcome(need.desired_outcome);
  const needTokens  = normalizeTokens(need.desired_outcome);
  const results: DerivedRelationship[] = [];

  for (const route of routes) {
    let strength: RelStrength | null = null;
    let reason = "";
    let displayLabel = "";
    const evidenceRefs: string[] = [];
    let derivedFrom: "frameworks" | "evidence" | "inference" = "inference";

    // HIGH — exact outcome match in evidence_json
    const evidenceMatch = (route.evidence_json ?? []).find(
      (e) => normalizeOutcome(e.title) === outcomeNorm,
    );
    if (evidenceMatch) {
      strength     = "high";
      reason       = `evidence_json exact match: "${evidenceMatch.title}"`;
      displayLabel = "Clearly serves this need";
      derivedFrom  = "evidence";
      evidenceRefs.push(evidenceMatch.id);
    }

    // HIGH — exact outcome match in why_this_matters
    if (!strength) {
      const whyMatch = (route.why_this_matters_json ?? []).some(
        (b) => normalizeOutcome(b) === outcomeNorm,
      );
      if (whyMatch) {
        strength     = "high";
        reason       = "why_this_matters exact match";
        displayLabel = "Clearly serves this need";
        derivedFrom  = "evidence";
      }
    }

    // MEDIUM / LOW — token coverage
    if (!strength) {
      const rTokens  = routeTextTokens(route);
      const coverage = coverageScore(needTokens, rTokens);
      if (coverage >= ROUTE_NEED_MEDIUM) {
        strength     = "medium";
        reason       = `token coverage ${Math.round(coverage * 100)}%`;
        displayLabel = "May serve this need";
      } else if (coverage >= ROUTE_NEED_LOW) {
        strength     = "low";
        reason       = `token coverage ${Math.round(coverage * 100)}% (low)`;
        displayLabel = "Loosely related";
      }
    }

    if (!strength) continue;

    results.push({
      fromId:   need.id,
      fromKind: "customer_need",
      toId:     route.id,
      toKind:   "strategic_route",
      type:     "served_by",
      strength,
      state:    stateForDerived(route, derivedFrom),
      reason,
      displayLabel,
      ...(evidenceRefs.length ? { evidenceRefs } : {}),
    });
  }

  return deduplicateRelationships(results);
}

// ─── Derivation: Route → Needs (serves) ─────────────────────────────────────────

/**
 * For a given route, classify all needs by how well the route serves them.
 * Returns only relationships at strength LOW or above.
 */
export function deriveRouteServesNeeds(
  route: RouteRow,
  needs: OdiNeedRow[],
): DerivedRelationship[] {
  const rTokens   = routeTextTokens(route);
  const results: DerivedRelationship[] = [];

  for (const need of needs) {
    const outcomeNorm = normalizeOutcome(need.desired_outcome);
    const needTokens  = normalizeTokens(need.desired_outcome);
    let strength: RelStrength | null = null;
    let reason = "";
    let displayLabel = "";
    const evidenceRefs: string[] = [];
    let derivedFrom: "frameworks" | "evidence" | "inference" = "inference";

    // HIGH — exact outcome in evidence_json
    const evidenceMatch = (route.evidence_json ?? []).find(
      (e) => normalizeOutcome(e.title) === outcomeNorm,
    );
    if (evidenceMatch) {
      strength     = "high";
      reason       = "evidence_json exact match";
      displayLabel = "Clearly serves";
      derivedFrom  = "evidence";
      evidenceRefs.push(evidenceMatch.id);
    }

    // HIGH — exact outcome in why_this_matters
    if (!strength) {
      const whyMatch = (route.why_this_matters_json ?? []).some(
        (b) => normalizeOutcome(b) === outcomeNorm,
      );
      if (whyMatch) {
        strength     = "high";
        reason       = "why_this_matters exact match";
        displayLabel = "Clearly serves";
        derivedFrom  = "evidence";
      }
    }

    // MEDIUM / LOW — coverage
    if (!strength) {
      const coverage = coverageScore(needTokens, rTokens);
      if (coverage >= ROUTE_NEED_MEDIUM) {
        strength     = "medium";
        reason       = `token coverage ${Math.round(coverage * 100)}%`;
        displayLabel = "Likely serves";
      } else if (coverage >= ROUTE_NEED_LOW) {
        strength     = "low";
        reason       = `token coverage ${Math.round(coverage * 100)}% (low)`;
        displayLabel = "Loosely related";
      }
    }

    if (!strength) continue;

    results.push({
      fromId:   route.id,
      fromKind: "strategic_route",
      toId:     need.id,
      toKind:   "customer_need",
      type:     "serves",
      strength,
      state:    stateForDerived(route, derivedFrom),
      reason,
      displayLabel,
      ...(evidenceRefs.length ? { evidenceRefs } : {}),
    });
  }

  return deduplicateRelationships(results);
}

// ─── Derivation: Direction → Routes (realizes) ──────────────────────────────────

/**
 * For a strategic direction, classify all routes by alignment strength.
 * HIGH = route was generated from the cascade (frameworks_used signal).
 * MEDIUM = meaningful token overlap with direction narrative.
 * LOW = weak overlap — not shown as primary aligned route in the UI.
 */
export function deriveDirectionRealizesRoutes(
  cascade: StrategyCascade,
  companyId: string,
  routes: RouteRow[],
): DerivedRelationship[] {
  const dirTokens = directionTextTokens(cascade);
  const results: DerivedRelationship[] = [];

  for (const route of routes) {
    const frameworks = (route.frameworks_used ?? []).map((f) => f.toLowerCase());
    let strength: RelStrength | null = null;
    let reason = "";
    let displayLabel = "";
    let derivedFrom: "frameworks" | "evidence" | "inference" = "inference";

    // HIGH — explicitly generated from strategy cascade
    if (frameworks.includes("strategy_cascade")) {
      strength     = "high";
      reason       = "frameworks_used: strategy_cascade";
      displayLabel = "Generated from your strategic direction";
      derivedFrom  = "frameworks";
    }

    // MEDIUM / LOW — direction narrative overlap
    if (!strength) {
      const rTokens  = routeTextTokens(route);
      const coverage = coverageScore(rTokens, dirTokens);
      if (coverage >= DIR_ROUTE_MEDIUM) {
        strength     = "medium";
        reason       = `theme alignment: ${Math.round(coverage * 100)}% coverage`;
        displayLabel = "Aligned with strategic direction";
      } else if (coverage >= DIR_ROUTE_LOW) {
        strength     = "low";
        reason       = `loose alignment: ${Math.round(coverage * 100)}% coverage`;
        displayLabel = "Loosely aligned";
      }
    }

    if (!strength) continue;

    results.push({
      fromId:   companyId,
      fromKind: "strategic_direction",
      toId:     route.id,
      toKind:   "strategic_route",
      type:     "realizes",
      strength,
      state:    stateForDerived(route, derivedFrom),
      reason,
      displayLabel,
    });
  }

  return deduplicateRelationships(results);
}

// ─── Derivation: Route → Direction (aligns_with) ────────────────────────────────

/**
 * For a given route, derive its alignment relationship with the strategic direction.
 * Returns null when no alignment is derivable (cascade absent or no signal).
 */
export function deriveRouteAlignsWithDirection(
  route: RouteRow,
  cascade: StrategyCascade | null,
  companyId: string,
): DerivedRelationship | null {
  if (!cascade) return null;

  const frameworks = (route.frameworks_used ?? []).map((f) => f.toLowerCase());

  // HIGH — explicitly from strategy cascade
  if (frameworks.includes("strategy_cascade")) {
    return {
      fromId:       route.id,
      fromKind:     "strategic_route",
      toId:         companyId,
      toKind:       "strategic_direction",
      type:         "aligns_with",
      strength:     "high",
      state:        stateForDerived(route, "frameworks"),
      reason:       "frameworks_used: strategy_cascade",
      displayLabel: "Generated from your strategic direction",
    };
  }

  const dirTokens = directionTextTokens(cascade);
  const rTokens   = routeTextTokens(route);
  const coverage  = coverageScore(rTokens, dirTokens);

  if (coverage >= DIR_ROUTE_MEDIUM) {
    return {
      fromId:       route.id,
      fromKind:     "strategic_route",
      toId:         companyId,
      toKind:       "strategic_direction",
      type:         "aligns_with",
      strength:     "medium",
      state:        stateForDerived(route, "inference"),
      reason:       `theme alignment: ${Math.round(coverage * 100)}% coverage`,
      displayLabel: "Aligns with your strategic direction",
    };
  }

  if (coverage >= DIR_ROUTE_LOW) {
    return {
      fromId:       route.id,
      fromKind:     "strategic_route",
      toId:         companyId,
      toKind:       "strategic_direction",
      type:         "aligns_with",
      strength:     "low",
      state:        stateForDerived(route, "inference"),
      reason:       `loose alignment: ${Math.round(coverage * 100)}% coverage`,
      displayLabel: "Needs strategic fit validation",
    };
  }

  return null;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Keep only relationships at or above the specified minimum strength.
 * "medium" keeps medium + high; "high" keeps only high.
 */
export function filterByMinStrength(
  rels: DerivedRelationship[],
  min: RelStrength,
): DerivedRelationship[] {
  return rels.filter((r) => STRENGTH_RANK[r.strength] >= STRENGTH_RANK[min]);
}

/**
 * Remove duplicate (fromId, toId, type) pairs, keeping the highest-strength entry.
 * Called internally by each derivation function and also available to callers.
 */
export function deduplicateRelationships(
  rels: DerivedRelationship[],
): DerivedRelationship[] {
  const seen = new Map<string, DerivedRelationship>();
  for (const rel of rels) {
    const key      = `${rel.fromId}|${rel.toId}|${rel.type}`;
    const existing = seen.get(key);
    if (!existing || STRENGTH_RANK[rel.strength] > STRENGTH_RANK[existing.strength]) {
      seen.set(key, rel);
    }
  }
  return [...seen.values()];
}
