// COSMETIC PRE-CHECK ONLY. The authority is the DB: companies.frozen + the enforce_company_freeze
// trigger on every company_id-bearing table (migration 20260810120000) — that is what actually
// refuses writes to a frozen company, for every edge fn, RPC, and direct SQL path. This client set
// exists so the UI can disable controls and show the named reason WITHOUT a round-trip; it does NOT
// enforce anything. If it ever drifts from companies.frozen, the DB still holds the line. Ideally the
// UI reads companies.frozen; this constant is the offline fallback. Remove when CB1 retires.
export const FROZEN_COMPANY_IDS = new Set<string>([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // Cafe Barra (CB1)
  // CB2 (Cafe Barra 2, fd3f7f63…) UNFROZEN — now a normal writable, regenerable fixture.
]);

export const isFrozenCompany = (id?: string | null): boolean => !!id && FROZEN_COMPANY_IDS.has(id);
