// The Gap, per-pair verdict (operator rulings R1–R4, 2026-09-22).
//   R2 — within a statement, disputing pairs render first, then echoing ones, stable inside each group.
//   R4 — tier 2's grounding check validates the judged reason against the CONTRADICTED pairs' hosts
//        only; a reason grounded solely in a host that ECHOES the statement is rejected and the line
//        falls to tier 3.
// The statement-level any-one rule and gapCounts are untouched — pinned here too, so a change to the
// pair order can never quietly move a statement's own verdict.
import { describe, it, expect } from "vitest";
import { groupGapStatements, judgedContradictionReason, orderPairsByVerdict } from "./mapping";
import type { FRGapPair, FRGapStatement } from "./types";

const pair = (o: Partial<FRGapPair> & { id: string }): FRGapPair => ({
  statementId: "S", verdict: "contradicted", declared: "We serve youth.", record: "A source.",
  sourceTag: null, eventDate: null, evidenceRank: 2, ...o,
});
const stmt = (o: Partial<FRGapStatement>): FRGapStatement => ({
  statementId: "S", declared: "We serve youth.", verdict: "contradicted", evidence: [], ...o,
});

describe("R2 — pair order within a statement", () => {
  it("a mixed set puts the disputing pair first, echoes after", () => {
    const pairs = [
      pair({ id: "echo-1", verdict: "confirmed" }),
      pair({ id: "echo-2", verdict: "confirmed" }),
      pair({ id: "dispute", verdict: "contradicted" }),
      pair({ id: "echo-3", verdict: "confirmed" }),
    ];
    expect(orderPairsByVerdict(pairs).map((p) => p.id)).toEqual(["dispute", "echo-1", "echo-2", "echo-3"]);
  });

  it("Edgewood's shape: one dispute, four echoes → the dispute leads and the echoes keep their order", () => {
    const pairs = [
      pair({ id: "usnews", verdict: "confirmed" }),
      pair({ id: "kp-1", verdict: "confirmed" }),
      pair({ id: "indeed", verdict: "contradicted" }),
      pair({ id: "kp-2", verdict: "confirmed" }),
      pair({ id: "kp-3", verdict: "confirmed" }),
    ];
    expect(orderPairsByVerdict(pairs).map((p) => p.id)).toEqual(["indeed", "usnews", "kp-1", "kp-2", "kp-3"]);
  });

  it("an all-confirmed statement is returned unchanged — no reorder", () => {
    const pairs = [pair({ id: "a", verdict: "confirmed" }), pair({ id: "b", verdict: "confirmed" }), pair({ id: "c", verdict: "confirmed" })];
    expect(orderPairsByVerdict(pairs).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("an all-contradicted statement is returned unchanged — no reorder", () => {
    const pairs = [pair({ id: "a" }), pair({ id: "b" }), pair({ id: "c" })];
    expect(orderPairsByVerdict(pairs).map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("stable within each group: upstream strength/recency order survives", () => {
    const pairs = [
      pair({ id: "d2", verdict: "contradicted", evidenceRank: 1 }),
      pair({ id: "e1", verdict: "confirmed", evidenceRank: 3 }),
      pair({ id: "d1", verdict: "contradicted", evidenceRank: 3 }),
      pair({ id: "e2", verdict: "confirmed", evidenceRank: 1 }),
    ];
    // NOT re-sorted by rank — the incoming order inside each verdict group is preserved verbatim
    expect(orderPairsByVerdict(pairs).map((p) => p.id)).toEqual(["d2", "d1", "e1", "e2"]);
  });

  it("the input array is not mutated", () => {
    const pairs = [pair({ id: "echo", verdict: "confirmed" }), pair({ id: "dispute" })];
    orderPairsByVerdict(pairs);
    expect(pairs.map((p) => p.id)).toEqual(["echo", "dispute"]);
  });
});

describe("R4 — tier 2 grounds on the CONTRADICTED pairs' hosts only", () => {
  const withHosts = (judgeReason: string) => stmt({
    evidence: [
      pair({ id: "indeed", verdict: "contradicted", recordHost: "indeed.com", judgeReason, evidenceRank: 3 }),
      pair({ id: "kp", verdict: "confirmed", recordHost: "healthy.kaiserpermanente.org" }),
      pair({ id: "usnews", verdict: "confirmed", recordHost: "usnews.com" }),
    ],
  });

  it("a reason grounded in the CONTRADICTING host passes", () => {
    const reason = "You say you serve youth; indeed.com reports a former employee left over safety concerns.";
    expect(judgedContradictionReason(withHosts(reason))).toBe(reason);
  });

  it("a reason grounded ONLY in a CONFIRMING host is rejected — it cannot explain a contradiction", () => {
    const reason = "You say you serve youth; usnews.com lists the school in its directory.";
    expect(judgedContradictionReason(withHosts(reason))).toBeNull();
  });

  it("a reason naming a host that is not in evidence at all is rejected", () => {
    expect(judgedContradictionReason(withHosts("You say you serve youth; example.com disagrees."))).toBeNull();
  });

  it("with NO contradicted pair carrying a host, tier 2 yields nothing", () => {
    const s = stmt({ evidence: [pair({ id: "d", recordHost: null, judgeReason: "indeed.com disagrees." })] });
    expect(judgedContradictionReason(s)).toBeNull();
  });
});

describe("R3 — the statement verdict and the pair order are independent", () => {
  const p = (id: string, verdict: FRGapPair["verdict"], host: string): FRGapPair =>
    pair({ id, verdict, recordHost: host, record: `record ${id}`, relevanceVerdict: "relevant", observedOwnHost: false });

  it("one contradicted pair among four confirmed still makes the STATEMENT contradicted (any-one)", () => {
    const grouped = groupGapStatements([
      p("usnews", "confirmed", "usnews.com"),
      p("kp-1", "confirmed", "healthy.kaiserpermanente.org"),
      p("indeed", "contradicted", "indeed.com"),
      p("kp-2", "confirmed", "healthy.kaiserpermanente.org"),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].verdict).toBe("contradicted");
    expect(grouped[0].evidence).toHaveLength(4); // every admissible visible pair still renders
    // and the ORDER the beat draws them in is the R2 order, without touching the verdict above
    expect(orderPairsByVerdict(grouped[0].evidence).map((e) => e.id)[0]).toBe("indeed");
  });

  it("all-confirmed stays confirmed and keeps every pair", () => {
    const grouped = groupGapStatements([p("a", "confirmed", "a.com"), p("b", "confirmed", "b.com")]);
    expect(grouped[0].verdict).toBe("confirmed");
    expect(orderPairsByVerdict(grouped[0].evidence).map((e) => e.id)).toEqual(["a", "b"]);
  });
});
