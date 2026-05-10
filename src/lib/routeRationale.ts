import type { HypothesisProvenanceCard, RouteHypothesisDependency } from "@/hooks/useStrategicHypotheses";
import { inferIdentityNarrative, type IdentityNarrative } from "@/lib/identityNarrative";
import {
  authorityWeightedSupportShape,
  dominantAuthorityBand,
  hypothesisAuthorityScore,
  inferStrategicCenterOfGravity,
  normalizeAuthorityPhase,
  resolveSignalConflict,
} from "@/lib/signalAuthority";
import { inferStrategicCenter, type StrategicCenter, type StrategicCenterRouteSeed } from "@/lib/strategicCenter";
import type { RouteAssumption, RouteRow } from "@/views/Routes/useRoutes";

export type RouteRationaleEvidenceItem = {
  id: string;
  title: string;
  status: "complete" | "in_progress" | "missing";
};

export type RouteNarrativeConfidence =
  | "Early directional read"
  | "Evidence is starting to converge"
  | "Supported by multiple validated signals"
  | "Still highly uncertain"
  | "Customer validation missing"
  | "Contradicted by recent evidence";

export type RouteMovement = "strengthen" | "weaken" | "narrow" | "split" | "remain_unresolved";
export type RouteReadiness = "Investigate" | "Validate" | "Commit" | "Hold";

export type RouteRationale = {
  routeId: string;
  routeTitle: string;
  confidenceLabel: RouteNarrativeConfidence;
  movement: RouteMovement;
  movementLabel: string;
  readiness: RouteReadiness;
  readinessMeaning: string;
  whyThisRouteExists: string;
  whatSupportsIt: string;
  uncertainty: string;
  mustBecomeTrue: string;
  couldWeaken: string;
  supportingEvidenceLines: string[];
  weakeningEvidenceLines: string[];
  relevanceScore: number;
  matchedHypothesisIds: string[];
  supportShape: { outside: number; organization: number; customer: number };
  linkSource: "graph_linked" | "fallback_matched" | "no_support";
};

type RouteRationaleSeed = {
  route: RouteRow;
  evidence: RouteRationaleEvidenceItem[];
  assumptions: RouteAssumption[];
};

type Theme =
  | "proof"
  | "trust"
  | "switching"
  | "reliability"
  | "support"
  | "governance"
  | "donor"
  | "onboarding"
  | "operational"
  | "partner_fit"
  | "novelty"
  | "price"
  | "convenience";

const GENERIC_HYPOTHESIS_TRUTHS = new Set([
  "further evidence must confirm that this directional pattern matters in real decisions",
  "customer evidence must eventually confirm this internal strategic assumption",
  "customer or market evidence must confirm that this tension changes real buyer behavior",
  "we need evidence that this route changes customer or stakeholder decisions",
]);

const GENERIC_ROUTE_ASSUMPTIONS = new Set([
  "there is validated demand for this new capability",
  "the market timing is right for this investment",
  "the organization can sustain this after the initial build",
  "the identified gap directly limits customer or business outcomes",
  "addressing this gap is the highest-leverage move available right now",
  "solving this gap would need to change a real customer or business outcome, not just clean up the process",
  "the current approach can be meaningfully strengthened without replacing it",
  "customers will notice and benefit from this improvement",
  "customers would need to value this new path enough to change a real decision",
]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "their", "will", "have", "has", "been", "more", "less", "than", "only", "still", "need", "needs", "route", "path", "customer", "customers", "company", "current", "could", "should", "would", "might", "what", "when", "where", "which", "about", "through", "before", "after", "while", "because", "being", "make", "made", "over", "under", "across",
]);

function clean(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function lowerFirst(value: string) {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function stripPeriod(value: string) {
  return clean(value).replace(/[.?!]+$/g, "");
}

function sentence(value: string | null | undefined) {
  return clean(value);
}

function uniqueLines(values: Array<string | null | undefined>, limit = 3) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const item = sentence(value);
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
    if (output.length >= limit) break;
  }
  return output;
}

function tokenize(value: string) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
}

function detectThemes(value: string): Theme[] {
  const text = clean(value).toLowerCase();
  const matches: Theme[] = [];
  const add = (theme: Theme, patterns: string[]) => {
    if (patterns.some((pattern) => text.includes(pattern))) matches.push(theme);
  };
  add("proof", ["proof", "prove", "credible", "credibility"]);
  add("trust", ["trust", "confidence"]);
  add("switching", ["switching", "switch", "sticky", "staying"]);
  add("reliability", ["reliability", "consistent", "consistency", "repeat purchasing", "repeat buying"]);
  add("support", ["support", "hands-on", "documentation", "training", "enablement"]);
  add("governance", ["governance", "participation", "leadership involvement"]);
  add("donor", ["donor", "fundraising", "endowment"]);
  add("onboarding", ["onboarding", "adoption"]);
  add("operational", ["operational", "operations", "workflow", "burden", "dial-in", "batch variability", "recipe-adjustment"]);
  add("partner_fit", ["partner fit", "partner", "wholesale reach", "selected partners"]);
  add("novelty", ["novelty", "artisanal", "coffee novelty"]);
  add("price", ["price", "pricing", "budget"]);
  add("convenience", ["convenience", "easy", "easier"]);
  return [...new Set(matches)];
}

function themeLabel(themes: Theme[]) {
  const labels = [...new Set(themes.map((theme) => {
    if (theme === "partner_fit") return "partner fit";
    return theme;
  }))];
  if (labels.length === 0) return "a smaller strategic pattern";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]}, ${labels[1]}, and ${labels[2]}`;
}

function routeMatchesCenter(center: StrategicCenter, themes: Theme[]) {
  if (!center.key || center.supportingThemes.length === 0) return false;
  const keys = new Set(center.supportingThemes.map((theme) => theme.key));
  return themes.some((theme) => {
    if (theme === "support") return keys.has("operational_reliability") || keys.has("proof_trust");
    if (theme === "operational" || theme === "reliability") return keys.has("operational_reliability");
    if (theme === "proof" || theme === "trust") return keys.has("proof_trust") || keys.has("operational_reliability");
    if (theme === "switching" || theme === "partner_fit") return keys.has("partner_outcomes");
    return false;
  }) || keys.has(center.key);
}

function aggregateSupportShape(rows: Array<HypothesisProvenanceCard | { supportingClaims: Array<{ supportShape: { outside: number; organization: number; customer: number } }> }>) {
  return rows.reduce(
    (acc, row) => {
      row.supportingClaims.forEach((claim) => {
        acc.outside += claim.supportShape.outside;
        acc.organization += claim.supportShape.organization;
        acc.customer += claim.supportShape.customer;
      });
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function countValidatedSignals(row: HypothesisProvenanceCard) {
  let count = 0;
  for (const claim of [...row.supportingClaims, ...row.weakeningClaims]) {
    for (const detail of [...claim.supportingSignals, ...claim.qualifyingSignals]) {
      const status = String(detail.signal?.validation_status || "").toLowerCase();
      if (status === "validated") count += 1;
    }
  }
  return count;
}

function supportingClaimText(row: HypothesisProvenanceCard) {
  return uniqueLines(
    row.supportingClaims.flatMap((claim) => [claim.claim.statement, claim.strongestSupportingSignal?.evidence_excerpt]),
    3,
  );
}

function weakeningClaimText(row: HypothesisProvenanceCard) {
  return uniqueLines(
    row.weakeningClaims.flatMap((claim) => [claim.claim.statement, claim.strongestSupportingSignal?.evidence_excerpt]),
    3,
  );
}

function leadSupportThread(rows: HypothesisProvenanceCard[], leadHypothesisStatement?: string | null) {
  const lead = clean(leadHypothesisStatement);
  for (const row of rows) {
    for (const line of supportingClaimText(row)) {
      const candidate = stripPeriod(line);
      if (!candidate) continue;
      if (lead && candidate.toLowerCase() === stripPeriod(lead).toLowerCase()) continue;
      return candidate;
    }
  }
  return "";
}

function routeText(seed: RouteRationaleSeed) {
  return [
    seed.route.title,
    seed.route.short_description,
    ...(seed.route.why_this_matters_json ?? []),
    ...seed.evidence.map((item) => item.title),
  ].filter(Boolean).join(" ");
}

function hypothesisText(row: HypothesisProvenanceCard) {
  return [
    row.hypothesis.statement,
    ...row.supportingClaims.map((claim) => claim.claim.statement),
    ...row.weakeningClaims.map((claim) => claim.claim.statement),
  ].filter(Boolean).join(" ");
}

function overlapScore(routeValue: string, hypothesisValue: string) {
  const routeTokens = tokenize(routeValue);
  const hypothesisTokens = new Set(tokenize(hypothesisValue));
  let score = 0;
  for (const token of routeTokens) {
    if (hypothesisTokens.has(token)) score += token.length >= 8 ? 2 : 1;
  }
  return score;
}

function categoryThemeBoost(category: string, themes: Theme[]) {
  const key = String(category || "").toLowerCase();
  if (key === "fix") {
    return themes.some((theme) => ["proof", "trust", "reliability", "switching", "operational", "onboarding"].includes(theme)) ? 2 : 0;
  }
  if (key === "improve") {
    return themes.some((theme) => ["support", "operational", "proof", "reliability", "onboarding"].includes(theme)) ? 2 : 0;
  }
  if (key === "create") {
    return themes.some((theme) => ["support", "partner_fit", "governance", "donor", "proof"].includes(theme)) ? 2 : 0;
  }
  return 0;
}

function scoreHypothesisMatch(seed: RouteRationaleSeed, row: HypothesisProvenanceCard, phase: string) {
  const routeValue = routeText(seed);
  const hypothesisValue = hypothesisText(row);
  const overlap = overlapScore(routeValue, hypothesisValue);
  const routeThemes = detectThemes(routeValue);
  const hypothesisThemes = detectThemes(hypothesisValue);
  const sharedThemes = routeThemes.filter((theme) => hypothesisThemes.includes(theme));
  const themeScore = sharedThemes.length * 2 + categoryThemeBoost(seed.route.category, sharedThemes);
  const kindBoost = row.hypothesis.hypothesis_kind === "inferred_tension" ? 1 : 0;
  return overlap + themeScore + kindBoost + hypothesisAuthorityScore(row, phase) * 3;
}

function routeWhyFallback(seed: RouteRationaleSeed) {
  const first = uniqueLines([...(seed.route.why_this_matters_json ?? []), seed.route.short_description], 1)[0];
  if (first) return `This route rises because ${lowerFirst(stripPeriod(first))}.`;
  return "This route rises because the current evidence points to a meaningful constraint worth testing.";
}

function supportSummary(
  phase: string,
  shape: { outside: number; organization: number; customer: number },
  themes: Theme[],
  matchedCount: number,
  matchedRows: HypothesisProvenanceCard[],
  leadHypothesisStatement?: string | null,
  strategicCenter?: StrategicCenter | null,
  identityNarrative?: IdentityNarrative | null,
) {
  const label = themeLabel(themes);
  const weightedShape = authorityWeightedSupportShape(shape, phase);
  const bands = [weightedShape.outside > 0, weightedShape.organization > 0, weightedShape.customer > 0].filter(Boolean).length;
  const supportThread = leadSupportThread(matchedRows, leadHypothesisStatement);
  const specificLead = supportThread ? `Evidence keeps pointing to ${lowerFirst(supportThread)}.` : "";
  const center = inferStrategicCenterOfGravity(matchedRows, phase);
  const dominantBand = dominantAuthorityBand(shape, phase);
  const conflict = resolveSignalConflict(matchedRows, phase);
  const routeCentered = Boolean(
    strategicCenter?.shouldLeadExplanations &&
    strategicCenter.label &&
    routeMatchesCenter(strategicCenter, themes),
  );

  if (routeCentered && strategicCenter?.label) {
    const publicContext =
      strategicCenter.hasMeaningfulDivergence && (identityNarrative?.publicIdentity || strategicCenter.publicContextLabel)
        ? ` Publicly, the company still reads as ${lowerFirst(identityNarrative?.publicIdentity || strategicCenter.publicContextLabel || "")}, but that is now better treated as context than as the main direction.`
        : "";

    if (shape.customer > 0) {
      return `The route fits a direction increasingly centered on ${strategicCenter.label}. Customer evidence is starting to reinforce it.${publicContext}`;
    }
    if (shape.organization > 0) {
      return `The route fits a direction increasingly centered on ${strategicCenter.label}.${publicContext} Customer proof is still missing.`;
    }
    if (shape.outside > 0) {
      return `The route fits a direction increasingly centered on ${strategicCenter.label}.${publicContext} The current proof still comes mostly from public signals, so confidence should stay provisional.`;
    }
  }

  if (conflict.hasConflict && conflict.summary) {
    if (shape.customer > 0) return `${conflict.summary} Customer evidence is starting to show which side carries more weight.`;
    return `${conflict.summary} Customer proof is still missing.`;
  }

  if (shape.customer > 0 && bands >= 3) {
    return specificLead || `Customer, internal, and public evidence are pointing toward ${label}.`;
  }
  if (shape.customer > 0 && bands >= 2) {
    return specificLead
      ? `${specificLead} Customer evidence is starting to line up with other signals.`
      : `Customer evidence is starting to line up with other signals around ${label}.`;
  }
  if (shape.organization > 0 && shape.outside > 0) {
    if (center.label && dominantBand === "organization" && normalizeAuthorityPhase(phase) !== "pre_diagnosis") {
      const publicContext = identityNarrative?.publicIdentity
        ? ` Publicly, the company still reads as ${lowerFirst(identityNarrative.publicIdentity)}, but that is now better treated as context than as the main direction.`
        : " Public signals now act more as context than proof.";
      return `Internal strategy is increasingly centered on ${center.label}.${publicContext} Customer proof is still missing.`;
    }
    return specificLead
      ? `${specificLead} Public and internal evidence line up, but customer proof is still missing.`
      : `Public and internal evidence are pointing toward ${label}, but customer proof is still missing.`;
  }
  if (shape.organization > 0) {
    if (center.label && normalizeAuthorityPhase(phase) !== "pre_diagnosis") {
      return `Internal strategy is increasingly centered on ${center.label}, but customer proof is still missing.`;
    }
    return specificLead
      ? `${specificLead} Internal evidence is lining up here, but customer proof is still missing.`
      : `Internal evidence is pointing toward ${label}, but customer proof is still missing.`;
  }
  if (shape.outside > 0) {
    return specificLead
      ? `${specificLead} This is still based on public signals only.`
      : matchedCount > 1
        ? `Public signals are clustering around ${label}, but not enough to treat it as confirmed.`
        : `This is mostly supported by public signals pointing toward ${label}.`;
  }
  return "The route has some local support, but the broader evidence behind it is still thin.";
}

function uncertaintySummary(args: {
  phase: string;
  hasContradiction: boolean;
  hasCustomer: boolean;
  missingEvidenceCount: number;
  criticalAssumptions: RouteAssumption[];
  route: RouteRow;
  matched: HypothesisProvenanceCard[];
  strategicCenter?: StrategicCenter | null;
  identityNarrative?: IdentityNarrative | null;
}) {
  const conflict = resolveSignalConflict(args.matched, args.phase);
  if (args.hasContradiction) {
    return "The current evidence does not line up cleanly yet, so this route should not be treated as settled.";
  }
  if (args.strategicCenter?.hasMeaningfulDivergence && args.strategicCenter.publicContextLabel && args.strategicCenter.label) {
    const publicChoice = args.identityNarrative?.publicDescriptor || args.strategicCenter.publicContextLabel;
    return `It is still unclear whether buyers choose primarily on ${publicChoice}, ${args.strategicCenter.label}, or some combination of both.`;
  }
  if (conflict.hasConflict && conflict.summary) {
    return "Public signals and the current strategic direction are still pulling in different directions.";
  }
  if (String(args.route.dependency_state || "").toLowerCase() !== "fresh") {
    return "This route should be treated cautiously until it is checked against the latest customer-job view.";
  }
  if (!args.hasCustomer) {
    if (args.strategicCenter?.shouldLeadExplanations && args.strategicCenter.label) {
      return `Customer proof has not yet confirmed whether ${args.strategicCenter.label} actually changes real decisions.`;
    }
    return "We still do not have direct customer evidence showing this route would change real decisions.";
  }
  if (args.criticalAssumptions.length > 0) {
    return "This route still depends on open conditions that have not been fully validated yet.";
  }
  if (args.missingEvidenceCount > 0) {
    return "Important proof is still missing, so confidence should stay provisional.";
  }
  return "This route still needs more proof before it should be treated as locked.";
}

function mustBecomeTrueSummary(args: {
  criticalAssumptions: RouteAssumption[];
  matched: HypothesisProvenanceCard[];
  themes: Theme[];
  strategicCenter?: StrategicCenter | null;
}) {
  const critical = args.criticalAssumptions
    .map((assumption) => sentence(assumption.statement))
    .find((statement) => !GENERIC_ROUTE_ASSUMPTIONS.has(stripPeriod(clean(statement)).toLowerCase()));
  if (critical) return sentence(critical);

  const hypothesisTruth = args.matched
    .flatMap((row) => row.hypothesis.what_must_be_true ?? [])
    .map(sentence)
    .filter((value) => !GENERIC_HYPOTHESIS_TRUTHS.has(stripPeriod(clean(value)).toLowerCase()))
    .find(Boolean);
  if (hypothesisTruth) return hypothesisTruth;

  if (args.strategicCenter?.label) {
    if (args.strategicCenter.label.includes("operational reliability")) {
      return "We still need direct customer evidence that operational reliability changes buying confidence.";
    }
    if (args.strategicCenter.label.includes("partner operational outcomes")) {
      return "We still need evidence that reducing operator burden changes repeat buying or partner confidence.";
    }
    if (args.strategicCenter.label.includes("visible proof")) {
      return "We still need proof that making reliability visible changes real buyer decisions.";
    }
  }

  if (args.themes.includes("proof") || args.themes.includes("trust")) {
    return "We need evidence that clearer operational proof changes confidence or choice.";
  }
  if (args.themes.includes("support")) {
    return "We need evidence that stronger support changes adoption, retention, or trust.";
  }
  if (args.themes.includes("reliability")) {
    return "We need evidence that consistency and reliability affect repeat buying or retention.";
  }
  if (args.themes.includes("governance") || args.themes.includes("donor")) {
    return "We need evidence that visible governance changes donor confidence or giving behavior.";
  }
  return "We need evidence that this route changes customer or stakeholder decisions.";
}

function couldWeakenSummary(args: {
  weakeningLines: string[];
  route: RouteRow;
  themes: Theme[];
}) {
  if (args.weakeningLines.length > 0) {
    return `This route weakens if ${lowerFirst(stripPeriod(args.weakeningLines[0]))}.`;
  }
  if (String(args.route.stale_reason || "").trim()) {
    return "If the latest customer-job view keeps shifting, this route may no longer fit the current problem.";
  }
  if (args.themes.some((theme) => ["proof", "trust", "reliability"].includes(theme))) {
    return "If buyers prioritize price or convenience more than reliability or proof, this route may weaken.";
  }
  if (args.themes.includes("support")) {
    return "If customers do not value high-touch support enough to change decisions, this route may weaken.";
  }
  if (args.themes.includes("governance") || args.themes.includes("donor")) {
    return "If donors respond more to urgency than to governance visibility, this route may weaken.";
  }
  return "If direct evidence points to a different constraint, this route may weaken.";
}

function movementLabel(value: RouteMovement) {
  if (value === "strengthen") return "Strengthening";
  if (value === "weaken") return "Weakening";
  if (value === "narrow") return "Narrowing";
  if (value === "split") return "Split between two readings";
  return "Still unresolved";
}

function readinessMeaning(value: RouteReadiness) {
  if (value === "Commit") return "Strong enough to focus around.";
  if (value === "Validate") return "Promising path. Needs validation before commitment.";
  if (value === "Hold") return "Do not pursue until the evidence clears.";
  return "Worth investigating, not ready to choose.";
}

function determineConfidence(args: {
  phase: string;
  matched: HypothesisProvenanceCard[];
  supportShape: { outside: number; organization: number; customer: number };
  validatedSignalCount: number;
  hasContradiction: boolean;
  missingEvidenceCount: number;
  criticalAssumptions: RouteAssumption[];
}): RouteNarrativeConfidence {
  const weighted = authorityWeightedSupportShape(args.supportShape, args.phase);
  const bands = [weighted.outside > 0, weighted.organization > 0, weighted.customer > 0].filter(Boolean).length;
  const pureOutside =
    args.supportShape.outside > 0 &&
    args.supportShape.organization === 0 &&
    args.supportShape.customer === 0;
  const outsideAuthorityOnly =
    weighted.outside > 0 &&
    weighted.organization === 0 &&
    weighted.customer === 0 &&
    normalizeAuthorityPhase(args.phase) !== "pre_diagnosis";
  if (args.hasContradiction) return "Contradicted by recent evidence";
  if (args.validatedSignalCount >= 2 && args.supportShape.customer > 0 && bands >= 2) return "Supported by multiple validated signals";
  if (pureOutside) return "Still highly uncertain";
  if (outsideAuthorityOnly) return "Still highly uncertain";
  if (bands > 0 && args.supportShape.customer === 0) return "Customer validation missing";
  if (bands >= 2 || args.supportShape.customer > 0) return "Evidence is starting to converge";
  if (args.matched.length === 0 || args.missingEvidenceCount >= 2 || args.criticalAssumptions.length >= 2) return "Still highly uncertain";
  return "Early directional read";
}

function determineMovement(args: {
  hasContradiction: boolean;
  route: RouteRow;
  matched: HypothesisProvenanceCard[];
  supportShape: { outside: number; organization: number; customer: number };
  validatedSignalCount: number;
  isLead: boolean;
  leadGap: number;
}) {
  const bands = [args.supportShape.outside > 0, args.supportShape.organization > 0, args.supportShape.customer > 0].filter(Boolean).length;
  const hasTension = args.matched.some((row) => row.hypothesis.hypothesis_kind === "inferred_tension");
  if (args.hasContradiction || ["contradicted", "needs_review", "stale", "revalidate"].includes(String(args.route.dependency_state || "").toLowerCase())) {
    return "weaken" as const;
  }
  if (hasTension && args.matched.length > 1) return "split" as const;
  if (args.isLead && args.leadGap >= 2 && args.supportShape.customer === 0 && args.validatedSignalCount === 0) return "narrow" as const;
  if ((args.validatedSignalCount >= 1 && args.supportShape.customer > 0) || bands >= 2) return "strengthen" as const;
  return "remain_unresolved" as const;
}

function determineReadiness(args: {
  route: RouteRow;
  matched: HypothesisProvenanceCard[];
  supportShape: { outside: number; organization: number; customer: number };
  validatedSignalCount: number;
  hasContradiction: boolean;
  missingEvidenceCount: number;
  criticalAssumptions: RouteAssumption[];
  confidenceLabel: RouteNarrativeConfidence;
  movement: RouteMovement;
  linkSource: RouteRationale["linkSource"];
}) {
  const bands = [args.supportShape.outside > 0, args.supportShape.organization > 0, args.supportShape.customer > 0].filter(Boolean).length;
  const nonFresh = ["contradicted", "needs_review", "stale", "revalidate"].includes(String(args.route.dependency_state || "").toLowerCase());
  const customerBacked = args.supportShape.customer > 0;
  const outsideOnly = args.supportShape.outside > 0 && args.supportShape.organization === 0 && args.supportShape.customer === 0;
  const assumptionsClear = args.criticalAssumptions.length === 0;
  const majorUnresolvedDependency =
    args.linkSource === "no_support" &&
    args.criticalAssumptions.length >= 2 &&
    args.missingEvidenceCount >= 2;

  if (args.hasContradiction || nonFresh || args.movement === "weaken" || majorUnresolvedDependency) {
    return "Hold" as const;
  }

  if (
    (customerBacked || args.validatedSignalCount >= 2) &&
    assumptionsClear &&
    args.missingEvidenceCount <= 1 &&
    bands >= 2 &&
    args.confidenceLabel !== "Still highly uncertain"
  ) {
    return "Commit" as const;
  }

  if (outsideOnly && args.linkSource !== "graph_linked") {
    return "Investigate" as const;
  }

  if (
    args.linkSource === "no_support" ||
    args.confidenceLabel === "Early directional read" ||
    args.confidenceLabel === "Still highly uncertain"
  ) {
    return "Investigate" as const;
  }

  return "Validate" as const;
}

function primaryWhy(
  seed: RouteRationaleSeed,
  matched: HypothesisProvenanceCard[],
  explicitLinks: RouteHypothesisDependency[],
  phase: string,
  strategicCenter: StrategicCenter | null,
  themes: Theme[],
) {
  if (
    strategicCenter?.shouldLeadExplanations &&
    strategicCenter.label &&
    normalizeAuthorityPhase(phase) !== "pre_diagnosis" &&
    routeMatchesCenter(strategicCenter, themes)
  ) {
    return `This route matters because the emerging strategy appears centered on ${strategicCenter.label}.`;
  }
  const top = [...matched].sort((a, b) => hypothesisAuthorityScore(b, phase) - hypothesisAuthorityScore(a, phase))[0];
  if (!top) return routeWhyFallback(seed);
  const leadingLink =
    explicitLinks.find((link) => link.hypothesisId === top.hypothesis.id && link.dependencyType !== "contradicts") ?? null;
  const statement = lowerFirst(stripPeriod(top.hypothesis.statement));
  if (leadingLink?.dependencyType === "assumes") {
    return `This route stays viable if ${statement}.`;
  }
  if (leadingLink?.dependencyType === "constrains") {
    return `This route stays relevant because ${statement}.`;
  }
  return `This route rises because ${statement}.`;
}

function dependencyRank(type: RouteHypothesisDependency["dependencyType"]) {
  if (type === "contradicts") return 4;
  if (type === "assumes") return 3;
  if (type === "constrains") return 2;
  return 1;
}

function strengthRank(value: RouteHypothesisDependency["strength"]) {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function graphRelevanceScore(links: RouteHypothesisDependency[]) {
  return links.reduce((sum, link) => sum + strengthRank(link.strength) * 4 + dependencyRank(link.dependencyType), 0);
}

export function buildRouteRationales(args: {
  seeds: StrategicCenterRouteSeed[];
  hypotheses: HypothesisProvenanceCard[];
  routeLinks?: RouteHypothesisDependency[];
  selectedRouteId?: string | null;
  recommendedRouteId?: string | null;
  phase?: string;
}) {
  const phase = normalizeAuthorityPhase(args.phase || "diagnose");
  const activeHypotheses = args.hypotheses.filter((row) => row.hypothesis.is_active);
  const activeHypothesisMap = new Map(activeHypotheses.map((row) => [row.hypothesis.id, row]));
  const strategicCenter = inferStrategicCenter({
    activeRows: activeHypotheses,
    routeSeeds: args.seeds,
    phase,
  });
  const identityNarrative = inferIdentityNarrative({
    activeRows: activeHypotheses,
    routeSeeds: args.seeds,
    phase,
    strategicCenter,
  });
  const routeLinksByRouteId = new Map<string, RouteHypothesisDependency[]>();
  for (const link of args.routeLinks ?? []) {
    if (!activeHypothesisMap.has(link.hypothesisId)) continue;
    const bucket = routeLinksByRouteId.get(link.routeId) ?? [];
    bucket.push(link);
    routeLinksByRouteId.set(link.routeId, bucket);
  }

  const prelim = args.seeds.map((seed) => {
    const explicitLinks = [...new Map((routeLinksByRouteId.get(seed.route.id) ?? []).map((link) => [`${link.hypothesisId}:${link.dependencyType}`, link])).values()]
      .sort((a, b) => {
        const strengthDelta = strengthRank(b.strength) - strengthRank(a.strength);
        if (strengthDelta !== 0) return strengthDelta;
        return dependencyRank(b.dependencyType) - dependencyRank(a.dependencyType);
      });
    const fallbackMatched = activeHypotheses
      .map((row) => ({ row, score: scoreHypothesisMatch(seed, row, phase) }))
      .filter((entry) => entry.score >= 3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const matchedRows = (
      explicitLinks.length > 0
        ? explicitLinks
            .map((link) => activeHypothesisMap.get(link.hypothesisId) ?? null)
            .filter((row): row is HypothesisProvenanceCard => Boolean(row))
        : fallbackMatched.map((entry) => entry.row)
    ).sort((a, b) => hypothesisAuthorityScore(b, phase) - hypothesisAuthorityScore(a, phase));
    const supportShape = aggregateSupportShape(matchedRows);
    const validatedSignalCount = matchedRows.reduce((sum, row) => sum + countValidatedSignals(row), 0);
    const hasContradiction = matchedRows.some(
      (row) => row.weakeningClaims.length > 0 || row.hypothesis.hypothesis_state === "contradicted",
    ) || explicitLinks.some((link) => link.dependencyType === "contradicts");
    const themes = detectThemes([routeText(seed), ...matchedRows.map(hypothesisText)].join(" "));
    const criticalAssumptions = seed.assumptions.filter((assumption) => assumption.critical && assumption.status === "unproven");
    const missingEvidenceCount = seed.evidence.filter((item) => item.status === "missing").length;
    const relevanceScore =
      explicitLinks.length > 0
        ? graphRelevanceScore(explicitLinks)
        : fallbackMatched.reduce((sum, entry) => sum + entry.score, 0);
    const supportingEvidenceLines = uniqueLines(
      matchedRows.flatMap((row) => [row.hypothesis.statement, ...supportingClaimText(row)]),
      4,
    );
    const weakeningEvidenceLines = uniqueLines(
      matchedRows.flatMap((row) => {
        const linkedAsContradiction = explicitLinks.some((link) => link.hypothesisId === row.hypothesis.id && link.dependencyType === "contradicts");
        return [
          row.hypothesis.hypothesis_kind === "inferred_tension" || linkedAsContradiction ? row.hypothesis.statement : null,
          ...weakeningClaimText(row),
        ];
      }),
      3,
    );
    const linkSource =
      explicitLinks.length > 0
        ? "graph_linked"
        : matchedRows.length > 0
          ? "fallback_matched"
          : "no_support";

    return {
      seed,
      matchedRows,
      explicitLinks,
      supportShape,
      validatedSignalCount,
      hasContradiction,
      themes,
      criticalAssumptions,
      missingEvidenceCount,
      relevanceScore,
      supportingEvidenceLines,
      weakeningEvidenceLines,
      linkSource,
    };
  });

  const leadId = args.selectedRouteId || args.recommendedRouteId || prelim.sort((a, b) => b.relevanceScore - a.relevanceScore)[0]?.seed.route.id || null;
  const sortedScores = prelim.map((entry) => entry.relevanceScore).sort((a, b) => b - a);
  const leadGap = sortedScores.length >= 2 ? sortedScores[0] - sortedScores[1] : sortedScores[0] ?? 0;

  return prelim.map((entry) => {
    const isLead = entry.seed.route.id === leadId;
    const confidenceLabel = determineConfidence({
      phase,
      matched: entry.matchedRows,
      supportShape: entry.supportShape,
      validatedSignalCount: entry.validatedSignalCount,
      hasContradiction: entry.hasContradiction,
      missingEvidenceCount: entry.missingEvidenceCount,
      criticalAssumptions: entry.criticalAssumptions,
    });
    const movement = determineMovement({
      hasContradiction: entry.hasContradiction,
      route: entry.seed.route,
      matched: entry.matchedRows,
      supportShape: entry.supportShape,
      validatedSignalCount: entry.validatedSignalCount,
      isLead,
      leadGap,
    });
    const readiness = determineReadiness({
      route: entry.seed.route,
      matched: entry.matchedRows,
      supportShape: entry.supportShape,
      validatedSignalCount: entry.validatedSignalCount,
      hasContradiction: entry.hasContradiction,
      missingEvidenceCount: entry.missingEvidenceCount,
      criticalAssumptions: entry.criticalAssumptions,
      confidenceLabel,
      movement,
      linkSource: entry.linkSource,
    });

    return {
      routeId: entry.seed.route.id,
      routeTitle: entry.seed.route.title || "Untitled route",
      confidenceLabel,
      movement,
      movementLabel: movementLabel(movement),
      readiness,
      readinessMeaning: readinessMeaning(readiness),
      whyThisRouteExists: primaryWhy(
        entry.seed,
        entry.matchedRows,
        entry.explicitLinks,
        phase,
        strategicCenter,
        entry.themes,
      ),
      whatSupportsIt: supportSummary(
        phase,
        entry.supportShape,
        entry.themes,
        entry.matchedRows.length,
        entry.matchedRows,
        entry.matchedRows[0]?.hypothesis.statement ?? null,
        strategicCenter,
        identityNarrative,
      ),
      uncertainty: uncertaintySummary({
        phase,
        hasContradiction: entry.hasContradiction,
        hasCustomer: entry.supportShape.customer > 0,
        missingEvidenceCount: entry.missingEvidenceCount,
        criticalAssumptions: entry.criticalAssumptions,
        route: entry.seed.route,
        matched: entry.matchedRows,
        strategicCenter,
        identityNarrative,
      }),
      mustBecomeTrue: mustBecomeTrueSummary({
        criticalAssumptions: entry.criticalAssumptions,
        matched: entry.matchedRows,
        themes: entry.themes,
        strategicCenter,
      }),
      couldWeaken: couldWeakenSummary({
        weakeningLines: entry.weakeningEvidenceLines,
        route: entry.seed.route,
        themes: entry.themes,
      }),
      supportingEvidenceLines: entry.supportingEvidenceLines,
      weakeningEvidenceLines: entry.weakeningEvidenceLines,
      relevanceScore: entry.relevanceScore,
      matchedHypothesisIds: entry.matchedRows.map((row) => row.hypothesis.id),
      supportShape: entry.supportShape,
      linkSource: entry.linkSource,
    } satisfies RouteRationale;
  });
}
