import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import { resolveRefineNarrativePhase } from "@/lib/refinePreviewPhaseOrchestration";

export type RouteOrientationRead = {
  /** One-sentence current strategic interpretation. */
  whatAppearsTrue: string;
  /** Strongest supporting signal — null when no concrete line is available. */
  strongestSignal: string | null;
  /** Most important gap, tension, or uncertainty. */
  whatRemains: string;
  /** What the organization is currently trying to prove — null when not determinable. */
  validating: string | null;
  /** Condition that would most change the current read. */
  whatCouldChange: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GENERIC_MARKERS = [
  "further evidence",
  "must confirm",
  "must eventually confirm",
  "must eventually",
  "still being",
  "still needs proof",
  "still waiting",
  "not yet validated",
];

function isGeneric(text: string): boolean {
  if (!text || text.length < 18) return true;
  const lower = text.toLowerCase();
  return GENERIC_MARKERS.some((marker) => lower.includes(marker));
}

function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function capitalize(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function bestHypothesis(
  rows: HypothesisProvenanceCard[],
  preferState?: string,
): HypothesisProvenanceCard | null {
  const active = rows.filter(
    (r) =>
      r.hypothesis.is_active &&
      r.hypothesis.hypothesis_state !== "contradicted" &&
      r.hypothesis.hypothesis_state !== "retired",
  );
  if (active.length === 0) return null;

  if (preferState) {
    const preferred = active.filter(
      (r) => r.hypothesis.hypothesis_state === preferState,
    );
    if (preferred.length > 0) return preferred[0];
  }

  return active.sort(
    (a, b) => b.supportingClaims.length - a.supportingClaims.length,
  )[0];
}

function weakeningHypothesis(
  rows: HypothesisProvenanceCard[],
): HypothesisProvenanceCard | null {
  return (
    rows
      .filter(
        (r) =>
          r.hypothesis.is_active &&
          (r.weakeningClaims.length > 0 ||
            r.hypothesis.hypothesis_state === "unstable" ||
            r.hypothesis.hypothesis_state === "contradicted"),
      )
      .sort((a, b) => b.weakeningClaims.length - a.weakeningClaims.length)[0] ??
    null
  );
}

function supportShapeLabel(shape: {
  outside: number;
  organization: number;
  customer: number;
}): string | null {
  const has = {
    outside: shape.outside > 0,
    org: shape.organization > 0,
    customer: shape.customer > 0,
  };
  const bands = [has.outside, has.org, has.customer].filter(Boolean).length;
  if (bands === 0) return null;
  if (has.customer && has.outside && has.org)
    return "Customer, outside, and organizational signals all point in this direction.";
  if (has.customer && has.outside)
    return "Customer and outside signals are converging on this direction.";
  if (has.customer && has.org)
    return "Customer evidence and internal signals support this direction.";
  if (has.customer)
    return "Direct customer evidence currently supports this direction.";
  if (has.outside && has.org)
    return "Outside and internal signals align on this — customer proof is still missing.";
  if (has.outside)
    return "Outside signals are pointing here, but customer and internal proof are still thin.";
  if (has.org)
    return "Internal signals support this — customer and outside validation are still needed.";
  return null;
}

// ─── Phase fallbacks ──────────────────────────────────────────────────────────

function phaseFallbacks(phase: string): RouteOrientationRead {
  const narrativePhase = resolveRefineNarrativePhase(phase);
  if (narrativePhase === "pre_diagnosis") {
    return {
      whatAppearsTrue:
        "Outside signals have been pointing toward a direction, but it has not yet been grounded in customer or internal evidence.",
      strongestSignal: null,
      whatRemains: "Customer evidence has not yet emerged — the direction has remained provisional.",
      validating: null,
      whatCouldChange:
        "If direct customer evidence surfaces, it would either confirm or redirect what has formed so far.",
    };
  }
  if (narrativePhase === "diagnose") {
    return {
      whatAppearsTrue:
        "The evidence has been forming a direction, but key assumptions have not yet been tested against direct proof.",
      strongestSignal: null,
      whatRemains: "Several assumptions have remained untested as this direction develops.",
      validating: null,
      whatCouldChange:
        "If customer research or new organizational evidence surfaces, the read that has been building could shift substantially.",
    };
  }
  if (narrativePhase === "focus") {
    return {
      whatAppearsTrue:
        "A clearest path has been emerging from the evidence, but competing interpretations have not yet resolved.",
      strongestSignal: null,
      whatRemains:
        "The lead read has not yet earned full commitment — key proof gaps have persisted.",
      validating: null,
      whatCouldChange: "If the lead signal continues to weaken, the comparison will need to reopen.",
    };
  }
  return {
    whatAppearsTrue:
      "The active direction has been tested through execution — signals continue to arrive.",
    strongestSignal: null,
    whatRemains: "Some tensions and assumptions have persisted unresolved through this learning phase.",
    validating: null,
    whatCouldChange:
      "If the lead route continues to lose confidence, an alternative will need to step forward.",
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildRouteOrientationRead(args: {
  phase: string;
  leadRationale: RouteRationale | null;
  allRationales: RouteRationale[];
  hypothesisRows: HypothesisProvenanceCard[];
  topNeedOutcome?: string | null;
}): RouteOrientationRead {
  const { phase, leadRationale, allRationales, hypothesisRows, topNeedOutcome } = args;
  const narrativePhase = resolveRefineNarrativePhase(phase);
  const fallback = phaseFallbacks(phase);

  // ── 1. whatAppearsTrue ────────────────────────────────────────────────────

  let whatAppearsTrue = fallback.whatAppearsTrue;

  if (leadRationale) {
    const candidate =
      narrativePhase === "focus" || narrativePhase === "flow"
        ? leadRationale.whatSupportsIt || leadRationale.whyThisRouteExists
        : leadRationale.whyThisRouteExists || leadRationale.whatSupportsIt;

    if (candidate && !isGeneric(candidate)) {
      whatAppearsTrue = capitalize(truncate(candidate, 200));
    } else {
      const hyp = bestHypothesis(hypothesisRows, "strengthened");
      if (hyp && !isGeneric(hyp.hypothesis.statement)) {
        whatAppearsTrue = capitalize(truncate(hyp.hypothesis.statement, 200));
      }
    }
  } else {
    const hyp = bestHypothesis(hypothesisRows);
    if (hyp && !isGeneric(hyp.hypothesis.statement)) {
      whatAppearsTrue = capitalize(truncate(hyp.hypothesis.statement, 200));
    }
  }

  // In Flow, movement signal overrides static description when the commitment is destabilizing
  if (narrativePhase === "flow" && leadRationale?.movement === "weaken") {
    whatAppearsTrue =
      "The committed direction has been under pressure — the signal that drove this commitment has continued to weaken.";
  }

  // ── 2. strongestSignal ────────────────────────────────────────────────────

  let strongestSignal: string | null = null;

  if (leadRationale) {
    const evidenceLine = leadRationale.supportingEvidenceLines.find(
      (line) => !isGeneric(line) && line.length > 20,
    );
    if (evidenceLine) {
      strongestSignal = capitalize(truncate(evidenceLine, 160));
    } else {
      strongestSignal = supportShapeLabel(leadRationale.supportShape);
    }
  }

  // ── 3. whatRemains ────────────────────────────────────────────────────────

  let whatRemains = fallback.whatRemains;

  if (leadRationale) {
    const uncertainty = leadRationale.uncertainty;
    if (uncertainty && !isGeneric(uncertainty)) {
      whatRemains = capitalize(truncate(uncertainty, 200));
    } else {
      const weak = weakeningHypothesis(hypothesisRows);
      if (weak && !isGeneric(weak.hypothesis.statement)) {
        whatRemains = capitalize(
          truncate(
            `${weak.hypothesis.statement} — this has continued to be contested by accumulating evidence.`,
            200,
          ),
        );
      } else {
        const mustBecomeTrue = leadRationale.mustBecomeTrue;
        if (mustBecomeTrue && !isGeneric(mustBecomeTrue)) {
          whatRemains = capitalize(truncate(mustBecomeTrue, 200));
        }
      }
    }
  } else {
    const weak = weakeningHypothesis(hypothesisRows);
    if (weak && !isGeneric(weak.hypothesis.statement)) {
      whatRemains = capitalize(truncate(weak.hypothesis.statement, 200));
    }
  }

  // ── 4. validating ─────────────────────────────────────────────────────────

  let validating: string | null = null;

  // Prefer an open/emerging hypothesis — something actively being tested
  const openHyp = hypothesisRows.find(
    (r) =>
      r.hypothesis.is_active &&
      (r.hypothesis.hypothesis_state === "inferred" ||
        r.hypothesis.hypothesis_state === "emerging") &&
      !isGeneric(r.hypothesis.statement),
  );

  if (openHyp) {
    validating = capitalize(truncate(openHyp.hypothesis.statement, 200));
  } else if (
    leadRationale?.mustBecomeTrue &&
    !isGeneric(leadRationale.mustBecomeTrue) &&
    leadRationale.mustBecomeTrue !== whatRemains
  ) {
    validating = capitalize(truncate(leadRationale.mustBecomeTrue, 200));
  } else if (topNeedOutcome && !isGeneric(topNeedOutcome)) {
    validating = capitalize(truncate(topNeedOutcome, 200));
  }

  // ── 5. whatCouldChange ────────────────────────────────────────────────────

  let whatCouldChange = fallback.whatCouldChange;

  if (leadRationale?.couldWeaken && !isGeneric(leadRationale.couldWeaken)) {
    whatCouldChange = capitalize(truncate(leadRationale.couldWeaken, 200));
  } else {
    // Check for weakening hypothesis
    const weak = weakeningHypothesis(hypothesisRows);
    if (weak && !isGeneric(weak.hypothesis.statement)) {
      whatCouldChange = capitalize(
        truncate(
          `If ${weak.hypothesis.statement.toLowerCase()} continues to resolve in the wrong direction, this read will need to shift.`,
          200,
        ),
      );
    } else {
      // Check for weakening route
      const weakeningRoute = allRationales.find(
        (r) => r.movement === "weaken" || r.confidenceLabel === "Contradicted by recent evidence",
      );
      if (weakeningRoute) {
        whatCouldChange = `A weakening signal has already been building — if it reaches the lead direction, the read will need to shift.`;
      }
    }
  }

  return { whatAppearsTrue, strongestSignal, whatRemains, validating, whatCouldChange };
}

// ─── Commitment legitimacy ─────────────────────────────────────────────────────

export function deriveCommitmentLegitimacy(
  rationale: RouteRationale | null,
  isSelected: boolean,
  phase: string,
): string | null {
  if (!isSelected || !rationale) return null;
  const narrativePhase = resolveRefineNarrativePhase(phase);
  if (narrativePhase !== "flow") return null;

  if (rationale.movement === "weaken") {
    return "The committed direction has been under pressure — evidence that once supported it has continued to pull away.";
  }

  if (rationale.whatSupportsIt && !isGeneric(rationale.whatSupportsIt)) {
    return capitalize(truncate(rationale.whatSupportsIt, 200));
  }

  const evidenceLine = rationale.supportingEvidenceLines.find(
    (line) => !isGeneric(line) && line.length > 20,
  );
  if (evidenceLine) {
    return capitalize(truncate(evidenceLine, 180));
  }

  const shapeLabel = supportShapeLabel(rationale.supportShape);
  if (shapeLabel) return shapeLabel;

  if (rationale.movement === "strengthen") {
    return "Evidence has been converging here — the signals that drove this commitment continue to strengthen.";
  }

  return "The accumulated evidence continues to make this the most defensible direction available.";
}
