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

// All real + latent (artifact_role, provenance) classes, with the expected lane.
const CASES: Array<{ role: string | null; prov: string | null; lane: "external" | "local" }> = [
  { role: "market_read", prov: "public_research", lane: "external" }, // the 4 real public reads
  { role: "market_read", prov: "public_baseline", lane: "external" }, // (public_baseline not in the cascade enum, but admit set member)
  { role: "market_read", prov: null, lane: "local" },                 // CB1's real market_read/NULL
  { role: "market_read", prov: "internal_declared", lane: "local" },  // latent
  { role: "declared_direction", prov: "internal_declared", lane: "local" }, // CB2's real declared direction
  { role: "declared_direction", prov: "public_research", lane: "local" },   // the latent XOR-gap case (now closed)
  { role: "declared_direction", prov: null, lane: "local" },
  { role: null, prov: null, lane: "local" },
];

Deno.test("cascade lanes partition (artifact_role, provenance) — XOR", () => {
  for (const c of CASES) {
    const ext = isCascadeExternallyAdmissible(c.role, c.prov);
    const loc = isCascadeLocalAdmissible(c.role, c.prov);
    assert(ext !== loc, `role=${c.role} prov=${c.prov}: external=${ext} local=${loc} — must differ (XOR)`);
    assert((ext ? "external" : "local") === c.lane, `role=${c.role} prov=${c.prov}: lane=${ext ? "external" : "local"}, expected ${c.lane}`);
  }
});

Deno.test("only market_read + public is external; everything else is local", () => {
  assert(isCascadeExternallyAdmissible("market_read", "public_research"));
  assert(!isCascadeExternallyAdmissible("declared_direction", "public_research")); // not market_read
  assert(!isCascadeExternallyAdmissible("market_read", null));                     // null provenance
  assert(!isCascadeExternallyAdmissible("market_read", "internal_declared"));      // internal provenance
  assert(isCascadeLocalAdmissible("declared_direction", "internal_declared"));     // the 3a subject
});
