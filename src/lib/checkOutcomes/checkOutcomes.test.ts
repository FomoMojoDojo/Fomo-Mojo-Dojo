// Durable check outcomes — resolution by content identity (rulings 1–7, 2026-09-12). The pure layer is
// proven here with the REAL identity authority (supabase/functions/_shared/contentIdentity.ts — sha256 of
// the normalized text, exactly what production injects), so identity behaviour is the production one:
//   resurrection  — an identical-text condition (rebuilt after a re-roll, or on a re-inserted leg) regains
//                   its verdict; a reworded one does not; a HEAL-rewritten leg condition does not (ruling 2)
//   cross-route   — two routes carrying the identical condition both read the verdict (ruling 1)
//   supersession  — only the live row resolves; withdrawn resolves to nothing (ruling 3)
//   check_version — a version-2 row does not resolve against version 1 (ruling 4)
//   cache         — an element stamped by a row that is later withdrawn is cleared; a never-stamped element
//                   is untouched; the projection is idempotent
//   readers       — the d37aa79 reader cases read the projection exactly as they read the columns
import { describe, it, expect } from "vitest";
import { contentIdentity } from "../../../supabase/functions/_shared/contentIdentity";
import { liveOutcomes, overlayCompany, projectCompany, type CheckOutcomeRow, type RouteEl, type TestEl } from "./index";
import { deriveRouteStates } from "@/lib/validationState";

const C = "Families value clear eligibility information enough to change their funding search behavior";
const C_REWORDED = "Families value clear eligibility information enough to change how they search for funding";
const C_HEALED = "Families clearly understand eligibility rules, so they can plan their funding search";
let n = 0;
const row = (over: Partial<CheckOutcomeRow> & { subject_identity: string; check_kind: CheckOutcomeRow["check_kind"]; verdict: CheckOutcomeRow["verdict"] }): CheckOutcomeRow =>
  ({ id: `row-${++n}`, company_id: "c1", check_version: 1, recorded_at: `2026-09-12T10:0${n}:00Z`, superseded_by: null, ...over });
const route = (id: string, conds: Array<Record<string, unknown>>, over: Partial<RouteEl> = {}): RouteEl => ({ id, level: "route", parent_id: null, what_would_have_to_be_true: conds as never, ...over });
const leg = (id: string, parent: string, carried: string): RouteEl => ({ id, level: "leg", parent_id: parent, what_would_have_to_be_true: [{ condition: carried, satisfied_flag: false, leg_class: "test" }] as never });
const test_ = (id: string, action_id: string, outcome: string | null = null): TestEl => ({ id, action_id, outcome });
const idOf = contentIdentity;

describe("resurrection by identity (rulings 1, 2, 7)", () => {
  it("a rebuilt condition with IDENTICAL text (fresh element, no stamp) regains checked_at + satisfied_flag from the live row", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "condition_check", verdict: "unsatisfied" })];
    const rebuilt = route("r1", [{ condition: C, satisfied_flag: false, source: "generate-route-conditions:2026-09-12" }]);
    const p = await projectCompany(rows, [rebuilt], [], idOf);
    const el = p.routes[0].what_would_have_to_be_true![0];
    expect(el.checked_at).toBe(rows[0].recorded_at);
    expect(el.satisfied_flag).toBe(false);
    expect(el.source).toBe("generate-route-conditions:2026-09-12"); // siblings of the element untouched
  });
  it("normalization is the authority's: case and whitespace differences still resolve", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "condition_check", verdict: "satisfied" })];
    const p = await projectCompany(rows, [route("r1", [{ condition: `  ${C.toUpperCase()}\n`, satisfied_flag: false }])], [], idOf);
    expect(p.routes[0].what_would_have_to_be_true![0].satisfied_flag).toBe(true);
  });
  it("a REWORDED condition resolves to nothing", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "condition_check", verdict: "unsatisfied" })];
    const p = await projectCompany(rows, [route("r1", [{ condition: C_REWORDED, satisfied_flag: false }])], [], idOf);
    const el = p.routes[0].what_would_have_to_be_true![0];
    expect(el.checked_at).toBeUndefined();
    expect(el.satisfied_flag).toBe(false);
  });
  it("a leg re-inserted with the identical carried condition regains its test outcome; a HEAL-rewritten carried condition inherits nothing (ruling 2)", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "leg_test", verdict: "failed" })];
    const routes = [route("r1", [{ condition: C, satisfied_flag: false }]), leg("l-new", "r1", C), leg("l-healed", "r1", C_HEALED)];
    const tests = [test_("t-new", "l-new"), test_("t-healed", "l-healed")];
    const p = await projectCompany(rows, routes, tests, idOf);
    expect(p.tests.find((t) => t.id === "t-new")!.outcome).toBe("failed");
    expect(p.tests.find((t) => t.id === "t-healed")!.outcome).toBeNull();
    // and the derived states follow the durable record, not the (empty) columns
    const states = deriveRouteStates(p.routes as never, p.tests as never);
    expect(states.get("l-new")).toBe("contradicted");
    expect(states.get("l-healed")).toBe("unvalidated");
    expect(states.get("r1")).toBe("contradicted");
  });
  it("cross-route (ruling 1): two routes carrying the identical condition both read the verdict", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "condition_check", verdict: "unsatisfied" })];
    const p = await projectCompany(rows, [route("r1", [{ condition: C, satisfied_flag: false }]), route("r2", [{ condition: C, satisfied_flag: false }, { condition: "other", satisfied_flag: false }])], [], idOf);
    const states = deriveRouteStates(p.routes as never, []);
    expect(states.get("r1")).toBe("contradicted");
    expect(states.get("r2")).toBe("contradicted");
    expect(p.routes[1].what_would_have_to_be_true![1].checked_at).toBeUndefined(); // the other condition untouched
  });
});

describe("supersession, withdrawal, version (rulings 3, 4)", () => {
  it("only the live (non-superseded) row resolves — latest wins; the superseded row is history", async () => {
    const id = await idOf(C);
    const first = row({ subject_identity: id, check_kind: "condition_check", verdict: "unsatisfied" });
    const second = row({ subject_identity: id, check_kind: "condition_check", verdict: "satisfied" });
    first.superseded_by = second.id;
    const live = liveOutcomes([first, second]);
    expect(live.get(`condition_check:${id}`)?.id).toBe(second.id);
    const p = await projectCompany([first, second], [route("r1", [{ condition: C, satisfied_flag: false }])], [], idOf);
    expect(p.routes[0].what_would_have_to_be_true![0].satisfied_flag).toBe(true);
    expect(p.routes[0].what_would_have_to_be_true![0].checked_at).toBe(second.recorded_at);
  });
  it("withdrawn removes the identity from resolution: a previously stamped element is cleared, a never-stamped one untouched", async () => {
    const id = await idOf(C);
    const prior = row({ subject_identity: id, check_kind: "condition_check", verdict: "unsatisfied" });
    const withdrawn = row({ subject_identity: id, check_kind: "condition_check", verdict: "withdrawn" });
    prior.superseded_by = withdrawn.id;
    const stamped = route("r1", [{ condition: C, satisfied_flag: false, checked_at: prior.recorded_at }, { condition: "never stamped", satisfied_flag: true }]);
    const p = await projectCompany([prior, withdrawn], [stamped], [], idOf);
    const [a, b] = p.routes[0].what_would_have_to_be_true!;
    expect(a.checked_at).toBeUndefined();
    expect(a.satisfied_flag).toBe(false);
    expect(b).toEqual({ condition: "never stamped", satisfied_flag: true }); // the synthesis's flag stays
  });
  it("check_version: a version-2 row does not resolve at version 1", async () => {
    const id = await idOf(C);
    const v2 = row({ subject_identity: id, check_kind: "condition_check", verdict: "unsatisfied", check_version: 2 });
    const p = await projectCompany([v2], [route("r1", [{ condition: C, satisfied_flag: false }])], [], idOf);
    expect(p.routes[0].what_would_have_to_be_true![0].checked_at).toBeUndefined();
    expect(liveOutcomes([v2]).size).toBe(0);
    expect(liveOutcomes([v2], 2).size).toBe(1);
  });
});

describe("cache overlay is total and idempotent", () => {
  it("the overlay lists only what must change; applying it and overlaying again yields nothing", async () => {
    const rows = [row({ subject_identity: await idOf(C), check_kind: "condition_check", verdict: "satisfied" }), row({ subject_identity: await idOf(C), check_kind: "leg_test", verdict: "passed" })];
    const routes = [route("r1", [{ condition: C, satisfied_flag: false }]), leg("l1", "r1", C), route("r2", [{ condition: "unrelated", satisfied_flag: false }])];
    const tests = [test_("t1", "l1"), test_("t2", "missing-leg")];
    const first = await overlayCompany(rows, routes, tests, idOf);
    expect(first.routes.map((o) => o.routeId).sort()).toEqual(["l1", "r1"]); // the leg's carried copy is stamped too
    expect(first.tests).toEqual([{ testId: "t1", outcome: "passed", changed: true, legIdentity: await idOf(C) }]);
    const applied = await projectCompany(rows, routes, tests, idOf);
    const second = await overlayCompany(rows, applied.routes, applied.tests, idOf);
    expect(second.routes).toEqual([]);
    expect(second.tests).toEqual([]);
  });
});
