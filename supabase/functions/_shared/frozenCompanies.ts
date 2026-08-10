// SINGLE edge authority for the frozen reference-company set (courtesy layer only).
//
// The REAL guard is the DB trigger enforce_company_freeze (migration 20260810120000): companies.frozen
// is the sole source of truth, and a BEFORE INSERT/UPDATE/DELETE trigger on every company_id-bearing
// table refuses writes to a frozen company — no edge fn, RPC, or direct SQL can write around it.
//
// This constant is retained as a courtesy FAST-FAIL (defense-in-depth): guarded synthesizers skip
// work for a frozen company before doing any model calls, and entry points can refuse early with a
// friendly message. It is NOT the enforcement boundary — if it ever drifts from companies.frozen, the
// DB trigger still holds the line. Previously this set was duplicated across routeLegSynthesis /
// legTestSynthesis / stepConditionsSynthesis; those now re-export from here.
export const FROZEN_COMPANY_IDS = new Set<string>([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  // CB2 (Cafe Barra 2, fd3f7f63…) UNFROZEN — a normal writable, regenerable fixture.
]);

export const isFrozenCompany = (id?: string | null): boolean => !!id && FROZEN_COMPANY_IDS.has(id);
