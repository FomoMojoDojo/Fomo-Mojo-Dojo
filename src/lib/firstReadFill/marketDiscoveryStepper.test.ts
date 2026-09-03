// Market-discovery self-chaining stepper guards (operator ruling 2026-09-01): DB-persisted manifest
// makes a mid-chunk death RESUMABLE (resume from the persisted cursor, not from 0); terminal discipline
// (max-steps + no-progress) makes an infinite self-fire loop structurally impossible. Each proof fails
// if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  runMarketDiscoveryStep,
  type MDChainState,
  type MDStepConfig,
} from "../../../supabase/functions/_shared/marketDiscoveryStepper.ts";

const CANDS = ["c0", "c1", "c2", "c3", "c4", "c5"]; // a 6-candidate manifest

const cfg = (state: MDChainState, over: Partial<MDStepConfig> = {}): MDStepConfig => ({
  state,
  plan: vi.fn(async () => ({ candidates: CANDS })),
  judgeChunk: vi.fn(async () => ({ ok: true })),
  confirmChunk: vi.fn(async () => ({ accounted: 0 })),
  finalize: vi.fn(async () => {}),
  persistPlanned: vi.fn(async () => {}),
  persistProgress: vi.fn(async () => {}),
  closeCompleted: vi.fn(async () => {}),
  closeFailed: vi.fn(async () => {}),
  markUnconfirmed: vi.fn(async () => {}),
  selfFire: vi.fn(async () => {}),
  ...over,
});

const base = (over: Partial<MDChainState> = {}): MDChainState => ({
  planned: true, candidates: CANDS, cursor: 0, chunkSize: 2, stepCount: 0, maxSteps: 10, ...over,
});

describe("plan phase", () => {
  it("plans once, persists the manifest, self-fires into judging", async () => {
    const c = cfg(base({ planned: false, candidates: [], cursor: 0 }));
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("planned");
    expect(c.persistPlanned).toHaveBeenCalledWith(CANDS);
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("already_discovered ⇒ completed_empty, no persist, no self-fire", async () => {
    const c = cfg(base({ planned: false, candidates: [] }), { plan: vi.fn(async () => ({ candidates: [], alreadyDiscovered: true })) });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("already_discovered");
    expect(c.closeCompleted).toHaveBeenCalledWith(true);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
  it("planned with zero candidates ⇒ completed_empty, no self-fire", async () => {
    const c = cfg(base({ planned: false, candidates: [] }), { plan: vi.fn(async () => ({ candidates: [] })) });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("planned_empty");
    expect(c.closeCompleted).toHaveBeenCalledWith(true);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("RESUME-AFTER-DEATH — resume from the DB cursor, not from 0", () => {
  it("a fresh fire at persisted cursor=2 judges candidates[2:4], never [0:2]", async () => {
    // Simulates: two chunks completed (cursor=2, stepCount=1), then the isolate died mid-run.
    // The next fire reads cursor=2 from the DB and MUST resume there.
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: true }));
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { judgeChunk: judge });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("chunk_done");
    expect(judge).toHaveBeenCalledTimes(1);
    expect(judge.mock.calls[0][0]).toEqual(["c2", "c3"]); // resumed from index 2 — NOT ["c0","c1"]
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2);  // cursor advanced 2→4, step 1→2
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("the final chunk exhausts the manifest, then finalize + complete (no self-fire)", async () => {
    const c = cfg(base({ cursor: 6, stepCount: 3 })); // cursor past the end
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("finalized");
    expect(c.finalize).toHaveBeenCalledTimes(1);
    expect(c.closeCompleted).toHaveBeenCalledWith(false);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("CONFIRM-POLL — a not-ok fetch is NEVER failure on its own (gap_pairs 504 class)", () => {
  it("NOT-OK + fully accounted ⇒ advance to nextCursor + self-fire, NEVER closeFailed (worker was alive)", async () => {
    // The fetch was cut, but the worker wrote/judged BOTH chunk candidates server-side.
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: false }));
    const confirm = vi.fn(async (chunk: unknown[]) => ({ accounted: chunk.length })); // 2 of 2
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { judgeChunk: judge, confirmChunk: confirm });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("chunk_recovered");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2); // cursor 2→4 (recovered the whole chunk)
    expect(c.selfFire).toHaveBeenCalledTimes(1);          // the chain CONTINUES
    expect(c.closeFailed).not.toHaveBeenCalled();         // FALSIFICATION: reverting to closeFailed breaks this
    expect(c.markUnconfirmed).not.toHaveBeenCalled();
  });
  it("NOT-OK + PARTIAL accounted ⇒ advance to the last-accounted candidate + self-fire (tail re-judges)", async () => {
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: false }));
    const confirm = vi.fn(async (_chunk: unknown[]) => ({ accounted: 1 })); // only the leading 1 of 2 landed
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { judgeChunk: judge, confirmChunk: confirm });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("chunk_recovered_partial");
    expect(c.persistProgress).toHaveBeenCalledWith(3, 2); // cursor 2→3 (last accounted), NOT 4
    expect(c.selfFire).toHaveBeenCalledTimes(1);          // resumes at 3 next fire
    expect(c.closeFailed).not.toHaveBeenCalled();
    expect(c.markUnconfirmed).not.toHaveBeenCalled();
  });
  it("NOT-OK + NOTHING accounted ⇒ unconfirmed HOLD (running + note), NO self-fire, NEVER failed", async () => {
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: false }));
    const confirm = vi.fn(async (_chunk: unknown[]) => ({ accounted: 0 })); // nothing landed in the window
    const markUnconfirmed = vi.fn(async (_cursor: number) => {});
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { judgeChunk: judge, confirmChunk: confirm, markUnconfirmed });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("unconfirmed_hold");
    expect(markUnconfirmed).toHaveBeenCalledWith(2);      // held at the CURRENT cursor (resumable)
    expect(c.closeFailed).not.toHaveBeenCalled();         // the worker may be alive — NEVER failed
    expect(c.selfFire).not.toHaveBeenCalled();            // no hot loop
    expect(c.persistProgress).not.toHaveBeenCalled();     // cursor did not advance
  });
  it("HAPPY PATH unchanged: ok:true advances + self-fires WITHOUT consulting confirmChunk", async () => {
    const confirm = vi.fn(async (_chunk: unknown[]) => ({ accounted: 0 }));
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { confirmChunk: confirm }); // judge default ok:true
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("chunk_done");
    expect(confirm).not.toHaveBeenCalled();               // confirm-poll is the not-ok path ONLY
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2);
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
});

describe("TERMINAL DISCIPLINE — no infinite loop", () => {
  it("MAX-STEPS: at the step ceiling it closes failed FIRST, doing no further work", async () => {
    const plan = vi.fn(async () => ({ candidates: CANDS }));
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: true }));
    const closeFailed = vi.fn(async (_reason: string) => {});
    const c = cfg(base({ cursor: 2, stepCount: 10, maxSteps: 10 }), { plan, judgeChunk: judge, closeFailed });
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("terminate_max_steps");
    expect(closeFailed).toHaveBeenCalledTimes(1);
    expect(closeFailed.mock.calls[0][0]).toMatch(/max_steps/);
    expect(plan).not.toHaveBeenCalled();
    expect(judge).not.toHaveBeenCalled();
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});
