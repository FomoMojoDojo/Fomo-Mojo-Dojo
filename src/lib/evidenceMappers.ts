import {
  type ClaimCandidate,
  type ClaimDraft,
  type ClaimProvenance,
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

// ── E2 SPECIFICITY GUARD (gate 2, 2026-08-25). The outside/customer band used to keep only the
// lead sentence (takeLeadClause), dropping concrete allegations a rich source carried (Edgewood
// "…going downhill" losing pay/assault/staffing). CONCRETE content is detected STRUCTURALLY first
// — numbers, currency, percent, dates — which stands ALONE and never rots as allegations fall
// outside a word list; a small allegation LEXICON is ONE ADDITIONAL input, not the whole test.
// Deterministic; no model call.
const CONCRETE_ROOTS = [
  "assault", "pay", "wage", "salary", "overtime", "understaff", "staff",
  "injur", "fire", "harass", "union", "burnout", "turnover", "layoff",
  "strike", "lawsuit", "discriminat", "retaliat", "benefit", "safety",
];
export function extractConcreteTokens(text: string): Set<string> {
  const t = String(text || "").toLowerCase();
  const out = new Set<string>();
  // STRUCTURAL (stands alone): currency, percent, ratios, any number (incl. k/m/bn suffix & years).
  const structural = t.match(/\$\s?\d[\d,.]*|\d[\d,.]*\s*%|\b\d[\d,.]*(?:\/\d+)?(?:k|m|bn)?\b/g) || [];
  for (const s of structural) {
    // canonicalize to the numeric core so a $/% normalization difference can't split a token.
    out.add(s.replace(/\s+/g, "").replace(/^\$/, "").replace(/%$/, ""));
  }
  // LEXICON (one additional input): concrete-allegation roots, substring-matched.
  for (const root of CONCRETE_ROOTS) if (t.includes(root)) out.add(root);
  return out;
}

// Keep the lead clause PLUS every later clause carrying concrete content the lead dropped, so a
// multi-sentence source is never silently thinned below the concrete facts it stated. A single
// sentence, or a lead that drops nothing concrete, is returned unchanged (prior behavior).
export function retainConcreteEvidence(text: string): string {
  const norm = normalizeStatement(text);
  const sentences = norm.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length <= 1) return norm;
  const lead = sentences[0];
  const full = extractConcreteTokens(norm);
  const inLead = extractConcreteTokens(lead);
  const dropped = [...full].filter((tok) => !inLead.has(tok));
  if (dropped.length === 0) return lead;
  const kept = [lead];
  for (let i = 1; i < sentences.length; i++) {
    const st = extractConcreteTokens(sentences[i]);
    if (dropped.some((tok) => st.has(tok))) kept.push(sentences[i]);
  }
  return kept.join(" ");
}

// D2 (generator root-cause): a claim must be intelligible standing ALONE. Two deterministic
// context-incomplete shapes, both born from lead-clause truncation, are REFUSED (not minted):
//   (1) a SINGLE-sentence claim carrying a dangling demonstrative — "that/this/these/those
//       <noun>" whose referent noun does not appear earlier in the claim (e.g. the struck
//       "Most suppliers leave that system to the owner."); and
//   (2) a SINGLE-sentence inverted-thesis negation — "... is not a/an ... yet" — whose point
//       lives in the sentence that truncation dropped (e.g. the re-minted "Cafe Barra is not
//       a brand yet.").
// A MULTI-sentence claim that carries its own resolution passes (both re-mints do): the fix
// is full-passage retention below; this guard only catches the residual lone fragments.
export function looksLikeContextIncompleteClaim(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  const sentences = t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const single = sentences.length <= 1;
  if (!single) return false;
  const dem = t.match(/\b(that|this|these|those)\s+([a-z]+)/i);
  if (dem) {
    const stem = dem[2].toLowerCase().replace(/s$/, "");
    const before = t.slice(0, dem.index).toLowerCase();
    if (stem.length >= 3 && !before.includes(stem)) return true; // dangling referent
  }
  if (/\bis not (a|an)\b[^.?!]*\byet\b/i.test(t)) return true; // inverted-thesis fragment
  return false;
}

// Fabrication-removal (ecc4bd5 family, 07-09): the Cafe Barra-era vocabulary
// substitutions ("teams"/"operators" → "Cafe operators", "roasters" →
// "suppliers") are GONE — they rewrote every company's claim statements at
// derivation (verbatim-or-nothing law). Statements pass through honestly;
// only whitespace normalization remains.
function compactStatement(text: string) {
  return normalizeStatement(text)
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeCustomerEvidence(text: string) {
  // Regex→literal canned sentences and the imperative rewrite chain are GONE
  // (fabrication: invented sentences replaced the signal's own words). The
  // signal's lead clause passes through, or nothing.
  const normalized = normalizeComparisonText(text);
  if (!normalized) return null;
  return compactStatement(retainConcreteEvidence(text));
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
  // D2: the DECLARED band keeps the FULL passage — lead-clause truncation inverted theses
  // ("Cafe Barra is not a brand yet.") and dropped the client's own claim (the "…built to
  // support it" half). A context-incomplete fragment (dangling demonstrative / inverted
  // negation) is refused rather than minted unintelligible.
  const full = compactStatement(claimText || evidenceText);
  if (looksLikeContextIncompleteClaim(full)) return null;
  return full;
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
  if (/(business to business relationships as partnerships|best roasted coffee to partner outlets)/.test(normalized)) {
    return null;
  }
  return compactStatement(retainConcreteEvidence(text));
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
  // D2: the declared (organization) band keeps FULL multi-sentence passages (thesis +
  // resolution), so its length ceiling is higher than the single-clause outside/customer cap.
  // E2 (gate 2): when the outside/customer band RETAINED extra concrete clauses (multi-sentence
  // AND concrete-bearing), the cap is raised so the un-thinning fix doesn't trade thinning for
  // suppression. A single long sentence keeps the 160 cap (no new mints from that shape).
  const multiSentence = /[.!?]\s+\S/.test(text);
  const carriesConcrete = extractConcreteTokens(text).size > 0;
  const maxLen = signal.signal_band === "organization" ? 320
    : (multiSentence && carriesConcrete ? 480 : 160);
  if (text.length > maxLen) return null;
  if (text.length < 32 && GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(text))) return null;
  if (text.split(" ").length < 4) return null;

  // E2 SPECIFICITY ASSERTION: the minted statement must not drop concrete content its source
  // carried. If the source evidence has concrete tokens (structural or lexicon) the statement
  // lacks, the extraction over-thinned → REFUSE (return null) rather than mint a generic
  // lead-only claim. Scoped to outside/customer (the thinning bands); organization keeps its
  // full passage via its own faithfulness path. Deterministic.
  if (signal.signal_band !== "organization") {
    const sourceConcrete = extractConcreteTokens(signal.evidence_excerpt || signal.claim_text || "");
    if (sourceConcrete.size > 0) {
      const stmtConcrete = extractConcreteTokens(text);
      for (const tok of sourceConcrete) {
        if (!stmtConcrete.has(tok)) return null;
      }
    }
  }

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
      // B1: discovery-time voice class rides into signals.voice_class; signal_band
      // stamping above is deliberately unchanged (claim-state gates depend on it).
      voice_class: asString(record.voice_class) || null,
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
      voice_class: asString(record.voice_class) || null,
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
      // D1 (generator root-cause): top_hypotheses are the model's SYNTHESIS reads — our
      // analysis, not captured evidence. Born voice_class='analysis' at the mint site
      // (marker-driven: the same branch that stamps raw_payload.source_type='analysis'),
      // so an analysis read can never inherit the company-URL→client_voice overlay and
      // render as the client's own voice. Every consumer excludes 'analysis' (f1f94d8).
      voice_class: "analysis",
      // Findings layer: hypotheses are synthesis reads (no voice source type). Stamp
      // 'analysis' as the terminal fallback so ingest auto-captures them as findings;
      // render bucketing maps 'analysis' to the bucket blank used (net-zero visible).
      raw_payload: { hypothesis: text, source_type: "analysis" },
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

// ── INT-2: sole claim-provenance derivation authority ─────────────────────────
// A claim is internal_declared ONLY when every backing signal is the operator's
// own uploaded material (source_type='uploaded_file') in the organization band.
// Any public/customer signal in the mix keeps it public_observed — a mixed group
// is observation-corroborated, not purely declared. Empty input ⇒ public_observed
// (fail-safe: nothing is ever accidentally born declared).
// This function is the ONLY place provenance is assigned (conflation guard layer 2);
// the DB trigger makes it immutable after birth (layer 1).
export function deriveClaimProvenance(
  backing: Array<{ sourceType: string; band: SignalBand }>,
): ClaimProvenance {
  if (backing.length === 0) return "public_observed";
  // V2-5c — a claim backed ENTIRELY by analysis (mojo_analysis) is OUR reading, not the
  // client's declared words and not the outside record: provenance='analytic' (renders
  // nowhere client-facing). MIXED backing (analytic + public/uploaded) is NOT tainted to
  // analytic — it falls through to the rules below (public_observed unless all-declared).
  // REPORTED (not silently fixed): a claim with SOME analytic backing but ALSO public
  // backing keeps public_observed, so an analytic-flavored line CAN reach a public
  // surface if its public backing is thin — the V2-5b render guard is the backstop there.
  if (backing.every((b) => b.sourceType === "mojo_analysis")) return "analytic";
  // R4 (intake gate, 2026-08-12): intake-derived signals (source_type='intake') are the client's
  // OWN declared quiz answers — the same standing as their uploaded org material — so an all-intake
  // (or all-upload) organization-band group is internal_declared, never public_observed. This is
  // orthogonal to the First Read provenance gate, which still ADMITS intake (it excludes
  // 'uploaded_file' specifically); only true uploads stay excluded there.
  return backing.every(
    (b) => (b.sourceType === "uploaded_file" || b.sourceType === "intake") && b.band === "organization",
  )
    ? "internal_declared"
    : "public_observed";
}

// D3 (generator root-cause): the ANCHOR GATE. An OUTSIDE-band signal may mint a
// public_observed CLIENT claim only if its own text or source_url references a client entity
// anchor (name / domain host / partner name / street address — the operator-editable
// companies.entity_anchors_json). Unanchored outside signals stay signals (their
// market_context/competitor home), never client claims — closing D3 (Izote / Belli Fratelli
// etc. minting claims in the client's name). Org/customer bands are exempt (the client's own
// uploaded material). BACK-COMPAT: an EMPTY anchor set leaves the gate inert — a company that
// has not been seeded behaves exactly as before, so the gate rolls out per-company on seed.
// KNOWN false-positive (named at the design gate): a genuine location review that names no
// anchor ("Adorable little French Bakery…") is refused and stays a signal.
export function signalMatchesAnchor(signal: { claim_text?: string | null; evidence_excerpt?: string | null; source_url?: string | null }, anchors: string[]): boolean {
  if (!anchors.length) return true;
  const hay = `${signal.claim_text ?? ""} ${signal.evidence_excerpt ?? ""} ${signal.source_url ?? ""}`.toLowerCase();
  return anchors.some((a) => {
    const needle = String(a || "").trim().toLowerCase();
    return needle.length > 0 && hay.includes(needle);
  });
}

export function mapSignalsToClaimCandidates(companyId: string, signals: Array<SignalDraft & { id?: string }>, anchors: string[] = []): ClaimCandidate[] {
  const grouped = new Map<string, { claim: ClaimDraft; sourceSignals: ClaimCandidate["sourceSignals"]; qualities: Array<{ band: SignalBand; directness: Directness; confidence: ConfidenceLevel; validation: ValidationStatus; sourceType: string }> }>();

  signals.forEach((signal, index) => {
    if (!isSignalProvenanceWorthy(signal)) return;
    // D3 anchor gate — outside-band signals must reference a client anchor to mint a client
    // claim (inert when no anchors are configured for the company).
    if (signal.signal_band === "outside" && !signalMatchesAnchor(signal, anchors)) return;
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
          provenance: "public_observed", // finalized below from the FULL group
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
      sourceType: signal.source_type,
    });
  });

  return [...grouped.values()].map((entry) => {
    // INT-2: provenance from the FULL backing group (sole authority).
    entry.claim.provenance = deriveClaimProvenance(
      entry.qualities.map((q) => ({ sourceType: q.sourceType, band: q.band })),
    );
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
    // E2 (gate 2): the final length gate mirrors canonicalizeClaimStatement's concrete-aware cap —
    // a multi-sentence statement that carries concrete content (the un-thinned outside/customer
    // shape) is allowed past 160 so this gate doesn't silently re-thin what the fix retained.
    const s = entry.claim.statement;
    const cap = (/[.!?]\s+\S/.test(s) && extractConcreteTokens(s).size > 0) ? 480 : 160;
    if (s.length > cap) return false;
    if (GENERIC_CLAIM_PATTERNS.some((pattern) => pattern.test(entry.claim.statement))) return false;
    return true;
  });
}
