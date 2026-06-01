import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import { inferIdentityNarrative } from "@/lib/identityNarrative";
import type { RouteRationale, RouteRationaleEvidenceItem } from "@/lib/routeRationale";
import { authorityWeightedSupportShape, normalizeAuthorityPhase, resolveSignalConflict } from "@/lib/signalAuthority";
import { inferStrategicCenter } from "@/lib/strategicCenter";
import type { RouteAssumption, RouteRow } from "@/views/Routes/useRoutes";

export type ConfidenceLandscapeState =
  | "Early signal"
  | "Direction forming"
  | "Building support"
  | "Strong enough to act on";

export type ConfidenceLandscapeDomain = {
  key:
    | "market_understanding"
    | "customer_proof"
    | "strategic_alignment"
    | "route_confidence"
    | "execution_readiness";
  title: string;
  state: ConfidenceLandscapeState;
  narrative: string;
  whatIncreasesConfidence: string;
  whatStillWeakensConfidence: string;
};

export type ConfidenceLandscapeRouteSeed = {
  route: RouteRow;
  evidence: RouteRationaleEvidenceItem[];
  assumptions: RouteAssumption[];
};

export const CONFIDENCE_STATE_ORDER: Record<ConfidenceLandscapeState, number> = {
  "Early signal": 0,
  "Direction forming": 1,
  "Building support": 2,
  "Strong enough to act on": 3,
};

const SUMMARY_PRIORITY: Record<ConfidenceLandscapeDomain["key"], number> = {
  customer_proof: 0,
  execution_readiness: 1,
  strategic_alignment: 2,
  route_confidence: 3,
  market_understanding: 4,
};

function supportShape(row: HypothesisProvenanceCard) {
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

function aggregateSourceMix(rows: HypothesisProvenanceCard[]) {
  return rows.reduce(
    (acc, row) => {
      const shape = supportShape(row);
      acc.outside += shape.outside;
      acc.organization += shape.organization;
      acc.customer += shape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function authorityAggregateSourceMix(rows: HypothesisProvenanceCard[], phase: string) {
  return rows.reduce(
    (acc, row) => {
      const weighted = authorityWeightedSupportShape(supportShape(row), phase);
      acc.outside += weighted.outside;
      acc.organization += weighted.organization;
      acc.customer += weighted.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function bandCount(shape: { outside: number; organization: number; customer: number }) {
  return [shape.outside > 0, shape.organization > 0, shape.customer > 0].filter(Boolean).length;
}

function countCustomerBacked(rows: HypothesisProvenanceCard[]) {
  return rows.filter((row) => supportShape(row).customer > 0).length;
}

function contradictionCount(rows: HypothesisProvenanceCard[]) {
  return rows.filter((row) => row.weakeningClaims.length > 0 || row.hypothesis.hypothesis_state === "contradicted").length;
}

function criticalAssumptionStats(seeds: ConfidenceLandscapeRouteSeed[]) {
  const assumptions = seeds.flatMap((seed) => seed.assumptions);
  const critical = assumptions.filter((assumption) => assumption.critical && assumption.status !== "supported");
  return {
    total: critical.length,
    unproven: critical.filter((assumption) => assumption.status === "unproven").length,
    partial: critical.filter((assumption) => assumption.status === "partial").length,
  };
}

function missingEvidenceCount(seeds: ConfidenceLandscapeRouteSeed[]) {
  return seeds.reduce((sum, seed) => sum + seed.evidence.filter((item) => item.status === "missing").length, 0);
}

function nonFreshRouteCount(seeds: ConfidenceLandscapeRouteSeed[]) {
  return seeds.filter((seed) => {
    const state = String(seed.route.dependency_state || "").toLowerCase();
    return state !== "" && state !== "fresh";
  }).length;
}

function routeCounts(routeRationales: RouteRationale[]) {
  return routeRationales.reduce(
    (acc, rationale) => {
      acc[rationale.readiness] += 1;
      acc[rationale.movement] += 1;
      if (rationale.supportShape.customer > 0) acc.customerBacked += 1;
      if (rationale.linkSource === "graph_linked") acc.graphLinked += 1;
      return acc;
    },
    {
      Investigate: 0,
      Validate: 0,
      Commit: 0,
      Hold: 0,
      strengthen: 0,
      weaken: 0,
      narrow: 0,
      split: 0,
      remain_unresolved: 0,
      customerBacked: 0,
      graphLinked: 0,
    },
  );
}

function marketUnderstanding(args: {
  activeRows: HypothesisProvenanceCard[];
  tensions: number;
  contradictions: number;
  phase: string;
}) : ConfidenceLandscapeDomain {
  const sourceMix = authorityAggregateSourceMix(args.activeRows, args.phase);
  const repeatedOutsidePatterns = sourceMix.outside;
  const mixedSupport = args.activeRows.filter((row) => bandCount(supportShape(row)) >= 2).length;

  let state: ConfidenceLandscapeState = "Early signal";
  if (repeatedOutsidePatterns >= 4 && args.contradictions === 0 && args.tensions <= 1 && mixedSupport >= 2) {
    state = "Strong enough to act on";
  } else if (repeatedOutsidePatterns >= 3 && mixedSupport >= 1 && args.contradictions <= 1) {
    state = "Building support";
  } else if (repeatedOutsidePatterns >= 1) {
    state = "Direction forming";
  }

  const narrative =
    state === "Strong enough to act on"
      ? "Outside patterns are repeating enough to guide where to focus next, even though they should still be tested."
      : state === "Building support"
        ? "We have enough outside signal to form a first read, and several external patterns are repeating."
        : state === "Direction forming"
          ? "We have enough outside signal to form a first read, but not enough to treat it as settled."
          : "The outside picture is still thin. We do not yet have enough repeated signal to trust the pattern.";

  const whatIncreasesConfidence =
    "More repeated outside patterns across competitor behavior, buyer language, or switching behavior.";

  const whatStillWeakensConfidence =
    args.contradictions > 0 || args.tensions > 0
      ? "Conflicting outside signals still leave open whether this pattern is real or just early noise."
      : "The outside read still depends on too few repeated patterns.";

  return {
    key: "market_understanding",
    title: "Market Understanding",
    state,
    narrative,
    whatIncreasesConfidence,
    whatStillWeakensConfidence,
  };
}

function customerProof(args: {
  activeRows: HypothesisProvenanceCard[];
  routeRationales: RouteRationale[];
}) : ConfidenceLandscapeDomain {
  const customerBackedHypotheses = countCustomerBacked(args.activeRows);
  const routes = routeCounts(args.routeRationales);

  let state: ConfidenceLandscapeState = "Early signal";
  if ((customerBackedHypotheses >= 2 && routes.Commit >= 1) || routes.customerBacked >= 2) {
    state = "Strong enough to act on";
  } else if (customerBackedHypotheses >= 2 || routes.Commit >= 1 || routes.customerBacked >= 1) {
    state = "Building support";
  } else if (customerBackedHypotheses >= 1) {
    state = "Direction forming";
  }

  const narrative =
    state === "Strong enough to act on"
      ? "Customer evidence is starting to confirm that this affects real decisions."
      : state === "Building support"
        ? "We have some customer confirmation, but not enough yet to treat the direction as proven."
        : state === "Direction forming"
          ? "We have early customer signal, but it is still too thin to know whether this changes real choices."
          : "We have not yet heard directly from enough customers to know whether this matters in real decisions.";

  return {
    key: "customer_proof",
    title: "Customer Proof",
    state,
    narrative,
    whatIncreasesConfidence: "More direct customer evidence tied to trust, switching, buying, or repeat behavior.",
    whatStillWeakensConfidence:
      customerBackedHypotheses === 0
        ? "The strongest hypotheses still need direct customer confirmation or challenge."
        : "We have some customer proof, but not enough breadth yet to remove the remaining uncertainty.",
  };
}

function strategicAlignment(args: {
  activeRows: HypothesisProvenanceCard[];
  changeSummary: StrategicChangeSummary | null;
  routeRationales: RouteRationale[];
  routeSeeds: ConfidenceLandscapeRouteSeed[];
  phase: string;
}) : ConfidenceLandscapeDomain {
  const tensions = args.activeRows.filter((row) => row.hypothesis.hypothesis_kind === "inferred_tension").length;
  const routes = routeCounts(args.routeRationales);
  const criticalAssumptions = criticalAssumptionStats(args.routeSeeds);
  const unresolvedReview = args.changeSummary?.affectedCounts.total ?? 0;
  const center = inferStrategicCenter({
    activeRows: args.activeRows,
    routeSeeds: args.routeSeeds,
    phase: args.phase,
  });
  const identityNarrative = inferIdentityNarrative({
    activeRows: args.activeRows,
    routeSeeds: args.routeSeeds,
    phase: args.phase,
    strategicCenter: center,
  });
  const conflict = resolveSignalConflict(args.activeRows, args.phase);
  const customerBacked = countCustomerBacked(args.activeRows);

  let state: ConfidenceLandscapeState = "Early signal";
  if (unresolvedReview > 0) {
    state = "Early signal";
  } else if (tensions === 0 && criticalAssumptions.total === 0 && routes.Commit >= 1) {
    state = "Strong enough to act on";
  } else if (tensions <= 1 && criticalAssumptions.unproven <= 1 && (routes.Validate + routes.Commit) >= 1) {
    state = "Building support";
  } else if (tensions <= 1 && criticalAssumptions.total <= 2) {
    state = "Direction forming";
  }

  if (center.hasMeaningfulDivergence && customerBacked === 0) {
    if (state === "Strong enough to act on") state = "Building support";
    else if (state === "Building support") state = "Direction forming";
  }

  const narrative =
    center.hasMeaningfulDivergence && center.label && (identityNarrative.publicIdentity || center.publicContextLabel)
      ? `The read is increasingly centered on ${center.label}, but publicly the company still reads as ${String(identityNarrative.publicIdentity || center.publicContextLabel).replace(/^([A-Z])/, (match) => match.toLowerCase())}.`
      : state === "Strong enough to act on"
        ? center.label
          ? `The direction is centering on ${center.label}. There's enough shared confidence to move — you don't need certainty to take the next step.`
          : "The team has enough shared confidence in the read to move without forcing certainty."
        : state === "Building support"
          ? center.label
            ? `The read is starting to center on ${center.label}, but it still needs team validation before it can become shared direction.`
            : "The read is starting to hold internally, but it still needs team validation before it can become a shared direction."
          : state === "Direction forming"
            ? center.label
              ? `The read is starting to lean toward ${center.label}, but it still needs team validation before it can become a shared direction.`
              : "The read still needs team validation before it can become a shared direction."
            : "The read still needs team validation before it can become a shared direction.";

  return {
    key: "strategic_alignment",
    title: "Strategic Alignment",
    state,
    narrative,
    whatIncreasesConfidence: "Resolve downstream reviews and turn critical assumptions into explicit validation questions.",
    whatStillWeakensConfidence:
      center.hasMeaningfulDivergence && center.label && (identityNarrative.publicIdentity || center.publicContextLabel)
        ? `Outside perception reads as ${String(identityNarrative.publicIdentity || center.publicContextLabel).replace(/^([A-Z])/, (match) => match.toLowerCase())}, while the strategic read is leaning toward ${center.label}. Customer proof is needed to settle that gap.`
        : unresolvedReview > 0
        ? "Some needs or routes still require review, so the shared direction could still change."
        : conflict.hasConflict && conflict.summary
          ? `${conflict.summary} The shared direction could still shift until that tension is resolved.`
          : "Open tensions and unproven assumptions can still pull the team toward different interpretations.",
  };
}

function routeConfidence(args: {
  routeRationales: RouteRationale[];
}) : ConfidenceLandscapeDomain {
  const routes = routeCounts(args.routeRationales);

  let state: ConfidenceLandscapeState = "Early signal";
  if (routes.Commit >= 1 && routes.Hold === 0) {
    state = "Strong enough to act on";
  } else if ((routes.Validate + routes.Commit) >= 1 && routes.weaken === 0) {
    state = "Building support";
  } else if (args.routeRationales.length > 0 && (routes.Validate >= 1 || routes.Investigate >= 1 || routes.graphLinked >= 1)) {
    state = "Direction forming";
  }

  const narrative =
    state === "Strong enough to act on"
      ? "At least one route has enough support to focus around, while still learning through execution."
      : state === "Building support"
        ? "At least one route is plausible, but it still needs proof before commitment."
        : state === "Direction forming"
          ? "A route is beginning to stand out, but it is still safer to validate than to choose."
          : "There are possible paths, but none is safe to treat as a lead route yet.";

  return {
    key: "route_confidence",
    title: "Route Confidence",
    state,
    narrative,
    whatIncreasesConfidence: "One route continuing to strengthen while customer proof and critical assumptions get answered.",
    whatStillWeakensConfidence:
      routes.Hold > 0 || routes.weaken > 0
        ? "Recent weakening signals still leave room for the route picture to change."
        : "The lead route still depends on missing proof or unresolved assumptions.",
  };
}

function executionReadiness(args: {
  changeSummary: StrategicChangeSummary | null;
  routeRationales: RouteRationale[];
  routeSeeds: ConfidenceLandscapeRouteSeed[];
}) : ConfidenceLandscapeDomain {
  const routes = routeCounts(args.routeRationales);
  const criticalAssumptions = criticalAssumptionStats(args.routeSeeds);
  const missingEvidence = missingEvidenceCount(args.routeSeeds);
  const nonFreshRoutes = nonFreshRouteCount(args.routeSeeds);
  const unresolvedNeeds = args.changeSummary?.affectedCounts.odi_needs ?? 0;

  let state: ConfidenceLandscapeState = "Early signal";
  if (unresolvedNeeds === 0 && nonFreshRoutes === 0 && criticalAssumptions.unproven === 0 && routes.Commit >= 1) {
    state = "Strong enough to act on";
  } else if (unresolvedNeeds === 0 && criticalAssumptions.total <= 1 && missingEvidence <= 2 && (routes.Validate + routes.Commit) >= 1) {
    state = "Building support";
  } else if (criticalAssumptions.total <= 2 && routes.Hold === 0) {
    state = "Direction forming";
  }

  const narrative =
    state === "Strong enough to act on"
      ? "The organization can act on the lead path without waiting on major missing proof or review items."
      : state === "Building support"
        ? "The work is getting closer to execution, but a few proof gaps still need to clear first."
        : state === "Direction forming"
          ? "The work is not ready to execute until the missing proof and review items are cleared."
          : "The work is not ready to execute until the missing proof and review items are cleared.";

  return {
    key: "execution_readiness",
    title: "Execution Readiness",
    state,
    narrative,
    whatIncreasesConfidence: "Clear the remaining review items and prove the critical assumptions that still gate action.",
    whatStillWeakensConfidence:
      unresolvedNeeds > 0 || nonFreshRoutes > 0
        ? "Some downstream needs or routes still need review before the work is safe to execute."
        : "Missing proof and open assumptions still block confident execution.",
  };
}

export function buildRefinePreviewConfidenceLandscape(args: {
  activeRows: HypothesisProvenanceCard[];
  allRows: HypothesisProvenanceCard[];
  changeSummary: StrategicChangeSummary | null;
  routeRationales: RouteRationale[];
  routeSeeds: ConfidenceLandscapeRouteSeed[];
  phase?: string;
}) {
  const activeRows = args.activeRows.filter((row) => row.hypothesis.is_active);
  const tensions = activeRows.filter((row) => row.hypothesis.hypothesis_kind === "inferred_tension").length;
  const contradictions = contradictionCount(activeRows);
  const phase = normalizeAuthorityPhase(args.phase || "diagnose");

  return [
    marketUnderstanding({ activeRows, tensions, contradictions, phase }),
    customerProof({ activeRows, routeRationales: args.routeRationales }),
    strategicAlignment({
      activeRows,
      changeSummary: args.changeSummary,
      routeRationales: args.routeRationales,
      routeSeeds: args.routeSeeds,
      phase,
    }),
    routeConfidence({ routeRationales: args.routeRationales }),
    executionReadiness({
      changeSummary: args.changeSummary,
      routeRationales: args.routeRationales,
      routeSeeds: args.routeSeeds,
    }),
  ];
}

export function selectConfidenceLandscapeHighlight(domains: ConfidenceLandscapeDomain[]) {
  if (domains.length === 0) return null;

  const domainMap = new Map(domains.map((domain) => [domain.key, domain]));
  const customerProof = domainMap.get("customer_proof") ?? null;

  const eligible = domains.filter((domain) => {
    if (domain.key !== "route_confidence") return true;

    const routeNarrative = domain.narrative.toLowerCase();
    const customerProofIsWeak = customerProof?.state === "Early signal";
    const routeStillPreCommit =
      domain.state === "Early signal" ||
      domain.state === "Direction forming" ||
      routeNarrative.includes("safer to validate than to choose") ||
      routeNarrative.includes("none is safe to treat as a lead route");

    if (customerProofIsWeak && routeStillPreCommit) return false;
    return true;
  });

  const pool = eligible.length > 0 ? eligible : domains;
  return [...pool].sort((left, right) => {
    const stateDelta = CONFIDENCE_STATE_ORDER[right.state] - CONFIDENCE_STATE_ORDER[left.state];
    if (stateDelta !== 0) return stateDelta;
    return SUMMARY_PRIORITY[left.key] - SUMMARY_PRIORITY[right.key];
  })[0] ?? null;
}
