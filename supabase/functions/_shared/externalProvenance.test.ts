// XOR partition invariant: for every provenance_type enum value AND NULL, exactly
// one of the two subject lanes admits — never both, never neither. This guards the
// Option-B partition (no subject double-evaluated or silently dropped).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PROVENANCE_TYPE_ENUM,
  EXTERNAL_ADMISSIBLE_PROVENANCE,
  isSubjectLocalAdmissible,
} from "./externalProvenance.ts";

function externalAdmits(p: string | null): boolean {
  return p != null && EXTERNAL_ADMISSIBLE_PROVENANCE.has(p);
}

Deno.test("subject lanes partition the enum + NULL (XOR)", () => {
  const cases: Array<string | null> = [...PROVENANCE_TYPE_ENUM, null];
  for (const p of cases) {
    const ext = externalAdmits(p);
    const loc = isSubjectLocalAdmissible(p);
    assert(ext !== loc, `provenance ${p}: external=${ext} local=${loc} — must differ (XOR)`);
  }
});

Deno.test("local lane = exact enum complement of external-admissible", () => {
  const expectedLocal = new Set([
    "framework_adjudicated", "odi_survey", "manual", "internal_declared", "internal_hypothesis",
  ]);
  for (const p of PROVENANCE_TYPE_ENUM) {
    const inLocal = isSubjectLocalAdmissible(p);
    assert(inLocal === expectedLocal.has(p), `provenance ${p}: local=${inLocal}, expected=${expectedLocal.has(p)}`);
  }
  // public_research is the only external-admissible enum value.
  assert(!isSubjectLocalAdmissible("public_research"), "public_research must NOT be local-admissible");
  // NULL fails closed external → local is its home.
  assert(isSubjectLocalAdmissible(null), "NULL must be local-admissible (fail-closed external)");
});
