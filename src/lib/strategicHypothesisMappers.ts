import type { Claim } from "./evidenceDomain.ts";
import { normalizeClaimKey, normalizeStatement } from "./evidenceDomain.ts";
import type {
  StrategicHypothesisCandidate,
  StrategicHypothesisDraft,
  StrategicHypothesisKind,
  StrategicHypothesisState,
} from "./strategicHypothesisDomain.ts";

function normalizeComparisonText(value: unknown) {
  return normalizeStatement(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: unknown) {
  return normalizeComparisonText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !new Set(["this", "that", "with", "from", "into", "more", "than", "where", "when", "what", "have", "will", "been", "their", "they", "them", "company", "public", "customer", "customers", "cafe", "cafes", "coffee", "support", "proof", "brand"]).has(part));
}

function sharedTokenCount(a: unknown, b: unknown) {
  const aTokens = [...new Set(tokenize(a))];
  const bTokens = new Set(tokenize(b));
  let matches = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) matches += 1;
  }
  return matches;
}

function totalSupportCount(claim: Pick<Claim, "outside_support_count" | "organization_support_count" | "customer_support_count">) {
  return (claim.outside_support_count ?? 0) + (claim.organization_support_count ?? 0) + (claim.customer_support_count ?? 0);
}

function activeBandCount(claim: Pick<Claim, "outside_support_count" | "organization_support_count" | "customer_support_count">) {
  return [
    claim.outside_support_count ?? 0,
    claim.organization_support_count ?? 0,
    claim.customer_support_count ?? 0,
  ].filter((count) => count > 0).length;
}

function guessTopic(claim: Pick<Claim, "topic">): StrategicHypothesisDraft["topic"] {
  const normalized = String(claim.topic || "").trim().toLowerCase();
  if (!normalized || normalized === "unknown") return null;
  return normalized as StrategicHypothesisDraft["topic"];
}

function looksLikeRealTension(text: string) {
  return /(conflict|contradict|ambiguity|proof gap|unclear|vs\.|versus|cannot both be true)/i.test(text);
}

function startsWithQuestion(text: string) {
  return /^(what|how|why|when|where|which)\b/i.test(text);
}

function looksRouteLike(text: string) {
  return /^(build|create|define|deliver|ensure|establish|identify|improve|increase|maximize|minimize|optimize|reduce|replace|select|validate)\b/i.test(text);
}

function hasUncertaintyLanguage(text: string) {
  return /\b(may|might|could|appears to|depends on|may require|may only work if|may be constrained by)\b/i.test(text);
}

function looksLikeWeakOutsideDescription(text: string) {
  return /(declared in page metadata|referenced in script asset|company social\/profile|public sources may include similarly named entities|clear contact points|contact points for|volunteer opportunities range|numerous news outlets report|advisory board includes|raised over|annual star studded fundraiser|celebrity involvement|launched with a 10 million goal|successful fundraisers|company blog|social media presence|site states soon|potential upcoming products|digital content|contact form for inquiries)/i.test(text);
}

function looksLikeWeakOrgStrategyFact(text: string) {
  return /(will position|will productize|will achieve|will build|aims to create|is targeting|provides clear|primary opportunity is|solution is differentiated by|is a strategic decision system that|category defining|high value engagements|specific outcomes do .* aim for)/i.test(text);
}

function canBecomeCandidateAssumption(text: string) {
  return /(assum|depends|requires|relies|favors depth|position .* rather than|fit over|proof|flagship engagements|value proposition relies|partner fit|support can scale|buyers valuing|volume threshold|repeat purchasing)/i.test(text);
}

function shouldGenerateHypothesisFromClaim(claim: Claim) {
  const statement = normalizeStatement(claim.statement);
  const normalized = normalizeComparisonText(statement);
  const topic = String(claim.topic || "").trim().toLowerCase();
  if (topic === "route" || topic === "job" || topic === "unknown") return false;
  if (totalSupportCount(claim) === 0) return false;
  if (statement.length > 160) return false;
  if (startsWithQuestion(statement)) return false;
  if (looksRouteLike(statement)) return false;
  if (looksLikeWeakOutsideDescription(normalized)) return false;
  if (/current state of discovery|lack of validated|evidence confidence|robust validation|reliability of opportunities/i.test(normalized)) return false;

  if ((claim.outside_support_count ?? 0) > 0) {
    if (looksLikeWeakOutsideDescription(normalized)) return false;
    return true;
  }
  if ((claim.claim_type === "strategic_belief" || claim.claim_type === "hypothesis") && (claim.organization_support_count ?? 0) > 0) {
    if (looksLikeWeakOrgStrategyFact(normalized) && !canBecomeCandidateAssumption(normalized)) return false;
    return canBecomeCandidateAssumption(normalized);
  }
  if (claim.triangulation_state === "contradicted" && ((claim.organization_support_count ?? 0) > 0 || (claim.outside_support_count ?? 0) > 0)) return true;
  return false;
}

function hypothesisKindFromClaim(claim: Claim): StrategicHypothesisKind {
  const normalized = normalizeComparisonText(claim.statement);
  if (claim.triangulation_state === "contradicted" || looksLikeRealTension(normalized)) return "inferred_tension";
  if (claim.claim_type === "strategic_belief" || claim.claim_type === "hypothesis") return "candidate_assumption";
  return "directional_hypothesis";
}

function hypothesisStatementFromClaim(claim: Claim, kind: StrategicHypothesisKind) {
  const statement = normalizeStatement(claim.statement);
  const normalized = normalizeComparisonText(statement);

  if (!statement || startsWithQuestion(statement)) return null;
  if (looksRouteLike(statement)) return null;
  if (looksLikeWeakOutsideDescription(normalized)) return null;
  if (/current state of discovery|lack of validated|evidence confidence|robust validation|reliability of opportunities|declared in page metadata|referenced in script asset|social profile/i.test(normalized)) {
    return null;
  }

  if (kind === "candidate_assumption") {
    if (/(assume|depends|requires|relies)/.test(normalized)) {
      if (hasUncertaintyLanguage(statement)) return statement;
      return statement.replace(/\.$/, "").replace(/^their\b/i, "The model").replace(/^the company\b/i, "The model") + ".";
    }
    return null;
  }

  if (kind === "inferred_tension") {
    if (hasUncertaintyLanguage(statement)) return statement;
    if (looksLikeRealTension(statement)) return statement;
    return null;
  }

  if (hasUncertaintyLanguage(statement)) return statement;
  return null;
}

function deriveWhatMustBeTrue(statement: string, kind: StrategicHypothesisKind, claim: Claim) {
  const normalized = normalizeComparisonText(statement);
  const items = new Set<string>();

  if (kind === "inferred_tension") {
    items.add("Customer or market evidence must confirm that this tension changes real buyer behavior.");
  } else if (kind === "candidate_assumption") {
    items.add("Customer evidence must eventually confirm this internal strategic assumption.");
  } else {
    items.add("Further evidence must confirm that this directional pattern matters in real decisions.");
  }

  if (/(support|documentation|training)/.test(normalized)) {
    items.add("Operators must use support quality as a trust signal when choosing or keeping a supplier.");
  }
  if (/(switching risk|switching costs|easy to perceive)/.test(normalized)) {
    items.add("Supplier switching must remain easy enough that proof gaps change behavior.");
  }
  if (/(operational proof|artisanal quality)/.test(normalized)) {
    items.add("Buyers must need more operational proof than current public positioning provides.");
  }
  if (/(reliability|repeat purchasing confidence)/.test(normalized)) {
    items.add("Reliability concerns must influence repeat purchase or retention decisions.");
  }
  if (/(partner fit|wholesale reach|volume threshold)/.test(normalized)) {
    items.add("Selective partner fit must outperform broader reach in relationship quality or growth.");
  }
  if (claim.customer_support_count > 0) {
    items.add("The current customer evidence must hold under broader validation, not just isolated examples.");
  }

  return [...items].slice(0, 3);
}

function validationStateFromCandidate(kind: StrategicHypothesisKind, claim: Claim, weakeningCount: number): StrategicHypothesisDraft["validation_state"] {
  if (weakeningCount > 0 && kind !== "inferred_tension") return "contradicted";
  if ((claim.customer_support_count ?? 0) > 0) return "directional";
  if (activeBandCount(claim) >= 2 && (claim.outside_support_count ?? 0) > 0) return "directional";
  return "unvalidated";
}

function confidenceFromCandidate(state: StrategicHypothesisState, claim: Claim): StrategicHypothesisDraft["confidence"] {
  if (state === "strengthened" && (claim.customer_support_count ?? 0) > 0 && activeBandCount(claim) >= 2) return "high";
  if (state === "strengthened" || state === "emerging") return "medium";
  return "low";
}

function stageFromCandidate(args: {
  kind: StrategicHypothesisKind;
  claim: Claim;
  weakeningCount: number;
}): StrategicHypothesisState {
  if (args.weakeningCount > 0 && args.kind !== "inferred_tension") return "contradicted";
  const bandCount = activeBandCount(args.claim);
  if (args.kind === "inferred_tension") {
    if (args.claim.customer_support_count > 0 || bandCount >= 3) return "strengthened";
    if (bandCount >= 2 || totalSupportCount(args.claim) >= 2) return "emerging";
    return "inferred";
  }
  if (args.claim.customer_support_count > 0 && bandCount >= 2) return "strengthened";
  if (bandCount >= 3) return "strengthened";
  if (bandCount >= 2) return "emerging";
  if (args.claim.customer_support_count > 0) return "emerging";
  return "inferred";
}

function similarityScore(a: string, b: string) {
  return sharedTokenCount(a, b);
}

export function matchReframedHypothesis(previous: Pick<StrategicHypothesisDraft, "statement" | "hypothesis_kind" | "topic">, next: Pick<StrategicHypothesisDraft, "statement" | "hypothesis_kind" | "topic">) {
  if (previous.hypothesis_kind !== next.hypothesis_kind) return 0;
  if ((previous.topic || null) !== (next.topic || null) && previous.topic && next.topic) return 0;
  return similarityScore(previous.statement, next.statement);
}

export function buildStrategicHypothesisCandidates(companyId: string, claims: Claim[]): StrategicHypothesisCandidate[] {
  const eligibleClaims = claims.filter(shouldGenerateHypothesisFromClaim);
  const candidateMap = new Map<string, StrategicHypothesisCandidate>();

  for (const claim of eligibleClaims) {
    const kind = hypothesisKindFromClaim(claim);
    const statement = hypothesisStatementFromClaim(claim, kind);
    if (!statement) continue;
    const topic = guessTopic(claim);
    const hypothesisKey = `${kind}:${normalizeClaimKey(statement)}`;
    if (!hypothesisKey || hypothesisKey.endsWith(":")) continue;

    if (!candidateMap.has(hypothesisKey)) {
      candidateMap.set(hypothesisKey, {
        hypothesis: {
          company_id: companyId,
          hypothesis_key: hypothesisKey,
          statement,
          hypothesis_kind: kind,
          hypothesis_state: "inferred",
          topic,
          confidence: "low",
          validation_state: "unvalidated",
          what_must_be_true: [],
          source_run_id: null,
          reframed_from_hypothesis_id: null,
          is_active: true,
          raw_payload: { source_claim_ids: [claim.id] },
        },
        supportingClaimIds: [],
        weakeningClaimIds: [],
      });
    }

    candidateMap.get(hypothesisKey)!.supportingClaimIds.push(claim.id);
  }

  const candidates = [...candidateMap.values()];

  for (const candidate of candidates) {
    const supportingClaims = eligibleClaims.filter((claim) => candidate.supportingClaimIds.includes(claim.id));
    const primaryClaim = supportingClaims.sort((a, b) => totalSupportCount(b) - totalSupportCount(a))[0];
    if (!primaryClaim) continue;

    const weakeningClaimIds = claims
      .filter((claim) => !candidate.supportingClaimIds.includes(claim.id))
      .filter((claim) => claim.triangulation_state === "contradicted")
      .filter((claim) => similarityScore(claim.statement, candidate.hypothesis.statement) >= 2)
      .map((claim) => claim.id);

    candidate.weakeningClaimIds = [...new Set(weakeningClaimIds)].slice(0, 4);
    candidate.hypothesis.what_must_be_true = deriveWhatMustBeTrue(candidate.hypothesis.statement, candidate.hypothesis.hypothesis_kind, primaryClaim);
    candidate.hypothesis.validation_state = validationStateFromCandidate(candidate.hypothesis.hypothesis_kind, primaryClaim, candidate.weakeningClaimIds.length);
    candidate.hypothesis.hypothesis_state = stageFromCandidate({
      kind: candidate.hypothesis.hypothesis_kind,
      claim: primaryClaim,
      weakeningCount: candidate.weakeningClaimIds.length,
    });
    candidate.hypothesis.confidence = confidenceFromCandidate(candidate.hypothesis.hypothesis_state, primaryClaim);
    candidate.hypothesis.raw_payload = {
      source_claim_ids: candidate.supportingClaimIds,
      weakening_claim_ids: candidate.weakeningClaimIds,
      primary_claim_id: primaryClaim.id,
    };
  }

  return candidates
    .filter((candidate) => candidate.supportingClaimIds.length > 0)
    .sort((a, b) => {
      const stateRank = { strengthened: 5, emerging: 4, inferred: 3, contradicted: 2, reframed: 1, retired: 0 } as const;
      return (stateRank[b.hypothesis.hypothesis_state] ?? 0) - (stateRank[a.hypothesis.hypothesis_state] ?? 0);
    });
}
