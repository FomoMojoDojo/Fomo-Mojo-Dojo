// validation_state writers (2026-09-12) — the derivation proven per outcome source. Since the outcome
// encoding (tests.outcome, condition checked_at — rulings 1–3), contradicted is PRODUCIBLE through the
// production readers on both paths; those tests are the primary proof. The injected-reader proofs from
// the first cut stay. Plus the unchecked-vs-failed distinction the encoding exists for, idempotence per
// writer, and the ruling-2B / ruling-5 proof that the Mojo Score never reads validation_state, outcome
// or checked_at.
import { describe, it, expect } from "vitest";
import {
  deriveClaimContradictions, deriveNeedStates, deriveRouteStates, diffStates, readConditionOutcome, readTestOutcome, strongest,
  type ClaimLike, type ClaimRefLike, type NeedLike, type RouteLike, type TestRow,
} from "./index";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { computeReachableScore, computeUnlockableScore } from "@/lib/mojoScore/projections";

const route = (id: string, conds: Array<{ satisfied_flag: boolean }> = [], over: Partial<RouteLike> = {}): RouteLike =>
  ({ id, level: "route", parent_id: null, what_would_have_to_be_true: conds.map((c, i) => ({ condition: `c${i}`, ...c })), validation_state: "unvalidated", ...over });
const leg = (id: string, parent: string, over: Partial<RouteLike> = {}): RouteLike =>
  ({ id, level: "leg", parent_id: parent, what_would_have_to_be_true: [{ condition: "src", satisfied_flag: false, leg_class: "test" } as never], validation_state: "unvalidated", ...over });
const test_ = (id: string, action_id: string, result: string | null, over: Partial<TestRow> = {}): TestRow => ({ id, action_id, result, no_test_needed: false, ...over });
const current = (rows: RouteLike[]) => rows.map((r) => ({ id: r.id, state: r.validation_state ?? null }));

describe("readers — the five ruling-3 cases", () => {
  it("test outcome 'failed' ⇒ failure; 'passed' ⇒ success; 'inconclusive' ⇒ no outcome", () => {
    expect(readTestOutcome(test_("t", "l", null, { outcome: "failed" }))).toBe("failure");
    expect(readTestOutcome(test_("t", "l", null, { outcome: "passed" }))).toBe("success");
    expect(readTestOutcome(test_("t", "l", "we ran it, could not tell", { outcome: "inconclusive" }))).toBeNull();
  });
  it("tests.result is NEVER parsed: with outcome null, null / blank / no_test_needed ⇒ no outcome; any set write-up ⇒ unknown polarity", () => {
    expect(readTestOutcome(test_("t", "l", null))).toBeNull();
    expect(readTestOutcome(test_("t", "l", "   "))).toBeNull();
    expect(readTestOutcome(test_("t", "l", "positive", { no_test_needed: true }))).toBeNull();
    expect(readTestOutcome(test_("t", "l", "Survey ran; 8 of 10 families confirmed"))).toBe("unknown");
    expect(readTestOutcome(test_("t", "l", "FAILED — nobody confirmed"))).toBe("unknown"); // text says failed; outcome does not
    expect(readTestOutcome(test_("t", "l", "passed with flying colours", { outcome: "failed" }))).toBe("failure"); // outcome wins over text
  });
  it("conditions: checked_at set + satisfied ⇒ satisfied; checked_at set + unsatisfied ⇒ UNSATISFIED; checked_at null ⇒ unchecked", () => {
    expect(readConditionOutcome({ satisfied_flag: true, checked_at: "2026-09-12T10:00:00Z" })).toBe("satisfied");
    expect(readConditionOutcome({ satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" })).toBe("unsatisfied");
    expect(readConditionOutcome({ satisfied_flag: false, checked_at: null })).toBe("unchecked");
    expect(readConditionOutcome({ satisfied_flag: false })).toBe("unchecked");
    expect(readConditionOutcome({ satisfied_flag: false, checked_at: "" })).toBe("unchecked");
    expect(readConditionOutcome({ satisfied_flag: false, evidence_refs: ["s1"] })).toBe("unchecked"); // evidence_refs is not a proxy
    expect(readConditionOutcome({ satisfied_flag: true })).toBe("satisfied"); // the synthesis-set flag, no stamp: the Sep 12 reading
    expect(readConditionOutcome({})).toBe("unchecked");
  });
});

describe("PRODUCTION-path contradicted (the primary proof)", () => {
  it("a test with outcome 'failed' ⇒ contradicted on its leg and its parent route", () => {
    const routes = [route("r1"), leg("l1", "r1"), leg("l2", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", "went the other way", { outcome: "failed" })]);
    expect(states.get("l1")).toBe("contradicted");
    expect(states.get("r1")).toBe("contradicted");
    expect(states.get("l2")).toBe("unvalidated");
  });
  it("a test with outcome 'passed' ⇒ directional (as any set result)", () => {
    const routes = [route("r1"), leg("l1", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", null, { outcome: "passed" })]);
    expect(states.get("l1")).toBe("directional");
    expect(states.get("r1")).toBe("directional");
  });
  it("'inconclusive' ⇒ no outcome, even with a write-up", () => {
    const routes = [route("r1"), leg("l1", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", "ran, unclear", { outcome: "inconclusive" })]);
    expect(states.get("l1")).toBe("unvalidated");
    expect(states.get("r1")).toBe("unvalidated");
  });
  it("a condition checked_at set + satisfied_flag=false ⇒ contradicted on its route", () => {
    const routes = [route("r1", [{ satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" } as never])];
    expect(deriveRouteStates(routes, []).get("r1")).toBe("contradicted");
  });
  it("a condition checked_at set + satisfied_flag=true ⇒ directional", () => {
    const routes = [route("r1", [{ satisfied_flag: true, checked_at: "2026-09-12T10:00:00Z" } as never])];
    expect(deriveRouteStates(routes, []).get("r1")).toBe("directional");
  });
  it("UNCHECKED vs FAILED — satisfied_flag=false with checked_at NULL ⇒ unvalidated, not contradicted (the distinction this encoding exists for)", () => {
    const unchecked = [route("r1", [{ satisfied_flag: false, checked_at: null } as never, { satisfied_flag: false } as never])];
    expect(deriveRouteStates(unchecked, []).get("r1")).toBe("unvalidated");
    const checked = [route("r1", [{ satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" } as never, { satisfied_flag: false } as never])];
    expect(deriveRouteStates(checked, []).get("r1")).toBe("contradicted");
  });
  it("strongest-wins: one passed + one failed test on a route ⇒ contradicted", () => {
    const routes = [route("r1"), leg("l1", "r1"), leg("l2", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", null, { outcome: "passed" }), test_("t2", "l2", null, { outcome: "failed" })]);
    expect(states.get("l1")).toBe("directional");
    expect(states.get("l2")).toBe("contradicted");
    expect(states.get("r1")).toBe("contradicted");
  });
  it("strongest-wins: one satisfied + one checked-unsatisfied condition ⇒ contradicted", () => {
    const routes = [route("r1", [{ satisfied_flag: true, checked_at: "2026-09-12T09:00:00Z" } as never, { satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" } as never])];
    expect(deriveRouteStates(routes, []).get("r1")).toBe("contradicted");
  });
});

describe("tests → leg + parent route", () => {
  it("a set result ⇒ directional on the leg AND its parent route", () => {
    const routes = [route("r1"), leg("l1", "r1"), leg("l2", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", "8 of 10 confirmed")]);
    expect(states.get("l1")).toBe("directional");
    expect(states.get("r1")).toBe("directional");
    expect(states.get("l2")).toBe("unvalidated");
  });
  it("no result ⇒ nothing moves", () => {
    const routes = [route("r1"), leg("l1", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", null)]);
    expect([...states.values()].every((s) => s === "unvalidated")).toBe(true);
  });
  it("PLANTED contradicted: a failing outcome ⇒ contradicted on the leg and its route, and it dominates a sibling's success", () => {
    const routes = [route("r1"), leg("l1", "r1"), leg("l2", "r1")];
    const tests = [test_("t1", "l1", "went the other way"), test_("t2", "l2", "confirmed")];
    const states = deriveRouteStates(routes, tests, { test: (t) => (t.id === "t1" ? "failure" : "success") });
    expect(states.get("l1")).toBe("contradicted");
    expect(states.get("l2")).toBe("directional");
    expect(states.get("r1")).toBe("contradicted"); // strongest-wins, contradicted dominating
  });
  it("with outcome null the production reader still never reads failure out of the write-up text", () => {
    const routes = [route("r1"), leg("l1", "r1")];
    const states = deriveRouteStates(routes, [test_("t1", "l1", "went the other way")]);
    expect(states.get("l1")).toBe("directional");
    expect(states.get("r1")).toBe("directional");
  });
  it("a test on an unknown leg or with no action_id is ignored", () => {
    const routes = [route("r1")];
    expect(deriveRouteStates(routes, [test_("t1", "nope", "x"), test_("t2", null as unknown as string, "x")]).get("r1")).toBe("unvalidated");
  });
});

describe("route conditions → route", () => {
  it("one satisfied condition among many ⇒ directional (Edgewood's 1/28 case)", () => {
    const routes = [route("r1", [{ satisfied_flag: true }, { satisfied_flag: false }, { satisfied_flag: false }])];
    expect(deriveRouteStates(routes, []).get("r1")).toBe("directional");
  });
  it("only unsatisfied flags ⇒ unvalidated (false is indistinguishable from never-checked)", () => {
    const routes = [route("r1", [{ satisfied_flag: false }, { satisfied_flag: false }])];
    expect(deriveRouteStates(routes, []).get("r1")).toBe("unvalidated");
  });
  it("PLANTED contradicted: a checked-and-unsatisfied condition ⇒ contradicted, dominating a satisfied sibling", () => {
    const routes = [route("r1", [{ satisfied_flag: true }, { satisfied_flag: false, condition: "checked-not-met" } as never])];
    const states = deriveRouteStates(routes, [], { condition: (c) => (c.condition === "checked-not-met" ? "unsatisfied" : readConditionOutcome(c)) });
    expect(states.get("r1")).toBe("contradicted");
  });
  it("conditions on a LEG do not feed the leg (they are the parent's condition carried for display)", () => {
    const routes = [route("r1"), leg("l1", "r1", { what_would_have_to_be_true: [{ condition: "src", satisfied_flag: true }] })];
    expect(deriveRouteStates(routes, []).get("l1")).toBe("unvalidated");
  });
});

describe("needs → validated only from survey provenance", () => {
  it("odi_survey ⇒ validated; manual / public_research / internal_declared ⇒ unvalidated", () => {
    const needs: NeedLike[] = [
      { id: "n1", provenance_type: "odi_survey" }, { id: "n2", provenance_type: "manual" },
      { id: "n3", provenance_type: "public_research" }, { id: "n4", provenance_type: "internal_declared" }, { id: "n5", provenance_type: null },
    ];
    const s = deriveNeedStates(needs);
    expect(s.get("n1")).toBe("validated");
    for (const id of ["n2", "n3", "n4", "n5"]) expect(s.get(id)).toBe("unvalidated");
  });
});

describe("claims → triangulation_state contradicted from a contradicting ref", () => {
  it("a 'contradicts' ref ⇒ contradicted; supports / qualifies ⇒ untouched", () => {
    const claims: ClaimLike[] = [{ id: "c1", triangulation_state: "single_source" }, { id: "c2", triangulation_state: "untested" }, { id: "c3", triangulation_state: "single_source" }];
    const refs: ClaimRefLike[] = [{ claim_id: "c1", relationship: "supports" }, { claim_id: "c2", relationship: "contradicts" }, { claim_id: "c3", relationship: "qualifies" }];
    const d = deriveClaimContradictions(claims, refs);
    expect(d.get("c2")).toBe("contradicted");
    expect(d.has("c1")).toBe(false);
    expect(d.has("c3")).toBe(false);
    const updates = diffStates(claims.map((c) => ({ id: c.id, state: c.triangulation_state ?? null })), d);
    expect(updates).toEqual([{ id: "c2", from: "untested", to: "contradicted" }]);
  });
});

describe("movement and idempotence", () => {
  it("strongest-wins: contradicted > validated > directional > unvalidated", () => {
    expect(strongest(["directional", "unvalidated"])).toBe("directional");
    expect(strongest(["directional", "contradicted", "validated"])).toBe("contradicted");
    expect(strongest([])).toBe("unvalidated");
  });
  it("routes: re-running on unchanged data yields no updates; a new outcome moves the row; its removal moves it back", () => {
    const routes = [route("r1"), leg("l1", "r1")];
    const first = diffStates(current(routes), deriveRouteStates(routes, [test_("t1", "l1", "confirmed")]));
    expect(first.map((u) => `${u.id}:${u.to}`).sort()).toEqual(["l1:directional", "r1:directional"]);
    const applied = routes.map((r) => ({ ...r, validation_state: "directional" }));
    expect(diffStates(current(applied), deriveRouteStates(applied, [test_("t1", "l1", "confirmed")]))).toEqual([]);
    // Total recomputation: the outcome gone ⇒ back to unvalidated (not sticky).
    expect(diffStates(current(applied), deriveRouteStates(applied, [])).map((u) => u.to)).toEqual(["unvalidated", "unvalidated"]);
  });
  it("routes with the new fields: idempotent (failed test + checked-unsatisfied condition, re-run ⇒ no updates)", () => {
    const routes = [route("r1", [{ satisfied_flag: false, checked_at: "2026-09-12T10:00:00Z" } as never], { validation_state: "contradicted" }), leg("l1", "r1", { validation_state: "contradicted" })];
    const tests = [test_("t1", "l1", null, { outcome: "failed" })];
    expect(diffStates(current(routes), deriveRouteStates(routes, tests))).toEqual([]);
  });
  it("needs: idempotent", () => {
    const needs: NeedLike[] = [{ id: "n1", provenance_type: "odi_survey", validation_state: "validated" }, { id: "n2", provenance_type: "manual", validation_state: "unvalidated" }];
    expect(diffStates(needs.map((n) => ({ id: n.id, state: n.validation_state ?? null })), deriveNeedStates(needs))).toEqual([]);
  });
  it("claims: idempotent", () => {
    const claims: ClaimLike[] = [{ id: "c1", triangulation_state: "contradicted" }];
    expect(diffStates([{ id: "c1", state: "contradicted" }], deriveClaimContradictions(claims, [{ claim_id: "c1", relationship: "contradicts" }]))).toEqual([]);
  });
});

describe("ruling 2B / ruling 5 — the Mojo Score does not read validation_state, outcome or checked_at", () => {
  it("the computed score, reachable and unlockable are identical before and after a planted validation_state / outcome / checked_at change on the same rows", () => {
    const routes = [
      { id: "r1", category: "fix", level: "route", parent_id: null, rejected_alternatives: [{ alternative_title: "a", rejection_reason: "b" }], what_would_have_to_be_true: [{ condition: "c", satisfied_flag: true }, { condition: "d", satisfied_flag: false }], updated_at: "2026-09-01T00:00:00Z", validation_state: "unvalidated" },
      { id: "l1", category: "fix", level: "leg", parent_id: "r1", steps_json: [{ id: "s", title: "s", status: "complete" }], evidence_json: [{ id: "e", title: "e", status: "complete" }], linked_need_ids: ["n1"], updated_at: "2026-09-01T00:00:00Z", validation_state: "unvalidated" },
    ];
    const needs = [{ id: "n1", desired_outcome: "x", importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", updated_at: "2026-09-01T00:00:00Z", validation_state: "unvalidated" }];
    const claims = [{ id: "c1", state: "diagnose" as const, claim_type: "t", topic: "t", outside_support_count: 1, organization_support_count: 1, customer_support_count: 0, updated_at: "2026-09-01T00:00:00Z", triangulation_state: "single_source" }];
    const computedAt = "2026-09-12T00:00:00Z";
    const before = computeMojoScore({ companyId: "c", claims, routes, needs, computedAt });
    const planted = {
      // checked_at stamped on every condition (flags unchanged), validation_state flipped, a failed test outcome beside it.
      routes: routes.map((r) => ({ ...r, validation_state: "contradicted", what_would_have_to_be_true: r.what_would_have_to_be_true?.map((c) => ({ ...c, checked_at: "2026-09-12T10:00:00Z" })) })),
      needs: needs.map((n) => ({ ...n, validation_state: "validated" })),
      claims: claims.map((c) => ({ ...c, triangulation_state: "contradicted" })),
    };
    const after = computeMojoScore({ companyId: "c", claims: planted.claims, routes: planted.routes, needs: planted.needs, computedAt });
    // tests (outcome) are not even an input to computeMojoScore — MojoScoreInput carries no tests; asserted by type and by the identical result.
    const failedTest: TestRow = test_("t1", "l1", "went the other way", { outcome: "failed" });
    expect(readTestOutcome(failedTest)).toBe("failure");
    expect(after.total_score).toBe(before.total_score);
    expect(after.contributors).toEqual(before.contributors);
    expect(after.projected_raisers).toEqual(before.projected_raisers);
    expect(computeReachableScore(after)).toBe(computeReachableScore(before));
    expect(computeUnlockableScore(computeReachableScore(after), after)).toBe(computeUnlockableScore(computeReachableScore(before), before));
  });
});
