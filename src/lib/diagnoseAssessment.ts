// Diagnose assessment v1 — pure derivation (read-only, no fabrication, no DB writes).
//
// Per candidate parent route: which conditions are proven, which aren't, the
// BARRIER (the condition to prove first), and the Gate-3 test that moves it.
// Route-local ONLY: no gap-grouping, no route→outcome link, no likelihood rank
// (tier data is flat — ranking on provenance/evidence_state is the Gate-4 trap).
// Qualitative movement only: state changes as satisfied_flag flips / tests resolve.

export type TestRow = {
  id: string;
  action_id: string;         // = the leg route id
  hypothesis: string | null;
  expected_positive_signal: string | null;
  expected_negative_signal: string | null;
  result: string | null;
  no_test_needed?: boolean | null;
};

export type RouteLike = {
  id: string;
  level?: string | null;
  parent_id?: string | null;
  title?: string | null;
  sort_order?: number | null;
  what_would_have_to_be_true?: Array<{ condition?: string; satisfied_flag?: boolean }> | null;
};

// Test-resolution ladder: the ONLY per-condition evidence signal that moves today.
export type TestLadder = 0 | 1 | 2; // 0 = no test, 1 = drafted (result null), 2 = tested (result present)
export const TEST_STATE_LABEL: Record<TestLadder, string> = {
  0: "No test yet",
  1: "Drafted — not run",
  2: "Tested",
};

export type ConditionAssessment = {
  index: number;             // stable array-index order in routes.what_would_have_to_be_true (tie-break key)
  condition: string;
  met: boolean;              // from the matching leg's satisfied_flag
  ladder: TestLadder;
  testStateLabel: string;
  isBarrier: boolean;
  // Lever — populated ONLY on the barrier condition, ONLY when a test row exists (ladder >= 1):
  hypothesis: string | null;
  expectedPositiveSignal: string | null;
  expectedNegativeSignal: string | null;
};

export type RouteAssessment = {
  routeId: string;
  title: string;
  sortOrder: number;
  conditions: ConditionAssessment[];
  metCount: number;
  totalCount: number;
  barrierIndex: number | null; // null => zero unmet conditions (all proven, no barrier)
};

function norm(s: unknown): string {
  return String(s ?? "").trim();
}

function firstCondition(r: RouteLike): { condition: string; satisfied_flag: boolean } | null {
  const arr = Array.isArray(r.what_would_have_to_be_true) ? r.what_would_have_to_be_true : [];
  const c = arr[0];
  if (!c) return null;
  return { condition: norm(c.condition), satisfied_flag: c.satisfied_flag === true };
}

export function deriveRouteAssessment(
  parent: RouteLike,
  legs: RouteLike[],
  testsByAction: Map<string, TestRow>,
): RouteAssessment {
  const parentConds = Array.isArray(parent.what_would_have_to_be_true) ? parent.what_would_have_to_be_true : [];

  // Match each parent condition (in array order) to the leg whose first WWHTBT
  // condition text matches (one-leg-per-condition, established at Gate 2).
  const legByCondition = new Map<string, RouteLike>();
  for (const leg of legs) {
    const fc = firstCondition(leg);
    if (fc && fc.condition && !legByCondition.has(fc.condition)) legByCondition.set(fc.condition, leg);
  }

  const conditions: ConditionAssessment[] = parentConds.map((raw, index) => {
    const condition = norm(raw?.condition);
    const leg = legByCondition.get(condition) ?? null;
    // Rule 2: met = the matching leg's satisfied_flag. No matching leg → not proven.
    const met = leg ? firstCondition(leg)?.satisfied_flag === true : false;
    // Rule 3: test-resolution ladder from the leg's test (tests.action_id = leg.id).
    const test = leg ? testsByAction.get(leg.id) ?? null : null;
    const ladder: TestLadder = !test ? 0 : test.result == null ? 1 : 2;
    return {
      index,
      condition,
      met,
      ladder,
      testStateLabel: TEST_STATE_LABEL[ladder],
      isBarrier: false,
      hypothesis: test?.hypothesis ?? null,
      expectedPositiveSignal: test?.expected_positive_signal ?? null,
      expectedNegativeSignal: test?.expected_negative_signal ?? null,
    };
  });

  // Rule 4: BARRIER = among UNMET conditions, the LOWEST ladder rank.
  // Tie-break: lowest array index (stable order in what_would_have_to_be_true).
  // Zero unmet → no barrier (all-met route).
  const unmet = conditions.filter((c) => !c.met);
  let barrierIndex: number | null = null;
  if (unmet.length > 0) {
    const barrier = unmet.reduce((best, c) =>
      c.ladder < best.ladder || (c.ladder === best.ladder && c.index < best.index) ? c : best,
    );
    barrier.isBarrier = true;
    barrierIndex = barrier.index;
  }
  // The lever lives ONLY on the barrier — strip hypotheses from non-barrier conditions.
  for (const c of conditions) {
    if (!c.isBarrier) {
      c.hypothesis = null;
      c.expectedPositiveSignal = null;
      c.expectedNegativeSignal = null;
    }
  }

  return {
    routeId: String(parent.id),
    title: norm(parent.title) || "Untitled route",
    sortOrder: typeof parent.sort_order === "number" ? parent.sort_order : 0,
    conditions,
    metCount: conditions.filter((c) => c.met).length,
    totalCount: conditions.length,
    barrierIndex,
  };
}

export function deriveDiagnoseAssessment(routes: RouteLike[], tests: TestRow[]): RouteAssessment[] {
  const parents = routes.filter((r) => r.level === "route");
  const legsByParent = new Map<string, RouteLike[]>();
  for (const r of routes) {
    if (r.level === "leg" && r.parent_id) {
      const list = legsByParent.get(r.parent_id) ?? [];
      list.push(r);
      legsByParent.set(r.parent_id, list);
    }
  }
  const testsByAction = new Map<string, TestRow>();
  for (const t of tests) {
    if (t.action_id && !testsByAction.has(t.action_id)) testsByAction.set(t.action_id, t);
  }
  return parents
    .map((p) => deriveRouteAssessment(p, legsByParent.get(String(p.id)) ?? [], testsByAction))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// Status-quo "Do nothing" is a synthesized GLOBAL card (never a data row) — signed strings.
export const STATUS_QUO_CARD = {
  title: "Do nothing",
  body: "The gap stays open. Your score holds where it is.",
} as const;
