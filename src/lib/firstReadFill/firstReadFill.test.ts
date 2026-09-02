// FIRST-FILL AUTO-CHAIN guards (operator-signed 2026-09-01). The module lives under
// supabase/functions/_shared (edge-mounted, pure); this test lives under src/** so vitest runs it
// against the SAME implementation the edge function imports. Each proof fails if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  missingPublicReadKinds,
  marketReadIsEmpty,
  runFirstReadFill,
  PUBLIC_READ_KINDS,
  type PublicReadKind,
  type GenPerKind,
} from "../../../supabase/functions/_shared/firstReadFill.ts";

const cfg = (over: Partial<Parameters<typeof runFirstReadFill>[0]>): Parameters<typeof runFirstReadFill>[0] => ({
  missingKinds: [],
  marketEmpty: false,
  generatePublicRead: vi.fn(async () => ({ perKind: {} as GenPerKind })),
  recordKindLedger: vi.fn(async () => {}),
  fireMarketDiscovery: vi.fn(async () => {}),
  closeParent: vi.fn(async () => {}),
  ...over,
});

describe("emptiness predicates (the beats' own queries)", () => {
  it("missingPublicReadKinds returns only the kinds with no current row", () => {
    expect(missingPublicReadKinds([])).toEqual(["positioning", "strategy", "promise", "offering"]);
    expect(missingPublicReadKinds(["positioning", "strategy", "promise"])).toEqual(["offering"]);
    expect(missingPublicReadKinds([...PUBLIC_READ_KINDS])).toEqual([]);
  });

  it("(d) market read: internal_inferred-ONLY counts as EMPTY (the Sonos rendering)", () => {
    expect(marketReadIsEmpty([{ market_register: "internal_inferred", job_executor: "Households" }])).toBe(true);
    expect(marketReadIsEmpty([])).toBe(true);
    // a public def with a job executor is NON-empty
    expect(marketReadIsEmpty([{ market_register: "public_inferred", job_executor: "Home audio buyers" }])).toBe(false);
    expect(marketReadIsEmpty([{ market_register: "publicly_declared", job_executor: "Cafe operators" }])).toBe(false);
    // a public def with a BLANK executor does not render → still empty
    expect(marketReadIsEmpty([{ market_register: "public_inferred", job_executor: "  " }])).toBe(true);
  });
});

describe("(a) first-fill-only — a current kind is never generated", () => {
  it("skips the kind that already has a current row (zero generation call for it)", async () => {
    const gen = vi.fn(async (kinds: PublicReadKind[]) => ({
      perKind: Object.fromEntries(kinds.map((k) => [k, "written"])) as GenPerKind,
    }));
    const rec = vi.fn(async () => {});
    // offering already current → missing is the other three
    const missing = missingPublicReadKinds(["offering"]);
    const out = await runFirstReadFill(cfg({ missingKinds: missing, generatePublicRead: gen, recordKindLedger: rec }));
    // generation was called WITHOUT offering
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen.mock.calls[0][0]).not.toContain("offering");
    expect(gen.mock.calls[0][0].sort()).toEqual(["positioning", "promise", "strategy"]);
    // offering was recorded completed_empty (skipped), never generated/failed
    expect(out.skipped).toContain("offering");
    expect(out.generated).not.toContain("offering");
    expect(rec).toHaveBeenCalledWith("offering", "completed_empty");
  });
});

describe("(b) failure isolation — a kind failure never fails the parent", () => {
  it("a rejected kind is recorded failed; the parent still completes", async () => {
    const gen = vi.fn(async () => ({ perKind: { positioning: "written", strategy: "rejected", promise: "written", offering: "written" } as GenPerKind }));
    const closeParent = vi.fn(async () => {});
    const out = await runFirstReadFill(cfg({ missingKinds: [...PUBLIC_READ_KINDS], generatePublicRead: gen, closeParent }));
    expect(out.failed).toEqual(["strategy"]);
    expect(out.generated.sort()).toEqual(["offering", "positioning", "promise"]);
    expect(closeParent).toHaveBeenCalledTimes(1); // parent completed DESPITE the strategy failure
  });

  it("a total generation throw fails every missing kind but still completes the parent", async () => {
    const gen = vi.fn(async () => { throw new Error("boom"); });
    const closeParent = vi.fn(async () => {});
    const out = await runFirstReadFill(cfg({ missingKinds: ["positioning", "offering"], generatePublicRead: gen, closeParent }));
    expect(out.failed.sort()).toEqual(["offering", "positioning"]);
    expect(out.generated).toEqual([]);
    expect(closeParent).toHaveBeenCalledTimes(1);
  });
});

describe("(c) no-op — all current + non-empty market ⇒ completed_empty, zero generation", () => {
  it("generates nothing and fires no market discovery", async () => {
    const gen = vi.fn(async () => ({ perKind: {} as GenPerKind }));
    const fire = vi.fn(async () => {});
    const rec = vi.fn(async () => {});
    const out = await runFirstReadFill(cfg({ missingKinds: [], marketEmpty: false, generatePublicRead: gen, fireMarketDiscovery: fire, recordKindLedger: rec }));
    expect(gen).not.toHaveBeenCalled();
    expect(fire).not.toHaveBeenCalled();
    expect(out.stageEmpty).toBe(true);
    expect(out.generated).toEqual([]);
    // every kind recorded completed_empty (nothing missing)
    for (const k of PUBLIC_READ_KINDS) expect(rec).toHaveBeenCalledWith(k, "completed_empty");
  });
});

describe("market discovery firing", () => {
  it("fires only when the market read is empty; a fire error is isolated (parent still completes)", async () => {
    const fireOk = vi.fn(async () => {});
    const closeParent = vi.fn(async () => {});
    const a = await runFirstReadFill(cfg({ marketEmpty: true, fireMarketDiscovery: fireOk, closeParent }));
    expect(fireOk).toHaveBeenCalledTimes(1);
    expect(a.marketFired).toBe(true);
    const fireThrow = vi.fn(async () => { throw new Error("discovery boot failed"); });
    const closeParent2 = vi.fn(async () => {});
    const b = await runFirstReadFill(cfg({ marketEmpty: true, fireMarketDiscovery: fireThrow, closeParent: closeParent2 }));
    expect(b.marketFired).toBe(false);
    expect(closeParent2).toHaveBeenCalledTimes(1); // isolated — parent completed anyway
  });
});
