// ACT-C-2 — the tiering pure-function + content-keyed pair identity.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stepSourcePairIdentity, TIER_STRONG_MIN, tierForCount } from "./normativeConsistency.ts";

Deno.test("tierForCount: ≥2 strongly / ==1 lightly / 0 inferred-from-standard", () => {
  assertEquals(tierForCount(0), "inferred_from_standard");
  assertEquals(tierForCount(1), "lightly_attested");
  assertEquals(tierForCount(2), "strongly_repeated");
  assertEquals(tierForCount(9), "strongly_repeated");
  assertEquals(TIER_STRONG_MIN, 2); // operator-signed default
});

Deno.test("pair identity is content-keyed, asymmetric, and deterministic", async () => {
  const a = await stepSourcePairIdentity("stepSHA", "srcSHA");
  const b = await stepSourcePairIdentity("stepSHA", "srcSHA");
  assertEquals(a, b); // deterministic → cross-run freeze
  const swapped = await stepSourcePairIdentity("srcSHA", "stepSHA");
  assert(a !== swapped); // asymmetric: step and source roles are distinct (no order-normalize)
  assertEquals(a.length, 64);
});
