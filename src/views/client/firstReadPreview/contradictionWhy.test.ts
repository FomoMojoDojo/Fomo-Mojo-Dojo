// GATE (2026-08-22, SIGNED softened wording): the derived contradiction "why" is built ONLY from
// row data (declared date, contra count, deduped hosts, most-recent contra date). No model, no stored
// field. Dates optional (omitted, never guessed). Empty when unconstructible. These pins cover the
// plural/date variants and the empty cases, against Edgewood-shaped rows.
import { describe, it, expect } from "vitest";
import { conflictExplanationFor, deriveContradictionWhy, isGroundedReason, judgedContradictionReason } from "./mapping";
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

describe("isGroundedReason — deterministic render-time check (no model)", () => {
  const hosts = new Set(["indeed.com", "guidestar.org"]);
  it("clean reason with NO host tokens → grounded (the common case)", () => {
    expect(isGroundedReason("employee review contradicts the declared supportive model", hosts)).toBe(true);
  });
  it("reason citing a host that IS in the evidence set → grounded", () => {
    expect(isGroundedReason("the indeed.com review contradicts the mission", hosts)).toBe(true);
  });
  it("VACUOUS PROOF — reason citing a host ABSENT from the evidence set → rejected", () => {
    expect(isGroundedReason("a yelp.com review contradicts the mission", hosts)).toBe(false);
  });
  it("empty / whitespace reason → rejected (non-empty required)", () => {
    expect(isGroundedReason("", hosts)).toBe(false);
    expect(isGroundedReason("   ", hosts)).toBe(false);
  });
});

describe("judgedContradictionReason — strongest divergent pair, grounded", () => {
  const p = (o: Partial<FRGapPair>): FRGapPair => ({
    id: o.id ?? "p", statementId: "S", verdict: "contradicted", declared: "We are the best.",
    record: "x", sourceTag: null, eventDate: null, evidenceRank: 2, ...o,
  });
  it("returns the strongest divergent pair's reason (highest evidenceRank)", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [
        p({ id: "a", evidenceRank: 1, recordHost: "indeed.com", judgeReason: "weak reason" }),
        p({ id: "b", evidenceRank: 3, recordHost: "guidestar.org", judgeReason: "strong reason" }),
      ],
    };
    expect(judgedContradictionReason(s)).toBe("strong reason");
  });
  it("tie on evidenceRank → most recent date wins", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [
        p({ id: "a", evidenceRank: 2, eventDate: "2024-01-01", recordHost: "indeed.com", judgeReason: "older" }),
        p({ id: "b", evidenceRank: 2, eventDate: "2024-07-05", recordHost: "indeed.com", judgeReason: "newer" }),
      ],
    };
    expect(judgedContradictionReason(s)).toBe("newer");
  });
  it("reason cites an absent host → null (caller falls back to the derived line)", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [p({ id: "a", evidenceRank: 3, recordHost: "indeed.com", judgeReason: "a yelp.com review contradicts it" })],
    };
    expect(judgedContradictionReason(s)).toBeNull();
  });
  it("confirmed / unechoed → null", () => {
    expect(judgedContradictionReason({ verdict: "confirmed", evidence: [] })).toBeNull();
    expect(judgedContradictionReason({ verdict: "unechoed", evidence: [] })).toBeNull();
  });
});

describe("conflictExplanationFor — tier 1, prefer SPECIFIC over honest-non-specific", () => {
  const p = (o: Partial<FRGapPair>): FRGapPair => ({
    id: o.id ?? "p", statementId: "S", verdict: "contradicted", declared: "We are the best.",
    record: "x", sourceTag: null, eventDate: null, evidenceRank: 2, ...o,
  });
  it("prefers the SPECIFIC pair even when a non-specific pair is stronger", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [
        p({ id: "strongVague", evidenceRank: 3, conflictExplanation: "You claim X; a public review is critical without specifics." }),
        p({ id: "weakSpecific", evidenceRank: 1, conflictExplanation: "You claim X; a former employee alleges serious safety concerns for clients and staff." }),
      ],
    };
    expect(conflictExplanationFor(s)).toBe("You claim X; a former employee alleges serious safety concerns for clients and staff.");
  });
  it("uses the honest non-specific line only when NO pair is specific", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [p({ id: "a", evidenceRank: 3, conflictExplanation: "You claim X; a public review is critical without specifics." })],
    };
    expect(conflictExplanationFor(s)).toBe("You claim X; a public review is critical without specifics.");
  });
  it("among specific pairs, returns the strongest (evidenceRank desc)", () => {
    const s: Pick<FRGapStatement, "verdict" | "evidence"> = {
      verdict: "contradicted",
      evidence: [
        p({ id: "a", evidenceRank: 1, conflictExplanation: "You claim X; sources allege weak thing." }),
        p({ id: "b", evidenceRank: 3, conflictExplanation: "You claim X; sources allege strong thing." }),
      ],
    };
    expect(conflictExplanationFor(s)).toBe("You claim X; sources allege strong thing.");
  });
  it("no pair carries an explanation → null (falls to tier 2)", () => {
    expect(conflictExplanationFor({ verdict: "contradicted", evidence: [p({})] })).toBeNull();
    expect(conflictExplanationFor({ verdict: "confirmed", evidence: [] })).toBeNull();
  });
});
