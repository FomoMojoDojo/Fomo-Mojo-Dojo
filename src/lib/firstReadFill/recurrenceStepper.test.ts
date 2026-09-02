// Signal-recurrence self-chaining stepper guards (operator ruling 2026-09-02), mirroring the open-
// questions / market-discovery steppers: a DB-persisted pair manifest makes a mid-chunk death RESUMABLE
// (resume from the persisted cursor, not from 0); terminal discipline (max-steps + no-progress) makes
// an infinite self-fire loop structurally impossible. Each proof fails if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  runRecurrenceStep,
  type RecChainState,
  type RecStepConfig,
  type RecPair,
} from "../../../supabase/functions/_shared/recurrenceStepper.ts";

const P = (n: number): RecPair[] => Array.from({ length: n }, (_, i) => ({ a: `a${i}`, b: `b${i}` }));
const PAIRS = P(12); // 12-pair manifest, cap-5 → 3 chunks (5,5,2)

const cfg = (state: RecChainState, over: Partial<RecStepConfig> = {}): RecStepConfig => ({
  state,
  plan: vi.fn(async () => ({ pairs: PAIRS })),
  runChunk: vi.fn(async () => ({ ok: true })),
  finalize: vi.fn(async () => {}),
  persistPlanned: vi.fn(async () => {}),
  persistProgress: vi.fn(async () => {}),
  closeCompleted: vi.fn(async () => {}),
  closeFailed: vi.fn(async () => {}),
  selfFire: vi.fn(async () => {}),
  ...over,
});

const base = (over: Partial<RecChainState> = {}): RecChainState => ({
  planned: true, pairs: PAIRS, cursor: 0, chunkSize: 5, stepCount: 0, maxSteps: 500, ...over,
});

describe("plan phase", () => {
  it("plans once, persists the pair manifest, self-fires into judging", async () => {
    const c = cfg(base({ planned: false, pairs: [], cursor: 0 }));
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("planned");
    expect(c.persistPlanned).toHaveBeenCalledWith(PAIRS);
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("planned with ZERO fresh pairs ⇒ still finalizes (reconcile from banked) then completes, no self-fire", async () => {
    const c = cfg(base({ planned: false, pairs: [] }), { plan: vi.fn(async () => ({ pairs: [] })) });
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("planned_empty");
    expect(c.finalize).toHaveBeenCalledTimes(1);
    expect(c.closeCompleted).toHaveBeenCalledWith(true);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("RESUME-AFTER-DEATH — resume from the DB cursor, not from 0", () => {
  it("a fresh fire at persisted cursor=5 judges pairs[5:10], never [0:5]", async () => {
    const run = vi.fn(async (_chunk: RecPair[]) => ({ ok: true }));
    const c = cfg(base({ cursor: 5, stepCount: 1 }), { runChunk: run });
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("chunk_done");
    expect(run.mock.calls[0][0]).toEqual(PAIRS.slice(5, 10)); // resumed from 5 — NOT [0:5]
    expect(c.persistProgress).toHaveBeenCalledWith(10, 2);
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("cursor past the end ⇒ finalize + complete (no self-fire)", async () => {
    const c = cfg(base({ cursor: 12, stepCount: 3 }));
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("finalized");
    expect(c.finalize).toHaveBeenCalledTimes(1);
    expect(c.closeCompleted).toHaveBeenCalledWith(false);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("TERMINAL DISCIPLINE — no infinite loop", () => {
  it("NO-REFIRE-ON-NO-PROGRESS: a failed chunk closes failed and NEVER self-fires", async () => {
    const run = vi.fn(async (_chunk: RecPair[]) => ({ ok: false }));
    const closeFailed = vi.fn(async (_reason: string) => {});
    const c = cfg(base({ cursor: 5, stepCount: 1 }), { runChunk: run, closeFailed });
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("no_progress_failed");
    expect(closeFailed.mock.calls[0][0]).toMatch(/no_progress/);
    expect(c.selfFire).not.toHaveBeenCalled();
    expect(c.persistProgress).not.toHaveBeenCalled();
  });
  it("MAX-STEPS: at the ceiling it closes failed FIRST, doing no further work", async () => {
    const run = vi.fn(async (_chunk: RecPair[]) => ({ ok: true }));
    const closeFailed = vi.fn(async (_reason: string) => {});
    const c = cfg(base({ cursor: 5, stepCount: 500, maxSteps: 500 }), { runChunk: run, closeFailed });
    const out = await runRecurrenceStep(c);
    expect(out.outcome).toBe("terminate_max_steps");
    expect(closeFailed.mock.calls[0][0]).toMatch(/max_steps/);
    expect(run).not.toHaveBeenCalled();
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});
