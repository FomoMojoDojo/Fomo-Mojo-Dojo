import { describe, it, expect } from "vitest";
import { groupGapStatements } from "./mapping";
import { isRelevanceActive, isRelevanceStruck } from "@/lib/firstRead/relevanceActive";
import type { FRGapPair } from "./types";

// Proof (d): the single shared selector excludes an 'orthogonal' echoed pair from the CONFIRMED
// count, while KEEPING it in evidence so it renders line-through in place (not deleted).
const base = { declared: "d", record: "r", sourceTag: null, eventDate: null, evidenceRank: 1 } as const;

describe("relevance backstop — count exclusion + struck render", () => {
  it("orthogonal echoed pair does NOT make its statement confirmed, but stays as struck evidence", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "o", statementId: "S1", verdict: "confirmed", relevanceVerdict: "orthogonal" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("unechoed");            // out of the CONFIRMED count
    expect(st.evidence.length).toBe(1);             // NOT deleted — still present
    expect(isRelevanceStruck(st.evidence[0].relevanceVerdict)).toBe(true); // renders line-through
  });

  it("a relevant echoed pair still confirms (active) — no behavior change", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "r", statementId: "S2", verdict: "confirmed", relevanceVerdict: "relevant" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
    expect(isRelevanceActive(st.evidence[0].relevanceVerdict)).toBe(true);
  });

  it("NULL relevance (unjudged, e.g. every real company today) is active — no regression", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "n", statementId: "S3", verdict: "confirmed", relevanceVerdict: null },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
  });

  it("a statement with one active + one orthogonal echo stays confirmed on the active one", () => {
    const pairs: FRGapPair[] = [
      { ...base, id: "a", statementId: "S4", verdict: "confirmed", relevanceVerdict: "relevant" },
      { ...base, id: "b", statementId: "S4", verdict: "confirmed", relevanceVerdict: "orthogonal" },
    ];
    const [st] = groupGapStatements(pairs);
    expect(st.verdict).toBe("confirmed");
    expect(st.evidence.length).toBe(2); // both visible; the orthogonal one struck
  });
});
