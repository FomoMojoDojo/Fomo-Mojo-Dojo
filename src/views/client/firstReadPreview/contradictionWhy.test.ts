// GATE (2026-08-22, SIGNED softened wording): the derived contradiction "why" is built ONLY from
// row data (declared date, contra count, deduped hosts, most-recent contra date). No model, no stored
// field. Dates optional (omitted, never guessed). Empty when unconstructible. These pins cover the
// plural/date variants and the empty cases, against Edgewood-shaped rows.
import { describe, it, expect } from "vitest";
import { deriveContradictionWhy } from "./mapping";
import type { FRGapPair, FRGapStatement } from "./types";

const pair = (o: Partial<FRGapPair>): FRGapPair => ({
  id: o.id ?? "p", statementId: "S", verdict: "contradicted", declared: "We are the best.",
  record: o.record ?? "A review disagrees.", sourceTag: null, eventDate: null, evidenceRank: 2, ...o,
});
const stmt = (o: Partial<FRGapStatement>): FRGapStatement => ({
  statementId: "S", declared: "We are the best.", verdict: "contradicted", evidence: [], ...o,
});

describe("deriveContradictionWhy — row-sourced, no model", () => {
  it("1 source, declared date present, contra undated → singular tells, declared date, no contra date", () => {
    const s = stmt({
      declaredDate: "2025-09-25",
      evidence: [pair({ recordHost: "indeed.com", eventDate: null })],
    });
    expect(deriveContradictionWhy(s)).toBe(
      "You say this (stated September 25, 2025); 1 public source (indeed.com) tells a different story.",
    );
  });

  it("3 sources (2 hosts deduped), declared undated, contra dated → plural tell, deduped hosts, most-recent date", () => {
    const s = stmt({
      declaredDate: null,
      evidence: [
        pair({ id: "a", recordHost: "indeed.com", eventDate: "2024-07-05" }),
        pair({ id: "b", recordHost: "guidestar.org", eventDate: "2024-01-01" }),
        pair({ id: "c", recordHost: "indeed.com", eventDate: null }),
      ],
    });
    expect(deriveContradictionWhy(s)).toBe(
      "You say this; 3 public sources (indeed.com, guidestar.org) tell a different story, most recently July 5, 2024.",
    );
  });

  it("both dates absent → no date clauses at all (never guessed)", () => {
    const s = stmt({ declaredDate: null, evidence: [pair({ recordHost: "indeed.com", eventDate: null })] });
    expect(deriveContradictionWhy(s)).toBe("You say this; 1 public source (indeed.com) tells a different story.");
  });

  it("no host on the pair → omits the host parenthetical, still constructible from the count", () => {
    const s = stmt({ declaredDate: null, evidence: [pair({ recordHost: null, eventDate: null })] });
    expect(deriveContradictionWhy(s)).toBe("You say this; 1 public source tells a different story.");
  });

  it("confirmed / unechoed statements → null (nothing renders, never fabricated)", () => {
    expect(deriveContradictionWhy(stmt({ verdict: "confirmed", evidence: [pair({ verdict: "confirmed" })] }))).toBeNull();
    expect(deriveContradictionWhy(stmt({ verdict: "unechoed", evidence: [] }))).toBeNull();
  });

  it("only contradicted pairs count toward N (a mixed statement ignores its confirmed pairs)", () => {
    const s = stmt({
      declaredDate: null,
      evidence: [
        pair({ id: "x", verdict: "contradicted", recordHost: "indeed.com", eventDate: null }),
        pair({ id: "y", verdict: "confirmed", recordHost: "trustpilot.com", eventDate: null }),
      ],
    });
    expect(deriveContradictionWhy(s)).toBe("You say this; 1 public source (indeed.com) tells a different story.");
  });
});
