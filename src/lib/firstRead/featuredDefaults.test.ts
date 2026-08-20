// Gate 2.5 — deterministic default selectors (pure). Imports the SAME module the edge function
// uses, so the ranking can never fork between test and runtime.
import { describe, it, expect } from "vitest";
import {
  selectSayVsSeeDefault, selectFindingDefault, DECLARED_DIRECTION_TOPICS,
  type SayVsSeeCandidate, type FindingCandidate,
} from "../../../supabase/functions/_shared/featuredDefaults";

const sv = (id: string, deltaType: string, declaredTopic: string | null, declaredConfidence: string | null = "medium"): SayVsSeeCandidate =>
  ({ contentIdentity: id, deltaType, declaredTopic, declaredConfidence });

describe("selectSayVsSeeDefault — divergent > publicly_silent > echoed within declared-direction topics", () => {
  it("prefers a divergent on a declared-direction topic over echoes", () => {
    const out = selectSayVsSeeDefault([
      sv("echo", "echoed", "problem"),
      sv("div", "divergent", "positioning"),
      sv("sil", "publicly_silent", "strategy"),
    ]);
    expect(out).toBe("div");
  });

  it("ignores items whose declared topic is NOT in the declared-direction set", () => {
    // a divergent on 'market' (not declared-direction) loses to a publicly_silent on 'positioning'
    const out = selectSayVsSeeDefault([
      sv("div-market", "divergent", "market"),
      sv("sil-pos", "publicly_silent", "positioning"),
    ]);
    expect(out).toBe("sil-pos");
  });

  it("tie-break: same delta_type → topic priority (positioning/differentiators > problem > strategy)", () => {
    const out = selectSayVsSeeDefault([
      sv("a", "publicly_silent", "strategy"),
      sv("b", "publicly_silent", "problem"),
      sv("c", "publicly_silent", "positioning"),
    ]);
    expect(out).toBe("c");
  });

  it("tie-break: same delta_type + topic → confidence (high > medium > low)", () => {
    const out = selectSayVsSeeDefault([
      sv("lo", "publicly_silent", "positioning", "low"),
      sv("hi", "publicly_silent", "positioning", "high"),
    ]);
    expect(out).toBe("hi");
  });

  it("no eligible declared-direction item → null (honest: no forced pick)", () => {
    expect(selectSayVsSeeDefault([sv("x", "divergent", "market"), sv("y", "echoed", null)])).toBeNull();
    expect(selectSayVsSeeDefault([])).toBeNull();
  });

  it("declared-direction set includes stated-problem, positioning, differentiators, strategy", () => {
    for (const t of ["problem", "positioning", "unique attributes", "differentiated value", "strategy"]) {
      expect(DECLARED_DIRECTION_TOPICS.has(t)).toBe(true);
    }
    expect(DECLARED_DIRECTION_TOPICS.has("market")).toBe(false);
  });
});

describe("selectSayVsSeeDefault — W2 public_vs_public branch (topic allowlist does not apply)", () => {
  it("public: picks divergent first, then echoed — regardless of declared topic", () => {
    const out = selectSayVsSeeDefault([
      sv("echo", "echoed", "market"),
      sv("div", "divergent", "distribution channel"),
    ], "public_vs_public");
    expect(out).toBe("div");
  });

  it("public: an operational-topic echoed pair IS eligible (would be null under internal)", () => {
    const cands = [sv("echo", "echoed", "company owned web")];
    expect(selectSayVsSeeDefault(cands, "public_vs_public")).toBe("echo");
    expect(selectSayVsSeeDefault(cands)).toBeNull(); // internal default: topic not in allowlist
  });

  it("public: publicly_silent is NOT a say-vs-see pair (needs both sides) → excluded", () => {
    expect(selectSayVsSeeDefault([sv("sil", "publicly_silent", "market")], "public_vs_public")).toBeNull();
  });

  it("public: zero divergent/echoed pairs → no pointer (null)", () => {
    expect(selectSayVsSeeDefault([], "public_vs_public")).toBeNull();
  });
});

const fc = (id: string, kind: string, createdAtMs: number): FindingCandidate => ({ identity: id, kind, createdAtMs });

describe("selectFindingDefault — frontier wins, else most-recent (neutral)", () => {
  it("the single frontier finding is the default", () => {
    const out = selectFindingDefault([fc("obs1", "observation", 100), fc("front", "frontier", 50), fc("obs2", "observation", 200)]);
    expect(out).toEqual({ identity: "front", isFrontier: true });
  });

  it("no frontier → most-recent by createdAt (isFrontier false = neutral label)", () => {
    const out = selectFindingDefault([fc("old", "observation", 100), fc("new", "observation", 300), fc("mid", "observation", 200)]);
    expect(out).toEqual({ identity: "new", isFrontier: false });
  });

  it("no findings → null", () => {
    expect(selectFindingDefault([])).toBeNull();
  });
});
