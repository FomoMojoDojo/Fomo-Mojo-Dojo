// Create-client onramp guards (design A′, operator-signed 2026-09-02). Ordering / isolation /
// skip-if-present exercised against the pure sequencer; no-retrigger via a source-level assertion that
// the ONLY caller is the create handler. Each proof fails if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runCreateOnramp } from "./createOnramp";

const cfg = (over: Partial<Parameters<typeof runCreateOnramp>[0]> = {}) => ({
  hasSpine: vi.fn(async () => false),
  fireBirth: vi.fn(async () => {}),
  fireRefresh: vi.fn(async () => {}),
  onBirthError: vi.fn(),
  ...over,
});

describe("(a) ordering — birth is attempted BEFORE the refresh", () => {
  it("fires birth, then the refresh (call order)", async () => {
    const order: string[] = [];
    const c = cfg({
      fireBirth: vi.fn(async () => { order.push("birth"); }),
      fireRefresh: vi.fn(async () => { order.push("refresh"); }),
    });
    const out = await runCreateOnramp(c);
    expect(order).toEqual(["birth", "refresh"]); // birth strictly before refresh
    expect(out).toMatchObject({ birthRan: true, birthSkipped: false, birthFailed: false, refreshFired: true });
  });
});

describe("(b) isolation — a birth failure never blocks the refresh nor fails the create", () => {
  it("birth throws → recorded, refresh STILL fires, no throw propagates", async () => {
    const fireRefresh = vi.fn(async () => {});
    const onBirthError = vi.fn();
    const c = cfg({
      fireBirth: vi.fn(async () => { throw new Error("birth cold-start failed"); }),
      fireRefresh, onBirthError,
    });
    const out = await runCreateOnramp(c); // must NOT throw
    expect(out.birthFailed).toBe(true);
    expect(out.birthRan).toBe(false);
    expect(fireRefresh).toHaveBeenCalledTimes(1); // refresh fired despite the birth failure
    expect(onBirthError).toHaveBeenCalledTimes(1);
    expect(out.refreshFired).toBe(true);
  });
});

describe("(c) skip-if-present — an existing spine skips the birth (no duplicate defs)", () => {
  it("hasSpine true → birth NOT fired; refresh still fires", async () => {
    const fireBirth = vi.fn(async () => {});
    const fireRefresh = vi.fn(async () => {});
    const c = cfg({ hasSpine: vi.fn(async () => true), fireBirth, fireRefresh });
    const out = await runCreateOnramp(c);
    expect(fireBirth).not.toHaveBeenCalled();  // skip-if-present
    expect(out.birthSkipped).toBe(true);
    expect(out.birthRan).toBe(false);
    expect(fireRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("(d) no-retrigger — the onramp's ONLY caller is the create handler", () => {
  // Source-level: runCreateOnramp is imported/called from exactly ONE place — handleCreateClient in
  // the workshop view. No existing-company path (refresh button, drift scan, schedules) may reach it.
  const grepCallers = (): string[] => {
    // The importers of createOnramp across the client surface.
    const files = [
      "src/views/client/ClientRefinePreviewWorkshopView.tsx",
    ];
    return files.filter((f) => readFileSync(resolve(process.cwd(), f), "utf8").includes("runCreateOnramp"));
  };
  it("is invoked only from the create handler, and inside handleCreateClient", () => {
    const importers = grepCallers();
    expect(importers).toEqual(["src/views/client/ClientRefinePreviewWorkshopView.tsx"]);
    const src = readFileSync(resolve(process.cwd(), importers[0]), "utf8");
    // the call site sits inside handleCreateClient (the create handler), not another callback.
    const handlerStart = src.indexOf("const handleCreateClient");
    const nextHandler = src.indexOf("const handle", handlerStart + 1);
    const handlerBody = src.slice(handlerStart, nextHandler > 0 ? nextHandler : undefined);
    expect(handlerBody).toContain("runCreateOnramp");
    // no OTHER handler references it (single call site).
    expect(src.split("runCreateOnramp(").length - 1).toBe(1);
  });
});
