// Gate 2b — provenance-keyed journey protection (operator-approved Option A,
// absolute, 2026-06-12). Replaces ALL name-based protection (the two divergent
// isInternalJourneyKey predicates are gone): a journey_key is PROTECTED when any
// of its rows carries provenance_type internal_derived or operator_authored.
// Protected keys never enter generation targeting and never enter any delete
// list, at any pipeline write path, regardless of journey name or operator pin.
// Rationale on record: same-class re-apply would silently destroy operator
// curation — deliberate delete-then-rederive is the consent flow.
//
// Row-level backstop for every job_steps delete: the filter string below keeps
// protected rows out of a delete even if a caller's key-level exclusion regresses.
// It must be applied with .or(...) — a bare .not("provenance_type","in",...)
// would also spare NULL-legacy rows (SQL NOT IN returns NULL for NULL), silently
// breaking legacy regeneration.

export const PROTECTED_PROVENANCE_TYPES = ["internal_derived", "operator_authored"] as const;

// PostgREST .or() filter: row is deletable when provenance is NULL (legacy,
// unproven — Gate 1 law) or a non-protected stamped value.
export const DELETABLE_PROVENANCE_OR_FILTER =
  'provenance_type.is.null,provenance_type.not.in.("internal_derived","operator_authored")';

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function protectedJourneyKeys(
  rows: Array<{ journey_key?: unknown; provenance_type?: string | null }> | null | undefined,
): Set<string> {
  const protectedKeys = new Set<string>();
  for (const row of rows ?? []) {
    const provenance = String(row?.provenance_type ?? "");
    if ((PROTECTED_PROVENANCE_TYPES as readonly string[]).includes(provenance)) {
      const key = normalizeKey(row?.journey_key);
      if (key) protectedKeys.add(key);
    }
  }
  return protectedKeys;
}

export function isProtectedJourneyKey(key: unknown, protectedKeys: Set<string>): boolean {
  return protectedKeys.has(normalizeKey(key));
}
