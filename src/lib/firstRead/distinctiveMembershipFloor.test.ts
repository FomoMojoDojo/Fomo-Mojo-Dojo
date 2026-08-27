// Gate 5a — DISTINCTIVE two-word membership floor (2026-08-26). Each test is
// load-bearing: it MUST fail if the distinctive-token change is reverted to the
// plain shared-token floor. The functions under test live under
// supabase/functions/_shared (edge-mounted); this test lives under src/** so the
// vitest suite (include: src/**) actually runs it.
import { describe, expect, it } from "vitest";
import {
  distinctiveSharedTokenCount,
  distinctiveSharedTokens,
  GENERIC_TOKEN_DF_THRESHOLD,
  genericTokens,
  sharedTokenCount,
} from "../../../supabase/functions/_shared/tokens.ts";
// NOTE: deriveGatedFindingRow is deliberately NOT imported here — signalRecurrence.ts
// pulls the edge-only modelRouter (bare `Deno`) into the browser tsconfig. Its floor
// is proven end-to-end by the live Gate-5a recompute on real evidence (report), which
// is a stronger integration check than a synthetic member fixture. The distinctive
// mechanism the floor gates on is fully covered below at the token layer.

// A CB2-shaped corpus: "cafe"/"barra"/"coffee" are near-universal (brand/category),
// "kinship"/"program"/"mentorship" appear in a minority (genuinely distinctive).
const CORPUS = [
  "cafe barra coffee roaster in burbank",
  "cafe barra coffee french rooster",
  "cafe barra coffee pour-over flight",
  "cafe barra coffee wholesale account",
  "cafe barra coffee kinship program",
  "cafe barra coffee mentorship program",
  "cafe barra espresso and pastries",
  "cafe barra coffee delivery to go",
  "cafe barra coffee ratings and reviews",
  "cafe barra coffee loyalty and community",
];

describe("genericTokens — DF-generic set over the eligible corpus", () => {
  it("flags near-universal brand/category tokens as GENERIC and spares minority tokens", () => {
    const g = genericTokens(CORPUS);
    // cafe (10/10), barra (10/10), coffee (9/10) are >= 0.4 → generic.
    expect(g.has("cafe")).toBe(true);
    expect(g.has("barra")).toBe(true);
    expect(g.has("coffee")).toBe(true);
    // kinship (1/10), mentorship (1/10), program (2/10) are < 0.4 → distinctive.
    expect(g.has("kinship")).toBe(false);
    expect(g.has("mentorship")).toBe(false);
    expect(g.has("program")).toBe(false);
  });

  it("is deterministic across corpus order (DF counts are order-independent)", () => {
    const a = [...genericTokens(CORPUS)].sort();
    const b = [...genericTokens([...CORPUS].reverse())].sort();
    expect(a).toEqual(b);
  });

  it("θ-boundary is inclusive (>= threshold) and fixed at 0.40", () => {
    expect(GENERIC_TOKEN_DF_THRESHOLD).toBe(0.4);
    // token present in exactly 2 of 5 docs = 0.40 → GENERIC (>=).
    const corpus = ["alpha zzz", "alpha yyy", "www", "xxx", "vvv"];
    expect(genericTokens(corpus).has("alpha")).toBe(true); // 2/5 == 0.40
    // present in 1 of 5 = 0.20 → distinctive.
    expect(genericTokens(corpus).has("zzz")).toBe(false);
  });

  it("empty corpus → empty generic set (floor falls back to plain shared-token rule)", () => {
    expect(genericTokens([]).size).toBe(0);
  });
});

describe("distinctiveSharedTokenCount — generic-excluded intersection", () => {
  const generic = genericTokens(CORPUS);

  it("a generic-only pair counts ZERO distinctive tokens (fails the floor) though it shares >=2 raw", () => {
    const body = "cafe barra coffee kinship program";
    const member = "cafe barra coffee roaster"; // shares cafe+barra+coffee — ALL generic
    expect(sharedTokenCount(body, member)).toBeGreaterThanOrEqual(2); // plain floor WOULD keep it
    expect(distinctiveSharedTokenCount(body, member, generic)).toBe(0); // distinctive floor drops it
  });

  it("a distinctive pair counts its non-generic overlap (passes the floor)", () => {
    const body = "cafe barra coffee kinship program";
    const member = "kinship program mentorship offering"; // shares kinship+program — distinctive
    expect(distinctiveSharedTokenCount(body, member, generic)).toBe(2);
    expect(distinctiveSharedTokens(body, member, generic).sort()).toEqual(["kinship", "program"]);
  });

  it("with an empty generic set it equals the plain shared-token count", () => {
    const body = "cafe barra coffee roaster";
    const member = "cafe barra coffee shop";
    expect(distinctiveSharedTokenCount(body, member, new Set())).toBe(sharedTokenCount(body, member));
  });
});

// The membership floor (deriveGatedFindingRow) counts DISTINCTIVE tokens against the
// finding body. Here we prove the exact per-member decisions the floor makes, at the
// token layer, for CB2-shaped members — a generic-only member is dropped, a
// distinctive member is kept — including the "empty generic set would keep it" case
// that shows the generic set is what does the work (can-fail on a revert).
describe("membership-floor decisions — distinctive floor removes vacuous brand-token membership", () => {
  const generic = genericTokens(CORPUS);
  const FLOOR = 2;
  const BODY = "Cafe Barra runs a kinship program with community mentorship";
  const genericOnlyMembers = ["cafe barra coffee roaster review", "cafe barra coffee french rooster"];
  const distinctiveMembers = ["their kinship program and mentorship are praised", "the kinship mentorship program built community"];

  it("DROPS members bridged ONLY by generic brand tokens (< 2 distinctive → out of the cluster)", () => {
    for (const m of genericOnlyMembers) {
      expect(sharedTokenCount(BODY, m)).toBeGreaterThanOrEqual(FLOOR); // plain floor WOULD keep it
      expect(distinctiveSharedTokenCount(BODY, m, generic)).toBeLessThan(FLOOR); // distinctive floor drops it
    }
  });

  it("KEEPS members sharing >= 2 DISTINCTIVE tokens with the finding body", () => {
    for (const m of distinctiveMembers) {
      expect(distinctiveSharedTokenCount(BODY, m, generic)).toBeGreaterThanOrEqual(FLOOR);
    }
  });

  it("with an EMPTY generic set the generic-only members are (wrongly) kept — the generic set is what does the work", () => {
    for (const m of genericOnlyMembers) {
      expect(distinctiveSharedTokenCount(BODY, m, new Set())).toBeGreaterThanOrEqual(FLOOR);
    }
  });
});
