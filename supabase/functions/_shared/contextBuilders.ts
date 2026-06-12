// Shared context-building utilities for strategy LLM prompts — extracted from research-company

type StrategicProblemStatement = {
  id?: string;
  statement: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "open" | "reconciled";
  reconciliation_note?: string;
};

type StrategicAssumptionStatement = {
  id?: string;
  assumption: string;
  source: "client" | "intake" | "company" | "public" | "evidence";
  status: "untested" | "validating" | "validated" | "invalidated";
  note?: string;
};

function normalizeStrategicProblemSource(value: unknown): StrategicProblemStatement["source"] {
  const source = String(value || "").trim().toLowerCase();
  if (source === "intake" || source === "company" || source === "public" || source === "evidence") return source;
  return "client";
}

function normalizeStrategicProblemStatus(value: unknown): StrategicProblemStatement["status"] {
  return String(value || "").trim().toLowerCase() === "reconciled" ? "reconciled" : "open";
}

function normalizeStrategicProblems(rows: unknown): StrategicProblemStatement[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const statement = String(item?.statement || "").trim();
      if (!statement) return null;
      const normalized: StrategicProblemStatement = {
        id: typeof item?.id === "string" ? item.id : undefined,
        statement,
        source: normalizeStrategicProblemSource(item?.source),
        status: normalizeStrategicProblemStatus(item?.status),
      };
      const note = String(item?.reconciliation_note || "").trim();
      if (note) normalized.reconciliation_note = note;
      return normalized;
    })
    .filter((item): item is StrategicProblemStatement => item !== null);
}

function buildStrategicProblemBrief(problems: StrategicProblemStatement[]): string {
  if (!problems.length) {
    return "No client-stated strategic problems recorded yet. Keep outputs grounded in evidence and surface what problem framing still needs clarification.";
  }
  const open = problems.filter((item) => item.status !== "reconciled");
  const reconciled = problems.filter((item) => item.status === "reconciled");
  const lines = problems.slice(0, 12).map((item, index) => {
    const note = item.reconciliation_note ? ` | note: ${item.reconciliation_note}` : "";
    return `${index + 1}. [${item.source} | ${item.status}] ${item.statement}${note}`;
  });
  return [
    `${problems.length} strategic problem statement(s) captured.`,
    `${open.length} open, ${reconciled.length} reconciled.`,
    `Use these as reference for prioritization, tradeoffs, and what must be true.`,
    `Strategic problems:\n${lines.join("\n")}`,
  ].join("\n");
}

function normalizeStrategicAssumptionStatus(value: unknown): StrategicAssumptionStatement["status"] {
  const status = String(value || "").trim().toLowerCase();
  if (status === "validating" || status === "validated" || status === "invalidated") return status;
  return "untested";
}

function normalizeStrategicAssumptions(rows: unknown): StrategicAssumptionStatement[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const item = row as Record<string, unknown>;
      const assumption = String(item?.assumption || "").trim();
      if (!assumption) return null;
      const normalized: StrategicAssumptionStatement = {
        id: typeof item?.id === "string" ? item.id : undefined,
        assumption,
        source: normalizeStrategicProblemSource(item?.source),
        status: normalizeStrategicAssumptionStatus(item?.status),
      };
      const note = String(item?.note || "").trim();
      if (note) normalized.note = note;
      return normalized;
    })
    .filter((item): item is StrategicAssumptionStatement => item !== null);
}

function buildStrategicAssumptionBrief(assumptions: StrategicAssumptionStatement[]): string {
  if (!assumptions.length) return "No manually tracked strategic assumptions recorded yet.";
  const pending = assumptions.filter((item) => item.status === "untested" || item.status === "validating").length;
  const validated = assumptions.filter((item) => item.status === "validated").length;
  const invalidated = assumptions.filter((item) => item.status === "invalidated").length;
  const lines = assumptions.slice(0, 16).map((item, index) => {
    const note = item.note ? ` | note: ${item.note}` : "";
    return `${index + 1}. [${item.source} | ${item.status}] ${item.assumption}${note}`;
  });
  return [
    `${assumptions.length} strategic assumption(s) tracked manually.`,
    `${pending} pending validation, ${validated} validated, ${invalidated} invalidated.`,
    `Strategic assumptions:\n${lines.join("\n")}`,
  ].join("\n");
}

// Claim provenance entries are judged upstream (research-company's deriveClaimProvenance)
// and passed through so leaf briefs show the same data-level qualification of company
// self-claims. When absent, the brief renders exactly as before.
type SharedClaimProvenanceEntry = {
  ledger_index?: number | null;
  claim?: string;
  status?: string;
  basis_urls?: string[];
};

const SHARED_CLAIM_PROVENANCE_PREFIX: Record<string, string> = {
  corroborated: "",
  uncorroborated: "SELF-REPORTED, UNCORROBORATED: ",
  contradicted: "SELF-REPORTED, CONTRADICTED by independent evidence: ",
  unverified: "SELF-REPORTED (corroboration unverified): ",
};

const SHARED_CLAIM_PROVENANCE_LABEL: Record<string, string> = {
  corroborated: "CORROBORATED by independent sources — keep its substance",
  uncorroborated:
    "SELF-REPORTED, UNCORROBORATED — qualify as self-reported, aspirational, or developing; never assert as established fact",
  contradicted: "SELF-REPORTED, CONTRADICTED — independent evidence cuts against this; do not assert it",
  unverified: "SELF-REPORTED, corroboration unverified — treat as self-reported",
};

function buildBaselineBrief(
  baselineResultJson: unknown,
  claimProvenance?: SharedClaimProvenanceEntry[],
): string {
  const baseline = baselineResultJson as {
    category_archetype?: string;
    lens_card?: {
      primary_buyer?: string;
      chooser?: string;
      user?: string;
      adoption_constraints?: string;
      value_chain?: string;
      risk_surface?: string;
      economic_engine?: string;
    };
    evidence_ledger?: Array<{
      bucket?: string;
      snippet?: string;
      signal_strength?: string;
      confidence?: number;
    }>;
    top_hypotheses?: string[];
    open_questions?: string[];
    market_initiative_success?: {
      proven?: boolean;
      low_pct?: number;
      typical_pct?: number;
      high_pct?: number;
      source?: string;
      as_of?: string;
      confidence?: number;
    };
    message_alignment?: {
      alignment_status?: string;
      alignment_summary?: string;
      outside_voice_posture?: string;
    };
    outside_voice_signals?: Array<{
      perspective?: string;
      sentiment?: string;
      alignment?: string;
      signal?: string;
      confidence?: number;
    }>;
  } | null;

  if (!baseline) return "No public baseline available.";

  const lens = baseline.lens_card ?? {};
  // Keep original ledger indexes so provenance verdicts (judged by index) attach to the
  // right item after slicing.
  const evidence = (Array.isArray(baseline.evidence_ledger) ? baseline.evidence_ledger : [])
    .map((item, ledgerIndex) => ({ item, ledgerIndex }))
    .slice(0, 8);
  const provenanceByIndex = new Map<number, SharedClaimProvenanceEntry>();
  for (const entry of claimProvenance ?? []) {
    if (typeof entry.ledger_index === "number") provenanceByIndex.set(entry.ledger_index, entry);
  }
  const hypotheses = Array.isArray(baseline.top_hypotheses) ? baseline.top_hypotheses.slice(0, 4) : [];
  const openQuestions = Array.isArray(baseline.open_questions) ? baseline.open_questions.slice(0, 3) : [];
  const alignment = baseline.message_alignment ?? {};
  const marketSuccess = baseline.market_initiative_success ?? {};
  // Sentiment-aware selection (mirrors research-company): an unordered slice(0,3) can
  // truncate negative/mixed voices out for a positives-first company. Guarantee negative
  // voices are represented (up to 3) while keeping some positive context (up to 2).
  const isNegativeSentiment = (signal: { sentiment?: string }) =>
    /negativ/i.test(String(signal?.sentiment || ""));
  const allOutsideSignals = Array.isArray(baseline.outside_voice_signals)
    ? baseline.outside_voice_signals
    : [];
  const outsideSignals = [
    ...allOutsideSignals.filter(isNegativeSentiment).slice(0, 3),
    ...allOutsideSignals.filter((signal) => !isNegativeSentiment(signal)).slice(0, 2),
  ];

  return [
    `Category archetype: ${baseline.category_archetype || "unknown"}`,
    `Primary buyer: ${lens.primary_buyer || "unknown"}`,
    `Chooser: ${lens.chooser || "unknown"}`,
    `User: ${lens.user || "unknown"}`,
    `Adoption constraints: ${lens.adoption_constraints || "unknown"}`,
    `Value chain: ${lens.value_chain || "unknown"}`,
    `Risk surface: ${lens.risk_surface || "unknown"}`,
    `Economic engine: ${lens.economic_engine || "unknown"}`,
    `Market initiative success baseline: proven=${marketSuccess.proven === true ? "yes" : "no"} | range=${marketSuccess.low_pct ?? "?"}-${marketSuccess.high_pct ?? "?"}% | typical=${marketSuccess.typical_pct ?? "?"}% | source=${marketSuccess.source || "unknown"} | as_of=${marketSuccess.as_of || "unknown"} | conf=${marketSuccess.confidence ?? "?"}`,
    `Message alignment: ${alignment.alignment_status || "unknown"}${alignment.alignment_summary ? ` — ${alignment.alignment_summary}` : ""}`,
    `Outside voice posture: ${alignment.outside_voice_posture || "unknown"}`,
    evidence.length
      ? `Evidence:\n${
        evidence.map(({ item, ledgerIndex }, index) =>
          `${index + 1}. [${item.bucket || "signal"} | ${item.signal_strength || "unknown"} | conf ${item.confidence ?? "?"}] ${
            SHARED_CLAIM_PROVENANCE_PREFIX[String(provenanceByIndex.get(ledgerIndex)?.status || "corroborated")] ?? ""
          }${item.snippet || "No snippet"}`
        ).join("\n")
      }`
      : "Evidence: none",
    outsideSignals.length
      ? `Outside voice signals:\n${
        outsideSignals.map((item, index) =>
          `${index + 1}. [${item.perspective || "outside voice"} | ${item.sentiment || "unknown"} | ${item.alignment || "unknown"} | conf ${item.confidence ?? "?"}] ${item.signal || "No signal"}`
        ).join("\n")
      }`
      : "Outside voice signals: none",
    hypotheses.length ? `Top hypotheses:\n- ${hypotheses.join("\n- ")}` : "Top hypotheses: none",
    openQuestions.length ? `Open questions:\n- ${openQuestions.join("\n- ")}` : "Open questions: none",
    claimProvenance && claimProvenance.length
      ? `Company self-claim provenance (judged against independent evidence only):\n${claimProvenance
        .map((entry) =>
          `- [${SHARED_CLAIM_PROVENANCE_LABEL[String(entry.status || "unverified")] ?? "SELF-REPORTED"}] ${entry.claim || ""}${
            Array.isArray(entry.basis_urls) && entry.basis_urls.length ? ` (basis: ${entry.basis_urls.join(", ")})` : ""
          }`
        ).join("\n")}`
      : "",
  ].filter(Boolean).join("\n");
}

// B2.1: competitor/market evidence brief — TWO bounded sections with hard-stated rights.
// ALTERNATIVES (competitor_voice) grounds "who else they could choose" ONLY; CATEGORY/
// MARKET (market_context) grounds category and where-to-play ONLY. Neither may ever
// support a client claim (the judges enforce this; the wording here keeps gens honest).
function buildCompetitorMarketBrief(competitorRunJson: unknown): string {
  const run = competitorRunJson as {
    competitors?: Array<{ name?: string; domain?: string; items?: Array<{ url?: string; snippet?: string; voice_class?: string }> }>;
    market_context_items?: Array<{ url?: string; snippet?: string }>;
  } | null;
  if (!run) return "";
  const competitors = Array.isArray(run.competitors) ? run.competitors : [];
  const marketItems = Array.isArray(run.market_context_items) ? run.market_context_items : [];
  if (competitors.length === 0 && marketItems.length === 0) return "";
  const parts: string[] = [];
  if (competitors.length > 0) {
    parts.push(
      "ALTERNATIVES EVIDENCE (competitor voice — grounds 'who else they could choose' ONLY; may never support a client claim):\n" +
      competitors.map((competitor) => {
        const items = (Array.isArray(competitor.items) ? competitor.items : []).slice(0, 4);
        return `- ${competitor.name || "Unknown"} (${competitor.domain || "no domain"}):\n` +
          items.map((item) => `    · [${item.voice_class || "market_context"}] ${(item.snippet || "").slice(0, 180)} (${item.url || "no url"})`).join("\n");
      }).join("\n"),
    );
  }
  if (marketItems.length > 0) {
    parts.push(
      "CATEGORY/MARKET EVIDENCE (market context — grounds category and where-to-play ONLY; may never support a client claim):\n" +
      marketItems.slice(0, 6).map((item) => `- ${(item.snippet || "").slice(0, 180)} (${item.url || "no url"})`).join("\n"),
    );
  }
  return parts.join("\n\n");
}

// Known tensions: acknowledge-and-scope entries for serious negatives in the outside voice,
// generated and reviewed in the research-company spine and passed to leaves for persistence.
// Perception register: each entry observes what the public record visibly contains — never
// adjudicates truth.
function buildKnownTensionsBrief(knownTensions: unknown): string {
  const items = Array.isArray(knownTensions) ? knownTensions : [];
  if (!items.length) return "None declared.";
  return items
    .map((tension, index) => {
      const entry = tension as {
        title?: string;
        what_we_see?: string;
        what_it_is?: string;
        what_it_isnt?: string;
        resolution_condition?: string;
      };
      return `${index + 1}. ${entry?.title || "Untitled"} — visible in the record: ${entry?.what_we_see || "?"} | its place and weight: ${entry?.what_it_is || "?"} | what it is not: ${entry?.what_it_isnt || "?"} | the record shifts when: ${entry?.resolution_condition || "?"}`;
    })
    .join("\n");
}

function buildJourneyBrief(journeys: unknown): string {
  const items = Array.isArray(journeys) ? journeys : [];
  return items.map((journey, journeyIndex) => {
    const entry = journey as {
      journey_key?: string;
      journey_title?: string;
      journey_subtitle?: string;
      steps?: Array<{
        step_number?: number;
        step_label?: string;
        description?: string;
        designed?: boolean;
        has_gap?: boolean;
        evidence_status?: string;
        evidence_basis?: string;
        evidence_confidence?: number;
      }>;
    };
    const steps = Array.isArray(entry.steps) ? entry.steps : [];
    return [
      `${journeyIndex + 1}. ${entry.journey_key || "unknown"} :: ${entry.journey_title || "Untitled journey"}`,
      `Subtitle: ${entry.journey_subtitle || "unknown"}`,
      ...steps.map((step) =>
        `- Step ${step.step_number ?? "?"}: ${step.step_label || "Untitled"} | designed=${step.designed ? "yes" : "no"} | gap=${step.has_gap ? "yes" : "no"} | evidence=${step.evidence_status || "unknown"} | conf=${step.evidence_confidence ?? "?"} | basis=${step.evidence_basis || "unknown"} | ${step.description || "No description"}`
      ),
    ].join("\n");
  }).join("\n\n");
}

function buildOpportunityBrief(opportunities: unknown): string {
  const items = Array.isArray(opportunities) ? opportunities : [];
  return items.slice(0, 20).map((opportunity, index) => {
    const entry = opportunity as {
      outcome?: string;
      journey_key?: string;
      step_number?: number;
      step_label?: string;
      importance?: number;
      satisfaction?: number;
      opportunity_score?: number;
      priority_tier?: string;
    };
    return `${index + 1}. ${entry.outcome || "Untitled"} | ${entry.journey_key || "unknown"} | step ${entry.step_number ?? "?"} ${entry.step_label || ""} | score ${entry.opportunity_score ?? "?"} | ${entry.priority_tier || "unknown"} | importance ${entry.importance ?? "?"} | satisfaction ${entry.satisfaction ?? "?"}`;
  }).join("\n");
}

function buildInputBrief(inputs: unknown): string {
  const items = Array.isArray(inputs) ? inputs : [];
  return items.map((input, index) => {
    const entry = input as {
      input_key?: string;
      input_label?: string;
      sub_group?: string;
      description?: string;
      why_it_matters?: string;
    };
    return `${index + 1}. ${entry.input_key || "unknown"} | ${entry.input_label || "Untitled"} | ${entry.sub_group || "unknown"} | ${entry.description || "No description"} | why: ${entry.why_it_matters || "No rationale"}`;
  }).join("\n");
}

function buildRouteBrief(routes: unknown): string {
  const items = Array.isArray(routes) ? routes : [];
  return items.slice(0, 20).map((route, index) => {
    const entry = route as {
      category?: string;
      title?: string;
      short_description?: string;
      pts_value?: number;
      effort?: string;
    };
    return `${index + 1}. ${entry.category || "unknown"} | ${entry.title || "Untitled"} | ${entry.short_description || "No description"} | pts ${entry.pts_value ?? "?"} | ${entry.effort || "unknown"} effort`;
  }).join("\n");
}

type JobStepRow = {
  journey_key: string;
  journey_title: string;
  journey_subtitle: string;
  step_number: number;
  step_label: string;
  description: string;
  designed: boolean;
  has_gap: boolean;
  evidence_status: string;
  evidence_basis: string;
  evidence_confidence: number;
};

type JourneyObject = {
  journey_key: string;
  journey_title: string;
  journey_subtitle: string;
  steps: Array<Omit<JobStepRow, "journey_key" | "journey_title" | "journey_subtitle">>;
};

// Reconstructs journey objects from job_steps DB rows, grouped by journey_key.
// Returns journey array in the shape buildJourneyBrief expects.
function buildJourneysFromJobSteps(jobStepRows: unknown[]): JourneyObject[] {
  const byKey = new Map<string, JourneyObject>();

  for (const row of jobStepRows) {
    const r = row as Record<string, unknown>;
    // Phase 2 Gate 1 — defensive backstop behind the jobFramingGate chokepoint:
    // every current consumer of this builder is external-bound (OpenAI briefs), so
    // any row that is not explicitly public-provenance is dropped here even if a
    // future caller forgets the gate. Callers must select provenance_type.
    if (r.provenance_type !== "public_baseline") continue;
    const key = String(r.journey_key || "").trim();
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        journey_key: key,
        journey_title: String(r.journey_title || ""),
        journey_subtitle: String(r.journey_subtitle || ""),
        steps: [],
      });
    }
    byKey.get(key)!.steps.push({
      step_number: Number(r.step_number) || 1,
      step_label: String(r.step_label || ""),
      description: String(r.description || ""),
      designed: !!r.designed,
      has_gap: !!r.has_gap,
      evidence_status: String(r.evidence_status || "unclear"),
      evidence_basis: String(r.evidence_basis || ""),
      evidence_confidence: Number(r.evidence_confidence) || 0,
    });
  }

  const journeys = Array.from(byKey.values());
  for (const journey of journeys) {
    journey.steps.sort((a, b) => a.step_number - b.step_number);
  }
  return journeys;
}

// Formats the selectedJobMap brief line from journey objects (mirrors research-company line 5415-5416).
function buildSelectedJobMapBrief(journeys: JourneyObject[]): string {
  return journeys.map((j, index) =>
    `${index + 1}. ${j.journey_key} | ${j.journey_title} | ${j.journey_subtitle}`
  ).join("\n");
}

// Formats current strategy_cascades fields as a positioning anchor for the refresh-positioning prompt.
function buildCascadeContext(cascade: {
  winning_aspiration?: string | null;
  where_to_play?: string | null;
  how_to_win?: string | null;
  artifact_role?: string | null;
} | null): string {
  if (!cascade) return "No existing strategy cascade. Generate positioning from evidence only.";
  // Gate 3a defensive backstop: callers gate before building, but a
  // declared_direction row must never be formatted into an external prompt even
  // if a caller regresses.
  if (cascade.artifact_role != null && cascade.artifact_role !== "market_read") {
    return "No existing strategy cascade. Generate positioning from evidence only.";
  }
  return [
    `Current winning aspiration: ${cascade.winning_aspiration || "not set"}`,
    `Current where to play: ${cascade.where_to_play || "not set"}`,
    `Current how to win: ${cascade.how_to_win || "not set"}`,
  ].join("\n");
}

export {
  normalizeStrategicProblems,
  buildStrategicProblemBrief,
  normalizeStrategicAssumptions,
  buildStrategicAssumptionBrief,
  buildBaselineBrief,
  buildCompetitorMarketBrief,
  buildKnownTensionsBrief,
  buildJourneyBrief,
  buildOpportunityBrief,
  buildInputBrief,
  buildRouteBrief,
  buildJourneysFromJobSteps,
  buildSelectedJobMapBrief,
  buildCascadeContext,
};
export type { JourneyObject };
