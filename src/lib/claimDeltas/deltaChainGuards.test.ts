// STEPPER GUARDS (operator rulings 2026-09-04): (3) livelock guard — a self-chain whose `done` has not advanced
// for 3 consecutive passes fails the ledger row and STOPS (no 4th invocation); (4) the finalize-retry re-entry
// carries the pairing kind; (5) abandon path — a running row of the same kind+company with no finish inside the
// 25-minute attach window is stamped failed before a new row opens. Pure helpers, RED before they exist.
import { describe, expect, it, vi } from "vitest";
import { nextChainState, LIVELOCK_LEDGER_TEXT, ABANDON_LEDGER_TEXT, finalizeRetryBody, abandonedRunIds, CHAIN_WINDOW_MS, LIVELOCK_PASSES } from "../../../supabase/functions/_shared/deltaChainGate.ts";

describe("(3) livelock guard — nextChainState", () => {
  it("done advancing → passes reset, never tripped", () => {
    let s = nextChainState(null, 1); expect(s.tripped).toBe(false); expect(s.state.no_advance_passes).toBe(1);
    s = nextChainState(s.state, 2); expect(s.tripped).toBe(false); expect(s.state.no_advance_passes).toBe(1);
  });
  it("done frozen: pass 1 and 2 continue, pass 3 trips with the signed reason", () => {
    let s = nextChainState(null, 2); expect(s.tripped).toBe(false); expect(s.state.no_advance_passes).toBe(1);
    s = nextChainState(s.state, 2); expect(s.tripped).toBe(false); expect(s.state.no_advance_passes).toBe(2);
    s = nextChainState(s.state, 2); expect(s.tripped).toBe(true); expect(s.state.no_advance_passes).toBe(LIVELOCK_PASSES);
    expect(LIVELOCK_LEDGER_TEXT).toBe("livelock: plan yields work write refuses");
  });
  it("a simulated stepper with a stub that never advances: fails on pass 3, no fourth invocation", async () => {
    const invoke = vi.fn(); let state: ReturnType<typeof nextChainState>["state"] | null = null; let ledger: string | null = null;
    const step = async (): Promise<"chain" | "fail"> => {
      invoke();
      const done = 2; // the stub never advances
      const n = nextChainState(state, done); state = n.state;
      if (n.tripped) { ledger = LIVELOCK_LEDGER_TEXT; return "fail"; }
      return "chain";
    };
    let action: "chain" | "fail" = "chain"; let passes = 0;
    while (action === "chain" && passes < 10) { action = await step(); passes++; }
    expect(passes).toBe(3); expect(invoke).toHaveBeenCalledTimes(3); expect(ledger).toBe(LIVELOCK_LEDGER_TEXT);
  });
});

describe("(4) finalize-retry body carries the pairing kind", () => {
  it("public kind preserved; parent id preserved", () => {
    expect(finalizeRetryBody("co", "parent", "public_vs_public")).toEqual({ company_id: "co", parent_run_id: "parent", pairing_kind: "public_vs_public" });
    expect(finalizeRetryBody("co", null, "internal_vs_public")).toEqual({ company_id: "co", parent_run_id: null, pairing_kind: "internal_vs_public" });
  });
});

describe("(5) abandon path", () => {
  const now = Date.parse("2026-09-04T21:00:00Z");
  const rows = [
    { id: "old", status: "running", finished_at: null, updated_at: new Date(now - CHAIN_WINDOW_MS - 60_000).toISOString() },
    { id: "fresh", status: "running", finished_at: null, updated_at: new Date(now - 60_000).toISOString() },
    { id: "done", status: "completed", finished_at: "2026-09-04T20:00:00Z", updated_at: "2026-09-04T20:00:00Z" },
  ];
  it("only a running, unfinished row older than the attach window is abandoned", () => {
    expect(abandonedRunIds(rows, now)).toEqual(["old"]);
    expect(ABANDON_LEDGER_TEXT).toBe("abandoned: no finish within attach window");
  });
});
