import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { groupGapStatements, hoistStrongestNegative, isNegativeSignal, NEG_SLOT_INDEX } from "./mapping";
import { ActFindings } from "./acts";
import type { FRGapPair, FRFinding, FirstReadPreviewData } from "./types";

// ── FIX 1 — beat-4 statements ordered by FINAL verdict (post-relevance-strike) ────────────────
describe("FIX 1 — groupGapStatements orders by final verdict, not pre-strike pair order", () => {
  const base = { declared: "d", record: "r", sourceTag: null, eventDate: "2025-01-01", evidenceRank: 2 } as const;

  it("a statement whose divergent pairs are struck orthogonal (→confirmed) renders AFTER a genuinely contradicted one (fa55092a pattern)", () => {
    // S1 appears FIRST in input and has a divergent pair (would sort to the contradicted block by
    // pair-order) — but that divergent is struck orthogonal + it has an active echo → FINAL confirmed.
    // S2 appears later and has a live divergent → FINAL contradicted. Correct order: S2 (contradicted)
    // before S1 (confirmed), despite S1's earlier first-appearance.
    const pairs: FRGapPair[] = [
      { ...base, id: "s1d", statementId: "S1", verdict: "contradicted", relevanceVerdict: "orthogonal" },
      { ...base, id: "s1e", statementId: "S1", verdict: "confirmed", relevanceVerdict: "relevant" },
      { ...base, id: "s2d", statementId: "S2", verdict: "contradicted", relevanceVerdict: "relevant" },
    ];
    const out = groupGapStatements(pairs);
    expect(out.map((s) => s.statementId)).toEqual(["S2", "S1"]);
    expect(out.map((s) => s.verdict)).toEqual(["contradicted", "confirmed"]);
  });

  it("full order is contradicted → unechoed → confirmed", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "c", statementId: "C", verdict: "confirmed", relevanceVerdict: "relevant" },
      { ...base, id: "u", statementId: "U", verdict: "confirmed", relevanceVerdict: "orthogonal" }, // no active → unechoed
      { ...base, id: "x", statementId: "X", verdict: "contradicted", relevanceVerdict: "relevant" },
    ];
    expect(groupGapStatements(pairs).map((s) => s.verdict)).toEqual(["contradicted", "unechoed", "confirmed"]);
  });

  it("within a verdict group, strongest active evidence sorts first", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "a", statementId: "A", verdict: "contradicted", relevanceVerdict: "relevant", evidenceRank: 1 },
      { ...base, id: "b", statementId: "B", verdict: "contradicted", relevanceVerdict: "relevant", evidenceRank: 3 },
    ];
    expect(groupGapStatements(pairs).map((s) => s.statementId)).toEqual(["B", "A"]);
  });
});

// ── FIX 2 — strongest negative signal hoisted into an early slot ──────────────────────────────
describe("FIX 2 — hoistStrongestNegative", () => {
  const sig = (id: string, text: string, strength: string, eventDate: string | null) => ({ id, text, strength, eventDate });

  it("moves the strongest negative into NEG_SLOT_INDEX when it is buried", () => {
    const signals = [
      sig("p1", "safe, supportive, positive place", "strong", "2025-05-01"),
      sig("p2", "great outcomes for families", "strong", "2025-04-01"),
      sig("p3", "helpful staff", "strong", "2025-03-01"),
      sig("neg", "the place is going downhill, chronic understaffing", "moderate", "2024-07-05"),
    ];
    const out = hoistStrongestNegative(signals);
    expect(out[NEG_SLOT_INDEX].id).toBe("neg");
    expect(out).toHaveLength(4); // pure reorder — nothing added/removed
    expect(new Set(out.map((s) => s.id))).toEqual(new Set(["p1", "p2", "p3", "neg"]));
  });

  it("prefers the strongest tier, then most recent, among negatives", () => {
    const signals = [
      sig("p", "positive", "strong", "2025-01-01"),
      sig("nModOld", "understaffed turnover", "moderate", "2023-01-01"),
      sig("nStrong", "unsafe, safety concern", "strong", "2020-01-01"),
      sig("nModNew", "burnout, laid off", "moderate", "2025-01-01"),
    ];
    // strongest tier among negatives is nStrong (strong), despite older date
    expect(hoistStrongestNegative(signals)[NEG_SLOT_INDEX].id).toBe("nStrong");
  });

  it("no negative signal ⇒ array returned unchanged (no slot)", () => {
    const signals = [sig("p1", "positive", "strong", "2025-01-01"), sig("p2", "also positive", "moderate", "2025-01-01")];
    expect(hoistStrongestNegative(signals)).toBe(signals);
  });

  it("isNegativeSignal detects cues and rejects positive text", () => {
    expect(isNegativeSignal("Edgewood is going down hill")).toBe(true);
    expect(isNegativeSignal("chronic understaffing and burnout")).toBe(true);
    expect(isNegativeSignal("a safe, supportive, wonderful place")).toBe(false);
  });
});

// ── FIX 3 — findings show verbatim raw quotes; hidden when unverifiable ────────────────────────
describe("FIX 3 — findings raw quotes", () => {
  const readWith = (findings: FRFinding[]): FirstReadPreviewData =>
    ({ findings, statusConflicts: [] } as unknown as FirstReadPreviewData);

  it("renders the verbatim quote beneath a finding when one is provable", () => {
    const findings: FRFinding[] = [{
      id: "f", body: "Chronic frontline staff underpayment and high turnover.", recurrence: 4,
      sourceTag: { label: "read Aug 1" }, stale: false, ageMarker: null,
      quotes: [{ text: "Edgewood is a non profit that is going down hill.", sourceTag: { label: "indeed.com · July 2024" }, eventDate: "2024-07-05" }],
    }];
    render(<ActFindings read={readWith(findings)} />);
    expect(screen.getByText(/going down hill/)).toBeTruthy();
    expect(screen.getByText(/indeed\.com · July 2024/)).toBeTruthy();
  });

  it("renders NO quote when the guard found none (empty quotes) — never paraphrases the body", () => {
    const findings: FRFinding[] = [{
      id: "f", body: "A synthesized finding with no provable quote.", recurrence: 2,
      sourceTag: { label: "read Aug 1" }, stale: false, ageMarker: null, quotes: [],
    }];
    const { container } = render(<ActFindings read={readWith(findings)} />);
    // the body renders; the quote block (which alone emits a CLOSING ” via &rdquo;) does not.
    // (The LedgerRow adds a leading “ to the body itself, so absence is checked on the closing mark.)
    expect(screen.getByText(/A synthesized finding/)).toBeTruthy();
    expect(container.textContent).not.toContain("”"); // no closing double-quote → no quote block rendered
  });
});
