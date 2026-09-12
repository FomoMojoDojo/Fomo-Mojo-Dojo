// ── check outcomes — resolution by content identity (pure) ─────────────────────────────────────
//
// Rulings 1–7 (2026-09-12). A recorded check lives in check_outcomes keyed by the CONDITION's content
// identity (company-wide), check_kind and check_version. This module resolves the LIVE rows onto the
// current structure — route conditions and (through the leg's carried condition) leg tests — and
// produces the display cache the rows should carry (checked_at / satisfied_flag on an element,
// tests.outcome on a test). It never computes identity itself: `identityOf` is injected and is always
// the TS authority (supabase/functions/_shared/contentIdentity.ts) in production. Pure: no I/O.
//
//   condition_check  satisfied ⇒ checked_at = recorded_at, satisfied_flag = true
//                    unsatisfied ⇒ checked_at = recorded_at, satisfied_flag = false
//   leg_test         passed | failed | inconclusive ⇒ tests.outcome
//   withdrawn / no live row ⇒ the cache is cleared (checked_at null; a previously stamped element's
//                    satisfied_flag returns to false; tests.outcome null). Elements that were never
//                    stamped are untouched — their satisfied_flag is the synthesis's, not ours.
//   A reworded or HEAL-rewritten condition has a different identity and resolves to nothing (ruling 2).

export type CheckKind = "condition_check" | "leg_test";
export type CheckVerdict = "satisfied" | "unsatisfied" | "passed" | "failed" | "inconclusive" | "withdrawn";
export type CheckOutcomeRow = {
  id: string;
  company_id: string;
  subject_identity: string;
  check_kind: CheckKind;
  check_version: number;
  verdict: CheckVerdict;
  recorded_at: string;
  superseded_by: string | null;
};
export type ConditionEl = { condition?: string; satisfied_flag?: boolean | null; checked_at?: string | null; [k: string]: unknown };
export type RouteEl = { id: string; level?: string | null; parent_id?: string | null; what_would_have_to_be_true?: ConditionEl[] | null };
export type TestEl = { id: string; action_id: string | null; outcome?: string | null };
export type IdentityFn = (text: string) => Promise<string>;

export const CURRENT_CHECK_VERSION = 1;

/** Live = not superseded, not withdrawn, at the current version. Keyed "kind:identity". */
export function liveOutcomes(rows: CheckOutcomeRow[], version = CURRENT_CHECK_VERSION): Map<string, CheckOutcomeRow> {
  const out = new Map<string, CheckOutcomeRow>();
  for (const r of rows) {
    if (r.superseded_by !== null && r.superseded_by !== undefined) continue;
    if (r.check_version !== version) continue;
    if (r.verdict === "withdrawn") continue;
    out.set(`${r.check_kind}:${r.subject_identity}`, r);
  }
  return out;
}

export type ConditionCache = { checked_at: string | null; satisfied_flag: boolean | null };

/** What an element should carry given the live rows: null ⇒ leave the element exactly as it is. */
export function conditionCacheFor(el: ConditionEl, live: Map<string, CheckOutcomeRow>, identity: string): ConditionCache | null {
  const row = live.get(`condition_check:${identity}`);
  if (row) {
    return { checked_at: row.recorded_at, satisfied_flag: row.verdict === "satisfied" };
  }
  // No live row: an element that WAS stamped loses its stamp (and the flag the stamp set).
  const stamped = typeof el.checked_at === "string" && el.checked_at.trim() !== "";
  return stamped ? { checked_at: null, satisfied_flag: false } : null;
}

export type RouteOverlay = { routeId: string; conditions: ConditionEl[]; changed: boolean; identities: string[] };

/** Overlay the live rows onto a route's condition elements (route-level AND leg-carried copies). */
export async function overlayRoute(route: RouteEl, live: Map<string, CheckOutcomeRow>, identityOf: IdentityFn): Promise<RouteOverlay> {
  const conds = Array.isArray(route.what_would_have_to_be_true) ? route.what_would_have_to_be_true : [];
  const identities: string[] = [];
  let changed = false;
  const next: ConditionEl[] = [];
  for (const el of conds) {
    const text = String(el?.condition ?? "");
    const identity = text.trim() ? await identityOf(text) : "";
    identities.push(identity);
    const cache = identity ? conditionCacheFor(el, live, identity) : null;
    if (!cache) { next.push(el); continue; }
    const same = (el.checked_at ?? null) === cache.checked_at && (el.satisfied_flag === true) === (cache.satisfied_flag === true);
    if (same) { next.push(el); continue; }
    changed = true;
    const { checked_at: _c, ...rest } = el;
    next.push(cache.checked_at === null ? { ...rest, satisfied_flag: false } : { ...rest, satisfied_flag: cache.satisfied_flag === true, checked_at: cache.checked_at });
  }
  return { routeId: route.id, conditions: next, changed, identities };
}

export type TestOverlay = { testId: string; outcome: "passed" | "failed" | "inconclusive" | null; changed: boolean; legIdentity: string | null };

/** A test resolves through its leg's CARRIED condition (wwhtbt[0].condition) — ruling 2. */
export async function overlayTest(test: TestEl, legById: Map<string, RouteEl>, live: Map<string, CheckOutcomeRow>, identityOf: IdentityFn): Promise<TestOverlay> {
  const leg = test.action_id ? legById.get(test.action_id) : undefined;
  const carried = String(leg?.what_would_have_to_be_true?.[0]?.condition ?? "");
  const legIdentity = carried.trim() ? await identityOf(carried) : null;
  const row = legIdentity ? live.get(`leg_test:${legIdentity}`) : undefined;
  const outcome = row ? (row.verdict as "passed" | "failed" | "inconclusive") : null;
  const current = (test.outcome ?? null) as string | null;
  return { testId: test.id, outcome, changed: current !== outcome, legIdentity };
}

/** Whole-company overlay: what to write so the cache mirrors the live record. */
export async function overlayCompany(
  rows: CheckOutcomeRow[],
  routes: RouteEl[],
  tests: TestEl[],
  identityOf: IdentityFn,
): Promise<{ routes: RouteOverlay[]; tests: TestOverlay[] }> {
  const live = liveOutcomes(rows);
  const legById = new Map(routes.filter((r) => r.level === "leg" || r.level === "action").map((r) => [r.id, r]));
  const routeOverlays: RouteOverlay[] = [];
  for (const r of routes) routeOverlays.push(await overlayRoute(r, live, identityOf));
  const testOverlays: TestOverlay[] = [];
  for (const t of tests) testOverlays.push(await overlayTest(t, legById, live, identityOf));
  return { routes: routeOverlays.filter((o) => o.changed), tests: testOverlays.filter((o) => o.changed) };
}

/** The full projection: every route and test as the durable record says it should read (readers consume this). */
export async function projectCompany<R extends RouteEl, T extends TestEl>(
  rows: CheckOutcomeRow[],
  routes: R[],
  tests: T[],
  identityOf: IdentityFn,
): Promise<{ routes: R[]; tests: T[] }> {
  const live = liveOutcomes(rows);
  const legById = new Map(routes.filter((r) => r.level === "leg" || r.level === "action").map((r) => [r.id, r as RouteEl]));
  const outRoutes: R[] = [];
  for (const r of routes) {
    const o = await overlayRoute(r, live, identityOf);
    outRoutes.push(o.changed ? { ...r, what_would_have_to_be_true: o.conditions } : r);
  }
  const outTests: T[] = [];
  for (const t of tests) {
    const o = await overlayTest(t, legById, live, identityOf);
    outTests.push(o.changed ? { ...t, outcome: o.outcome } : t);
  }
  return { routes: outRoutes, tests: outTests };
}

/** A plain-JS identity for tests (NOT the authority — production injects contentIdentity). */
export async function fakeIdentity(text: string): Promise<string> {
  const norm = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0;
  for (let i = 0; i < norm.length; i++) h = (h * 31 + norm.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").repeat(8);
}
