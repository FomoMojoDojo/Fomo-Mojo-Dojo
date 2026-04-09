import {
  LOVABLE_DRIVER_IDS,
  type LovableDriver,
  type LovableDriverId,
  type PrioritySignal,
} from "@/components/client-view/decision-path/types";
import type {
  ClientActionStatus,
  ClientActionSummary,
  ClientConfidenceLevel,
  ClientConstraintSummary,
  ClientEvidenceSummary,
  ClientInputCoverageSummary,
  ClientOwnershipSummary,
} from "@/lib/clientViewModel";

export type DriverKey = LovableDriverId;
export type DecisionPathPhaseId = "outside" | "diagnosis" | "focus" | "execution";

export type DriverState = "Breaking" | "Weak" | "Stable" | "Strong";
export type PriorityStatus = "Not started" | "Active" | "Complete";
export type ConfidenceLevel = "Low" | "Medium" | "High";
export type AlignmentVote = "yes" | "not_quite" | "no";

type TeamBeliefEntry = {
  response?: unknown;
};

export type DecisionPathAdapterInput = {
  activeCompany?: {
    name?: string | null;
    website?: string | null;
    evidence_note?: string | null;
    mojo_score?: number | null;
    potential_score?: number | null;
  } | null;
  topActions: ClientActionSummary[];
  allActions: ClientActionSummary[];
  ownership: ClientOwnershipSummary;
  primaryConstraint: ClientConstraintSummary;
  evidence: ClientEvidenceSummary;
  inputCoverage: ClientInputCoverageSummary;
  teamBeliefs: TeamBeliefEntry[];
  currentUserBelief?: unknown;
  activeDriverId?: DriverKey;
  selectedPriorityId: string | null;
  recentlyCommittedActionId: string | null;
  actionConfidenceById: Record<string, ClientConfidenceLevel>;
  defaultActionConfidenceLevel: ClientConfidenceLevel;
  phase?: DecisionPathPhaseId;
  publicBaselineRun?: {
    result_json?: unknown;
    sources_json?: unknown;
  } | null;
  strategicProblems?: Array<{
    statement?: unknown;
    source?: unknown;
    status?: unknown;
  }>;
};

type DecisionPathHero = {
  score: number;
  statusLabel: string;
  scoreToneClass: "is-danger" | "is-warning" | "is-success";
  diagnosisLine: string;
  causeLine: string;
  impactLine: string;
  nextMoveLine: string;
  trajectory: {
    currentScore: number;
    nextScore: number;
    potentialScore: number;
    ownershipLift: number;
    executionLift: number;
  };
  agreement: {
    selectedBeliefValue: AlignmentVote;
    alignedCount: number;
    totalCount: number;
  };
  outsideSignalStateLine?: string;
  outsideSignalNoteLine?: string;
};

type DecisionPathInterpretation = {
  label: string;
  title: string;
  riskLine: string;
  mutedLine: string;
  fixLine: string;
};

type DecisionPathDrivers = {
  activeDriverId: DriverKey;
  weakestDriverId: DriverKey;
  list: LovableDriver[];
};

type DecisionPathConstraint = {
  driver: LovableDriver;
  selectedBeliefValue: AlignmentVote;
  alignedCount: number;
  totalCount: number;
  trust: {
    confidenceBasis: string;
    signalsCaptured: string;
    biggestRisk: string;
  };
};

type DecisionPathActionIntro = {
  title: string;
  supportLine: string;
};

type DecisionPathPriorities = {
  items: PrioritySignal[];
};

type DecisionPathPhase = {
  id: DecisionPathPhaseId;
  label: "Outside View" | "Diagnose" | "Focus" | "Flow";
  modeLine: string;
};

type OutsideSignalGroup = {
  source: "Customers" | "Company / Brand" | "Market";
  observations: string[];
};

type DecisionPathOutsideView = {
  confidenceLine: string;
  heroHeadline: string;
  heroWhyLine: string;
  heroBridgeLine: string;
  movement: {
    currentRead: string;
    bestAvailableUpside: string;
    ifLeadIsTrue: string;
  };
  clientLens: {
    hasClientProblem: boolean;
    whatWeHeard: string;
    whatWeHearYouSaying: string;
    whatOutsideViewSuggests: string;
    whatWeValidateTogether: string;
    validateQuestions: string[];
  };
  leadOpportunity: {
    title: string;
    whyLeading: string;
    outcomes: string[];
    nextMove: string;
  };
  rankedRoutes: Array<{
    rankLabel: "Most likely first" | "Still plausible" | "Keep in view";
    title: string;
    whyRelevant: string;
    whyLeading: string;
    confidenceLevel: "Stronger evidence" | "Building evidence" | "Early evidence";
    evidenceLevel: string;
    outcomes: string[];
    validate: string;
    isLeading: boolean;
  }>;
  alternateRoutes: Array<{
    title: string;
    reason: string;
  }>;
  diagnoseValidation: {
    confirm: string;
    weaken: string;
    shift: string;
  };
  confidenceFrame: string;
  supportSignals: string[];
  testsFirst: Array<{
    id: string;
    actionLine: string;
    outcomeLine: string;
  }>;
  strongestHypothesis: string;
  whyItMatters: string;
  implication: string;
  groups: OutsideSignalGroup[];
  hypothesesToTest: string[];
  unknowns: {
    observed: string[];
    inferred: string[];
    unknown: string[];
  };
  bridge: {
    whatThisMeans: string;
    nextStep: string;
    ctaLabel: string;
  };
};

type DecisionPathPhaseNarrative = {
  headline: string;
  supportLine: string;
  dominantLine: string;
  diagnose?: {
    rows: Array<{
      status: "Confirmed" | "Disproven" | "Unresolved";
      signal: string;
      assumption: string;
      evidence: string;
      truthStatus: string;
    }>;
  };
  focus?: {
    mattersMostNow: string;
    doFirst: string;
    keepVisible: string[];
  };
  flow?: {
    progressReview: string;
    signalShift: string;
    scoreMovement: string;
    adaptation: string;
  };
};

export type DecisionPathViewModel = {
  phase: DecisionPathPhase;
  hero: DecisionPathHero;
  interpretation: DecisionPathInterpretation;
  drivers: DecisionPathDrivers;
  constraint: DecisionPathConstraint;
  outsideView: DecisionPathOutsideView;
  phaseNarrative: DecisionPathPhaseNarrative;
  actionIntro: DecisionPathActionIntro;
  priorities: DecisionPathPriorities;
};

const DRIVER_ORDER: DriverKey[] = [...LOVABLE_DRIVER_IDS];

type ActionSignal = {
  action: ClientActionSummary;
  confidenceLevel: ConfidenceLevel;
  ownerPoints: number;
  statusPoints: number;
  confidencePoints: number;
  totalPoints: number;
};

type PhaseConstraintModel = {
  driverId: DriverKey;
  title: string;
  riskLine: string;
  detailLine: string;
  fixLine: string;
  withoutLine: string;
};

type AdapterStrategicProblem = {
  statement: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "open" | "reconciled";
};

type BaselineSignalBuckets = {
  customers: string[];
  employees: string[];
  market: string[];
  suggestions: string[];
  gaps: string[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromRatio(value: number) {
  return clampScore(value * 100);
}

function categoryRank(category: ClientActionSummary["category"]) {
  if (category === "Fix") return 0;
  if (category === "Improve") return 1;
  return 2;
}

function statusRank(status: ClientActionStatus) {
  if (status === "in_progress") return 0;
  if (status === "planned") return 1;
  if (status === "done") return 2;
  return 3;
}

function confidenceMultiplier(level: ConfidenceLevel) {
  if (level === "Low") return 0.7;
  if (level === "High") return 1.3;
  return 1.0;
}

function sortPriorities(actions: ClientActionSummary[]) {
  return [...(Array.isArray(actions) ? actions : [])]
    .filter(
      (action): action is ClientActionSummary =>
        !!action && typeof action.id === "string" && action.id.trim().length > 0,
    )
    .sort((a, b) => {
      const categoryDelta = categoryRank(a.category) - categoryRank(b.category);
      if (categoryDelta !== 0) return categoryDelta;
      const statusDelta = statusRank(a.status) - statusRank(b.status);
      if (statusDelta !== 0) return statusDelta;
      return b.score - a.score;
    })
    .slice(0, 3);
}

function dataBasisLabel(presentSources: number) {
  if (presentSources <= 1) return "Internal only";
  if (presentSources === 2) return "Partial";
  return "Strong";
}

function topPrioritySummary(action: ClientActionSummary, phase: DecisionPathPhaseId) {
  if (phase === "outside") return "This looks like the most important place to look harder first.";
  if (phase === "diagnosis") return "This is worth pressure-testing before anyone commits to it.";
  if (phase === "focus") return "This looks like the clearest move to put in the center right now.";
  if (action.category === "Fix") return "This could remove a blocker quickly.";
  if (action.category === "Improve") return "This could make progress feel more consistent week to week.";
  return "This could make the next decision easier to trust.";
}

function shortText(value: unknown, _maxLength = 96) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function normalizeCompare(value: unknown) {
  return shortText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function interpretClientProblem(statement: string) {
  const normalized = normalizeCompare(statement);
  if (!normalized) {
    return "There may be a gap between how much effort is going in and how much confidence is coming out.";
  }
  if (/(owner|ownership|accountab|execute|execution|moving|stuck)/.test(normalized)) {
    return "The work may be moving without one clear center of gravity.";
  }
  if (/(priority|priorities|focus|spread|too many|tradeoff|trade off)/.test(normalized)) {
    return "Energy may be spread across too many competing priorities.";
  }
  if (/(customer|market|position|message|proof|evidence|validate)/.test(normalized)) {
    return "The team may still be making important calls with thinner proof than it wants.";
  }
  if (/(growth|revenue|sales|pipeline|conversion)/.test(normalized)) {
    return "The pressure to grow may be outrunning clarity on what is actually working.";
  }
  return "The core issue may be less about effort and more about where to focus first.";
}

function hasWeakDefinitionSignal(lines: string[]) {
  const joined = normalizeCompare(lines.join(" "));
  return /(position|positioning|message|messaging|differentiat|jtbd|job to be done|icp|segment|who is it for|value promise|category)/.test(
    joined,
  );
}

function outcomeSetFromDriver(driver: PrioritySignal["impactedDriver"]) {
  if (driver === "Proof") {
    return [
      "Clearer proof before scaling.",
      "Stronger partner confidence in outcomes.",
      "Faster trust in early client conversations.",
    ];
  }
  if (driver === "Execution") {
    return [
      "More repeatable delivery across teams.",
      "Lower variance between promise and experience.",
      "Clearer evidence of system reliability.",
    ];
  }
  if (driver === "Risk Reduction") {
    return [
      "Lower operational risk as demand grows.",
      "Fewer avoidable delivery breakdowns.",
      "More predictable client outcomes.",
    ];
  }
  if (driver === "Decision") {
    return [
      "Clearer strategic direction before scaling.",
      "Better fit between positioning and delivery reality.",
      "Less dilution across competing bets.",
    ];
  }
  return [
    "Stronger partner confidence in consistent delivery.",
    "Faster movement on the highest-value route.",
    "Clearer signal on what scales reliably.",
  ];
}

function routeSpecificWhy(title: string, driver: PrioritySignal["impactedDriver"], isLeading: boolean) {
  const subject = routeSubject(title).toLowerCase();
  if (/(track|assess|measure|impact)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because the outside signal suggests the impact story is harder to see and trust than it should be."
      : "This is worth exploring if unclear impact is weakening confidence from the outside.";
  }
  if (/(eligibility|requirements)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because people may still struggle to understand who qualifies and what support is available."
      : "This is worth exploring if confusion about eligibility is slowing adoption or trust.";
  }
  if (/(find|access).*(support|resource|equipment)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because the outside signal suggests people still have to work too hard to find help quickly."
      : "This is worth exploring if access friction is making the offer feel harder to use than it should.";
  }
  if (/(positioning|message|messaging|story)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because the public story looks more visible than the proof behind it."
      : "This is worth exploring if the story is clearer than the evidence underneath it.";
  }
  if (/(delivery|consistency|repeatable|handoff)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because outside signals suggest the experience may still feel more uneven than the promise."
      : "This is worth exploring if delivery still feels less consistent than it should.";
  }
  if (/(ownership|owner|accountability)/.test(title.toLowerCase())) {
    return isLeading
      ? "This is leading because the work may still depend on too much coordination and not enough clear ownership."
      : "This is worth exploring if unclear ownership is slowing weekly movement.";
  }

  if (driver === "Proof") {
    return isLeading
      ? "This looks strongest where the proof still feels thinner than the promise."
      : "There is enough here to take seriously, but it still needs to prove itself.";
  }
  if (driver === "Execution") {
    return isLeading
      ? "This looks strongest where the experience may still feel less consistent than it should."
      : "This is worth keeping in view if the experience still feels uneven from the outside.";
  }
  if (driver === "Decision") {
    return isLeading
      ? "This looks strongest where attention may still be spread too thin."
      : "This is worth exploring if the team is still trying to carry too many priorities at once.";
  }
  if (driver === "Risk Reduction") {
    return isLeading
      ? "This looks strongest where hidden friction could quietly undermine momentum."
      : "This is worth keeping in view if the risk is more structural than it first appears.";
  }
  return isLeading
    ? subject
      ? `This is leading because the clearest friction seems to sit around ${subject}.`
      : "This looks strongest where ownership and follow-through may still feel blurry."
    : "This is worth exploring if ownership is still slowing movement more than anyone wants to admit.";
}

function validateLineFromDriver(title: string, driver: PrioritySignal["impactedDriver"]) {
  const lower = title.toLowerCase();
  if (/(track|assess|measure|impact)/.test(lower)) {
    return "Test whether the impact of the program is actually visible, understandable, and credible from the outside.";
  }
  if (/(eligibility|requirements)/.test(lower)) {
    return "Test whether people can quickly understand eligibility without needing extra explanation.";
  }
  if (/(find|access).*(support|resource|equipment)/.test(lower)) {
    return "Test whether people can find the right support quickly through the current experience.";
  }
  if (/(positioning|message|messaging|story)/.test(lower)) {
    return "Test whether the public story matches what people can actually see and believe.";
  }
  if (/(delivery|consistency|repeatable|handoff)/.test(lower)) {
    return "Test whether the experience feels consistent enough to build trust without extra reassurance.";
  }
  if (driver === "Proof") {
    return "Look closely at whether people can point to clear, repeatable proof that this is working.";
  }
  if (driver === "Execution") {
    return "Look closely at whether the experience feels consistent across the people delivering it.";
  }
  if (driver === "Decision") {
    return "Look closely at whether the team is genuinely aligned on one first priority.";
  }
  if (driver === "Risk Reduction") {
    return "Look closely at whether this would actually reduce near-term risk instead of just shifting it.";
  }
  return "Look closely at whether one person can really carry this forward week after week.";
}

function routeSpecificOutcomes(title: string, driver: PrioritySignal["impactedDriver"]) {
  const lower = title.toLowerCase();
  if (/(track|assess|measure|impact)/.test(lower)) {
    return [
      "A clearer impact story people can understand and trust.",
      "Stronger confidence that the program is making a real difference.",
    ];
  }
  if (/(eligibility|requirements)/.test(lower)) {
    return [
      "Less confusion about who qualifies and what support is available.",
      "Faster movement from interest to action.",
    ];
  }
  if (/(find|access).*(support|resource|equipment)/.test(lower)) {
    return [
      "People can find help faster when they need it.",
      "The experience feels easier to navigate under pressure.",
    ];
  }
  if (/(positioning|message|messaging|story)/.test(lower)) {
    return [
      "A public story that is easier to believe because the proof is visible.",
      "Better fit between what is promised and what people can see.",
    ];
  }
  if (/(delivery|consistency|repeatable|handoff)/.test(lower)) {
    return [
      "A more consistent experience that strengthens trust.",
      "Less gap between what is promised and what people actually encounter.",
    ];
  }
  return outcomeSetFromDriver(driver).slice(0, 2);
}

function routeSignalLevel(score: number): "Stronger evidence" | "Building evidence" | "Early evidence" {
  if (score >= 68) return "Stronger evidence";
  if (score >= 48) return "Building evidence";
  return "Early evidence";
}

function driverKeyFromImpact(driver: PrioritySignal["impactedDriver"]): DriverKey {
  if (driver === "Ownership") return "ownership";
  if (driver === "Execution") return "execution";
  if (driver === "Risk Reduction") return "risk_reduction";
  if (driver === "Belief") return "belief";
  if (driver === "Proof") return "proof";
  return "decision";
}

function evidenceLineForRoute(args: {
  driver: PrioritySignal["impactedDriver"];
  groups: OutsideSignalGroup[];
  fallback: string[];
  siteLabel?: string;
}) {
  const groupBySource = (source: OutsideSignalGroup["source"]) =>
    args.groups.find((group) => group.source === source);

  const customer = groupBySource("Customers")?.observations[0]
    ? humanizeOutsideSignal({
        source: "Customers",
        observation: groupBySource("Customers")!.observations[0],
        siteLabel: args.siteLabel,
      })
    : "";
  const brand = groupBySource("Company / Brand")?.observations[0]
    ? humanizeOutsideSignal({
        source: "Company / Brand",
        observation: groupBySource("Company / Brand")!.observations[0],
        siteLabel: args.siteLabel,
      })
    : "";
  const market = groupBySource("Market")?.observations[0]
    ? humanizeOutsideSignal({
        source: "Market",
        observation: groupBySource("Market")!.observations[0],
        siteLabel: args.siteLabel,
      })
    : "";

  if (args.driver === "Proof") return customer || brand || market || args.fallback[0] || "External proof signal is still limited.";
  if (args.driver === "Execution") return brand || customer || market || args.fallback[0] || "Outside signal suggests delivery consistency risk.";
  if (args.driver === "Risk Reduction") return market || brand || customer || args.fallback[0] || "Outside signal suggests rising execution risk.";
  if (args.driver === "Decision") return market || customer || brand || args.fallback[0] || "Outside signal suggests focus is spread.";
  if (args.driver === "Belief") return customer || brand || market || args.fallback[0] || "Outside signal suggests mixed understanding of the core issue.";
  return brand || customer || market || args.fallback[0] || "Outside signal suggests accountability is still diffuse.";
}

function deHedgeLine(value: string) {
  return shortText(value, 180)
    .replace(/\bmay\b/gi, "")
    .replace(/\bmight\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function compactOutsideSignal(value: string) {
  const text = shortText(value, 160);
  if (!text) return "";
  const firstSentence = text.split(/[.!?;]\s/)[0]?.trim() || text;
  const words = firstSentence.split(/\s+/).filter(Boolean);
  if (words.length <= 14) return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
  return `${words.slice(0, 14).join(" ")}.`;
}

function isTechnicalOutsideSignal(value: string) {
  const text = String(value || "").toLowerCase();
  return (
    /ledger=|avg_conf|artifacts=|manual local alignment|apply\s*\(|run_id|not_found|requested function|json|payload|stage=/.test(
      text,
    ) ||
    /^https?:\/\//.test(text)
  );
}

function normalizeOutsideObservationText(value: string) {
  return String(value || "")
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sentenceCase(value: string) {
  const text = normalizeOutsideObservationText(value);
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ensurePeriod(value: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function humanizeOutsideSignal(args: {
  source: OutsideSignalGroup["source"];
  observation: string;
  siteLabel?: string;
}) {
  const raw = normalizeOutsideObservationText(args.observation);
  if (!raw || isTechnicalOutsideSignal(raw)) return "";

  const lower = raw.toLowerCase();

  if (args.source === "Customers") {
    if (lower.includes("customers are pointing toward")) {
      return ensurePeriod(sentenceCase(raw));
    }
    if (lower.includes("customer signal exists")) {
      return "People are pointing to a real need, but the case for it is still early.";
    }
    if (lower.includes("eligibility")) {
      return "Customers may still be unsure who qualifies or how to access support.";
    }
    if (lower.includes("find") || lower.includes("access")) {
      return "People may be having trouble finding the support or equipment they need quickly.";
    }
    return ensurePeriod(`From what people are saying, ${raw.charAt(0).toLowerCase() + raw.slice(1)}`);
  }

  if (args.source === "Company / Brand") {
    if (lower.includes("positioning is visible in public channels")) {
      return args.siteLabel
        ? `${args.siteLabel} has a visible public story, but the proof behind it is still thin.`
        : "The public story is visible, but the proof behind it is still thin.";
    }
    if (lower.includes("signal exists") || lower.includes("proof remains thin")) {
      return "The company story is visible from the outside, but it still needs stronger proof.";
    }
    return ensurePeriod(`From the outside, the story suggests ${raw.charAt(0).toLowerCase() + raw.slice(1)}`);
  }

  if (lower.includes("public positioning")) {
    return args.siteLabel
      ? `The market can see ${args.siteLabel}'s positioning, but the outcomes are not yet obvious.`
      : "The market can see the positioning, but the outcomes are not yet obvious.";
  }
  if (lower.includes("signal exists") || lower.includes("direction is still unclear")) {
    return "There is real movement in the market, but the direction is still not fully clear.";
  }
  return ensurePeriod(`From the market, it looks like ${raw.charAt(0).toLowerCase() + raw.slice(1)}`);
}

function cleanNarrativeSourceLine(value: unknown) {
  const text = normalizeOutsideObservationText(value)
    .replace(/["']:\s*$/g, "")
    .replace(/:\s*$/g, "")
    .trim();

  if (!text || isTechnicalOutsideSignal(text)) return "";
  return ensurePeriod(sentenceCase(text));
}

function routeSubject(value: string) {
  return normalizeOutsideObservationText(value)
    .replace(/\.$/, "")
    .replace(/^(enhance|improve)\s+how\s+/i, "")
    .replace(/^improve\s+how\s+clearly\s+and\s+accessibly\s+/i, "")
    .replace(/^increase\s+the\s+clarity\s+of\s+/i, "")
    .replace(/^clarify\s+/i, "")
    .replace(/^strengthen\s+/i, "")
    .replace(/^tighten\s+/i, "")
    .replace(/^build\s+/i, "")
    .replace(/^reduce\s+/i, "")
    .replace(/^raise\s+/i, "")
    .replace(/^restore\s+/i, "")
    .replace(/^create\s+/i, "")
    .replace(/^expand\s+/i, "")
    .trim();
}

function observationFromRouteTitle(
  title: string,
  driver: PrioritySignal["impactedDriver"],
) {
  const raw = normalizeOutsideObservationText(title).replace(/\.$/, "");
  const lower = raw.toLowerCase();

  if (!raw) {
    if (driver === "Proof") return "From the outside, the strongest pattern is a gap between promise and proof.";
    if (driver === "Execution") return "From the outside, the strongest pattern is uneven confidence in how the experience holds up.";
    if (driver === "Decision") return "From the outside, the strongest pattern is attention being spread too thin.";
    if (driver === "Risk Reduction") return "From the outside, the strongest pattern is hidden delivery risk.";
    return "From the outside, the strongest pattern is still taking shape.";
  }

  const communicationMatch = raw.match(
    /^increase the clarity of communication channels for (.+) to find (.+?) quickly$/i,
  );
  if (communicationMatch) {
    return ensurePeriod(
      `Communication channels may still make it harder for ${communicationMatch[1]} to find ${communicationMatch[2]} quickly`,
    );
  }

  const accessMatch = raw.match(/^improve how clearly and accessibly (.+?) understand (.+)$/i);
  if (accessMatch) {
    return ensurePeriod(
      `${sentenceCase(accessMatch[1])} may still have to work too hard to understand ${accessMatch[2]}`,
    );
  }

  if (/^(enhance|improve)\s+how\s+/i.test(lower)) {
    const subject = routeSubject(raw);
    return ensurePeriod(`${sentenceCase(subject)} may still be harder than it should be`);
  }

  if (/^clarify /i.test(lower)) {
    return ensurePeriod(`${sentenceCase(routeSubject(raw))} may still be unclear from the outside`);
  }

  if (/^strengthen /i.test(lower)) {
    return ensurePeriod(`${sentenceCase(routeSubject(raw))} may still need stronger visible proof`);
  }

  if (/^tighten /i.test(lower)) {
    return ensurePeriod(`${sentenceCase(routeSubject(raw))} may still be more uneven than it should be`);
  }

  return ensurePeriod(`${sentenceCase(routeSubject(raw) || raw)} still appears to be a meaningful friction point`);
}

function outsideReadFromRoute(
  title: string,
  driver: PrioritySignal["impactedDriver"],
) {
  const subject = routeSubject(title).toLowerCase();

  if (driver === "Proof") {
    return subject
      ? `From the outside, the clearest tension sits around ${subject}, where the proof still feels thinner than it should.`
      : "From the outside, the clearest tension is a gap between promise and proof.";
  }
  if (driver === "Execution") {
    return subject
      ? `From the outside, ${subject} still looks more uneven than it should.`
      : "From the outside, the experience still looks more uneven than it should.";
  }
  if (driver === "Decision") {
    return subject
      ? `From the outside, attention may still be spread across too many directions, especially around ${subject}.`
      : "From the outside, attention may still be spread across too many directions.";
  }
  if (driver === "Risk Reduction") {
    return subject
      ? `From the outside, ${subject} still carries more hidden risk than it should.`
      : "From the outside, the work still appears to carry more hidden risk than it should.";
  }
  if (driver === "Belief") {
    return subject
      ? `From the outside, people may not be holding the same understanding of ${subject}.`
      : "From the outside, people may not be holding the same understanding of the core issue.";
  }
  return subject
    ? `From the outside, ownership around ${subject} still looks blurrier than it should.`
    : "From the outside, ownership still looks blurrier than it should.";
}

function implicationFromDriver(driver: PrioritySignal["impactedDriver"]) {
  if (driver === "Proof") {
    return "If that pattern holds up, important decisions will keep moving faster than the proof behind them.";
  }
  if (driver === "Execution") {
    return "If that pattern holds up, the team can keep working hard without making the experience feel reliably trustable.";
  }
  if (driver === "Decision") {
    return "If that pattern holds up, effort will keep spreading across too many priorities to compound.";
  }
  if (driver === "Risk Reduction") {
    return "If that pattern holds up, growth will keep increasing fragility faster than confidence.";
  }
  if (driver === "Belief") {
    return "If that pattern holds up, alignment will keep sounding better in conversation than it feels in practice.";
  }
  return "If that pattern holds up, important work will keep moving without clear accountability.";
}

function testLineFromRoute(
  title: string,
  index: number,
  driver: PrioritySignal["impactedDriver"],
) {
  const openings = [
    "Start by checking whether",
    "Then test whether",
    "Also test whether",
  ] as const;
  const opening = openings[index] ?? "Test whether";
  const raw = normalizeOutsideObservationText(title).replace(/\.$/, "");

  if (!raw) {
    return driver === "Proof"
      ? `${opening} the current story is backed by proof people can actually see.`
      : driver === "Execution"
        ? `${opening} the experience is more consistent than it currently appears.`
        : `${opening} this is really the place that deserves attention first.`;
  }

  const communicationMatch = raw.match(
    /^increase the clarity of communication channels for (.+) to find (.+?) quickly$/i,
  );
  if (communicationMatch) {
    return `${opening} ${communicationMatch[1]} can find ${communicationMatch[2]} quickly through the current communication channels.`;
  }

  const accessMatch = raw.match(/^improve how clearly and accessibly (.+?) understand (.+)$/i);
  if (accessMatch) {
    return `${opening} ${accessMatch[1]} can understand ${accessMatch[2]} quickly without extra explanation.`;
  }

  if (/^(enhance|improve)\s+how\s+/i.test(raw)) {
    return `${opening} ${routeSubject(raw)} is actually easier and more consistent than it currently appears.`;
  }

  if (/^clarify /i.test(raw)) {
    return `${opening} the market can understand ${routeSubject(raw)} without extra context from the team.`;
  }

  if (/^strengthen /i.test(raw)) {
    return `${opening} ${routeSubject(raw)} is backed by evidence people can actually see and trust.`;
  }

  if (/^tighten /i.test(raw)) {
    return `${opening} ${routeSubject(raw)} is more consistent than the outside view suggests.`;
  }

    return `${opening} ${routeSubject(raw) || raw} is really the first thing that deserves closer attention.`;
}

function toQuotedSignal(value: unknown) {
  const text = shortText(value, 110);
  if (!text) return "";
  const clean = text.replace(/^"+|"+$/g, "");
  return `"${clean}"`;
}

function toHostLabel(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const normalized = raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringLines(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  const lines: string[] = [];
  for (const item of value) {
    if (lines.length >= limit) break;
    if (typeof item === "string") {
      const text = cleanNarrativeSourceLine(item);
      if (text) lines.push(text);
      continue;
    }
    const record = asRecord(item);
    if (!record) continue;
    const text =
      cleanNarrativeSourceLine(record.quote) ||
      cleanNarrativeSourceLine(record.signal) ||
      cleanNarrativeSourceLine(record.statement) ||
      cleanNarrativeSourceLine(record.summary) ||
      cleanNarrativeSourceLine(record.title) ||
      cleanNarrativeSourceLine(record.claim) ||
      "";
    if (text) lines.push(text);
  }
  return lines;
}

function normalizeBaselineSignals(
  run: DecisionPathAdapterInput["publicBaselineRun"],
): BaselineSignalBuckets {
  const result = asRecord(run?.result_json);
  if (!result) {
    return { customers: [], employees: [], market: [], suggestions: [], gaps: [] };
  }

  const outsideVoice = asStringLines(result.outside_voice_signals, 12);
  const hypotheses = asStringLines(result.top_hypotheses, 6);
  const openQuestions = asStringLines(result.open_questions, 6);
  const ledger = asStringLines(result.evidence_ledger, 8);

  const customers: string[] = [];
  const employees: string[] = [];
  const market: string[] = [];

  const pushBucket = (line: string) => {
    const normalized = line.toLowerCase();
    if (/(customer|client|buyer|user|account)/.test(normalized)) {
      customers.push(line);
      return;
    }
    if (/(team|employee|founder|internal|ops|operator)/.test(normalized)) {
      employees.push(line);
      return;
    }
    market.push(line);
  };

  outsideVoice.forEach(pushBucket);
  hypotheses.forEach(pushBucket);

  return {
    customers,
    employees,
    market,
    suggestions: hypotheses,
    gaps: [...openQuestions, ...ledger].slice(0, 8),
  };
}

function parseStrategicProblemSource(
  value: unknown,
): AdapterStrategicProblem["source"] {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "intake" ||
    normalized === "company" ||
    normalized === "public" ||
    normalized === "evidence"
  ) {
    return normalized;
  }
  return "client";
}

function parseStrategicProblemStatus(
  value: unknown,
): AdapterStrategicProblem["status"] {
  return String(value || "").trim().toLowerCase() === "reconciled"
    ? "reconciled"
    : "open";
}

function normalizeStrategicProblems(
  problems: DecisionPathAdapterInput["strategicProblems"],
): AdapterStrategicProblem[] {
  if (!Array.isArray(problems)) return [];
  return problems
    .map((problem) => {
      const statement = shortText(problem?.statement, 120);
      if (!statement) return null;
      return {
        statement,
        source: parseStrategicProblemSource(problem?.source),
        status: parseStrategicProblemStatus(problem?.status),
      } satisfies AdapterStrategicProblem;
    })
    .filter((problem): problem is AdapterStrategicProblem => Boolean(problem));
}

function normalizePhase(value: unknown): DecisionPathPhaseId {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "outside" || raw === "outside_view" || raw === "outside-view") return "outside";
  if (raw === "focus") return "focus";
  if (raw === "execution" || raw === "flow") return "execution";
  if (raw === "diagnosis" || raw === "diagnose") return "diagnosis";
  return "outside";
}

function phaseLabel(phase: DecisionPathPhaseId): "Outside View" | "Diagnose" | "Focus" | "Flow" {
  if (phase === "outside") return "Outside View";
  if (phase === "focus") return "Focus";
  if (phase === "execution") return "Flow";
  return "Diagnose";
}

function nextMoveFromState(args: {
  actions: ClientActionSummary[];
  weakestDriver: DriverKey;
  unownedCritical: number;
  customerCoverage: number;
  marketCoverage: number;
  activeCount: number;
}) {
  const unownedFix = args.actions.filter(
    (action) => action.category === "Fix" && !action.primaryOwner,
  );
  if (unownedFix.length > 0 || args.unownedCritical > 0) {
    return "Set one owner for each top Fix action.";
  }

  if (args.weakestDriver === "proof" || args.customerCoverage < 60) {
    return "Validate your top result with customers.";
  }

  if (args.weakestDriver === "decision" || args.marketCoverage < 60) {
    return "Choose one problem and commit this week.";
  }

  if (args.activeCount === 0) {
    return "Start Priority 1 this week.";
  }

  return "Finish Priority 1 before starting new work.";
}

export function getStatusLabelFromScore(score: number) {
  if (score < 40) return "Off Track";
  if (score < 65) return "At Risk";
  if (score < 80) return "Getting Traction";
  return "On Track";
}

export function getScoreToneClassFromScore(
  score: number,
): "is-danger" | "is-warning" | "is-success" {
  if (score < 45) return "is-danger";
  if (score < 70) return "is-warning";
  return "is-success";
}

export function getDriverStateFromScore(score: number): DriverState {
  if (score < 35) return "Breaking";
  if (score < 55) return "Weak";
  if (score < 75) return "Stable";
  return "Strong";
}

export function getWeakestDriver<T extends { score: number }>(drivers: T[]): T {
  return [...drivers].sort((a, b) => a.score - b.score)[0] ?? drivers[0];
}

export function mapPriorityStatus(status: ClientActionStatus): PriorityStatus {
  if (status === "in_progress") return "Active";
  if (status === "done") return "Complete";
  return "Not started";
}

export function mapConfidenceLevel(value: unknown): ConfidenceLevel {
  if (value === "High" || value === "Medium" || value === "Low") return value;
  return "Low";
}

export function mapAlignmentVote(value: unknown): AlignmentVote {
  if (value === "yes" || value === "not_quite" || value === "no") return value;
  return "yes";
}

export function mapPriorityImpactDriver(
  action: ClientActionSummary,
): PrioritySignal["impactedDriver"] {
  if (!action.primaryOwner && (action.category === "Fix" || action.category === "Improve")) {
    return "Ownership";
  }
  if (action.category === "Fix") return "Risk Reduction";
  if (action.category === "Improve") return "Execution";
  return "Proof";
}

export function toDecisionPathViewModel(
  input: DecisionPathAdapterInput,
): DecisionPathViewModel {
  const phase = normalizePhase(input.phase);
  const prioritizedActions = sortPriorities(
    input.allActions.length > 0 ? input.allActions : input.topActions,
  );

  const actionSignals: ActionSignal[] = prioritizedActions.map((action) => {
    const confidenceLevel = mapConfidenceLevel(
      input.actionConfidenceById[action.id] ?? input.defaultActionConfidenceLevel,
    );
    const ownerPoints = action.primaryOwner ? 10 : 0;
    const statusPoints =
      action.status === "in_progress" || action.status === "done" ? 10 : 0;
    const confidencePoints = confidenceLevel === "High" ? 10 : 0;
    return {
      action,
      confidenceLevel,
      ownerPoints,
      statusPoints,
      confidencePoints,
      totalPoints: ownerPoints + statusPoints + confidencePoints,
    };
  });

  const strategicProblems = normalizeStrategicProblems(input.strategicProblems);
  const openStrategicProblems = strategicProblems.filter(
    (problem) => problem.status === "open",
  );
  const baselineSignals = normalizeBaselineSignals(input.publicBaselineRun);
  const companyWebsite = shortText(input.activeCompany?.website, 120);
  const evidenceNote = shortText(input.activeCompany?.evidence_note, 120);

  const customerCoverage =
    input.inputCoverage.items.find((item) => item.key === "customerTruth")?.coverage ?? 0;
  const marketCoverage =
    input.inputCoverage.items.find((item) => item.key === "marketSignals")?.coverage ?? 0;
  const executionCoverage =
    input.inputCoverage.items.find((item) => item.key === "executionSignals")?.coverage ?? 0;
  const internalCoverage =
    input.inputCoverage.items.find((item) => item.key === "internalSignals")?.coverage ?? 0;
  const confidenceLevel = mapConfidenceLevel(input.inputCoverage.confidenceLevel);
  const multiplier = confidenceMultiplier(confidenceLevel);

  const criticalActions = prioritizedActions.filter(
    (action) => action.category === "Fix" || action.category === "Improve",
  );
  const totalCritical = Math.max(criticalActions.length, 1);
  const ownedCritical = criticalActions.filter((action) => Boolean(action.primaryOwner)).length;
  const activeCritical = criticalActions.filter(
    (action) => action.status === "in_progress" || action.status === "done",
  ).length;
  const doneCritical = criticalActions.filter((action) => action.status === "done").length;
  const activeCount = prioritizedActions.filter(
    (action) => action.status === "in_progress" || action.status === "done",
  ).length;
  const notActiveCount = prioritizedActions.filter(
    (item) => item.status === "planned" || item.status === "parked",
  ).length;
  const doneCount = prioritizedActions.filter((item) => item.status === "done").length;

  const beliefCounts = input.teamBeliefs.reduce(
    (counts, belief) => {
      const vote = mapAlignmentVote(belief.response);
      counts[vote] += 1;
      return counts;
    },
    { yes: 0, not_quite: 0, no: 0 },
  );
  const totalBeliefs = input.teamBeliefs.length || 1;
  const alignedCount = Math.max(beliefCounts.yes, beliefCounts.not_quite, beliefCounts.no);
  const selectedBeliefValue = mapAlignmentVote(input.currentUserBelief);

  const beliefScore = (() => {
    const responseCount = input.teamBeliefs.length;
    const spread = [beliefCounts.yes, beliefCounts.not_quite, beliefCounts.no].filter(
      (value) => value > 0,
    ).length;
    const base = spread > 1 ? 42 : responseCount > 1 ? 74 : 58;
    return clampScore(base + Math.min(10, responseCount * 2));
  })();

  const presentEvidenceSources = input.evidence.sources.filter((source) => source.present).length;
  const hasInternalEvidence = input.evidence.sources.some(
    (source) => source.label === "Internal data" && source.present,
  );
  const hasCustomerEvidence = input.evidence.sources.some(
    (source) => source.label === "Customer interviews" && source.present,
  );
  const hasMarketEvidence = input.evidence.sources.some(
    (source) => source.label === "Market signals" && source.present,
  );

  const proofScore = (() => {
    const sourceCoverage =
      input.evidence.sources.length > 0
        ? (input.evidence.sources.filter((source) => source.present).length /
            input.evidence.sources.length) *
          100
        : 0;
    return clampScore(
      Math.round(
        ((customerCoverage + marketCoverage + internalCoverage) / 3) * 0.7 +
          sourceCoverage * 0.3,
      ),
    );
  })();

  const decisionScore = (() => {
    let score = 68;
    if (!input.primaryConstraint.title) score -= 16;
    if (prioritizedActions.length === 0) score -= 20;
    if (beliefCounts.no > 0 && beliefCounts.yes > 0) score -= 15;
    return clampScore(score);
  })();

  const executionScore = clampScore(
    Math.round(
      ((ownedCritical / totalCritical) * 0.5 +
        (activeCritical / totalCritical) * 0.3 +
        (executionCoverage / 100) * 0.2) *
        100,
    ),
  );

  const ownershipScore = clampScore(input.ownership.ownershipStrength);
  const riskReductionScore = scoreFromRatio(
    ownedCritical / totalCritical * 0.35 +
      activeCritical / totalCritical * 0.35 +
      doneCritical / totalCritical * 0.3,
  );

  const proofMissing = input.evidence.sources.filter((source) => !source.present).length;
  const proofBasis = dataBasisLabel(presentEvidenceSources);

  const drivers: LovableDriver[] = [
    {
      id: "ownership",
      label: "Ownership",
      score: ownershipScore,
      state: getDriverStateFromScore(ownershipScore),
      problem:
        input.ownership.unownedCriticalActions > 0
          ? "No one owns the outcome."
          : "Critical work has clear owners.",
      explanation:
        input.ownership.unownedCriticalActions > 0
          ? "Work exists, but no one is driving it."
          : "Each priority has one clear owner.",
      consequence:
        input.ownership.unownedCriticalActions > 0
          ? "Work stalls and deadlines slip."
          : "Ownership is keeping work on pace.",
      unlockLine: "Clear ownership speeds up execution.",
      fixLine: "Set one owner for each priority.",
      withoutLine: "Everything drifts — milestones slip silently.",
    },
    {
      id: "execution",
      label: "Execution",
      score: executionScore,
      state: getDriverStateFromScore(executionScore),
      problem:
        activeCount === 0
          ? "Top work is not active yet."
          : "Execution started, but pace is uneven.",
      explanation:
        activeCount === 0
          ? "Priorities are set, but work has not started."
          : "Some work is active, but pace is uneven.",
      consequence: "Deadlines slip and priorities drift.",
      unlockLine: "Active work builds confidence quickly.",
      fixLine: "Start Priority 1 this week.",
      withoutLine: "Plans stay planned and outcomes do not move.",
    },
    {
      id: "risk_reduction",
      label: "Risk Reduction",
      score: riskReductionScore,
      state: getDriverStateFromScore(riskReductionScore),
      problem:
        doneCritical === 0
          ? "Key blockers are still open."
          : "Some blockers are closed, but risk is still high.",
      explanation: "High-risk work is still open in top priorities.",
      consequence: "Small issues become bigger delays.",
      unlockLine: "Closing one blocker protects delivery speed.",
      fixLine: "Close one high-risk blocker this sprint.",
      withoutLine: "Risk compounds and slows every next step.",
    },
    {
      id: "belief",
      label: "Belief",
      score: beliefScore,
      state: getDriverStateFromScore(beliefScore),
      problem:
        beliefCounts.yes === input.teamBeliefs.length && input.teamBeliefs.length > 1
          ? "The team agrees on the core problem."
          : "The team sees different core problems.",
      explanation:
        beliefCounts.yes === input.teamBeliefs.length && input.teamBeliefs.length > 1
          ? "People are aligned on the core problem."
          : "People are focused on different problems.",
      consequence: "Teams pull in different directions.",
      unlockLine: "Shared belief speeds up decisions.",
      fixLine: "Get agreement on one problem statement.",
      withoutLine: "Direction fragments and speed drops.",
    },
    {
      id: "proof",
      label: "Proof",
      score: proofScore,
      state: getDriverStateFromScore(proofScore),
      problem: proofMissing > 0 ? "Proof is still thin." : "Proof is in place.",
      explanation: `Evidence strength is ${proofBasis.toLowerCase()}.`,
      consequence: "Teams hesitate when results are unproven.",
      unlockLine: "Proof turns doubt into action.",
      fixLine: "Validate results with customer evidence this week.",
      withoutLine: "Trust stays low and decisions slow down.",
    },
    {
      id: "decision",
      label: "Decision",
      score: decisionScore,
      state: getDriverStateFromScore(decisionScore),
      problem: "The direction is not locked yet.",
      explanation: "Trade-offs are still open across priorities.",
      consequence: "Too many choices slow progress.",
      unlockLine: "One direction makes execution faster.",
      fixLine: "Choose one direction and pause competing work.",
      withoutLine: "Resources spread too thin to win.",
    },
  ];

  const driversByKey = new Map(drivers.map((driver) => [driver.id, driver]));
  const orderedDrivers = DRIVER_ORDER.map((key) => driversByKey.get(key)).filter(
    (driver): driver is LovableDriver => Boolean(driver),
  );

  const phaseDriverIds: DriverKey[] =
    phase === "outside"
      ? ["proof", "belief", "decision"]
      : phase === "diagnosis"
      ? ["proof", "belief", "decision"]
      : phase === "focus"
        ? ["decision", "belief", "risk_reduction"]
        : ["ownership", "execution", "risk_reduction"];

  const phaseDrivers = orderedDrivers.filter((driver) =>
    phaseDriverIds.includes(driver.id as DriverKey),
  );
  const weakestDriver = getWeakestDriver(
    phaseDrivers.length > 0 ? phaseDrivers : orderedDrivers,
  );
  const selectedDriver = input.activeDriverId
    ? driversByKey.get(input.activeDriverId)
    : null;
  const activeDriver =
    selectedDriver && phaseDriverIds.includes(selectedDriver.id as DriverKey)
      ? selectedDriver
      : weakestDriver;

  const confidenceBasis = (() => {
    if (hasInternalEvidence && !hasCustomerEvidence && !hasMarketEvidence) {
      return "Mostly based on what the team can already see internally.";
    }
    if (hasInternalEvidence && (hasCustomerEvidence || hasMarketEvidence) && !(hasCustomerEvidence && hasMarketEvidence)) {
      return "Grounded in internal evidence, with some outside confirmation.";
    }
    if (hasInternalEvidence && hasCustomerEvidence && hasMarketEvidence) {
      return "Grounded in internal evidence, customer input, and what the market is showing.";
    }
    if (presentEvidenceSources > 0) {
      return "Based on an early mix of outside clues.";
    }
    return "Still based on a very limited picture.";
  })();

  const coverageSignalsCaptured = input.inputCoverage.items.filter((item) => item.coverage >= 60).length;
  const totalSignalSlots = input.inputCoverage.items.length + input.evidence.sources.length;
  const capturedSignals = presentEvidenceSources + coverageSignalsCaptured;

  const nextMoveLine = nextMoveFromState({
    actions: prioritizedActions,
    weakestDriver: weakestDriver.id as DriverKey,
    unownedCritical: input.ownership.unownedCriticalActions,
    customerCoverage,
    marketCoverage,
    activeCount,
  });

  const phaseConstraint: PhaseConstraintModel = (() => {
    if (phase === "outside") {
      if (proofScore < 60 || presentEvidenceSources < 2) {
        return {
          driverId: "proof",
          title: "The picture is still too thin to trust yet.",
          riskLine: "There is not enough proof yet.",
          detailLine: "From the outside, something is clearly creating friction, but the deeper cause is still too early to call.",
          fixLine: "Get closer to where the lived experience is clearest.",
          withoutLine: "We risk improving the wrong part of the system.",
        };
      }

      if (beliefScore < 65) {
        return {
          driverId: "belief",
          title: "The core problem is still a little blurry.",
          riskLine: "The picture is still mixed.",
          detailLine: "What the outside suggests and what the team believes are not fully lined up yet.",
          fixLine: "Pressure-test the core problem together before committing to a path.",
          withoutLine: "The first real commitment may drift before it lands.",
        };
      }

      return {
        driverId: "decision",
        title: "There are promising patterns, but the direction still needs to settle.",
        riskLine: "The direction is not stable yet.",
        detailLine: "There is enough here to take seriously, but not enough yet to treat as settled.",
        fixLine: "Choose one path to test before widening the work.",
        withoutLine: "Work can start moving before the direction is solid enough to trust.",
      };
    }

    if (phase === "diagnosis") {
      if (proofScore < 60 || presentEvidenceSources < 2 || customerCoverage < 55) {
        return {
          driverId: "proof",
          title: "The evidence still is not clear enough.",
          riskLine: "Too much is still unresolved.",
          detailLine: "The problem is still not sharp enough to trust yet.",
          fixLine: "Look for stronger proof before treating this as settled.",
          withoutLine: "We may end up solving the wrong problem well.",
        };
      }

      return {
        driverId: "belief",
        title: "People are still reading the picture differently.",
        riskLine: "The issue is still not settled.",
        detailLine: "Different people are drawing different conclusions from the same evidence.",
        fixLine: "Land one shared reading before you commit harder.",
        withoutLine: "Important decisions will keep drifting.",
      };
    }

    if (phase === "focus") {
      if (decisionScore < 60) {
        return {
          driverId: "decision",
          title: "There are still too many plausible paths in play.",
          riskLine: "The tradeoffs are still unclear.",
          detailLine: "The team has not fully chosen the one path it wants to back first.",
          fixLine: "Choose one move to center and let the others wait.",
          withoutLine: "Effort spreads too thin and progress loses force.",
        };
      }

      if (beliefScore < 65) {
        return {
          driverId: "belief",
          title: "The team is not fully aligned on what to pursue first.",
          riskLine: "The tradeoffs are still unclear.",
          detailLine: "Different parts of the team are still backing different priorities.",
          fixLine: "Settle the order together before the work spreads further.",
          withoutLine: "Conflicting bets will keep slowing progress.",
        };
      }

      return {
        driverId: "risk_reduction",
        title: "The order still is not clear enough.",
        riskLine: "There are still too many live options.",
        detailLine: "The plan needs a cleaner first-second-third sequence.",
        fixLine: "Name the order clearly and hold it long enough to learn from it.",
        withoutLine: "Weekly decisions will keep changing shape.",
      };
    }

    if (input.ownership.unownedCriticalActions > 0) {
      return {
        driverId: "ownership",
        title: "No one owns the outcome.",
        riskLine: "Priorities are not progressing.",
        detailLine: "Work exists, but no one is accountable for moving it.",
        fixLine: "Assign one owner per priority.",
        withoutLine: "Work stalls and deadlines slip.",
      };
    }

    if (activeCount === 0) {
      return {
        driverId: "execution",
        title: "Work is not actively moving.",
        riskLine: "Priorities are not progressing.",
        detailLine: "The plan is set, but execution has not started.",
        fixLine: "Move Priority 1 into active execution now.",
        withoutLine: "Plans stay planned and outcomes do not move.",
      };
    }

    if (notActiveCount > 0) {
      return {
        driverId: "execution",
        title: "Priorities are not progressing.",
        riskLine: "Work is not actively moving.",
        detailLine: "Some work is active, but pace is uneven.",
        fixLine: "Drive active work to completion before adding more.",
        withoutLine: "Momentum will flatten.",
      };
    }

    return {
      driverId: "risk_reduction",
      title: "Priorities are not progressing.",
      riskLine: "Execution is uneven.",
      detailLine: "Blockers still reduce weekly delivery speed.",
      fixLine: "Close one blocker this week.",
      withoutLine: "Risk compounds and slows the system.",
    };
  })();

  const missingEvidenceSources = input.evidence.sources
    .filter((source) => !source.present)
    .map((source) => source.label.toLowerCase());

  const topPriorityTitle = shortText(prioritizedActions[0]?.title, 86);
  const strongestOutsideSignal = shortText(
    openStrategicProblems[0]?.statement ||
      baselineSignals.suggestions[0] ||
      baselineSignals.customers[0] ||
      baselineSignals.employees[0] ||
      baselineSignals.market[0] ||
      "",
    110,
  );

  let heroDiagnosisLine = phaseConstraint.title;
  let heroCauseLine = phaseConstraint.detailLine;
  let heroImpactLine = phaseConstraint.withoutLine;
  let heroNextMoveLine = phaseConstraint.fixLine;

  if (phase === "outside") {
    heroDiagnosisLine = strongestOutsideSignal || phaseConstraint.title;
    heroCauseLine =
      missingEvidenceSources.length > 0
        ? `Parts of the picture are still missing, especially around ${missingEvidenceSources.join(" and ")}.`
        : phaseConstraint.detailLine;
    heroImpactLine = phaseConstraint.withoutLine;
    heroNextMoveLine = topPriorityTitle
      ? `Next, we would look harder at ${topPriorityTitle.toLowerCase()}.`
      : phaseConstraint.fixLine;
  } else if (phase === "diagnosis") {
    heroDiagnosisLine = "Now we test what actually holds up.";
    heroCauseLine = "This is where the picture gets sharper.";
    heroImpactLine = "What holds up stays in the frame. What weakens loses its claim on attention.";
    heroNextMoveLine = topPriorityTitle
      ? `Next, we pressure-test ${topPriorityTitle.toLowerCase()}.`
      : "Next, we pressure-test the strongest path first.";
  } else if (phase === "focus") {
    heroDiagnosisLine = "Now we narrow to one move.";
    heroCauseLine = "Too many live options make progress feel thinner than it should.";
    heroImpactLine = "A clear first move gives momentum a chance to compound.";
    heroNextMoveLine = topPriorityTitle
      ? `Next, we put ${topPriorityTitle.toLowerCase()} in the center.`
      : "Next, we put one path in the center and let the others wait.";
  } else {
    heroDiagnosisLine = "Now the question is whether the work is really changing the picture.";
    heroCauseLine = "Momentum becomes believable when movement is visible.";
    heroImpactLine = "Consistent movement is what starts turning a promising read into a stronger outcome.";
    heroNextMoveLine = topPriorityTitle
      ? `Next, keep ${topPriorityTitle.toLowerCase()} moving.`
      : nextMoveLine;
  }

  const interpretationRiskLine = phaseConstraint.riskLine;
  const interpretationMutedLine =
    phase === "outside"
      ? "This is an early outside read."
      : phase === "diagnosis"
      ? "The goal here is to learn quickly before confidence outruns proof."
      : phase === "focus"
        ? "The goal here is to choose one move and let the others wait."
        : "The goal here is to keep momentum visible and adjust before drift sets in.";

  const mojoScore = clampScore(Number(input.activeCompany?.mojo_score ?? 0));
  const potentialScore = clampScore(
    Number(input.activeCompany?.potential_score ?? mojoScore),
  );

  const averageActionScore =
    actionSignals.length > 0
      ? actionSignals.reduce((sum, signal) => sum + signal.totalPoints, 0) /
        actionSignals.length
      : 0;

  const nextScore = clampScore(mojoScore + averageActionScore * multiplier);
  const finalPotential = clampScore(Math.max(nextScore + 8, potentialScore));

  const unownedCount = prioritizedActions.filter((item) => !item.primaryOwner).length;
  const ownershipLift =
    prioritizedActions.length > 0
      ? Math.round((unownedCount / prioritizedActions.length) * 15)
      : 0;
  const executionLift =
    prioritizedActions.length > 0
      ? Math.round((notActiveCount / prioritizedActions.length) * 10)
      : 0;

  const prioritySignals: PrioritySignal[] = actionSignals.slice(0, 3).map((signal) => {
    const { action, confidenceLevel: actionConfidenceLevel } = signal;
    const impactLift = Math.max(
      1,
      Math.round(((30 - signal.totalPoints) / Math.max(1, actionSignals.length || 1)) * multiplier),
    );
    const projectedScore = clampScore(mojoScore + impactLift);
    const impactedDriver = mapPriorityImpactDriver(action);

    const whyLine = !action.primaryOwner
      ? "No one is driving this priority."
      : action.status === "planned"
        ? "Work has not started yet."
        : actionConfidenceLevel === "Low"
          ? "Confidence is still low."
          : `This lifts ${impactedDriver.toLowerCase()}.`;

    return {
      action,
      confidenceLevel: actionConfidenceLevel,
      impactLift,
      projectedScore,
      impactedDriver,
      summaryLine: topPrioritySummary(action, phase),
      withoutLine:
        action.category === "Fix"
          ? "If this stays open, blockers keep slowing delivery."
          : action.category === "Improve"
            ? "If this stays open, execution stays uneven."
            : "If this stays open, proof stays weak.",
      whyThisMatters: action.whyItMatters,
      whyNow: "This move gives the fastest near-term lift.",
      whyNotOthers: "This move has the strongest immediate impact.",
      whyLine,
      isSelected: input.selectedPriorityId === action.id,
      isCommitted: input.recentlyCommittedActionId === action.id,
    };
  });

  const orderedPrioritySignals = [...prioritySignals].sort((a, b) => {
    if (b.impactLift !== a.impactLift) return b.impactLift - a.impactLift;
    if (a.action.category !== b.action.category) {
      const categoryRank = (category: ClientActionSummary["category"]) =>
        category === "Fix" ? 0 : category === "Improve" ? 1 : 2;
      return categoryRank(a.action.category) - categoryRank(b.action.category);
    }
    return b.action.score - a.action.score;
  });

  const uniqueLines = (lines: Array<string | null | undefined>, limit = 3) => {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const line of lines) {
      const normalized = shortText(line || "", 124);
      if (!normalized || isTechnicalOutsideSignal(normalized)) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(normalized);
      if (output.length >= limit) break;
    }
    return output;
  };

  const openCustomerProblems = openStrategicProblems
    .filter((problem) => problem.source === "client" || problem.source === "evidence")
    .map((problem) => problem.statement);
  const openCompanyProblems = openStrategicProblems
    .filter((problem) => problem.source === "company" || problem.source === "intake")
    .map((problem) => problem.statement);
  const openMarketProblems = openStrategicProblems
    .filter((problem) => problem.source === "public")
    .map((problem) => problem.statement);

  const topOpportunityTitles = orderedPrioritySignals
    .slice(0, 3)
    .map((signal) => shortText(signal.action.title, 92))
    .filter(Boolean);

  const clientStatedProblems = strategicProblems
    .filter((problem) => problem.source === "client" || problem.source === "intake")
    .map((problem) => shortText(problem.statement, 180))
    .filter(Boolean);
  const clientStatedOpen = openStrategicProblems
    .filter((problem) => problem.source === "client" || problem.source === "intake")
    .map((problem) => shortText(problem.statement, 180))
    .filter(Boolean);
  const heardProblemStatement =
    clientStatedOpen[0] ||
    clientStatedProblems[0] ||
    "";
  const heardInterpretation = heardProblemStatement
    ? interpretClientProblem(heardProblemStatement)
    : "No pre-meeting problem statement is captured yet.";

  const outsideOpportunities = uniqueLines(
    [
      topOpportunityTitles[0]
        ? `Top opportunity: ${topOpportunityTitles[0]}.`
        : "",
      topOpportunityTitles[1]
        ? `Second opportunity: ${topOpportunityTitles[1]}.`
        : "",
      topOpportunityTitles[2]
        ? `Third opportunity: ${topOpportunityTitles[2]}.`
        : "",
    ],
    3,
  );

  const siteLabel = toHostLabel(companyWebsite);

  const customerDataSignals = [
    ...baselineSignals.customers.map((line) => toQuotedSignal(line)),
    ...openCustomerProblems.map((statement) => toQuotedSignal(statement)),
    topOpportunityTitles[0]
      ? toQuotedSignal(`Customers are pointing toward ${topOpportunityTitles[0]}`)
      : "",
  ].filter(Boolean);

  const companyBrandSignals = [
    ...baselineSignals.employees.map((line) => toQuotedSignal(line)),
    ...openCompanyProblems.map((statement) => toQuotedSignal(statement)),
    evidenceNote ? toQuotedSignal(evidenceNote) : "",
    siteLabel ? toQuotedSignal(`${siteLabel} positioning is visible in public channels`) : "",
  ].filter(Boolean);

  const marketDataSignals = [
    ...baselineSignals.market.map((line) => toQuotedSignal(line)),
    ...openMarketProblems.map((statement) => toQuotedSignal(statement)),
  ].filter(Boolean);

  const candidateOutsideGroups: OutsideSignalGroup[] = [
    {
      source: "Customers",
      observations: uniqueLines(
        [
          ...customerDataSignals,
          customerDataSignals.length === 0 && hasCustomerEvidence
            ? '"Customer signal exists, but proof is still forming."'
            : "",
        ],
        3,
      ),
    },
    {
      source: "Company / Brand",
      observations: uniqueLines(
        [
          ...companyBrandSignals,
          companyBrandSignals.length === 0 && siteLabel
            ? toQuotedSignal(`${siteLabel} signal exists, but proof remains thin`)
            : "",
        ],
        3,
      ),
    },
    {
      source: "Market",
      observations: uniqueLines(
        [
          ...marketDataSignals,
          siteLabel && marketDataSignals.length <= 1
            ? toQuotedSignal(`Public positioning on ${siteLabel} is clear, but outcomes are not yet proven`)
            : "",
          marketDataSignals.length === 0 && hasMarketEvidence
            ? '"Market signal exists, but direction is still unclear."'
            : "",
        ],
        3,
      ),
    },
  ];

  const outsideGroups = candidateOutsideGroups.filter(
    (group) => group.observations.length > 0,
  ).map((group) => ({
    ...group,
    observations: group.observations.map((line) => compactOutsideSignal(line)).filter(Boolean).slice(0, 3),
  })).filter((group) => group.observations.length > 0);

  const topDriver = orderedPrioritySignals[0]?.impactedDriver ?? "Decision";

  const strongestOutsideHypothesis =
    cleanNarrativeSourceLine(openStrategicProblems[0]?.statement) ||
    cleanNarrativeSourceLine(baselineSignals.suggestions[0]) ||
    outsideReadFromRoute(topOpportunityTitles[0] || phaseConstraint.title, topDriver);

  const implicationLine =
    cleanNarrativeSourceLine(baselineSignals.suggestions[0]) ||
    cleanNarrativeSourceLine(openStrategicProblems[1]?.statement) ||
    implicationFromDriver(topDriver);

  const weakDefinitionSignal = hasWeakDefinitionSignal([
    heardProblemStatement,
    strongestOutsideHypothesis,
    implicationLine,
    ...baselineSignals.suggestions,
    ...baselineSignals.market,
    ...baselineSignals.customers,
  ]);

  const outsideHypothesisLine =
    normalizeCompare(strongestOutsideHypothesis) === normalizeCompare(heardProblemStatement)
      ? implicationLine || strongestOutsideHypothesis
      : strongestOutsideHypothesis;

  const heroHeadline = weakDefinitionSignal
    ? "The story is visible, but the proof behind it still looks thin."
    : topDriver === "Execution"
      ? "The strongest early read points to making the experience more repeatable."
    : topDriver === "Proof"
        ? "The strongest early read points to making the proof easier to see and trust."
        : topDriver === "Risk Reduction"
          ? "The strongest early read points to reducing hidden friction before it grows."
          : topDriver === "Decision"
            ? "The strongest early read points to narrowing to one path before the work spreads further."
            : "The strongest early read points to tightening the link between promise and experience.";
  const heroWhyLine = weakDefinitionSignal
    ? "When promise outruns proof, confidence drops and growth slows."
    : topDriver === "Execution"
      ? "Repeatable delivery is the clearest path to stronger confidence and growth."
    : topDriver === "Proof"
        ? "Visible proof will increase confidence and support faster adoption."
        : topDriver === "Risk Reduction"
          ? "Reducing friction early lowers risk and protects outcomes."
          : topDriver === "Decision"
            ? "One focused path creates clearer market signal and faster learning."
            : compactOutsideSignal(deHedgeLine(implicationLine || "This pattern is shaping near-term outcomes."));
  const outsideSuggestions = uniqueLines(
    [
      strongestOutsideHypothesis,
      ...baselineSignals.suggestions.map((line) => cleanNarrativeSourceLine(line)),
      openStrategicProblems[0]
        ? cleanNarrativeSourceLine(openStrategicProblems[0].statement)
        : "",
      proofScore < 60
        ? "Proof is not yet strong enough for confident adoption."
        : "",
      decisionScore < 65
        ? "Priorities still look spread across multiple directions."
        : "",
      evidenceNote
        ? cleanNarrativeSourceLine(evidenceNote)
        : "",
    ],
    3,
  );

  if (outsideSuggestions.length === 0) {
    outsideSuggestions.push("Signals are promising, but confidence is still early.");
  }

  const outsideGaps = uniqueLines(
    [
      ...baselineSignals.gaps.map((line) => cleanNarrativeSourceLine(line)),
      openStrategicProblems[0]
        ? cleanNarrativeSourceLine(openStrategicProblems[0].statement)
        : "",
      openStrategicProblems[1]
        ? cleanNarrativeSourceLine(openStrategicProblems[1].statement)
        : "",
      missingEvidenceSources.length > 0
        ? `Missing signal: ${missingEvidenceSources.join(" and ")}.`
        : "",
      phaseConstraint.withoutLine,
    ],
    3,
  );

  const outsideHypothesesToTest = uniqueLines(
    orderedPrioritySignals
      .slice(0, 3)
      .map((signal, index) => testLineFromRoute(signal.action.title, index, signal.impactedDriver)),
    3,
  );

  const validateTogetherQuestions = uniqueLines(
    [
      ...outsideHypothesesToTest,
      missingEvidenceSources.length > 0
        ? `What internal proof is missing from ${missingEvidenceSources.join(" and ")}?`
        : "",
      "Which internal teams see this issue most clearly?",
    ],
    3,
  );

  const outsideObserved = uniqueLines(
    outsideGroups
      .flatMap((group) => group.observations)
      .map((line) => line.replace(/^"|"$/g, "")),
    3,
  );

  const outsideInferred = uniqueLines(
    [strongestOutsideHypothesis, implicationLine, ...outsideSuggestions],
    3,
  );

  const outsideUnknown = uniqueLines(
    [
      ...outsideGaps,
      missingEvidenceSources.length > 0
        ? `Unknown: validation from ${missingEvidenceSources.join(" and ")} is still missing.`
        : "",
    ],
    3,
  );

  const outsideBridgeWhatThisMeans =
    "There is something real here, but it still needs to hold up once we test it more directly.";
  const outsideBridgeNextStep =
    "Next we look at what holds up once the evidence gets closer to the work itself.";

  const outsideTestsFirst = orderedPrioritySignals.slice(0, 3).map((signal, index) => {
    const title = shortText(signal.action.title, 100);
    const normalizedTitle = title
      ? title.charAt(0).toLowerCase() + title.slice(1)
      : "";

    const actionLine =
      index === 0
        ? title
          ? `Validate whether ${normalizedTitle} creates clearer proof.`
          : "Validate whether the top opportunity creates clearer proof."
        : index === 1
          ? title
            ? `Test whether ${normalizedTitle} improves repeatable delivery.`
            : "Test whether the second opportunity improves repeatable delivery."
          : title
            ? `Watch for whether ${normalizedTitle} lowers risk as you scale.`
            : "Watch for whether the third opportunity lowers risk as you scale.";

    const outcomeLine =
      index === 0
        ? "Outcome: clearer proof before scaling."
        : index === 1
          ? "Outcome: stronger partner confidence and consistency."
          : "Outcome: lower operational risk with growth.";

    return {
      id: signal.action.id,
      actionLine,
      outcomeLine,
    };
  });

  const leadSignal = orderedPrioritySignals[0];
  const alternateSignals = orderedPrioritySignals.slice(1, 3);
  const leadDriver = leadSignal?.impactedDriver ?? topDriver;
  const leadTitle =
    shortText(leadSignal?.action.title, 100) ||
    shortText(outsideHypothesisLine, 100) ||
    "Strengthen the most credible outside signal first.";
  const leadOutcomes = outcomeSetFromDriver(leadDriver).slice(0, 3);
  const leadWhyLeading =
    weakDefinitionSignal
      ? "This is leading because the story looks more visible than the proof behind it."
      : leadSignal
      ? "This is leading because it has the clearest early support in what we can already see from the outside."
      : "This is leading because it currently carries the clearest early pattern.";
  const heroBridgeLine = leadSignal
    ? `The next question is whether ${shortText(leadSignal.action.title, 70).toLowerCase()} still looks this strong once we test it more directly.`
    : "The next question is whether this first read still holds up once we look more closely.";
  const leadNextMove = leadSignal
    ? "This is the place that deserves the first deeper look."
    : "This is the place that deserves the first deeper look.";

  const rankedRouteSeeds = orderedPrioritySignals.slice(0, 3);
  const routeRankLabels: Array<"Most likely first" | "Still plausible" | "Keep in view"> = [
    "Most likely first",
    "Still plausible",
    "Keep in view",
  ];

  const rankedRoutes = rankedRouteSeeds.map((signal, index) => {
    const driverKey = driverKeyFromImpact(signal.impactedDriver);
    const driverScore = driversByKey.get(driverKey)?.score ?? 45;
    const routeTitle = shortText(signal.action.title, 96);
    return {
      rankLabel: routeRankLabels[index] ?? "Keep in view",
      title: routeTitle,
      whyRelevant: routeSpecificWhy(routeTitle, signal.impactedDriver, index === 0),
      whyLeading: routeSpecificWhy(routeTitle, signal.impactedDriver, true),
      confidenceLevel: routeSignalLevel(driverScore),
      evidenceLevel: evidenceLineForRoute({
        driver: signal.impactedDriver,
        groups: outsideGroups,
        fallback: outsideSuggestions,
        siteLabel,
      }),
      outcomes: routeSpecificOutcomes(routeTitle, signal.impactedDriver),
      validate: validateLineFromDriver(routeTitle, signal.impactedDriver),
      isLeading: index === 0,
    };
  });

  if (rankedRoutes.length === 0) {
    rankedRoutes.push({
      rankLabel: "Most likely first",
      title: shortText(outsideHypothesisLine, 96) || "Clarify the strongest outside-in opportunity.",
      whyRelevant: "This is the place that currently makes the most sense to look harder first.",
      whyLeading: "This is the place that currently makes the most sense to look harder first.",
      confidenceLevel: "Early evidence",
      evidenceLevel: outsideSuggestions[0] || "The outside picture is still thin and early.",
      outcomes: [
        "Clearer direction before committing resources.",
        "Stronger confidence in the next strategic move.",
      ],
      validate: "This is the first place worth pressure-testing more directly.",
      isLeading: true,
    });
  }

  const alternateRoutes = rankedRoutes
    .slice(1, 3)
    .map((route) => ({ title: route.title, reason: route.whyRelevant }));

  const movementCurrentRead = weakDefinitionSignal
    ? "Right now the picture is being held back by a gap between the story and the visible proof."
    : `Right now the biggest drag seems to sit around ${leadDriver.toLowerCase()}.`;
  const movementBestUpside = `If this holds up, the biggest upside is ${leadOutcomes[0].charAt(0).toLowerCase()}${leadOutcomes[0].slice(1)}`;
  const movementIfLeadIsTrue =
    leadSignal
      ? `If this holds up and gets acted on, the outlook could move toward ~${Math.max(nextScore, mojoScore + 8)}.`
      : "If this holds up and gets acted on, the picture should get clearer quickly.";

  const diagnoseConfirm =
    leadSignal
      ? `What would strengthen this read: the closer evidence supports "${shortText(leadSignal.action.title, 72)}".`
      : "What would strengthen this read: the closer evidence supports the same pattern we can already see from the outside.";
  const diagnoseWeaken = weakDefinitionSignal
    ? "What would weaken it: the proof is already stronger than the outside view makes it look."
    : "What would weaken it: a closer look shows this is not the place with the most leverage after all.";
  const diagnoseShift =
    alternateRoutes[0]?.title
      ? `What would shift the picture: "${alternateRoutes[0].title}" holds up more strongly once we look closer.`
      : "What would shift the picture: another path holds up more strongly once we look closer.";

  const confidenceFrame =
    "This is an early read based on what we can see so far. The order can still change.";

  const supportSignals = uniqueLines(
    [
      humanizeOutsideSignal({
        source: "Customers",
        observation:
          outsideGroups.find((group) => group.source === "Customers")?.observations[0] ||
          observationFromRouteTitle(rankedRoutes[0]?.title || topOpportunityTitles[0] || "", "Proof"),
        siteLabel,
      }),
      humanizeOutsideSignal({
        source: "Company / Brand",
        observation:
          outsideGroups.find((group) => group.source === "Company / Brand")?.observations[0] ||
          (siteLabel
            ? `${siteLabel} positioning is visible in public channels`
            : "The public story is visible, but the proof behind it is still thin."),
        siteLabel,
      }),
      humanizeOutsideSignal({
        source: "Market",
        observation:
          outsideGroups.find((group) => group.source === "Market")?.observations[0] ||
          outsideReadFromRoute(rankedRoutes[0]?.title || topOpportunityTitles[0] || "", topDriver),
        siteLabel,
      }),
    ],
    4,
  );

  const whatWeHeardLine =
    heardProblemStatement ||
    "We do not yet have a clear stated concern from the team, so this first read is coming mostly from the outside.";

  const phaseNarrative: DecisionPathPhaseNarrative = (() => {
    if (phase === "diagnosis") {
      const confirmedStatement =
        shortText(strategicProblems.find((problem) => problem.status === "reconciled")?.statement, 120) ||
        rankedRoutes[0]?.title ||
        "No confirmed route yet.";
      const unresolvedStatement =
        shortText(openStrategicProblems[0]?.statement, 120) ||
        rankedRoutes[1]?.title ||
        "Second route remains unresolved.";
      const disprovenStatement =
        rankedRoutes[2]?.title || "No route has been disproven yet.";

      return {
        headline: "This is where the early read either gets stronger or starts to fall apart.",
        supportLine: "We use the evidence to separate what holds up from what only sounded plausible at first.",
        dominantLine: "What proves true earns more attention. What weakens stops leading the conversation.",
        diagnose: {
          rows: [
            {
              status: "Confirmed",
              signal: supportSignals[0] || outsideObserved[0] || "Strongest outside signal cluster.",
              assumption: confirmedStatement,
              evidence: hasInternalEvidence ? "The closer evidence is starting to support this direction." : "The closer evidence is still too thin to call this solid yet.",
              truthStatus: strategicProblems.some((problem) => problem.status === "reconciled")
                ? "This is the part of the picture currently holding up best."
                : "This is the strongest reading so far, but it is still not fully settled.",
            },
            {
              status: "Unresolved",
              signal: supportSignals[1] || outsideObserved[1] || "The picture is still mixed here.",
              assumption: unresolvedStatement,
              evidence:
                missingEvidenceSources.length > 0
                  ? `We still need a clearer read from ${missingEvidenceSources.join(" and ")}.`
                  : "The evidence is still partial and does not settle the question yet.",
              truthStatus: "This still needs a closer look before it deserves commitment.",
            },
            {
              status: "Disproven",
              signal: supportSignals[2] || outsideObserved[2] || "This part of the picture is not holding up strongly yet.",
              assumption: disprovenStatement,
              evidence:
                rankedRoutes[2]
                  ? "This is the part of the picture with the least support once we look more closely."
                  : "Nothing has clearly fallen apart yet.",
              truthStatus: rankedRoutes[2] ? "Right now this looks least likely to carry the story forward." : "Nothing has clearly fallen away yet.",
            },
          ],
        },
      };
    }

    if (phase === "focus") {
      return {
        headline: "One move now matters more than the others.",
        supportLine: "This is where we choose what goes in the center and what stays in the background for now.",
        dominantLine: "Put one move in front. Keep the others visible, but make them wait.",
        focus: {
          mattersMostNow: rankedRoutes[0]?.title || topPriorityTitle || "Top route to commit first.",
          doFirst:
            prioritizedActions[0]
              ? `The first move is ${shortText(prioritizedActions[0].title, 96)}.`
              : "The first move is choosing one clear path.",
          keepVisible: rankedRoutes.slice(1, 3).map((route) => route.title),
        },
      };
    }

    if (phase === "execution") {
      return {
        headline: "Momentum only becomes real when the picture starts changing in the work itself.",
        supportLine: "This is where we watch for movement, friction, and early signs that the story is getting stronger or weaker.",
        dominantLine: "Keep the movement visible and adjust before drift turns into drag.",
        flow: {
          progressReview: `${activeCount}/${prioritizedActions.length || 1} priorities are already in motion or complete.`,
          signalShift: `The next meaningful shift is most likely to show up around ${weakestDriver.label.toLowerCase()}.`,
          scoreMovement: `${mojoScore} → ${nextScore} → ${finalPotential}`,
          adaptation: "If the picture changes, the order should change with it before more work gets added.",
        },
      };
    }

    return {
      headline: "This is the first outside read of where the story may really be.",
      supportLine: "It is early, still incomplete, and open to revision.",
      dominantLine: "Start with the path that currently looks most believable, then see if it holds up.",
    };
  })();

  return {
    phase: {
      id: phase,
      label: phaseLabel(phase),
      modeLine:
        phase === "outside"
          ? "First read"
          : phase === "diagnosis"
          ? "Closer look"
          : phase === "focus"
            ? "Decision"
            : "Momentum",
    },
    hero: {
      score: mojoScore,
      statusLabel: phase === "outside" ? "Early read" : getStatusLabelFromScore(mojoScore),
      scoreToneClass: getScoreToneClassFromScore(mojoScore),
      diagnosisLine: phase === "outside" ? heroHeadline : heroDiagnosisLine,
      causeLine:
        phase === "outside"
          ? "What is standing out from what we can see so far."
          : heroCauseLine,
      impactLine: phase === "outside" ? heroWhyLine : heroImpactLine,
      nextMoveLine:
        phase === "outside" ? heroBridgeLine : heroNextMoveLine,
      trajectory: {
        currentScore: mojoScore,
        nextScore,
        potentialScore: finalPotential,
        ownershipLift,
        executionLift,
      },
      agreement: {
        selectedBeliefValue,
        alignedCount,
        totalCount: totalBeliefs,
      },
      outsideSignalStateLine:
        phase === "outside"
          ? "Early read · open to change."
          : undefined,
      outsideSignalNoteLine:
        phase === "outside"
          ? "This starts with what we can already see. A closer look may strengthen it, weaken it, or change the order."
          : undefined,
    },
    interpretation: {
      label: phaseLabel(phase),
      title: phaseConstraint.title,
      riskLine: interpretationRiskLine,
      mutedLine: interpretationMutedLine,
      fixLine:
        phase === "outside"
          ? `What this points toward: ${phaseConstraint.fixLine}`
          : phase === "diagnosis"
          ? `What this seems to require: ${phaseConstraint.fixLine}`
          : phase === "focus"
            ? `What matters now: ${phaseConstraint.fixLine}`
            : `What keeps this moving: ${phaseConstraint.fixLine}`,
    },
    drivers: {
      activeDriverId: activeDriver.id as DriverKey,
      weakestDriverId: weakestDriver.id as DriverKey,
      list: orderedDrivers,
    },
    constraint: {
      driver: driversByKey.get(phaseConstraint.driverId) ?? activeDriver,
      selectedBeliefValue,
      alignedCount,
      totalCount: totalBeliefs,
      trust: {
        confidenceBasis,
        signalsCaptured: `${capturedSignals} / ${Math.max(1, totalSignalSlots)}`,
        biggestRisk: phaseConstraint.withoutLine,
      },
    },
    outsideView: {
      confidenceLine: "This first read is based on what we can see so far from the outside. It can still change.",
      heroHeadline,
      heroWhyLine,
      heroBridgeLine,
      movement: {
        currentRead: movementCurrentRead,
        bestAvailableUpside: movementBestUpside,
        ifLeadIsTrue: movementIfLeadIsTrue,
      },
      clientLens: {
        hasClientProblem: Boolean(heardProblemStatement),
        whatWeHeard: whatWeHeardLine,
        whatWeHearYouSaying: heardInterpretation,
        whatOutsideViewSuggests: outsideHypothesisLine,
        whatWeValidateTogether:
          validateTogetherQuestions[0] || "The next step is checking what actually holds up once we look closer.",
        validateQuestions: validateTogetherQuestions,
      },
      leadOpportunity: {
        title: leadTitle,
        whyLeading: leadWhyLeading,
        outcomes: leadOutcomes,
        nextMove: leadNextMove,
      },
      rankedRoutes,
      alternateRoutes,
      diagnoseValidation: {
        confirm: diagnoseConfirm,
        weaken: diagnoseWeaken,
        shift: diagnoseShift,
      },
      confidenceFrame,
      supportSignals,
      testsFirst: outsideTestsFirst,
      strongestHypothesis: outsideHypothesisLine,
      whyItMatters: implicationLine,
      implication: phaseConstraint.withoutLine,
      groups: outsideGroups,
      hypothesesToTest: outsideHypothesesToTest,
      unknowns: {
        observed: outsideObserved,
        inferred: outsideInferred,
        unknown: outsideUnknown,
      },
      bridge: {
        whatThisMeans: outsideBridgeWhatThisMeans,
        nextStep: outsideBridgeNextStep,
        ctaLabel: "Look closer",
      },
    },
    phaseNarrative,
    actionIntro: {
      title: "Where this goes next",
      supportLine:
        phase === "outside"
          ? "Bring this first read into a closer conversation."
          : phase === "diagnosis"
          ? "Use what holds up to decide what deserves commitment."
          : phase === "focus"
            ? "Put one move in the center and let the rest wait."
            : "Keep the important work moving and watch for what changes.",
    },
    priorities: {
      items: orderedPrioritySignals,
    },
  };
}
