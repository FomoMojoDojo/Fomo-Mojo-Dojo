// Gate 3 (2026-08-26) — beat-4 display honesty: body-blank pairs (evidence held/superseded) are
// hidden not shown-blank; a statement that HAD a public echo but lost its evidence renders the
// REVERIFYING state (not the false "not echoed"); a genuinely publicly_silent statement stays
// unechoed; the STATUS DISPUTED chip is one-per-statement and only where there is visible evidence.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { groupGapStatements } from "./mapping";
import { ActGap } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair, type FRGapStatement } from "./types";

function pair(over: Partial<FRGapPair> & Pick<FRGapPair, "id" | "statementId" | "verdict">): FRGapPair {
  return {
    declared: "We say something.",
    record: "A public source says it too.",
    sourceTag: { label: "example.com" },
    eventDate: "2026-06-01",
    evidenceRank: 3,
    ...over,
  };
}
const readWith = (gapStatements: FRGapStatement[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  gapStatements,
  gapCounts: {
    contradicted: gapStatements.filter((s) => s.verdict === "contradicted").length,
    reverifying: gapStatements.filter((s) => s.verdict === "reverifying").length,
    unechoed: gapStatements.filter((s) => s.verdict === "unechoed").length,
    confirmed: gapStatements.filter((s) => s.verdict === "confirmed").length,
  },
});

describe("beat 4 — gate-3 display honesty (reverifying + chip dedup)", () => {
  it("1. a VISIBLE-evidence disputed pair renders as evidence and sets the statement chip", () => {
    const st = groupGapStatements([
      pair({ id: "v", statementId: "A", verdict: "contradicted", record: "The record disagrees.", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
    ]);
    expect(st[0].verdict).toBe("contradicted");
    expect(st[0].evidence.map((e) => e.id)).toEqual(["v"]); // kept
    expect(st[0].statusDisputed).toBe(true);                 // chip set from the visible pair
  });

  it("2. a BODY-BLANK pair (record+sourceTag null, evidence held) disappears — never a blank scaffold", () => {
    const st = groupGapStatements([
      pair({ id: "blank", statementId: "A", verdict: "contradicted", record: null, sourceTag: null, statusDisputed: true }),
    ]);
    expect(st[0].evidence).toHaveLength(0);   // omitted, not shown-blank
    expect(st[0].statusDisputed).toBe(false); // no chip from an omitted pair
  });

  it("3. an EMPTIED statement (had a public echo, all evidence held) → REVERIFYING, not unechoed", () => {
    const st = groupGapStatements([
      pair({ id: "e1", statementId: "A", verdict: "confirmed", record: null, sourceTag: null }),
      pair({ id: "e2", statementId: "A", verdict: "contradicted", record: null, sourceTag: null }),
    ]);
    expect(st[0].verdict).toBe("reverifying"); // the record is NOT silent — we're re-checking
    expect(st[0].verdict).not.toBe("unechoed");
    expect(st[0].evidence).toHaveLength(0);
  });

  it("4. a genuinely publicly-silent statement → UNECHOED, not reverifying", () => {
    const st = groupGapStatements([
      pair({ id: "s1", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),
      pair({ id: "s2", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    expect(st[0].verdict).toBe("unechoed"); // no public echo ever existed
    expect(st[0].verdict).not.toBe("reverifying");
  });

  it("5. ≤1 STATUS DISPUTED chip per statement, and NONE on an evidence-less (reverifying) row", () => {
    // Statement A: 3 visible disputed pairs → exactly ONE chip (was 3 before dedup).
    // Statement B: emptied → reverifying → ZERO chips, no verdict chip.
    const st = groupGapStatements([
      pair({ id: "a1", statementId: "A", verdict: "contradicted", record: "r1", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "a2", statementId: "A", verdict: "contradicted", record: "r2", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "a3", statementId: "A", verdict: "contradicted", record: "r3", sourceTag: { label: "yelp.com" }, statusDisputed: true }),
      pair({ id: "b1", statementId: "B", verdict: "contradicted", record: null, sourceTag: null, statusDisputed: true }),
    ]);
    const { container } = render(<ActGap read={readWith(st)} />);
    // ONE chip total: A dedupes 3 visible disputed pairs → 1; B (reverifying, evidence-less) → 0.
    // (Pre-fix this was 3 per-pair on A alone.)
    const chips = container.textContent?.match(/status disputed/gi) ?? [];
    expect(chips.length).toBe(1);
    // B renders the re-verifying holding note (not the record-silent line).
    expect(container.textContent?.toLowerCase()).toContain("re-verifying");
  });

  const CONFLICT = { location: "Le French Rooster", matchKey: "le french rooster", question: "closed?", closed: [], open: [] };
  const readConflict = (gapStatements: FRGapStatement[]) => ({ ...readWith(gapStatements), statusConflicts: [CONFLICT] } as FirstReadPreviewData);

  it("6. coherence note is SUPPRESSED while reverifying > 0 (its 'nothing contradicted' claim would be false)", () => {
    // 1 reverifying + 1 unechoed; contradicted = 0; a live status conflict present.
    const st = groupGapStatements([
      pair({ id: "e", statementId: "A", verdict: "contradicted", record: null, sourceTag: null }), // → reverifying
      pair({ id: "s", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }),      // → unechoed
    ]);
    const { container } = render(<ActGap read={readConflict(st)} />);
    expect(container.textContent?.toLowerCase()).not.toContain("nothing you've said publicly is contradicted");
  });

  it("6b. coherence note RETURNS when reverifying = 0 and contradicted = 0 (the clean state it was made for)", () => {
    const st = groupGapStatements([
      pair({ id: "s", statementId: "B", verdict: "unechoed", record: null, sourceTag: null }), // only unechoed → reverifying 0
    ]);
    const { container } = render(<ActGap read={readConflict(st)} />);
    expect(container.textContent?.toLowerCase()).toContain("nothing you've said publicly is contradicted");
  });

  it("7. the grouped re-verifying note renders ONCE over N statements, not once per row", () => {
    const st = groupGapStatements([
      pair({ id: "r1", statementId: "A", verdict: "contradicted", declared: "Claim one.", record: null, sourceTag: null }),
      pair({ id: "r2", statementId: "B", verdict: "confirmed", declared: "Claim two.", record: null, sourceTag: null }),
      pair({ id: "r3", statementId: "C", verdict: "contradicted", declared: "Claim three.", record: null, sourceTag: null }),
    ]);
    expect(st.every((s) => s.verdict === "reverifying")).toBe(true);
    const { container } = render(<ActGap read={readWith(st)} />);
    const notes = container.textContent?.match(/re-verifying the public record on these claims/gi) ?? [];
    expect(notes.length).toBe(1);                                  // ONE grouped note, not 3
    for (const d of ["Claim one.", "Claim two.", "Claim three."]) // all declared statements listed beneath
      expect(container.textContent).toContain(d);
  });
});

// HELD-ECHO CARVE-OUT (2026-08-26) — a relevance verdict computed over held/walled evidence is
// PROVISIONAL: it cannot demote a held echo to record-silence. This is the exact defect the R3
// backstop run exposed (the 5 Square-ordering echoes, held on Uber Eats/Postmates, were judged
// orthogonal and fell to 'unechoed'). H1 is the load-bearing red/green; H2–H4 prove the fix is
// scoped (a VISIBLE orthogonal pair stays unechoed; visible evidence still wins; 0-held is inert).
describe("beat 4 — held echo counts as re-verifying regardless of provisional relevance", () => {
  it("H1. a HELD echo judged ORTHOGONAL renders REVERIFYING (FAILS without the carve-out → unechoed)", () => {
    const st = groupGapStatements([
      pair({ id: "h", statementId: "SQ", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: true }),
    ]);
    expect(st[0].verdict).toBe("reverifying");
    expect(st[0].verdict).not.toBe("unechoed");
    expect(st[0].evidence).toHaveLength(0); // held → no visible evidence pushed
  });

  it("H2. a VISIBLE active-backed ORTHOGONAL pair stays UNECHOED (scope: not over-broadened)", () => {
    const st = groupGapStatements([
      pair({ id: "o", statementId: "V", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: false }),
    ]);
    expect(st[0].verdict).toBe("unechoed"); // present-but-irrelevant, NOT held → not re-verifying
  });

  it("H3. MIXED (held-orthogonal + visible-relevant on one statement) → renders evidence, not falsely silent", () => {
    const st = groupGapStatements([
      pair({ id: "held", statementId: "M", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal", heldEcho: true }),
      pair({ id: "vis", statementId: "M", verdict: "contradicted", record: "The record disagrees.", sourceTag: { label: "yelp.com" }, relevanceVerdict: "relevant" }),
    ]);
    expect(st[0].verdict).toBe("contradicted");             // visible relevant evidence wins
    expect(st[0].evidence.map((e) => e.id)).toEqual(["vis"]); // the held pair is never pushed as evidence
  });

  it("H4. Edgewood-shape (0 held) → identical to the relevance-only path (carve-out inert)", () => {
    const st = groupGapStatements([
      pair({ id: "c", statementId: "A", verdict: "contradicted", record: "r", sourceTag: { label: "yelp.com" }, relevanceVerdict: "relevant" }),
      pair({ id: "orth", statementId: "B", verdict: "confirmed", record: null, sourceTag: null, relevanceVerdict: "orthogonal" }), // no heldEcho
      pair({ id: "silent", statementId: "C", verdict: "unechoed", record: null, sourceTag: null }),
    ]);
    const byId = Object.fromEntries(st.map((s) => [s.statementId, s.verdict]));
    expect(byId).toEqual({ A: "contradicted", B: "unechoed", C: "unechoed" });
  });
});
