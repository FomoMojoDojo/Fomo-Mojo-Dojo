// XOR partition invariant: for every provenance_type enum value AND NULL, exactly
// one of the two subject lanes admits — never both, never neither. This guards the
// Option-B partition (no subject double-evaluated or silently dropped).
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PROVENANCE_TYPE_ENUM,
  EXTERNAL_ADMISSIBLE_PROVENANCE,
  isSubjectLocalAdmissible,
  isSubjectExternallyAdmissible,
  isExternalAdmissibleNeed,
  isOperatorEdited,
} from "./externalProvenance.ts";

function externalAdmits(p: string | null): boolean {
  return p != null && EXTERNAL_ADMISSIBLE_PROVENANCE.has(p);
}

// Q3 (2026-11-06): operator authorship is the second dimension of the subject partition.
const EDITED = "2026-11-06T00:00:00.000Z";

Deno.test("subject lanes partition the enum + NULL (XOR)", () => {
  const cases: Array<string | null> = [...PROVENANCE_TYPE_ENUM, null];
  for (const p of cases) {
    const ext = externalAdmits(p);
    const loc = isSubjectLocalAdmissible(p, null);
    assert(ext !== loc, `provenance ${p}: external=${ext} local=${loc} — must differ (XOR)`);
    // Q3: with the flag set, the SAME provenance must be local, and the XOR must still hold.
    const extEdited = isSubjectExternallyAdmissible(p, EDITED);
    const locEdited = isSubjectLocalAdmissible(p, EDITED);
    assert(!extEdited, `provenance ${p} + operator_edited_at: external must be false`);
    assert(extEdited !== locEdited, `provenance ${p} + operator_edited_at: XOR must still hold`);
  }
});

Deno.test("local lane = exact enum complement of external-admissible", () => {
  const expectedLocal = new Set([
    "framework_adjudicated", "odi_survey", "manual", "internal_declared", "internal_hypothesis",
  ]);
  for (const p of PROVENANCE_TYPE_ENUM) {
    const inLocal = isSubjectLocalAdmissible(p, null);
    assert(inLocal === expectedLocal.has(p), `provenance ${p}: local=${inLocal}, expected=${expectedLocal.has(p)}`);
  }
  // public_research is the only external-admissible enum value.
  assert(!isSubjectLocalAdmissible("public_research", null), "public_research must NOT be local-admissible");
  // NULL fails closed external → local is its home.
  assert(isSubjectLocalAdmissible(null, null), "NULL must be local-admissible (fail-closed external)");
});

// ── Q3 (2026-11-06): the operator-authorship dimension ──────────────────────────────────────────
Deno.test("Q3: isOperatorEdited treats only a real timestamp as a stamp", () => {
  assert(isOperatorEdited(EDITED), "a timestamp is a stamp");
  assert(!isOperatorEdited(null), "NULL is not a stamp");
  assert(!isOperatorEdited(undefined), "undefined is not a stamp");
  assert(!isOperatorEdited(""), "empty string is not a stamp");
  assert(!isOperatorEdited("   "), "blank string is not a stamp");
});

Deno.test("Q3: an operator-edited subject is never external; its unedited twin still is", () => {
  assert(!isSubjectExternallyAdmissible("public_research", EDITED),
    "an operator-edited public_research subject MUST be refused (Edgewood routes c3c9b9c2 / cf5a043d)");
  assert(isSubjectLocalAdmissible("public_research", EDITED),
    "and it must land on the LOCAL lane — refused by both lanes would mean judged nowhere");
  // Not vacuous: the unedited twin still goes external.
  assert(isSubjectExternallyAdmissible("public_research", null),
    "an UNEDITED public_research subject must still go external");
});

Deno.test("Q3: isExternalAdmissibleNeed reads the flag off the row", () => {
  assert(isExternalAdmissibleNeed({ provenance_type: "public_research" }),
    "a public need with no stamp is admissible (the control — otherwise this guard refuses everything)");
  assert(!isExternalAdmissibleNeed({ provenance_type: "public_research", operator_edited_at: EDITED }),
    "a public need the operator edited is NOT admissible");
  assert(!isExternalAdmissibleNeed({ provenance_type: "internal_declared" }), "internal stays inadmissible");
  assert(!isExternalAdmissibleNeed(null), "a missing row is inadmissible (fail closed)");
});
