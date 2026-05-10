import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { inferIdentityNarrative } from "@/lib/identityNarrative";
import type { RouteRationale } from "@/lib/routeRationale";
import { authorityWeightedSupportShape, detectStrategicThemes, hypothesisAuthorityScore, normalizeAuthorityPhase, resolveSignalConflict, strategicThemeLabel, type StrategicThemeKey } from "@/lib/signalAuthority";
import { inferStrategicCenter, type StrategicCenterRouteSeed } from "@/lib/strategicCenter";

export type ReconciliationStrength = "weak" | "emerging" | "strong";
export type ReconciliationMode = "divergent" | "lagging" | "aligned";

export type ReconciliationNarrative = {
  shouldRender: boolean;
  mode: ReconciliationMode;
  publicPerspective: string | null;
  strategicDirection: string | null;
  customerReality: string | null;
  alignmentSummary: string;
  unresolvedQuestion: string | null;
  reconciliationStrength: ReconciliationStrength;
};

type PerspectiveCandidate = {
  row: HypothesisProvenanceCard;
  score: number;
  themeKeys: StrategicThemeKey[];
  themeLabels: string[];
  statement: string;
};

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripPeriod(value: string) {
  return clean(value).replace(/[.?!]+$/g, "");
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function overlap<T>(left: T[], right: T[]) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function aggregateSupportShape(row: HypothesisProvenanceCard) {
  return row.supportingClaims.reduce(
    (acc, claim) => {
      acc.outside += claim.supportShape.outside;
      acc.organization += claim.supportShape.organization;
      acc.customer += claim.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function rowNarrativeText(row: HypothesisProvenanceCard) {
  return clean(
    [
      row.hypothesis.statement,
      ...row.supportingClaims.map((claim) => claim.claim.statement),
      ...row.weakeningClaims.map((claim) => claim.claim.statement),
    ].join(" "),
  );
}

function selectBandCandidate(
  rows: HypothesisProvenanceCard[],
  band: "outside" | "organization" | "customer",
  phase: string,
): PerspectiveCandidate | null {
  const ranked = rows
    .map((row) => {
      const weightedShape = authorityWeightedSupportShape(aggregateSupportShape(row), phase);
      const themeKeys = unique(detectStrategicThemes(rowNarrativeText(row)));
      return {
        row,
        bandScore: weightedShape[band],
        score: weightedShape[band] * 10 + hypothesisAuthorityScore(row, phase),
        themeKeys,
        themeLabels: themeKeys.map((key) => strategicThemeLabel(key)),
        statement: stripPeriod(row.hypothesis.statement),
      };
    })
    .filter((entry) => entry.bandScore > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0] ?? null;
}

function formatThemeLabels(labels: string[]) {
  const cleaned = unique(labels.map((label) => clean(label)).filter(Boolean));
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned[0]}, ${cleaned[1]}, and ${cleaned[2]}`;
}

function readinessRank(readiness: RouteRationale["readiness"]) {
  if (readiness === "Commit") return 4;
  if (readiness === "Validate") return 3;
  if (readiness === "Investigate") return 2;
  return 1;
}

function movementRank(movement: RouteRationale["movement"]) {
  if (movement === "weaken") return 5;
  if (movement === "split") return 4;
  if (movement === "strengthen") return 3;
  if (movement === "narrow") return 2;
  return 1;
}

function selectLeadRouteRationale(routeRationales: RouteRationale[], phase: string, leadRouteRationale?: RouteRationale | null) {
  if (leadRouteRationale) return leadRouteRationale;
  const authorityPhase = normalizeAuthorityPhase(phase);
  return [...routeRationales].sort((left, right) => {
    if (authorityPhase === "flow") {
      const movementDelta = movementRank(right.movement) - movementRank(left.movement);
      if (movementDelta !== 0) return movementDelta;
    }
    const readinessDelta = readinessRank(right.readiness) - readinessRank(left.readiness);
    if (readinessDelta !== 0) return readinessDelta;
    return right.relevanceScore - left.relevanceScore;
  })[0] ?? null;
}

function hasOrganizationPressure(rows: HypothesisProvenanceCard[]) {
  return rows.some((row) => {
    const shape = aggregateSupportShape(row);
    return shape.organization > 0 && (
      row.hypothesis.confidence === "medium" ||
      row.hypothesis.confidence === "high" ||
      row.hypothesis.hypothesis_kind === "candidate_assumption"
    );
  });
}

function describePublicPerspective(args: {
  publicIdentity: string | null;
  publicLabel: string | null;
  publicCandidate: PerspectiveCandidate | null;
}) {
  if (args.publicIdentity) return args.publicIdentity;

  const phrase = clean(args.publicLabel || formatThemeLabels(args.publicCandidate?.themeLabels ?? []));
  if (phrase) return `A company still publicly associated with ${phrase}`;

  if (args.publicCandidate?.statement) {
    return `A company still publicly read through ${lowerFirst(stripPeriod(args.publicCandidate.statement))}`;
  }

  return "A company whose public story is still too thin to read clearly";
}

function describeStrategicDirection(args: {
  phase: string;
  strategicIdentity: string | null;
  strategicLabel: string | null;
  leadRoute: RouteRationale | null;
}) {
  const authorityPhase = normalizeAuthorityPhase(args.phase);
  if (args.strategicIdentity) return args.strategicIdentity;

  const phrase = clean(args.strategicLabel);
  if (phrase) {
    if (authorityPhase === "pre_diagnosis") return `A company that may be shifting toward ${phrase}`;
    return `A company increasingly organized around ${phrase}`;
  }

  if (args.leadRoute?.routeTitle) {
    return `A direction currently expressed through ${lowerFirst(stripPeriod(args.leadRoute.routeTitle))}`;
  }

  return "A strategic direction that is still too early to describe cleanly";
}

function describeCustomerReality(args: {
  phase: string;
  customerCandidate: PerspectiveCandidate | null;
  customerLag: boolean;
  customerStrategicDivergence: boolean;
  leadRoute: RouteRationale | null;
}) {
  const authorityPhase = normalizeAuthorityPhase(args.phase);
  const phrase = formatThemeLabels(args.customerCandidate?.themeLabels ?? []);
  if (phrase) {
    if (authorityPhase === "flow" && args.leadRoute?.movement === "weaken") {
      return `Recent customer and execution signals are testing whether ${lowerFirst(phrase)} is actually being delivered.`;
    }
    return `Current customer evidence leans toward ${lowerFirst(phrase)}.`;
  }

  if (args.customerStrategicDivergence) {
    return "Customer evidence is beginning to point somewhere different from the current direction.";
  }

  if (args.customerLag) {
    if (authorityPhase === "focus") {
      return "Customer validation is still lagging the confidence of the current focus.";
    }
    if (authorityPhase === "flow") {
      return "We still do not have enough customer evidence to know whether execution is reinforcing or weakening the chosen direction.";
    }
    if (authorityPhase === "diagnose") {
      return "Customer validation is still lagging the confidence of the current read.";
    }
    return "We do not yet have enough customer evidence to know whether this matters in real decisions.";
  }

  return "Customer evidence is still too thin to settle this.";
}

function buildUnresolvedQuestion(args: {
  phase: string;
  publicLabel: string | null;
  publicDescriptor: string | null;
  strategicLabel: string | null;
  strategicDescriptor: string | null;
  hasCustomerLag: boolean;
  customerStrategicDivergence: boolean;
  leadRoute: RouteRationale | null;
}) {
  const authorityPhase = normalizeAuthorityPhase(args.phase);
  if (authorityPhase === "flow") {
    if (args.leadRoute?.movement === "weaken") {
      return "Whether recent learning is exposing a temporary execution problem or a deeper mismatch in direction.";
    }
    return "Whether recent execution is reinforcing the chosen direction or quietly pulling it off course.";
  }

  if (authorityPhase === "focus") {
    return "Whether the current focus is centered on something customers will actually reward.";
  }

  const publicChoice = clean(args.publicDescriptor || args.publicLabel);
  const strategicChoice = clean(args.strategicDescriptor || args.strategicLabel);
  if (publicChoice && strategicChoice && publicChoice !== strategicChoice) {
    return `Whether the company will be chosen more for ${publicChoice}, ${strategicChoice}, or both.`;
  }

  if (args.customerStrategicDivergence) {
    return "Whether the current direction reflects what customers actually reward, or only what the strategy expects them to value.";
  }

  if (args.hasCustomerLag) {
    return "Whether this changes customer or stakeholder decisions enough to justify stronger commitment.";
  }

  return "Which perspective is closest to what customers will actually reward.";
}

export function buildReconciliationNarrative(args: {
  activeRows: HypothesisProvenanceCard[];
  routeRationales?: RouteRationale[];
  routeSeeds?: StrategicCenterRouteSeed[];
  phase: string;
  leadRouteRationale?: RouteRationale | null;
}): ReconciliationNarrative | null {
  const activeRows = args.activeRows.filter((row) => row.hypothesis.is_active);
  if (activeRows.length === 0) return null;

  const authorityPhase = normalizeAuthorityPhase(args.phase);
  const conflict = resolveSignalConflict(activeRows, args.phase);
  const center = inferStrategicCenter({
    activeRows,
    routeSeeds: args.routeSeeds ?? [],
    phase: args.phase,
  });
  const publicCandidate = selectBandCandidate(activeRows, "outside", args.phase);
  const strategicCandidate = selectBandCandidate(activeRows, "organization", args.phase);
  const customerCandidate = selectBandCandidate(activeRows, "customer", args.phase);
  const leadRoute = selectLeadRouteRationale(args.routeRationales ?? [], args.phase, args.leadRouteRationale ?? null);
  const identities = inferIdentityNarrative({
    activeRows,
    routeSeeds: args.routeSeeds ?? [],
    phase: args.phase,
    strategicCenter: center,
  });

  const publicLabel = clean(center.publicContextLabel || conflict.outsideLabel || formatThemeLabels(publicCandidate?.themeLabels ?? [])) || null;
  const strategicLabel = clean(center.label || conflict.strategicLabel || formatThemeLabels(strategicCandidate?.themeLabels ?? [])) || null;
  const centerThemeKeys = center.supportingThemes.map((theme) => theme.key);

  const publicStrategicDivergence = Boolean(
    strategicLabel && publicLabel && publicLabel !== strategicLabel && (
      center.hasMeaningfulDivergence ||
      conflict.hasConflict ||
      !overlap(publicCandidate?.themeKeys ?? [], centerThemeKeys)
    ),
  );
  const customerStrategicDivergence = Boolean(
    customerCandidate && centerThemeKeys.length > 0 && !overlap(customerCandidate.themeKeys, centerThemeKeys),
  );
  const customerLag = Boolean(
    center.customerLag ||
    (!customerCandidate && strategicLabel && (
      hasOrganizationPressure(activeRows) ||
      leadRoute?.readiness === "Validate" ||
      leadRoute?.readiness === "Commit"
    )),
  );
  const strongAlignment = authorityPhase !== "pre_diagnosis" && Boolean(
    strategicLabel &&
    customerCandidate &&
    publicCandidate &&
    !publicStrategicDivergence &&
    !customerStrategicDivergence &&
    !customerLag &&
    overlap(publicCandidate.themeKeys, centerThemeKeys) &&
    overlap(customerCandidate.themeKeys, centerThemeKeys) &&
    leadRoute?.readiness !== "Hold"
  );

  if (!strongAlignment && !publicStrategicDivergence && !customerStrategicDivergence && !customerLag) {
    return null;
  }

  if (strongAlignment) {
    return {
      shouldRender: true,
      mode: "aligned",
      publicPerspective: null,
      strategicDirection: null,
      customerReality: null,
      alignmentSummary: "These perspectives are beginning to align.",
      unresolvedQuestion: null,
      reconciliationStrength: "strong",
    };
  }

  const publicPerspective = describePublicPerspective({
    publicIdentity: identities.publicIdentity,
    publicLabel,
    publicCandidate,
  });
  const strategicDirection = describeStrategicDirection({
    phase: args.phase,
    strategicIdentity: identities.strategicIdentity,
    strategicLabel,
    leadRoute,
  });
  const customerReality = describeCustomerReality({
    phase: args.phase,
    customerCandidate,
    customerLag,
    customerStrategicDivergence,
    leadRoute,
  });

  let alignmentSummary = "These perspectives are not fully aligned yet.";
  let mode: ReconciliationMode = "divergent";
  let reconciliationStrength: ReconciliationStrength = "emerging";

  if (customerLag && !publicStrategicDivergence && !customerStrategicDivergence) {
    alignmentSummary = "Customer validation is still lagging internal confidence.";
    mode = "lagging";
    reconciliationStrength = "weak";
  } else if (customerStrategicDivergence && !publicStrategicDivergence) {
    alignmentSummary = "Customer evidence is beginning to test the current direction.";
  } else if (publicStrategicDivergence && customerLag) {
    alignmentSummary = "These perspectives are not fully aligned yet, and customer validation has not resolved the gap.";
  } else if (authorityPhase === "flow" && leadRoute?.movement === "weaken") {
    alignmentSummary = "Recent signals are testing whether the chosen direction still holds.";
  }

  return {
    shouldRender: true,
    mode,
    publicPerspective,
    strategicDirection,
    customerReality,
    alignmentSummary,
    unresolvedQuestion: buildUnresolvedQuestion({
      phase: args.phase,
      publicLabel,
      publicDescriptor: identities.publicDescriptor,
      strategicLabel,
      strategicDescriptor: identities.strategicDescriptor,
      hasCustomerLag: customerLag,
      customerStrategicDivergence,
      leadRoute,
    }),
    reconciliationStrength,
  };
}
