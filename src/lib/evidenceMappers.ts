import {
  type ClaimCandidate,
  type ClaimDraft,
  type ClaimSignalRefRelationship,
  type ConfidenceLevel,
  type Directness,
  type EvidenceType,
  type FramingFit,
  type SignalDraft,
  type SignalBand,
  type SignalSourceType,
  type SignalTopic,
  type ValidationStatus,
  isCustomerSignalSourceType,
  normalizeClaimKey,
  normalizeStatement,
} from "./evidenceDomain.ts";

type RecordLike = Record<string, unknown>;

const GENERIC_MATCH_STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "what", "how", "when", "then",
  "your", "their", "will", "have", "make", "more", "less", "core", "work", "step", "team", "teams",
  "internal", "progress", "coffee", "cafe", "cafes", "owners", "owner", "operators", "operator",
  "customer", "customers", "specialty", "business", "brand", "partner", "partnership", "support",
  "quality", "product", "products", "service", "services", "current", "chosen", "real", "need",
  "main", "missing", "before", "starts",
]);

const GENERIC_CLAIM_PATTERNS = [
  /^decide what to focus on(?:\b|$)/i,
  /^validate customer needs(?:\b|$)/i,
  /^align teams around priorities(?:\b|$)/i,
  /^replace guesswork with evidence(?:\b|$)/i,
  /^limited information is available(?:\b|$)/i,
  /^social\/profile source linked from company website\.?$/i,
  /^declared in page metadata/i,
  /^evidence of .* exists\.?$/i,
  /^best[-\s]?fit customers are clearly defined\.?$/i,
  /^coherent:\s*/i,
  /^quality-conscious independent cafes and specialty venues as target market\.?$/i,
];

const META_ANALYSIS_PATTERNS = [
  /^discovery analysis:/i,
  /^odi analysis:/i,
  /^tension analysis:/i,
  /^gap note vs actual evidence:/i,
  /^confidence score .* unclear/i,
  /^low confidence scores?/i,
  /^\[inferred\]/i,
  /^steps like ['"]/i,
  /^underserved opportunity to/i,
  /not explicitly stated/i,
  /lack clear customer evidence/i,
  /\(importance:\s*\d+,\s*satisfaction:\s*\d+\)/i,
  /current state of discovery/i,
  /lacks robust validation/i,
  /critical steps/i,
  /reliability of opportunities identified/i,
  /analysis suggests/i,
  /without direct customer validation/i,
  /current positioning lacks concrete validation/i,
  /no direct evidence on/i,
  /unclear contract negotiation/i,
  /customer validated/i,
  /strategy cascade is coherent/i,
  /winning aspiration and where to play are not aligned/i,
  /high level goals/i,
  /detailed execution plans/i,
  /operational scalability is high/i,
  /evidence based brand growth/i,
  /clear supplier choice/i,
  /no clear evidence on/i,
  /lack of designed process/i,
  /low evidence confidence/i,
  /information about how these processes impact/i,
  /lack of external validation/i,
  /strategic confidence in the positioning/i,
  /insufficient validated evidence/i,
  /data or examples of how the templates are applied/i,
  /winning aspiration targets .* where[-\s]?to[-\s]?play includes/i,
  /these cannot both be true/i,
];

const OUTSIDE_NOISE_PATTERNS = [
  /^declared in page metadata/i,
  /^social\/profile source linked from company website/i,
  /^nav(?:igation)?\b/i,
  /^footer\b/i,
  /^home\b$/i,
  /\btarget market\b/i,
  /\bblocked\.invalid\b/i,
  /\b\d+\s+followers?\b/i,
  /\bemployees?\s+listed\b/i,
  /\bfood production\b/i,
  /\bsquarespace\b/i,
];

const IMPERATIVE_LEAD_PATTERNS = /^(build|create|decide|define|deliver|ensure|establish|identify|improve|increase|maximize|minimize|optimize|reduce|secure|select)\b/i;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparisonText(value: unknown) {
  return normalizeStatement(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeMeaningfulText(value: unknown, extraStopWords: string[] = []) {
  const extra = new Set(extraStopWords.map((token) => token.trim().toLowerCase()).filter(Boolean));
  return normalizeComparisonText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !GENERIC_MATCH_STOP_WORDS.has(part) && !extra.has(part));
}

function countSharedTokens(a: unknown, b: unknown, extraStopWords: string[] = []) {
  const aTokens = [...new Set(tokenizeMeaningfulText(a, extraStopWords))];
  const bSet = new Set(tokenizeMeaningfulText(b, extraStopWords));
  let matches = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) matches += 1;
  }
  return matches;
}

function startsWithQuestionWord(text: string) {
  return /^(how|what|why|when|where|who|which|can|could|should|would|do|does|did|is|are)\b/i.test(text);
}

function looksLikeQuotedExcerpt(text: string) {
  return /^["']/.test(text) || / - r\/[a-z0-9_]+/i.test(text);
}

function looksLikeOutsideNoise(text: string) {
  return OUTSIDE_NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

function stripBoilerplatePrefix(text: string) {
  return text
    .replace(/^(?:\[[^\]]+\]\s*)+/i, "")
    .replace(/^(the document|this document|the analysis|analysis|research)\s+(highlights|shows|suggests|indicates|reveals)\s+/i, "")
    .replace(/^the most critical unmet need, by frequency and emotional intensity, is this:\s*/i, "")
    .replace(/^for cafe (owners|operators):\s*/i, "")
    .replace(/^according to public sources,\s*/i, "")
    .replace(/^public sources suggest that\s*/i, "")
    .trim();
}

function looksLikeFeatureList(text: string) {
  const normalized = normalizeStatement(text);
  return (
    normalized.split(",").length >= 3 ||
    /(barra roast method|partner fit profile|last mile excellence)/i.test(normalized)
  );
}

function looksLikeLowValueOutsideDescription(text: string) {
  const normalized = normalizeComparisonText(text);
  return (
    /(primary buyers include|serves both direct consumers|targets coffee consumers|quality conscious independent cafes|specialty venues as target market|customer engagement includes tastings|contact options offered|company blog|social media presence|geographic presence|sales channels include|partnerships aiming to provide best roasted coffee)/.test(normalized)
  );
}

function looksLikeValidationLabelArtifact(text: string) {
  const normalized = normalizeComparisonText(text);
  return (
    /customer validated/.test(normalized) ||
    /^evidence of .* exists$/.test(normalized) ||
    /^best fit customers are clearly defined$/.test(normalized)
  );
}

function takeLeadClause(text: string) {
  return normalizeStatement(text)
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)[0] || normalizeStatement(text);
}

function compactStatement(text: string) {
  return normalizeStatement(text)
    .replace(/\b(cafe owners?|operators?|teams?)\b/gi, "Cafe operators")
    .replace(/\b(roasters?)\b/gi, "suppliers")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeCustomerEvidence(text: string) {
  const normalized = normalizeComparisonText(text);
  if (!normalized) return null;
  if (/^\bi\b/.test(normalized) && /(bag|subscription service|trusted supplier|relied on|rely on|supplier|coffee)/.test(normalized)) {
    return "Customer evidence describes disappointment with a previously trusted supplier.";
  }
  if (/(i received a bag|subscription service|i ve relied|ive relied)/.test(normalized) && /(under roasted|underroasted|not roasted enough|inconsistent|quality)/.test(normalized)) {
    return "Customer evidence describes disappointment with roast quality from a previously trusted supplier.";
  }
  if (/^\bi\b/.test(normalized) && /(quality|trust|reliab|support|dial|consisten|batch)/.test(normalized)) {
    return "Customer evidence describes operational frustration tied to coffee quality and supplier reliability.";
  }
  if (/(under roasted|underroasted|roast inconsisten|batch inconsisten|quality variance|crop years)/.test(normalized)) {
    return "Cafe operators report inconsistent roast quality across batches.";
  }
  if (/(dial in|dialin|new coffee arrives|new batch)/.test(normalized)) {
    return "New coffee arrivals create dial-in burden for cafe teams.";
  }
  if (/(support|responsiveness|response time|reach out)/.test(normalized) && /(reliab|trust|confiden)/.test(normalized)) {
    return "Support responsiveness appears tied to perceived supplier reliability.";
  }
  if (/(staff dependence|individual knowledge|single person|tribal knowledge)/.test(normalized)) {
    return "Cafe teams rely on individual staff knowledge to maintain quality consistency.";
  }
  if (/(partner|supplier|roaster)/.test(normalized) && /(reliab|consisten|risk)/.test(normalized)) {
    return "Reliability concerns appear tied to repeat purchasing confidence.";
  }
  if (/(support|documentation|training)/.test(normalized)) {
    return "Cafe operators report needing more hands-on support to maintain coffee quality.";
  }
  if (/(quality|consisten|variance|reliab|support|trust|dial)/.test(normalized)) {
    const clause = compactStatement(takeLeadClause(text));
    if (IMPERATIVE_LEAD_PATTERNS.test(clause)) {
      return clause
        .replace(/^increase speed to confident dial in/i, "Cafe operators need faster confidence when dialing in new coffee")
        .replace(/^reduce dependence on individual staff knowledge/i, "Cafe teams rely too heavily on individual staff knowledge")
        .replace(/^maximize customer perception of consistency/i, "Customer confidence depends on perceived coffee consistency")
        .replace(/^improve the predictability and reliability of partnerships/i, "Partnership reliability is affecting perceived supplier trust")
        .replace(/^cafe owners need to secure/i, "Cafe operators need to secure")
        .replace(/^cafes must reduce/i, "Cafe teams need to reduce")
        .replace(/^cafes should prioritize/i, "Cafe teams are pressured to prioritize")
        .replace(/^cafes must improve their ability to quickly dial in/i, "Cafe teams struggle to dial in new coffee quickly")
        .replace(/^secure a bean supply that performs consistently/i, "Bean supply consistency is affecting operating confidence")
        .replace(/^build a roaster partnership that reduces operational risk/i, "Cafe operators want suppliers to reduce operational risk")
        .replace(/^deliver a customer experience that justifies specialty pricing/i, "Coffee consistency affects whether specialty pricing feels justified")
        .replace(/\.$/, "") + ".";
    }
  }
  return compactStatement(takeLeadClause(text));
}

function summarizeOrganizationEvidence(claimText: string, evidenceText: string) {
  const claim = normalizeComparisonText(claimText);
  const evidence = normalizeComparisonText(evidenceText || claimText);
  if (!claim && !evidence) return null;
  if (looksLikeValidationLabelArtifact(claimText) || looksLikeValidationLabelArtifact(evidenceText)) return null;
  if (META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(claimText)) || META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(evidenceText))) {
    return null;
  }
  if (looksLikeFeatureList(claimText) || looksLikeFeatureList(evidenceText)) return null;
  return compactStatement(takeLeadClause(claimText || evidenceText));
}

function summarizeOutsideEvidence(text: string) {
  const normalized = normalizeComparisonText(text);
  if (!normalized) return null;
  if (looksLikeOutsideNoise(text)) return null;
  if (looksLikeFeatureList(text)) return null;
  if (looksLikeLowValueOutsideDescription(text)) return null;
  if (
    /(located in|operates primarily|followers|employees listed|website blocked|blog content|various arabica|direct online store|physical venues|geographic markets|small batch|hand roasted|product offerings?|flavor profiles?|versatility for multiple brewing methods|coffee consumers seeking|business customers looking for wholesale|customer engagement includes|tastings or consultation meetings|quality conscious independent cafes|sales channels include)/.test(normalized) &&
    !/(ambiguity|switching|support|trust|loyalty|proof|risk)/.test(normalized)
  ) {
    return null;
  }
  if (/(competitor|other roaster|winning trust)/.test(normalized) && /(support|hands on|documentation|training)/.test(normalized)) {
    return "Competitors appear to win trust through hands-on operational support.";
  }
  if (/(small batch|hand roasted|carefully extract)/.test(normalized)) {
    return "Public positioning emphasizes artisanal quality more than operational proof.";
  }
  if (/(switching costs|brand loyalty)/.test(normalized)) {
    return "Public market signals suggest customer switching costs remain low.";
  }
  if (/(ambiguity|same corporate entity|different company|separate cafe barra entity)/.test(normalized)) {
    return "Public sources create ambiguity about which Cafe Barra entity the brand represents.";
  }
  if (/(business to business relationships as partnerships|best roasted coffee to partner outlets)/.test(normalized)) {
    return null;
  }
  return compactStatement(takeLeadClause(text));
}

function synthesizeEvidenceStatement(signal: SignalDraft & { id?: string }) {
  const rawClaim = normalizeStatement(signal.claim_text);
  const rawEvidence = normalizeStatement(signal.evidence_excerpt || signal.claim_text);
  const baseText = stripBoilerplatePrefix(rawClaim || rawEvidence);
  if (!baseText) return null;

  if (signal.source_type === "public_baseline_run" && looksLikeOutsideNoise(baseText)) return null;
  if (GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(baseText))) return null;
  if (META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(baseText))) return null;
  if (looksLikeValidationLabelArtifact(baseText)) return null;

  if (signal.signal_band === "customer") {
    return summarizeCustomerEvidence(rawEvidence || rawClaim);
  }
  if (signal.signal_band === "organization") {
    return summarizeOrganizationEvidence(rawClaim, rawEvidence || rawClaim);
  }
  return summarizeOutsideEvidence(rawEvidence || rawClaim);
}

function canonicalizeClaimStatement(signal: SignalDraft & { id?: string }) {
  let text = synthesizeEvidenceStatement(signal);
  if (!text) return null;
  text = stripBoilerplatePrefix(text)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+-\s+r\/[a-z0-9_]+.*$/i, "")
    .trim();

  if (!text) return null;
  if (startsWithQuestionWord(text)) return null;
  if (GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) return null;
  if (META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(text))) return null;
  if (signal.source_type === "public_baseline_run" && looksLikeOutsideNoise(text)) return null;
  if (signal.framework === "dify_question" || normalizeComparisonText(signal.topic) === "question") return null;
  if (signal.validation_status === "contradicted" && !looksLikeRealContradiction(text)) return null;

  if (signal.structure_level !== "interpreted" && looksLikeQuotedExcerpt(text)) return null;
  if (/(codi ed|co ff ee|coî|coé)/i.test(text)) return null;
  if (text.length > 160) return null;
  if (text.length < 32 && GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) return null;
  if (text.split(" ").length < 4) return null;

  return text;
}

function normalizeTopicAlias(value: string) {
  const normalized = normalizeComparisonText(value);
  if (!normalized) return "unknown";
  if (normalized.includes("outside voice")) return "market";
  if (normalized.includes("job map")) return "job";
  if (normalized.includes("jtbd")) return "job";
  if (normalized.includes("opportunit")) return "need";
  if (normalized.includes("position")) return "positioning";
  if (normalized.includes("market")) return "market";
  if (normalized.includes("strategy") || normalized.includes("winning aspiration") || normalized.includes("where to play") || normalized.includes("how to win")) return "strategy";
  if (normalized.includes("route")) return "route";
  if (normalized.includes("outcome")) return "outcome";
  if (normalized.includes("problem")) return "problem";
  if (normalized.includes("need")) return "need";
  if (normalized.includes("proof")) return "proof";
  if (normalized.includes("job")) return "job";
  return normalized;
}

function inferTopicFromText(text: string, framework: string | null, existingTopic: string | null) {
  const normalizedTopic = normalizeTopicAlias(existingTopic || "");
  const normalizedText = normalizeComparisonText(text);
  let textTopic: SignalTopic = "unknown";
  if (/(cannot|can't|unable|struggle|difficult|delay|risk|mistake|problem|gap|unreliable|inconsistent|friction|troubleshooting)/.test(normalizedText)) {
    textTopic = "problem";
  }
  if (textTopic === "unknown" && /(success criteria|measurable|outcome|visibility|confidence|clarity)/.test(normalizedText)) {
    textTopic = "outcome";
  }
  if (textTopic === "unknown" && /(competitor|recipe|roast|offering|sourcing|supply|batch|taste|flavor)/.test(normalizedText)) {
    textTopic = "job";
  }
  if (textTopic === "unknown" && /(position|partner profile|brand led|where to play|winning aspiration)/.test(normalizedText)) {
    textTopic = "strategy";
  }
  if (textTopic === "unknown" && /(market|buyer|public sources|category)/.test(normalizedText)) {
    textTopic = "market";
  }

  if (
    normalizedTopic !== "unknown" &&
    normalizedTopic !== "question" &&
    !(textTopic !== "unknown" && ["problem", "outcome", "job"].includes(textTopic) && ["positioning", "strategy", "route", "market"].includes(normalizedTopic))
  ) {
    return normalizedTopic;
  }

  const frameworkTopic = topicFromFramework(framework || "", "unknown");
  if (frameworkTopic !== "unknown" && frameworkTopic !== "question" && textTopic === "unknown") return frameworkTopic;
  return textTopic;
}

function looksLikeNeedOrFriction(text: string) {
  return /(cannot|can't|unable|struggle|difficult|delay|risk|mistake|problem|gap|unreliable|inconsistent|friction|underserved|missing|lack|troubleshooting)/i.test(text);
}

function looksLikeOutcome(text: string) {
  return /(success criteria|measurable|confidence|visibility|clarity|repeat next cycle|detect when)/i.test(text);
}

function looksLikeRealContradiction(text: string) {
  return /\b(vs\.|versus|cannot both be true|conflicts? with|while .* includes)\b/i.test(text);
}

function isSignalProvenanceWorthy(signal: SignalDraft & { id?: string }) {
  if (signal.framework === "dify_question" || normalizeTopicAlias(signal.topic || "") === "question") return false;
  if (signal.source_type === "public_baseline_run" && looksLikeOutsideNoise(signal.claim_text)) return false;
  if (META_ANALYSIS_PATTERNS.some((pattern) => pattern.test(signal.claim_text))) return false;
  if (signal.source_type === "mojo_analysis" && signal.validation_status !== "contradicted") {
    const normalized = normalizeComparisonText(signal.claim_text);
    if (
      normalized.includes("analysis") ||
      normalized.includes("gap note") ||
      normalized.includes("unclear progress criteria") ||
      /^(increase|minimize|reduce|improve|align|ensure|select)\b/.test(normalized) ||
      normalized.includes("importance") ||
      normalized.includes("satisfaction") ||
      normalized.includes("lack clear customer evidence") ||
      normalized.includes("not explicitly stated")
    ) {
      return false;
    }
  }
  return Boolean(canonicalizeClaimStatement(signal));
}

function confidenceFromValue(value: unknown, fallback: ConfidenceLevel = "low"): ConfidenceLevel {
  const normalized = asString(value).toLowerCase();
  if (normalized === "high" || normalized === "medium" || normalized === "low") {
    return normalized;
  }
  return fallback;
}

function pushSignal(target: SignalDraft[], signal: SignalDraft | null | undefined) {
  if (!signal) return;
  if (!normalizeStatement(signal.claim_text)) return;
  target.push({
    ...signal,
    claim_text: normalizeStatement(signal.claim_text),
    evidence_excerpt: normalizeStatement(signal.evidence_excerpt),
    source_title: normalizeStatement(signal.source_title) || null,
    source_url: normalizeStatement(signal.source_url) || null,
    framework: normalizeStatement(signal.framework) || null,
    topic: normalizeStatement(signal.topic) || null,
    recency: normalizeStatement(signal.recency) || null,
  });
}

function defaultEvidenceTypeForBand(band: SignalBand, sourceType: string): EvidenceType {
  if (band === "outside") return "market_signal";
  if (band === "customer") return "customer_validation";
  if (sourceType === "founder_narrative" || sourceType === "manual_note") return "founder_narrative";
  return "internal_data";
}

function defaultValidationStatusForBand(band: SignalBand): ValidationStatus {
  if (band === "customer") return "directional";
  if (band === "outside") return "directional";
  return "unvalidated";
}

function looksLikeCustomerResearchSource(sourceType: string, sourceTitle: string) {
  if (isCustomerSignalSourceType(sourceType)) return true;
  const normalizedTitle = sourceTitle.toLowerCase();
  return /(interview|survey|transcript|customer[\s_-]?research|owner[\s_-]?research|buyer[\s_-]?research|user[\s_-]?research)/.test(normalizedTitle);
}

function detectBandFromSourceMeta(sourceType: string, sourceTitle: string): SignalBand {
  if (looksLikeCustomerResearchSource(sourceType, sourceTitle)) return "customer";
  return isCustomerSignalSourceType(sourceType) ? "customer" : "organization";
}

// Tunable heuristic — conservative by design; prefer precision over recall.
// Returns true when the leading subject is the company itself (first-person "we/our"
// or a proper-noun name) paired with an aspirational or strategic verb.
// These signals belong in the foundation/tensions layer, not in claims.
function isCompanySubjectStatement(text: string): boolean {
  const t = text.trim();
  // First-person "our …" — goal/mission/vision/aspiration declarations
  if (/^our (?:goal|aim|mission|vision|aspiration|winning aspiration|objective|purpose)\b/i.test(t)) return true;
  // First-person "we …" — aspirational/strategic verbs
  if (/^we (?:aim|seek|win|believe|aspire|intend|will|are committed|position|focus|strive)\b/i.test(t)) return true;
  // Third-person proper-noun company: "Edgewood aims to…" / "Edgewood Center for Children and Families aims to…"
  // Lowercase connectors (for/of/and/&/the/at/in/with) allowed between capitalized name words.
  // No 'i' flag on company-name segment so "the company aims to" doesn't match.
  if (/^(?:[A-Z][a-z]+)(?:\s+(?:[A-Z][a-z]+|for|of|and|&|the|at|in|with)){0,8}\s+(?:aims to|seeks to|is committed to|positions itself|wins by|aspires to|intends to|strives to)\b/.test(t)) return true;
  return false;
}

function detectEvidenceType(sourceType: string, signalBand: SignalBand, sourceTitle: string): EvidenceType {
  if (signalBand === "customer") return "customer_validation";
  if (sourceType === "public_baseline_run") return "market_signal";
  if (sourceType === "manual_note") return "founder_narrative";
  if (/metrics|revenue|conversion|retention|analytics|score/i.test(sourceTitle)) return "quantitative";
  return "internal_data";
}

function defaultCustomerDirectness(sourceType: string, sourceTitle: string): Directness {
  return isCustomerSignalSourceType(sourceType) ? "direct" : looksLikeCustomerResearchSource(sourceType, sourceTitle) ? "inferred" : "weak";
}

function topicFromFramework(framework: string, fallback: SignalTopic = "unknown"): SignalTopic {
  const normalized = framework.toLowerCase();
  if (normalized.includes("dunford")) return "positioning";
  if (normalized.includes("jtbd")) return "job";
  if (normalized.includes("odi")) return "need";
  if (normalized.includes("cascade")) return "strategy";
  if (normalized.includes("torres")) return "route";
  return fallback;
}

function claimTypeFromSignal(args: {
  statement: string;
  topic: string | null;
  signalBand: SignalBand;
  framework: string | null;
  validationStatus: ValidationStatus;
}): ClaimDraft["claim_type"] | null {
  const topic = normalizeTopicAlias(args.topic || "");
  const framework = String(args.framework || "").toLowerCase();
  const statement = normalizeComparisonText(args.statement);

  if (args.validationStatus === "contradicted") {
    return looksLikeRealContradiction(args.statement) ? "hypothesis" : null;
  }
  if (topic === "route") {
    if (args.signalBand === "customer") return looksLikeNeedOrFriction(args.statement) ? "unmet_need" : "observation";
    if (args.signalBand === "outside") return "inference";
    return "route_candidate";
  }
  if (topic === "outcome" || looksLikeOutcome(args.statement)) return "customer_outcome";
  if (topic === "need" || topic === "problem" || looksLikeNeedOrFriction(args.statement) || framework.includes("odi")) return "unmet_need";
  if (topic === "job" || framework.includes("jtbd")) return args.signalBand === "outside" ? "inference" : "observation";
  if (topic === "market") return "inference";
  if (topic === "positioning") {
    if (args.signalBand === "outside") return "inference";
    if (/(appears|depends|is creating|is defined|favors|relies|requires|currently)/.test(statement)) return "observation";
    return "strategic_belief";
  }
  if (topic === "strategy") {
    if (args.signalBand === "outside") return "inference";
    if (/(appears|depends|is creating|is defined|favors|relies|requires|currently)/.test(statement)) return "observation";
    if (/(aims to|positions itself|win condition|where to play|how to win|brand-led)/.test(statement)) return "strategic_belief";
    return "observation";
  }
  if (args.signalBand === "customer") return "observation";
  if (args.signalBand === "outside") return "inference";
  return "observation";
}

function normalizedNeedCoreText(value: string) {
  return normalizeStatement(value)
    .replace(/^increase confidence that\s+/i, "")
    .replace(/^increase clarity on\s+/i, "")
    .replace(/^increase visibility into\s+/i, "")
    .replace(/^minimize the time it takes to\s+/i, "")
    .replace(/^minimize the time to\s+/i, "")
    .replace(/^minimize delays caused by\s+/i, "")
    .replace(/^minimize mistakes while\s+/i, "")
    .replace(/^reduce the risk of\s+/i, "")
    .trim();
}

function normalizedStepIntentText(stepLabel: string, stepDescription: string) {
  return normalizeStatement(`${stepLabel} ${stepDescription}`)
    .replace(/^define desired progress/i, "progress success criteria")
    .replace(/^locate viable options/i, "identify competitors compare options")
    .replace(/^prepare for execution/i, "prepare inputs and conditions")
    .replace(/^confirm readiness/i, "confirm path inputs conditions")
    .replace(/^execute the job/i, "perform the core task")
    .replace(/^monitor results/i, "track progress signals")
    .replace(/^modify as needed/i, "adjust the approach")
    .replace(/^conclude and learn/i, "conclude and capture learning")
    .trim();
}

export function matchStrengthFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
}

export function scoreClaimToJobStepMatch(
  claim: Pick<ClaimDraft, "statement" | "topic" | "claim_type" | "triangulation_state">,
  step: { step_label?: string | null; description?: string | null },
) {
  const topic = normalizeTopicAlias(claim.topic || "");
  if (topic === "market" || topic === "positioning" || topic === "route" || topic === "proof") return 0;
  if (claim.claim_type === "route_candidate") return 0;

  const stepText = normalizedStepIntentText(String(step.step_label || ""), String(step.description || ""));
  const claimText = normalizeComparisonText(claim.statement);
  let score = countSharedTokens(claim.statement, stepText, ["owner", "owners", "operator", "operators"]);
  if (/(recipe|roast|batch|dial|flavor|taste)/.test(claimText) && /(recipe|roast|batch|dial|flavor|taste)/.test(stepText)) {
    score += 1;
  }
  if (/(support|trust|reliab|quality)/.test(claimText) && /(offering|evaluate|monitor|quality)/.test(stepText)) {
    score += 1;
  }
  if (score === 0) return 0;
  if (topic === "strategy") return score >= 2 ? score : 0;
  if (claim.triangulation_state === "contradicted") return score >= 1 ? score : 0;
  return score;
}

export function scoreClaimToNeedMatch(
  claim: Pick<ClaimDraft, "statement" | "topic" | "claim_type" | "triangulation_state">,
  need: { desired_outcome?: string | null },
) {
  const topic = normalizeTopicAlias(claim.topic || "");
  const allowedTypes = new Set(["observation", "hypothesis", "unmet_need", "customer_outcome"]);
  if (!allowedTypes.has(String(claim.claim_type || ""))) return 0;
  if (!(topic === "need" || topic === "problem" || topic === "outcome" || topic === "job" || topic === "unknown")) return 0;

  const needText = normalizedNeedCoreText(String(need.desired_outcome || ""));
  const score = countSharedTokens(claim.statement, needText, ["owner", "owners", "operator", "operators"]);
  if (score < 2) return 0;
  return score;
}

export function mapPublicBaselineOutputToSignals(args: {
  companyId: string;
  sourceId?: string | number | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  resultJson: unknown;
}): SignalDraft[] {
  const result = asRecord(args.resultJson) ?? {};
  const sourceId = args.sourceId == null ? null : String(args.sourceId);
  const sourceTitle = normalizeStatement(args.sourceTitle || "Public baseline run") || "Public baseline run";
  const sourceUrl = normalizeStatement(args.sourceUrl);
  const signals: SignalDraft[] = [];

  for (const item of asArray(result.outside_voice_signals)) {
    const record = asRecord(item);
    if (!record) continue;
    const claimText = asString(record.signal) || asString(record.perspective);
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: "public_baseline_run",
      source_title: sourceTitle,
      source_url: asString(record.url) || sourceUrl || null,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: claimText,
      evidence_excerpt: claimText,
      topic: "market",
      framework: "public_baseline",
      directness: "direct",
      recency: "recent",
      framing_fit: "partial",
      structure_level: "extracted",
      validation_status: "directional",
      confidence_to_use: confidenceFromValue(record.confidence, "medium"),
      raw_payload: record,
    });
  }

  for (const item of asArray(result.evidence_ledger)) {
    const record = asRecord(item);
    if (!record) continue;
    const claimText = asString(record.snippet) || asString(record.bucket);
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: "public_baseline_run",
      source_title: sourceTitle,
      source_url: asString(record.url) || sourceUrl || null,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: claimText,
      evidence_excerpt: asString(record.snippet) || claimText,
      topic: asString(record.bucket).toLowerCase() || "market",
      framework: "public_baseline",
      directness: asString(record.url) ? "direct" : "inferred",
      recency: "recent",
      framing_fit: "partial",
      structure_level: "extracted",
      validation_status: "directional",
      confidence_to_use: confidenceFromValue(record.confidence, "medium"),
      raw_payload: record,
    });
  }

  for (const item of asArray(result.top_hypotheses)) {
    const text = normalizeStatement(item);
    if (!text) continue;
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: "public_baseline_run",
      source_title: sourceTitle,
      source_url: sourceUrl || null,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: text,
      evidence_excerpt: text,
      topic: "market",
      framework: "public_baseline",
      directness: "inferred",
      recency: "recent",
      framing_fit: "partial",
      structure_level: "interpreted",
      validation_status: "unvalidated",
      confidence_to_use: "medium",
      raw_payload: { hypothesis: text },
    });
  }

  return signals;
}

export function mapDifyFileOutputToSignals(args: {
  companyId: string;
  sourceId?: string | null;
  sourceType?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  evidence?: unknown;
  contradictions?: unknown;
  frameworkResults?: unknown;
  questionsToVerify?: unknown;
  rawPayload?: unknown;
}): SignalDraft[] {
  const normalizedSourceType = normalizeStatement(args.sourceType || "file_proposal").toLowerCase() || "file_proposal";
  const sourceTitle = normalizeStatement(args.sourceTitle || "File proposal") || "File proposal";
  const signalBand = detectBandFromSourceMeta(normalizedSourceType, sourceTitle);
  const sourceType = (normalizedSourceType as SignalSourceType) || "file_proposal";
  const evidenceType = detectEvidenceType(sourceType, signalBand, sourceTitle);
  const sourceUrl = normalizeStatement(args.sourceUrl) || null;
  const sourceId = args.sourceId ?? null;
  const signals: SignalDraft[] = [];
  const customerDirectness = defaultCustomerDirectness(sourceType, sourceTitle);
  const customerFramingFit = isCustomerSignalSourceType(sourceType) ? "strong" : signalBand === "customer" ? "partial" : "partial";
  const customerConfidence = isCustomerSignalSourceType(sourceType) ? "high" : signalBand === "customer" ? "medium" : "medium";
  // Uploaded company documents get "strong" framing_fit so org-band signals can
  // satisfy Gate 1 ("supports"). mojo_analysis and unknown source types stay "partial".
  const FILE_SOURCE_TYPES = new Set(["file", "uploaded_file", "file_proposal"]);
  const orgFramingFit: "strong" | "partial" = FILE_SOURCE_TYPES.has(normalizedSourceType) ? "strong" : "partial";

  const summary = normalizeStatement(args.summary);
  if (summary) {
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: sourceType,
      source_title: sourceTitle,
      source_url: sourceUrl,
      signal_band: signalBand,
      evidence_type: evidenceType,
      claim_text: summary,
      evidence_excerpt: normalizeStatement(asArray(args.evidence)[0]) || summary,
      topic: signalBand === "customer" ? "problem" : "strategy",
      framework: "dify_summary",
      directness: signalBand === "customer" ? customerDirectness : "inferred",
      recency: null,
      framing_fit: signalBand === "customer" ? customerFramingFit : orgFramingFit,
      structure_level: "interpreted",
      validation_status: defaultValidationStatusForBand(signalBand),
      confidence_to_use: signalBand === "customer" ? customerConfidence : "medium",
      raw_payload: args.rawPayload ?? {},
    });
  }

  for (const item of asArray(args.evidence)) {
    const text = normalizeStatement(item);
    if (!text) continue;
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: sourceType,
      source_title: sourceTitle,
      source_url: sourceUrl,
      signal_band: signalBand,
      evidence_type: evidenceType,
      claim_text: text,
      evidence_excerpt: text,
      topic: signalBand === "customer" ? "problem" : (signalBand === "organization" && isCompanySubjectStatement(text) ? "strategy" : "unknown"),
      framework: null,
      directness: signalBand === "customer" ? customerDirectness : "inferred",
      recency: null,
      framing_fit: signalBand === "customer" ? customerFramingFit : orgFramingFit,
      structure_level: "extracted",
      validation_status: defaultValidationStatusForBand(signalBand),
      confidence_to_use: signalBand === "customer" ? customerConfidence : "medium",
      raw_payload: { evidence: text },
    });
  }

  for (const item of asArray(args.contradictions)) {
    const record = asRecord(item);
    const text = normalizeStatement(
      record
        ? record.claim ?? record.evidence ?? record.text ?? record.summary
        : item,
    );
    if (!text) continue;
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: sourceType,
      source_title: sourceTitle,
      source_url: sourceUrl,
      signal_band: signalBand,
      evidence_type: evidenceType,
      claim_text: text,
      evidence_excerpt: record ? asString(record.evidence) || text : text,
      topic: record ? asString(record.mojo_area) || (signalBand === "customer" ? "problem" : "unknown") : signalBand === "customer" ? "problem" : "unknown",
      framework: record ? asString(record.framework) || "dify_contradiction" : "dify_contradiction",
      directness: signalBand === "customer" ? customerDirectness : "inferred",
      recency: null,
      framing_fit: signalBand === "customer" ? customerFramingFit : "partial",
      structure_level: "interpreted",
      validation_status: "contradicted",
      confidence_to_use: confidenceFromValue(record?.confidence, "medium"),
      raw_payload: record ?? { contradiction: text },
    });
  }

  for (const result of asArray(args.frameworkResults)) {
    const resultRecord = asRecord(result);
    const framework = normalizeStatement(resultRecord?.framework);
    for (const finding of asArray(resultRecord?.findings)) {
      const findingRecord = asRecord(finding);
      if (!findingRecord) continue;
      const claimText = asString(findingRecord.claim);
      pushSignal(signals, {
        company_id: args.companyId,
        source_id: sourceId,
        source_type: sourceType,
        source_title: sourceTitle,
        source_url: sourceUrl,
        signal_band: signalBand,
        evidence_type: evidenceType,
        claim_text: claimText,
        evidence_excerpt: asString(findingRecord.evidence) || claimText,
        // D+A: org-band + discovery framework = company recommendation, not customer need.
        // Re-topic to "strategy" so Bug-2 excludes from claims; signal is retained in DB.
        topic: signalBand === "organization" &&
            (isCompanySubjectStatement(claimText) ||
              framework.includes("torres") || framework.includes("jtbd") || framework.includes("odi"))
          ? "strategy"
          : asString(findingRecord.mojo_area) || topicFromFramework(framework),
        framework: framework || null,
        directness: signalBand === "customer" ? customerDirectness : "inferred",
        recency: null,
        framing_fit: signalBand === "customer" ? customerFramingFit : orgFramingFit,
        structure_level: "interpreted",
        validation_status: defaultValidationStatusForBand(signalBand),
        confidence_to_use: confidenceFromValue(findingRecord.confidence, signalBand === "customer" ? customerConfidence : "medium"),
        raw_payload: findingRecord,
      });
    }
  }

  for (const item of asArray(args.questionsToVerify)) {
    const text = normalizeStatement(item);
    if (!text) continue;
    pushSignal(signals, {
      company_id: args.companyId,
      source_id: sourceId,
      source_type: sourceType,
      source_title: sourceTitle,
      source_url: sourceUrl,
      signal_band: signalBand,
      evidence_type: defaultEvidenceTypeForBand(signalBand, sourceType),
      claim_text: text,
      evidence_excerpt: text,
      topic: "question",
      framework: "dify_question",
      directness: "weak",
      recency: null,
      framing_fit: "unknown",
      structure_level: "interpreted",
      validation_status: "unvalidated",
      confidence_to_use: "low",
      raw_payload: { question: text },
    });
  }

  return signals;
}

export function mapSignalsToClaimCandidates(companyId: string, signals: Array<SignalDraft & { id?: string }>): ClaimCandidate[] {
  const grouped = new Map<string, { claim: ClaimDraft; sourceSignals: ClaimCandidate["sourceSignals"]; qualities: Array<{ band: SignalBand; directness: Directness; confidence: ConfidenceLevel; validation: ValidationStatus }> }>();

  signals.forEach((signal, index) => {
    if (!isSignalProvenanceWorthy(signal)) return;
    const statement = canonicalizeClaimStatement(signal);
    if (!statement) return;
    const topic = inferTopicFromText(statement, signal.framework || null, signal.topic || null);
    const claimType = claimTypeFromSignal({
      statement,
      topic,
      signalBand: signal.signal_band,
      framework: signal.framework || null,
      validationStatus: signal.validation_status,
    });
    if (!claimType) return;
    // Reject aspirations, positioning statements, and strategic beliefs — these are
    // not unmet-need hypotheses and pollute the commit picker. Manual claims
    // (raw_payload.source = manual_*) never enter this path so they are unaffected.
    if (claimType === "strategic_belief" || topic === "positioning" || topic === "strategy") return;

    const key = normalizeClaimKey(statement);
    if (!key) return;
    if (!grouped.has(key)) {
      grouped.set(key, {
        claim: {
          company_id: companyId,
          statement,
          topic,
          claim_type: claimType,
          outside_support_count: 0,
          organization_support_count: 0,
          customer_support_count: 0,
          triangulation_state: "untested",
          confidence: "low",
          revalidation_flag: signal.framing_fit === "weak" || signal.framing_fit === "unknown",
          raw_payload: { sample_signal: signal.raw_payload },
        },
        sourceSignals: [],
        qualities: [],
      });
    }

    const entry = grouped.get(key)!;
    if ((!entry.claim.topic || entry.claim.topic === "unknown") && topic && topic !== "unknown") {
      entry.claim.topic = topic;
    }
    if (entry.claim.claim_type === "observation" && claimType !== "observation") {
      entry.claim.claim_type = claimType;
    }
    const relationship: ClaimSignalRefRelationship =
      signal.validation_status === "contradicted"
        ? "contradicts"
        : signal.framing_fit === "partial" || signal.directness === "weak" || signal.confidence_to_use === "low"
          ? "qualifies"
          : "supports";

    entry.sourceSignals.push({ signalIndex: index, relationship });
    entry.qualities.push({
      band: signal.signal_band,
      directness: signal.directness,
      confidence: signal.confidence_to_use,
      validation: signal.validation_status,
    });
  });

  return [...grouped.values()].map((entry) => {
    const bands = new Set<SignalBand>();
    let hasContradiction = false;
    let hasStrongSupport = false;
    let hasMediumSupport = false;

    for (const quality of entry.qualities) {
      if (quality.validation === "contradicted") {
        hasContradiction = true;
        continue;
      }
      if (quality.band === "outside") entry.claim.outside_support_count += 1;
      if (quality.band === "organization") entry.claim.organization_support_count += 1;
      if (quality.band === "customer") entry.claim.customer_support_count += 1;
      bands.add(quality.band);
      if (quality.directness === "direct" && quality.confidence === "high") hasStrongSupport = true;
      if (quality.confidence === "medium" || quality.directness === "inferred") hasMediumSupport = true;
    }

    if (hasContradiction) {
      entry.claim.triangulation_state = "contradicted";
      entry.claim.confidence = "low";
    } else if (entry.claim.customer_support_count > 0) {
      entry.claim.triangulation_state = "customer_backed";
      entry.claim.confidence = hasStrongSupport ? "high" : "medium";
    } else if (bands.size >= 2) {
      entry.claim.triangulation_state = "multi_source";
      entry.claim.confidence = hasStrongSupport || hasMediumSupport ? "medium" : "low";
    } else if (bands.size === 1) {
      entry.claim.triangulation_state = "single_source";
      entry.claim.confidence = hasStrongSupport ? "medium" : "low";
    } else {
      entry.claim.triangulation_state = "untested";
      entry.claim.confidence = "low";
    }

    return entry;
  }).filter((entry) => {
    if (entry.claim.statement.length > 160) return false;
    if (GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(entry.claim.statement))) return false;
    return true;
  });
}
