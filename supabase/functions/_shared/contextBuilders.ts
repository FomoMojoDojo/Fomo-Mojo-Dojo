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

function buildBaselineBrief(baselineResultJson: unknown): string {
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
  const evidence = Array.isArray(baseline.evidence_ledger) ? baseline.evidence_ledger.slice(0, 8) : [];
  const hypotheses = Array.isArray(baseline.top_hypotheses) ? baseline.top_hypotheses.slice(0, 4) : [];
  const openQuestions = Array.isArray(baseline.open_questions) ? baseline.open_questions.slice(0, 3) : [];
  const alignment = baseline.message_alignment ?? {};
  const marketSuccess = baseline.market_initiative_success ?? {};
  const outsideSignals = Array.isArray(baseline.outside_voice_signals)
    ? baseline.outside_voice_signals.slice(0, 3)
    : [];

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
        evidence.map((item, index) =>
          `${index + 1}. [${item.bucket || "signal"} | ${item.signal_strength || "unknown"} | conf ${item.confidence ?? "?"}] ${item.snippet || "No snippet"}`
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
  ].join("\n");
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
} | null): string {
  if (!cascade) return "No existing strategy cascade. Generate positioning from evidence only.";
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
  buildJourneyBrief,
  buildOpportunityBrief,
  buildInputBrief,
  buildRouteBrief,
  buildJourneysFromJobSteps,
  buildSelectedJobMapBrief,
  buildCascadeContext,
};
export type { JourneyObject };
