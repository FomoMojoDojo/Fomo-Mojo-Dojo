// Open-questions self-chaining stepper guards (operator ruling 2026-09-02), mirroring the market-
// discovery stepper: a DB-persisted anchor manifest makes a mid-chunk death RESUMABLE (resume from the
// persisted cursor, not from 0); terminal discipline (max-steps + no-progress) makes an infinite self-
// fire loop structurally impossible. Each proof fails if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  runOpenQuestionsStep,
  type OQChainState,
  type OQStepConfig,
} from "../../../supabase/functions/_shared/openQuestionsStepper.ts";

const ANCHORS = ["a0", "a1", "a2", "a3", "a4", "a5", "a6"]; // a 7-anchor manifest (cap-3 → 3 chunks)

const cfg = (state: OQChainState, over: Partial<OQStepConfig> = {}): OQStepConfig => ({
  state,
  plan: vi.fn(async () => ({ anchors: ANCHORS })),
  runChunk: vi.fn(async () => ({ ok: true })),
  finalize: vi.fn(async () => {}),
  persistPlanned: vi.fn(async () => {}),
  persistProgress: vi.fn(async () => {}),
  closeCompleted: vi.fn(async () => {}),
  closeFailed: vi.fn(async () => {}),
  selfFire: vi.fn(async () => {}),
  ...over,
});

const base = (over: Partial<OQChainState> = {}): OQChainState => ({
  planned: true, anchors: ANCHORS, cursor: 0, chunkSize: 3, stepCount: 0, maxSteps: 25, ...over,
});

describe("plan phase", () => {
  it("plans once, persists the anchor manifest, self-fires into the chunks", async () => {
    const c = cfg(base({ planned: false, anchors: [], cursor: 0 }));
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("planned");
    expect(c.persistPlanned).toHaveBeenCalledWith(ANCHORS);
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("planned with ZERO anchors ⇒ completed_empty (looked, none), no self-fire", async () => {
    const c = cfg(base({ planned: false, anchors: [] }), { plan: vi.fn(async () => ({ anchors: [] })) });
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("planned_empty");
    expect(c.closeCompleted).toHaveBeenCalledWith(true); // writes integrity 'completed' examined 0
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("RESUME-AFTER-DEATH — resume from the DB cursor, not from 0", () => {
  it("a fresh fire at persisted cursor=3 runs anchors[3:6], never [0:3]", async () => {
    const run = vi.fn(async (_chunk: string[]) => ({ ok: true }));
    const c = cfg(base({ cursor: 3, stepCount: 1 }), { runChunk: run });
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("chunk_done");
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toEqual(["a3", "a4", "a5"]); // resumed from index 3 — NOT ["a0","a1","a2"]
    expect(c.persistProgress).toHaveBeenCalledWith(6, 2);      // cursor 3→6, step 1→2
    expect(c.selfFire).toHaveBeenCalledTimes(1);
  });
  it("cursor past the end ⇒ finalize + complete (no self-fire)", async () => {
    const c = cfg(base({ cursor: 7, stepCount: 3 }));
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("finalized");
    expect(c.finalize).toHaveBeenCalledTimes(1);
    expect(c.closeCompleted).toHaveBeenCalledWith(false);
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});

describe("TERMINAL DISCIPLINE — no infinite loop", () => {
  it("NO-REFIRE-ON-NO-PROGRESS: a failed chunk closes the ledger failed and NEVER self-fires", async () => {
    const run = vi.fn(async (_chunk: string[]) => ({ ok: false }));
    const closeFailed = vi.fn(async (_reason: string) => {});
    const c = cfg(base({ cursor: 3, stepCount: 1 }), { runChunk: run, closeFailed });
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("no_progress_failed");
    expect(closeFailed).toHaveBeenCalledTimes(1);
    expect(closeFailed.mock.calls[0][0]).toMatch(/no_progress/);
    expect(c.selfFire).not.toHaveBeenCalled();
    expect(c.persistProgress).not.toHaveBeenCalled();
  });
  it("MAX-STEPS: at the step ceiling it closes failed FIRST, doing no further work", async () => {
    const plan = vi.fn(async () => ({ anchors: ANCHORS }));
    const run = vi.fn(async (_chunk: string[]) => ({ ok: true }));
    const closeFailed = vi.fn(async (_reason: string) => {});
    const c = cfg(base({ cursor: 3, stepCount: 25, maxSteps: 25 }), { plan, runChunk: run, closeFailed });
    const out = await runOpenQuestionsStep(c);
    expect(out.outcome).toBe("terminate_max_steps");
    expect(closeFailed).toHaveBeenCalledTimes(1);
    expect(closeFailed.mock.calls[0][0]).toMatch(/max_steps/);
    expect(plan).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(c.selfFire).not.toHaveBeenCalled();
  });
});
