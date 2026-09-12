// ── validation_state — derived from outcomes that already exist ───────────────────────────────
//
// Operator ruling 1 (2026-09-12), the bars applied per element:
//   validated     — survey-validated provenance only (odi_needs, certaintyRung survey_validated).
//   directional   — a test with a result set, or a route condition with satisfied_flag true.
//   contradicted  — an outcome that went the other way: a test with outcome 'failed', a condition
//                   CHECKED (checked_at set) and not satisfied, or a claim with a contradicting signal ref.
//   unvalidated   — everything else (the default; the honest answer for most of the graph).
//
// Pure functions — no I/O. The edge-side recompute (supabase/functions/_shared/validationState.ts)
// loads the rows and applies the diff; both surfaces and every test import the derivation from here.
//
// The two outcome readers (rulings 1–3, 2026-09-12 — the encodings that make contradicted producible):
//   readTestOutcome    — tests.outcome is the STRUCTURED outcome: passed ⇒ success, failed ⇒ failure,
//                        inconclusive ⇒ no outcome. tests.result stays the free-text write-up and is
//                        NEVER parsed; with outcome null, a set result is still an outcome of unknown
//                        polarity ⇒ directional (the Sep 12 reading, unchanged).
//   readConditionOutcome — checked_at on the WrapCond element: null ⇒ never checked (satisfied_flag is
//                        meaningless ⇒ "unchecked"); set + satisfied_flag=true ⇒ satisfied; set +
//                        satisfied_flag=false ⇒ UNSATISFIED. satisfied_flag=true with no checked_at keeps
//                        the Sep 12 reading (satisfied) — the synthesis paths set the flag without a stamp.
//
// Movement: strongest-wins with contradicted dominating — contradicted > validated > directional >
// unvalidated. A check against a belief is not outweighed by a check for it. The derivation is total
// (recomputed from every current outcome), so re-running on unchanged data yields the same state.
// The Mojo Score does not read validation_state (ruling 2B) — proven in validationState.test.ts.

export type ValidationState = "unvalidated" | "directional" | "validated" | "contradicted";
export type TestOutcome = "success" | "failure" | "unknown";
export type ConditionOutcome = "satisfied" | "unsatisfied" | "unchecked";

export const VALIDATION_STATES: readonly ValidationState[] = ["unvalidated", "directional", "validated", "contradicted"];
const RANK: Record<ValidationState, number> = { unvalidated: 0, directional: 1, validated: 2, contradicted: 3 };

export type TestOutcomeCode = "passed" | "failed" | "inconclusive";
export type TestRow = { id: string; action_id: string | null; result: string | null; no_test_needed?: boolean | null; outcome?: TestOutcomeCode | string | null };
export type ConditionLike = { condition?: string; satisfied_flag?: boolean | null; evidence_refs?: string[] | null; checked_at?: string | null };
export type RouteLike = { id: string; level?: string | null; parent_id?: string | null; what_would_have_to_be_true?: ConditionLike[] | null; validation_state?: string | null };
export type NeedLike = { id: string; provenance_type?: string | null; validation_state?: string | null };
export type ClaimLike = { id: string; triangulation_state?: string | null };
export type ClaimRefLike = { claim_id: string; relationship: string };

/** The production reader: the structured outcome first; a set write-up with no outcome is still an outcome (unknown polarity). */
export function readTestOutcome(test: TestRow): TestOutcome | null {
  if (test.no_test_needed) return null;
  if (test.outcome === "passed") return "success";
  if (test.outcome === "failed") return "failure";
  if (test.outcome === "inconclusive") return null;
  if (test.result === null || test.result === undefined) return null;
  if (String(test.result).trim() === "") return null;
  return "unknown";
}

/** The production reader: checked_at decides whether satisfied_flag=false means anything. */
export function readConditionOutcome(cond: ConditionLike): ConditionOutcome {
  const checked = typeof cond.checked_at === "string" && cond.checked_at.trim() !== "";
  if (cond.satisfied_flag === true) return "satisfied";
  return checked ? "unsatisfied" : "unchecked";
}

export function strongest(states: Iterable<ValidationState>): ValidationState {
  let best: ValidationState = "unvalidated";
  for (const s of states) if (RANK[s] > RANK[best]) best = s;
  return best;
}

export function stateFromTestOutcome(o: TestOutcome | null): ValidationState {
  if (o === null) return "unvalidated";
  return o === "failure" ? "contradicted" : "directional";
}

export function stateFromConditionOutcome(o: ConditionOutcome): ValidationState {
  if (o === "satisfied") return "directional";
  if (o === "unsatisfied") return "contradicted";
  return "unvalidated";
}

export type RouteDerivation = { routeStates: Map<string, ValidationState> };

/**
 * Routes and legs. A leg's state comes from its tests. A route's state comes from its own conditions
 * AND from its legs' tests (the test's leg and its parent route both receive the outcome, ruling 3).
 */
export function deriveRouteStates(
  routes: RouteLike[],
  tests: TestRow[],
  readers: { test?: (t: TestRow) => TestOutcome | null; condition?: (c: ConditionLike) => ConditionOutcome } = {},
): Map<string, ValidationState> {
  const readTest = readers.test ?? readTestOutcome;
  const readCond = readers.condition ?? readConditionOutcome;
  const byId = new Map(routes.map((r) => [r.id, r]));
  const contributions = new Map<string, ValidationState[]>();
  const push = (id: string, s: ValidationState) => contributions.set(id, [...(contributions.get(id) ?? []), s]);

  for (const t of tests) {
    if (!t.action_id) continue;
    const leg = byId.get(t.action_id);
    if (!leg) continue;
    const s = stateFromTestOutcome(readTest(t));
    if (s === "unvalidated") continue;
    push(leg.id, s);
    if (leg.parent_id && byId.has(leg.parent_id)) push(leg.parent_id, s);
  }
  for (const r of routes) {
    if ((r.level ?? "route") !== "route") continue;
    for (const c of r.what_would_have_to_be_true ?? []) {
      const s = stateFromConditionOutcome(readCond(c));
      if (s !== "unvalidated") push(r.id, s);
    }
  }
  const out = new Map<string, ValidationState>();
  for (const r of routes) out.set(r.id, strongest(contributions.get(r.id) ?? []));
  return out;
}

/** Needs: validated only from survey provenance (certaintyRung survey_validated); everything else unvalidated. */
export function deriveNeedStates(needs: NeedLike[]): Map<string, ValidationState> {
  const out = new Map<string, ValidationState>();
  for (const n of needs) out.set(n.id, n.provenance_type === "odi_survey" ? "validated" : "unvalidated");
  return out;
}

/** Claims: a contradicting signal ref ⇒ triangulation_state 'contradicted'. Nothing else is touched. */
export function deriveClaimContradictions(claims: ClaimLike[], refs: ClaimRefLike[]): Map<string, "contradicted"> {
  const contradicted = new Set(refs.filter((r) => r.relationship === "contradicts").map((r) => r.claim_id));
  const out = new Map<string, "contradicted">();
  for (const c of claims) if (contradicted.has(c.id)) out.set(c.id, "contradicted");
  return out;
}

export type Update<T extends string> = { id: string; from: string | null; to: T };

/** The diff: only rows whose derived state differs from the stored one. Re-running on unchanged data yields []. */
export function diffStates<T extends string>(current: Array<{ id: string; state: string | null }>, derived: Map<string, T>): Update<T>[] {
  const out: Update<T>[] = [];
  for (const row of current) {
    const to = derived.get(row.id);
    if (to === undefined) continue;
    if ((row.state ?? "unvalidated") === to) continue;
    out.push({ id: row.id, from: row.state ?? null, to });
  }
  return out;
}
