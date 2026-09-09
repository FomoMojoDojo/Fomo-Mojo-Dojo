// GATE B (2026-09-09) — the gateway RESUME, with its vacuous proof on both sides.
//
// THE DEFECT: the own-words plan runs behind Kong's 150s wall. On Riverlane the caller was cut at
// 17:25:55.922 and recorded the stage FAILED; the worker finished and wrote its 'planned' integrity
// row at 17:26:24.777, 28.9s later. Because the caller had given up, mode:"write" never fired and
// zero own_words claims were created from seven frozen, judge-kept candidates.
//
// THE RULE: a gateway cut is UNKNOWN, never FAILED. Poll the component's integrity row within a
// bounded window; on a terminal status run the follow-up EXACTLY ONCE.
//
// VACUOUS PROOF (both sides — this is what makes the resume test non-vacuous):
//   - the row NEVER appears  → the resume must FAIL (the bounded poll exhausts) and must NOT write.
//   - the row appears at poll 3 → the resume must SUCCEED and must issue the write EXACTLY ONCE.
// If the poll were unbounded, side one would hang instead of failing. If the follow-up were inside
// the loop, side two would write more than once. Both are asserted.
import { describe, expect, it } from "vitest";
import {
  GATEWAY_CUT_STATUSES,
  isGatewayCut,
  resumeAfterGatewayCut,
} from "../../../supabase/functions/_shared/gatewayResume.ts";

/** A fake clock: no timers, no waiting. `sleep` advances it, so the budget is exercised for real. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => { t += ms; return Promise.resolve(); },
    elapsed: () => t,
  };
}

describe("gateway cut classification", () => {
  it("504 / 502 / 408 are cuts; a real failure is not", () => {
    for (const s of GATEWAY_CUT_STATUSES) expect(isGatewayCut(s)).toBe(true);
    for (const s of [500, 400, 403, 409, 422, 200]) expect(isGatewayCut(s)).toBe(false);
  });
});

describe("VACUOUS PROOF side 1 — the planned row NEVER appears", () => {
  it("the bounded poll exhausts, the resume FAILS, and the write is never issued", async () => {
    const clock = fakeClock();
    let reads = 0;
    let writes = 0;
    const r = await resumeAfterGatewayCut({
      readStatus: () => { reads++; return Promise.resolve(null); }, // no row, ever
      terminalStatuses: ["planned", "completed"],
      followUp: () => { writes++; return Promise.resolve({ status: "completed" as const }); },
      budgetMs: 10 * 60_000,
      intervalMs: 15_000,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(r.outcome).toBe("exhausted");   // ← the resume FAILS, as required
    expect(r.result).toBeNull();
    expect(r.observedStatus).toBeNull();
    expect(writes).toBe(0);                // ← and nothing was written
    // It is BOUNDED: it stopped, and it stopped inside the 10-minute window.
    // 41 = one IMMEDIATE read at t=0 (the worker has often already finished when the gateway cuts)
    // plus 600000/15000 = 40 interval reads, the last at t=600000 where the window closes.
    expect(reads).toBe(41);
    expect(clock.elapsed()).toBe(10 * 60_000);
  });

  it("a non-terminal status is not mistaken for a terminal one", async () => {
    const clock = fakeClock();
    let writes = 0;
    const r = await resumeAfterGatewayCut({
      readStatus: () => Promise.resolve("running"),
      terminalStatuses: ["planned", "completed"],
      followUp: () => { writes++; return Promise.resolve("wrote"); },
      budgetMs: 60_000, intervalMs: 15_000, now: clock.now, sleep: clock.sleep,
    });
    expect(r.outcome).toBe("exhausted");
    expect(writes).toBe(0);
  });
});

describe("VACUOUS PROOF side 2 — the planned row appears at poll 3", () => {
  it("the resume SUCCEEDS and issues the write EXACTLY ONCE", async () => {
    const clock = fakeClock();
    let reads = 0;
    const writeCalls: string[] = [];
    const r = await resumeAfterGatewayCut({
      readStatus: () => { reads++; return Promise.resolve(reads < 3 ? null : "planned"); },
      terminalStatuses: ["planned", "completed"],
      followUp: (observed) => { writeCalls.push(observed); return Promise.resolve({ status: "completed" as const, note: "resumed after gateway cut · plan 0 · wrote 7" }); },
      budgetMs: 10 * 60_000, intervalMs: 15_000, now: clock.now, sleep: clock.sleep,
    });

    expect(r.outcome).toBe("resumed");
    expect(r.polls).toBe(3);                       // ← found on the third read
    expect(r.observedStatus).toBe("planned");
    expect(writeCalls).toHaveLength(1);            // ← EXACTLY ONCE
    expect(writeCalls[0]).toBe("planned");
    expect(r.result).toEqual({ status: "completed", note: "resumed after gateway cut · plan 0 · wrote 7" });
    expect(reads).toBe(3);                         // it stopped reading the moment it resumed
  });

  it("a row already present when the gateway cuts costs zero waiting (poll 1, no sleep)", async () => {
    const clock = fakeClock();
    let writes = 0;
    const r = await resumeAfterGatewayCut({
      readStatus: () => Promise.resolve("planned"),
      terminalStatuses: ["planned", "completed"],
      followUp: () => { writes++; return Promise.resolve("wrote"); },
      now: clock.now, sleep: clock.sleep,
    });
    expect(r.outcome).toBe("resumed");
    expect(r.polls).toBe(1);
    expect(writes).toBe(1);
    expect(clock.elapsed()).toBe(0); // the worker had already finished — no wait at all
  });

  it("the two sides differ ONLY in whether the row ever appears", async () => {
    const mk = (appears: boolean) => {
      const clock = fakeClock();
      let reads = 0;
      let writes = 0;
      return resumeAfterGatewayCut({
        readStatus: () => { reads++; return Promise.resolve(appears && reads >= 3 ? "planned" : null); },
        terminalStatuses: ["planned", "completed"],
        followUp: () => { writes++; return Promise.resolve("wrote"); },
        budgetMs: 10 * 60_000, intervalMs: 15_000, now: clock.now, sleep: clock.sleep,
      }).then((r) => ({ ...r, writes }));
    };
    const never = await mk(false);
    const appears = await mk(true);
    expect(never.outcome).toBe("exhausted");
    expect(never.writes).toBe(0);
    expect(appears.outcome).toBe("resumed");
    expect(appears.writes).toBe(1);
  });
});
