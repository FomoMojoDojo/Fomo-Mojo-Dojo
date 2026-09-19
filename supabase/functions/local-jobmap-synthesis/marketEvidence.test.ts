// Gate A guards (a) and (f) — rulings M2 + M4 (2026-09-19), model-free. Fixtures are non-empty on both
// sides: a market journey carrying model-authored evidence lines with percentages, and a customer journey
// that must pass through byte-identical.
import { assert, assertEquals, assertNotStrictEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyMarketEvidenceRule,
  LabelRefusalError,
  labelLedgerForIntegrity,
  newLabelLedger,
  scaffoldEvidenceBasis,
} from "./marketEvidence.ts";

const isCustomerKey = (k: string) => k === "customer" || k.startsWith("customer-");
const MODEL_LINE_1 = "Customer research highlights the need for trauma-informed, inclusive care among families.";
const MODEL_LINE_2 = "Family feedback indicates a high demand for crisis stabilization.";

function fixtures() {
  const market = {
    journey_key: "pmk-philanthropic-organizations-and-grant-ma",
    journey_title: "Funders",
    steps: [
      { step_number: 1, step_label: "Clarify mission need", description: "d1", designed: true, has_gap: false, evidence_status: "implied", evidence_basis: MODEL_LINE_1, evidence_confidence: 62, gap_note: "" },
      { step_number: 2, step_label: "Identify potential recipients", description: "d2", designed: false, has_gap: true, evidence_status: "unclear", evidence_basis: MODEL_LINE_2, evidence_confidence: 0, gap_note: "g2" },
    ],
  };
  const customer = {
    journey_key: "customer",
    journey_title: "The customer job",
    steps: [
      { step_number: 1, step_label: "Define desired progress", description: "c1", designed: false, has_gap: true, evidence_status: "unclear", evidence_basis: "industry_anchor:Healthcare Services", evidence_confidence: 40, gap_note: "cg1" },
      { step_number: 2, step_label: "Locate inputs", description: "c2", designed: true, has_gap: false, evidence_status: "implied", evidence_basis: "Model sentence about the customer.", evidence_confidence: 55, gap_note: "" },
    ],
  };
  return { market, customer };
}

Deno.test("(a) market run: every row carries the scaffold basis, status unclear, confidence NULL; the model's evidence lines leave the rows and land in the displaced ledger", () => {
  const { market, customer } = fixtures();
  const res = applyMarketEvidenceRule([market], { isMarketRun: true, industryKey: "grantmaking", isCustomerKey });
  assertEquals(res.journeys.length, 1);
  const steps = res.journeys[0].steps;
  assertEquals(steps.length, 2);
  for (const s of steps) {
    assertEquals(s.evidence_basis, "industry_anchor:grantmaking");
    assertEquals(s.evidence_status, "unclear");
    assertStrictEquals(s.evidence_confidence, null);
    assert(!s.evidence_basis.includes(MODEL_LINE_1) && !s.evidence_basis.includes(MODEL_LINE_2), "no model evidence sentence on a market row");
  }
  // Non-evidence columns are untouched.
  assertEquals(steps.map((s) => s.step_label), market.steps.map((s) => s.step_label));
  assertEquals(steps.map((s) => s.description), market.steps.map((s) => s.description));
  assertEquals(steps.map((s) => s.gap_note), market.steps.map((s) => s.gap_note));
  // The model's lines are kept for the record, with what the row WOULD have carried.
  assertEquals(res.displaced, [
    { journey_key: market.journey_key, step_number: 1, evidence_status: "implied", evidence_basis: MODEL_LINE_1, evidence_confidence: 62 },
    { journey_key: market.journey_key, step_number: 2, evidence_status: "unclear", evidence_basis: MODEL_LINE_2, evidence_confidence: 0 },
  ]);
  assertEquals(scaffoldEvidenceBasis("grantmaking"), "industry_anchor:grantmaking");
  // A customer journey riding along in a market run is not rewritten either.
  const both = applyMarketEvidenceRule([customer, market], { isMarketRun: true, industryKey: "grantmaking", isCustomerKey });
  assertStrictEquals(both.journeys[0], customer);
  assertEquals(both.displaced.length, 2);
});

Deno.test("(a) customer run: byte-identical — the same objects come back, nothing displaced", () => {
  const { market, customer } = fixtures();
  const before = JSON.stringify([customer, market]);
  const res = applyMarketEvidenceRule([customer, market], { isMarketRun: false, industryKey: "Healthcare Services", isCustomerKey });
  assertStrictEquals(res.journeys[0], customer);
  assertStrictEquals(res.journeys[1], market);
  assertEquals(JSON.stringify(res.journeys), before);
  assertEquals(res.displaced, []);
  assertEquals(customer.steps[1].evidence_confidence, 55, "a customer row keeps its number");
});

Deno.test("(f) M4: the integrity fragment carries the raw labels and each repair with the model's original text; a refusal carries it too", () => {
  const ledger = newLabelLedger();
  ledger.raw_labels.push({ journey_key: "pmk-x", step_number: 1, step_label: "Build a donor dashboard" });
  ledger.raw_labels.push({ journey_key: "pmk-x", step_number: 2, step_label: "Confirm the grant's impact" });
  ledger.repairs.push({ journey_key: "pmk-x", step_number: 1, original: "Build a donor dashboard", repaired: "Define desired progress", reason: "vocabulary_law" });
  const completed = labelLedgerForIntegrity(ledger, null);
  assertEquals(completed.raw_model_labels.length, 2);
  assertEquals(completed.raw_model_labels[0].step_label, "Build a donor dashboard");
  assertEquals(completed.label_repairs, [{ journey_key: "pmk-x", step_number: 1, original: "Build a donor dashboard", repaired: "Define desired progress", reason: "vocabulary_law" }]);
  assertEquals(completed.label_refusal, null);

  const err = new LabelRefusalError("strict model content: refused", { journey_key: "pmk-x", step_number: 1, original: "Build a donor dashboard", reason: "vocabulary_law" });
  assert(err instanceof Error);
  const refused = labelLedgerForIntegrity(ledger, err.refusal);
  assertEquals(refused.label_refusal?.original, "Build a donor dashboard");
  assertEquals(refused.label_refusal?.reason, "vocabulary_law");
  assertEquals(refused.raw_model_labels.length, 2, "the run row keeps the raw labels even when refused");
  assertNotStrictEquals(refused.label_refusal, null);
});

// ── (f) through the real normalizer ─────────────────────────────────────────────────────────────
import { normalizeNonCustomerJourney } from "./handler.ts";

const MAP = { journey_key: "pmk-funders", journey_title: "Funders", journey_subtitle: "" };
function rawJourney(label1: string) {
  const step = (n: number, label: string) => ({ step_number: n, step_label: label, description: `What the funder does at step ${n}.`, evidence_status: "unclear", evidence_basis: "model line", evidence_confidence: 30, has_gap: true, gap_note: "g" });
  return { journey_key: MAP.journey_key, steps: [step(1, label1), step(2, "Identify potential recipients"), step(3, "Evaluate fit with the mission"), step(4, "Commit to support"), step(5, "Direct funding"), step(6, "Track impact")] };
}

Deno.test("(f) a repaired label: the normalizer keeps the model's original text and the canonical replacement in the ledger; the raw labels are all there", () => {
  const ledger = newLabelLedger();
  const out = normalizeNonCustomerJourney({ map: MAP, rawJourney: rawJourney("Build a donor dashboard"), evidenceBasis: "industry_anchor:grantmaking", ledger });
  assertEquals(out.steps.length, 6);
  assert(out.steps[0].step_label !== "Build a donor dashboard", "the prescriptive label was repaired");
  assertEquals(ledger.raw_labels.length, 6);
  assertEquals(ledger.raw_labels[0], { journey_key: "pmk-funders", step_number: 1, step_label: "Build a donor dashboard" });
  assertEquals(ledger.repairs, [{ journey_key: "pmk-funders", step_number: 1, original: "Build a donor dashboard", repaired: out.steps[0].step_label, reason: "vocabulary_law" }]);
});

Deno.test("(f) a refused label (strict mode): the thrown refusal carries the model's original text; the ledger already holds the raw labels seen", () => {
  const ledger = newLabelLedger();
  let caught: unknown = null;
  try {
    normalizeNonCustomerJourney({ map: MAP, rawJourney: rawJourney("Build a donor dashboard"), evidenceBasis: "industry_anchor:grantmaking", strictModelContent: true, ledger });
  } catch (e) { caught = e; }
  assert(caught instanceof LabelRefusalError, "strict mode refuses with a LabelRefusalError");
  assertEquals(caught.refusal, { journey_key: "pmk-funders", step_number: 1, original: "Build a donor dashboard", reason: "vocabulary_law" });
  assertEquals(ledger.raw_labels[0].step_label, "Build a donor dashboard");
  const frag = labelLedgerForIntegrity(ledger, caught.refusal);
  assertEquals(frag.label_refusal?.original, "Build a donor dashboard");
});

Deno.test("(f) a clean label: nothing repaired, nothing refused, raw labels kept", () => {
  const ledger = newLabelLedger();
  const out = normalizeNonCustomerJourney({ map: MAP, rawJourney: rawJourney("Clarify the mission need"), evidenceBasis: "industry_anchor:grantmaking", strictModelContent: true, ledger });
  assertEquals(out.steps[0].step_label, "Clarify the mission need");
  assertEquals(ledger.repairs, []);
  assertEquals(ledger.raw_labels.length, 6);
});

// ── item 1 (2026-09-19): a normalizer never emits null — null reaches the insert path ONLY through
// applyMarketEvidenceRule. Model output of null / NaN / "abc" / missing → clampInt → 0 (handler.ts:118-121).
Deno.test("item 1: the non-customer normalizer maps null / NaN / garbage / missing confidence to 0, never null", () => {
  const ledger = newLabelLedger();
  const raw = rawJourney("Clarify the mission need");
  (raw.steps[0] as Record<string, unknown>).evidence_confidence = null;
  (raw.steps[1] as Record<string, unknown>).evidence_confidence = Number.NaN;
  (raw.steps[2] as Record<string, unknown>).evidence_confidence = "abc";
  delete (raw.steps[3] as Record<string, unknown>).evidence_confidence;
  const out = normalizeNonCustomerJourney({ map: MAP, rawJourney: raw, evidenceBasis: "industry_anchor:grantmaking", ledger });
  assertEquals(out.steps.slice(0, 4).map((s) => s.evidence_confidence), [0, 0, 0, 0]);
  assert(out.steps.every((s) => typeof s.evidence_confidence === "number" && Number.isFinite(s.evidence_confidence)));
});
