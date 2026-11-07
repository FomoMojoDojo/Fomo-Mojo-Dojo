// Cascade XOR partition invariant: every (artifact_role, provenance) a cascade can
// carry is admitted by EXACTLY one lane — externalAdmit XOR cascadeLocalAdmit — never
// neither, never both. The two predicates share ONE authority (cascadeLocalAdmissible
// is the literal negation of cascadeExternallyAdmissible), so this holds by
// construction; the test guards against future drift.
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isCascadeExternallyAdmissible,
  isCascadeLocalAdmissible,
} from "./externalProvenance.ts";

// Q3 (2026-11-06): the partition is now over THREE dimensions — operator authorship joins role and
// provenance. `edited` null means "never operator-edited"; a timestamp means the row carries operator
// prose and must be LOCAL whatever its role and provenance say.
const EDITED = "2026-11-06T00:00:00.000Z";

// All real + latent (artifact_role, provenance, operator_edited_at) classes, with the expected lane.
const CASES: Array<{ role: string | null; prov: string | null; edited?: string | null; lane: "external" | "local" }> = [
  { role: "market_read", prov: "public_research", lane: "external" }, // the 4 real public reads
  { role: "market_read", prov: "public_baseline", lane: "external" }, // (public_baseline not in the cascade enum, but admit set member)
  { role: "market_read", prov: null, lane: "local" },                 // CB1's real market_read/NULL
  { role: "market_read", prov: "internal_declared", lane: "local" },  // latent
  { role: "declared_direction", prov: "internal_declared", lane: "local" }, // CB2's real declared direction
  { role: "declared_direction", prov: "public_research", lane: "local" },   // the latent XOR-gap case (now closed)
  { role: "declared_direction", prov: null, lane: "local" },
  { role: null, prov: null, lane: "local" },
  // ── Q3: the operator-authorship dimension ─────────────────────────────────────────────────────
  // The two REAL rows this ruling exists for: Edgewood 00f9d893 and FomoMojoDojo b9f2318b are both
  // market_read + public_research + manual_inline. Before Q3 both were admitted to OpenAI.
  { role: "market_read", prov: "public_research", edited: EDITED, lane: "local" },
  { role: "market_read", prov: "public_baseline", edited: EDITED, lane: "local" },
  // An edited row that was already local stays local — the flag can only ever move a row toward local.
  { role: "declared_direction", prov: "internal_declared", edited: EDITED, lane: "local" },
  { role: "market_read", prov: null, edited: EDITED, lane: "local" },
  // A blank string is not a stamp (isOperatorEdited trims) — it must NOT refuse a public read.
  { role: "market_read", prov: "public_research", edited: "   ", lane: "external" },
];

Deno.test("cascade lanes partition (artifact_role, provenance) — XOR", () => {
  for (const c of CASES) {
    const ext = isCascadeExternallyAdmissible(c.role, c.prov, c.edited ?? null);
    const loc = isCascadeLocalAdmissible(c.role, c.prov, c.edited ?? null);
    assert(ext !== loc, `role=${c.role} prov=${c.prov} edited=${c.edited ?? null}: external=${ext} local=${loc} — must differ (XOR)`);
    assert((ext ? "external" : "local") === c.lane, `role=${c.role} prov=${c.prov} edited=${c.edited ?? null}: lane=${ext ? "external" : "local"}, expected ${c.lane}`);
  }
});

Deno.test("only market_read + public is external; everything else is local", () => {
  assert(isCascadeExternallyAdmissible("market_read", "public_research", null));
  assert(!isCascadeExternallyAdmissible("declared_direction", "public_research", null)); // not market_read
  assert(!isCascadeExternallyAdmissible("market_read", null, null));                     // null provenance
  assert(!isCascadeExternallyAdmissible("market_read", "internal_declared", null));      // internal provenance
  assert(isCascadeLocalAdmissible("declared_direction", "internal_declared", null));     // the 3a subject
});

// Q3 (2026-11-06): operator authorship OVERRIDES a public label. This is the test that fails if the
// flag is ever dropped from the predicate — the exact regression that let the 5 live rows through.
Deno.test("Q3: an operator-edited cascade is never external, whatever its role and provenance", () => {
  const EDITED_AT = "2026-11-06T00:00:00.000Z";
  assert(!isCascadeExternallyAdmissible("market_read", "public_research", EDITED_AT),
    "an operator-edited market_read/public_research cascade MUST be refused (Edgewood 00f9d893, FomoMojoDojo b9f2318b)");
  assert(isCascadeLocalAdmissible("market_read", "public_research", EDITED_AT),
    "and it must land on the LOCAL lane — refused by both lanes would mean judged nowhere");
  // The unedited twin still goes external, so the guard is not vacuous.
  assert(isCascadeExternallyAdmissible("market_read", "public_research", null),
    "an UNEDITED public market_read must still go external — otherwise this guard refuses everything");
});
