// Rulings M2 + M4 (operator, signed 2026-09-19) — pure, model-free, so each rule is provable with a
// planted failure (marketEvidence.test.ts).
//
//   M2 — a MARKET run's steps are hypotheses. Its rows carry evidence_basis = "industry_anchor:<industry_key>"
//        (the scaffold the run was built on), evidence_status "unclear" and evidence_confidence NULL — never an
//        invented percentage. The model's evidence sentences are NOT stored on the rows; they go to the run's
//        integrity row for the record. A CUSTOMER run is byte-identical to before (the rule is not applied).
//   M4 — the model's raw labels are kept on the run's integrity row, and every label the normalizer repaired
//        (canonical substitution) or refused (strict mode) is recorded there with the model's original text.

export type MarketEvidenceStep = {
  step_number: number;
  evidence_status: string;
  evidence_basis: string;
  evidence_confidence: number | null;
};
export type MarketEvidenceJourney<S extends MarketEvidenceStep> = { journey_key: string; steps: S[] };

/** One displaced model evidence line — what the row would have carried before M2. */
export type DisplacedModelEvidence = {
  journey_key: string;
  step_number: number;
  evidence_status: string;
  evidence_basis: string;
  evidence_confidence: number | null;
};

export function scaffoldEvidenceBasis(industryKey: string): string {
  return `industry_anchor:${industryKey}`;
}

/** M2. Applies the scaffold-evidence rule to every non-customer journey of a MARKET run; a customer run
 *  (isMarketRun=false) returns the journeys untouched and displaces nothing. */
export function applyMarketEvidenceRule<S extends MarketEvidenceStep, J extends MarketEvidenceJourney<S>>(
  journeys: J[],
  args: { isMarketRun: boolean; industryKey: string; isCustomerKey: (key: string) => boolean },
): { journeys: J[]; displaced: DisplacedModelEvidence[] } {
  if (!args.isMarketRun) return { journeys, displaced: [] };
  const basis = scaffoldEvidenceBasis(args.industryKey);
  const displaced: DisplacedModelEvidence[] = [];
  const out = journeys.map((journey) => {
    if (args.isCustomerKey(journey.journey_key)) return journey;
    return {
      ...journey,
      steps: journey.steps.map((step) => {
        displaced.push({
          journey_key: journey.journey_key,
          step_number: step.step_number,
          evidence_status: step.evidence_status,
          evidence_basis: step.evidence_basis,
          evidence_confidence: step.evidence_confidence,
        });
        return { ...step, evidence_status: "unclear", evidence_basis: basis, evidence_confidence: null };
      }),
    } as J;
  });
  return { journeys: out, displaced };
}

// ── M4 — the label ledger ────────────────────────────────────────────────────────────────────────
export type RawModelLabel = { journey_key: string; step_number: number; step_label: string };
export type LabelRepair = { journey_key: string; step_number: number; original: string; repaired: string; reason: string };
export type LabelRefusal = { journey_key: string; step_number: number; original: string; reason: string };

/** Per-run, passed into the normalizers (never module state — requests interleave). */
export type LabelLedger = { raw_labels: RawModelLabel[]; repairs: LabelRepair[] };

export function newLabelLedger(): LabelLedger {
  return { raw_labels: [], repairs: [] };
}

/** A strict-mode refusal that carries the model's original text so the integrity row can keep it. */
export class LabelRefusalError extends Error {
  readonly refusal: LabelRefusal;
  constructor(message: string, refusal: LabelRefusal) {
    super(message);
    this.name = "LabelRefusalError";
    this.refusal = refusal;
  }
}

/** The integrity-row fragment for a run (completed or refused). */
export function labelLedgerForIntegrity(ledger: LabelLedger, refusal: LabelRefusal | null) {
  return {
    raw_model_labels: ledger.raw_labels,
    label_repairs: ledger.repairs,
    label_refusal: refusal,
  };
}
