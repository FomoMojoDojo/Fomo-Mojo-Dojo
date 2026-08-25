import { describe, it, expect } from "vitest";
import { groupGapStatements } from "./mapping";
import { isRelevanceActive, isRelevanceStruck } from "@/lib/firstRead/relevanceActive";
import type { FRGapPair } from "./types";

// Proof (d): the single shared selector excludes an 'orthogonal' echoed pair from the CONFIRMED
// count AND (operator ruling 2026-08-25) OMITS it from the client render entirely — struck rows
// are never in `evidence`. The orthogonal verdict stays fully recorded/reversible in claim_deltas.
const base = { declared: "d", record: "r", sourceTag: null, eventDate: null, evidenceRank: 1 } as const;

describe("relevance backstop — count exclusion + struck rows OMITTED from render", () => {
  it("orthogonal echoed pair does NOT confirm its statement AND is omitted from evidence (all-struck fallback)", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "o", statementId: "S1", verdict: "confirmed", relevanceVerdict: "orthogonal" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("unechoed");   // out of the CONFIRMED count → renders the doesn't-echo line
    expect(st.evidence.length).toBe(0);    // struck row OMITTED entirely (no line-through, no presence)
  });

  it("a relevant echoed pair still confirms (active) — no behavior change", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "r", statementId: "S2", verdict: "confirmed", relevanceVerdict: "relevant" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
    expect(st.evidence.length).toBe(1);
    expect(isRelevanceActive(st.evidence[0].relevanceVerdict)).toBe(true);
  });

  it("NULL relevance (unjudged, e.g. every real company today) is active — no regression", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "n", statementId: "S3", verdict: "confirmed", relevanceVerdict: null },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
  });

  it("a statement with one active + one orthogonal echo stays confirmed, showing ONLY the active row", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "a", statementId: "S4", verdict: "confirmed", relevanceVerdict: "relevant" },
      { ...base, id: "b", statementId: "S4", verdict: "confirmed", relevanceVerdict: "orthogonal" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
    expect(st.evidence.length).toBe(1);                               // struck one omitted
    expect(st.evidence.every((e) => !isRelevanceStruck(e.relevanceVerdict))).toBe(true);
  });

  // INVARIANT: a confirmed/contradicted statement can never be all-struck (its verdict comes from
  // active evidence), so it always has >=1 rendered row; only unechoed statements are evidence-empty.
  it("INVARIANT — confirmed/contradicted statements always have >=1 active evidence row", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "c1", statementId: "C", verdict: "confirmed", relevanceVerdict: "relevant" },
      { ...base, id: "c2", statementId: "C", verdict: "confirmed", relevanceVerdict: "orthogonal" },
      { ...base, id: "x1", statementId: "X", verdict: "contradicted", relevanceVerdict: "relevant" },
      { ...base, id: "x2", statementId: "X", verdict: "contradicted", relevanceVerdict: "orthogonal" },
      { ...base, id: "u1", statementId: "U", verdict: "confirmed", relevanceVerdict: "orthogonal" }, // all-struck → unechoed
    ];
    for (const st of groupGapStatements(pairs)) {
      if (st.verdict === "confirmed" || st.verdict === "contradicted") {
        expect(st.evidence.length).toBeGreaterThanOrEqual(1);
        expect(st.evidence.every((e) => !isRelevanceStruck(e.relevanceVerdict))).toBe(true);
      } else {
        expect(st.evidence.length).toBe(0); // unechoed (incl. all-struck) → clean empty state
      }
    }
  });
});
