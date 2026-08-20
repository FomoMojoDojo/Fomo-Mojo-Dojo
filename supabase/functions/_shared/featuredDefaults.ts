// First Read ROLLUP (Gate 2.5) — deterministic default selectors for the auto-featured item.
//
// PURE. No DB, no model. The edge function fetches rows, maps them to these shapes, and calls
// these to pick the default for the two DETERMINISTIC themes (theme 1 say-vs-see, theme 3
// findings). Theme 2 (outside-raised) has no deterministic path to the declared direction and is
// decided by the signed-criterion judge in the edge function — not here.

// The DECLARED-DIRECTION topic set: a say-vs-see delta only defaults when its DECLARED claim speaks
// to the company's declared direction (stated problem / positioning / differentiators / strategy).
// Topics are assigned deterministically upstream by evidenceMappers (band + mojo_area).
export const DECLARED_DIRECTION_TOPICS = new Set<string>([
  "problem",              // stated-problem-derived
  "positioning",          // positioning
  "unique attributes",    // differentiators
  "differentiated value", // differentiators
  "strategy",             // declared strategy
  "capabilities",
  "operations",
]);

// Rank order — the sharpest say-vs-see contrast first. A divergence between what the client
// declared and what the record says is the most meeting-worthy; a silence next; an echo last.
const DELTA_TYPE_RANK: Record<string, number> = { divergent: 0, publicly_silent: 1, echoed: 2 };
// Topic priority (tie-break within a delta_type): the flagship declared surfaces first.
const TOPIC_PRIORITY: Record<string, number> = {
  positioning: 0, "unique attributes": 0, "differentiated value": 0,
  problem: 1,
  strategy: 2, capabilities: 3, operations: 4,
};
// Confidence tie-break (higher confidence first).
const CONFIDENCE_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export interface SayVsSeeCandidate {
  contentIdentity: string;
  deltaType: string;               // echoed | divergent | publicly_silent
  declaredTopic: string | null;    // claims.topic of the declared side
  declaredConfidence: string | null; // claims.confidence of the declared side
}

export type FeaturedPairingKind = "internal_vs_public" | "public_vs_public";

/**
 * Pick the default say-vs-see item (theme 1 fallback, used only when no live curated tension).
 * Deterministic total order: delta_type rank → topic priority → confidence → contentIdentity.
 *
 * W2 (2026-08-20) — eligibility branches by pairing_kind:
 *  • internal_vs_public: only declared-direction topics qualify (the founding claims speak to
 *    the declared direction); none qualify → null.
 *  • public_vs_public: the declared side is a client-voice PUBLIC claim (operational topics —
 *    market / channel / web), so the topic allowlist does NOT apply. A say-vs-see pointer needs
 *    BOTH sides, so only divergent (contradicted) and echoed (confirmed) qualify — divergent
 *    first (sharpest evidence). Zero pairs → null (no pointer).
 */
export function selectSayVsSeeDefault(
  candidates: SayVsSeeCandidate[],
  pairingKind: FeaturedPairingKind = "internal_vs_public",
): string | null {
  const eligible = pairingKind === "public_vs_public"
    ? candidates.filter((c) => c.deltaType === "divergent" || c.deltaType === "echoed")
    : candidates.filter((c) => c.declaredTopic && DECLARED_DIRECTION_TOPICS.has(c.declaredTopic));
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => {
    const dt = (DELTA_TYPE_RANK[a.deltaType] ?? 9) - (DELTA_TYPE_RANK[b.deltaType] ?? 9);
    if (dt !== 0) return dt;
    const tp = (TOPIC_PRIORITY[a.declaredTopic ?? ""] ?? 9) - (TOPIC_PRIORITY[b.declaredTopic ?? ""] ?? 9);
    if (tp !== 0) return tp;
    const cf = (CONFIDENCE_RANK[a.declaredConfidence ?? ""] ?? 9) - (CONFIDENCE_RANK[b.declaredConfidence ?? ""] ?? 9);
    if (cf !== 0) return cf;
    return a.contentIdentity < b.contentIdentity ? -1 : a.contentIdentity > b.contentIdentity ? 1 : 0; // stable
  });
  return sorted[0].contentIdentity;
}

export interface FindingCandidate {
  identity: string;   // contentIdentity(finding.body) — matches the Check item key
  kind: string;       // 'frontier' | 'observation' | …
  createdAtMs: number; // finding.created_at as epoch ms (for the recency fallback)
}

/**
 * Pick the default finding (theme 3). The frontier finding — the single designated
 * "company-specific bet to name" — wins when present ("the one that matters most"). Otherwise the
 * most-recent finding (a NEUTRAL fallback, no salience claim). Ties broken by identity for stability.
 * Returns { identity, isFrontier } or null when there are no findings.
 */
export function selectFindingDefault(candidates: FindingCandidate[]): { identity: string; isFrontier: boolean } | null {
  if (candidates.length === 0) return null;
  const frontier = candidates
    .filter((c) => c.kind === "frontier")
    .sort((a, b) => (a.identity < b.identity ? -1 : 1));
  if (frontier.length > 0) return { identity: frontier[0].identity, isFrontier: true };
  const byRecency = [...candidates].sort((a, b) =>
    b.createdAtMs - a.createdAtMs || (a.identity < b.identity ? -1 : 1),
  );
  return { identity: byRecency[0].identity, isFrontier: false };
}
