export type GateScore = {
  label?: string;
  score?: number;
  components?: Record<string, number>;
};

export function parseGateScores(raw: unknown): Record<string, GateScore> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const per = obj.per_gate_scores;
  if (!per || typeof per !== "object") return null;
  return per as Record<string, GateScore>;
}

// Picks the gate key most relevant to improving confidence for this route category.
// Internal — not exported so gate key names never surface to callers.
function pickGateKey(category: string, gates: Record<string, GateScore>): string | null {
  if (category === "fix") {
    let lowestScore = Infinity;
    let key: string | null = null;
    for (const [k, g] of Object.entries(gates)) {
      const s = Number(g.score ?? 100);
      if (s < lowestScore) { lowestScore = s; key = k; }
    }
    return key;
  }
  if (category === "improve") {
    const ci = Number(gates.customer_insight?.score ?? 100);
    const sc = Number(gates.strategy_cascade?.score ?? 100);
    return ci <= sc ? "customer_insight" : "strategy_cascade";
  }
  return "gtm_execution";
}

// Client-safe labels — no internal gate key names exposed to the UI.
const CLIENT_FACTOR_LABELS: Record<string, string> = {
  customer_insight: "understanding customer needs",
  strategy_cascade: "strategic clarity",
  gtm_execution:    "go-to-market readiness",
  positioning:      "market positioning",
  evidence_quality: "evidence quality",
};

function clientFactorLabel(gateKey: string, gate: GateScore): string {
  return CLIENT_FACTOR_LABELS[gateKey] ?? gate.label ?? "strategic readiness";
}

// Admin version — exposes gate label and numeric score.
// Used by RouteInspectPanel's "What would move this" section.
export function gateInsight(
  category: string,
  gates: Record<string, GateScore>,
): { sentence: string; bullets: string[] } | null {
  const key = pickGateKey(category, gates);
  if (!key || !gates[key]) return null;
  const gate = gates[key];
  const label = gate.label || key.replace(/_/g, " ");
  const score = Math.round(Number(gate.score ?? 0));

  const bullets: string[] = [];
  if (gate.components) {
    const comps = gate.components;
    if (typeof comps.route_completeness === "number" && comps.route_completeness < 0.5) {
      bullets.push("Completing more steps in this route would improve this score.");
    }
    if (typeof comps.evidence_completeness === "number" && comps.evidence_completeness < 0.4) {
      bullets.push("Adding evidence would strengthen this score.");
    }
    if (bullets.length === 0) {
      bullets.push("Focus on the highest-impact steps to move this score.");
    }
  } else {
    bullets.push("Focus on the highest-impact steps to move this score.");
  }

  return { sentence: `Your ${label} score is currently ${score}/100.`, bullets };
}

// Client version — returns a plain-language factor name only, no score numbers.
// Used by ClientRouteInspectPanel's "What would move this" section.
export function clientGateInsight(
  category: string,
  areaScoresJson: unknown,
): string | null {
  const gates = parseGateScores(areaScoresJson);
  if (!gates) return null;
  const key = pickGateKey(category, gates);
  if (!key || !gates[key]) return null;
  return clientFactorLabel(key, gates[key]);
}
