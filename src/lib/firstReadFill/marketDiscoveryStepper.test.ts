// Market-discovery self-chaining stepper guards (operator ruling 2026-09-01): DB-persisted manifest
// makes a mid-chunk death RESUMABLE (resume from the persisted cursor, not from 0); terminal discipline
// (max-steps + no-progress) makes an infinite self-fire loop structurally impossible. Each proof fails
// if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  runMarketDiscoveryStep,
  HOLD_LIMIT,
  HOLD_NOTE_PREFIX,
  shouldReopenAdoptedRun,
  type MDChainState,
  type MDStepConfig,
} from "../../../supabase/functions/_shared/marketDiscoveryStepper.ts";
// Gate 1b (f): the END-TO-END proof wires the REAL confirm-poll rule into the stepper, so the two
// halves of the fix are shown to compose — a mid-flight candidate must produce a HOLD, not an advance.
import {
  marketCandidateAccounted,
  type ExistsProbe,
} from "../../../supabase/functions/_shared/marketCandidateAccounted.ts";

const CANDS = ["c0", "c1", "c2", "c3", "c4", "c5"]; // a 6-candidate manifest

const cfg = (state: MDChainState, over: Partial<MDStepConfig> = {}): MDStepConfig => ({
  state,
  plan: vi.fn(async () => ({ candidates: CANDS })),
  judgeChunk: vi.fn(async () => ({ ok: true })),
  confirmChunk: vi.fn(async () => ({ accounted: 0 })),
  finalize: vi.fn(async () => {}),
  persistPlanned: vi.fn(async () => {}),
  persistProgress: vi.fn(async (_c: number, _s: number, _h: number) => {}),
  closeCompleted: vi.fn(async () => {}),
  closeFailed: vi.fn(async () => {}),
  markUnconfirmed: vi.fn(async (_c: number, _h: number) => {}),
  selfFire: vi.fn(async () => {}),
  ...over,
});

const base = (over: Partial<MDChainState> = {}): MDChainState => ({
  planned: true, candidates: CANDS, cursor: 0, chunkSize: 2, stepCount: 0, maxSteps: 10,
  holdsAtCursor: 0, holdCursor: null, ...over,
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
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2, 0); // cursor advanced 2→4, step 1→2, holds reset
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
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2, 0); // cursor 2→4 (recovered the whole chunk); holds reset
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
    expect(c.persistProgress).toHaveBeenCalledWith(3, 2, 0); // cursor 2→3 (last accounted), NOT 4; holds reset
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
    expect(markUnconfirmed).toHaveBeenCalledWith(2, 1);   // held at the CURRENT cursor (resumable), first hold
    expect(c.closeFailed).not.toHaveBeenCalled();         // the worker may be alive — NEVER failed
    expect(c.selfFire).not.toHaveBeenCalled();            // no hot loop
    expect(c.persistProgress).not.toHaveBeenCalled();     // cursor did not advance
  });
  // ── (f) Gate 1b END-TO-END — the real rule, the real stepper ──────────────────────────────────
  // Riverlane manifest b60e2867 replayed at the moment of the loss: candidate #4 (the dropped `buyer`
  // group) is MID-FLIGHT — gate (a) rejected the original wording, the reframe round restated the job
  // and gate (a) passed it, then the chunk died inside the solution-agnostic call. Under the OLD rule
  // the lone perspective verdict counted as accounted, confirmChunk returned 1, and the cursor
  // advanced past a candidate that was never decided. The run then closed completed/6-of-6 with the
  // buyer group gone. Under the new rule the poll accounts NOTHING and the chain HOLDS.
  it("(f) a MID-FLIGHT candidate + not-ok fetch ⇒ unconfirmed_hold, cursor UNMOVED (real rule)", async () => {
    const COMPANY = "49435388-954b-42ff-8366-62e207a3f625";
    const MID_FLIGHT = [
      { job_executor: "Quantum software developers building applications on quantum computers",
        jtbd: "To create robust quantum applications by integrating Riverlane's Deltaflow QEC stack, "
          + "ensuring that their software runs reliably on quantum hardware." },
      { job_executor: "Venture capitalists investing in quantum technology startups",
        jtbd: "To identify promising quantum technology investments by evaluating Riverlane's "
          + "leadership in QEC and its partnerships with major quantum hardware companies." },
    ];
    // The ONLY rows that exist: gate-(a) perspective verdicts. No def, no verdict, no error terminal.
    const exists: ExistsProbe = async (table) => table === "step_perspective_verdicts";
    const confirm = vi.fn(async (chunk: unknown[]) => {
      let leading = 0;
      for (const candidate of chunk as Array<Record<string, unknown>>) {
        if (await marketCandidateAccounted({ exists, companyId: COMPANY, candidate })) leading++;
        else break;
      }
      return { accounted: leading };
    });
    const judge = vi.fn(async (_chunk: unknown[]) => ({ ok: false }));
    const markUnconfirmed = vi.fn(async (_cursor: number) => {});
    const c = cfg(
      { planned: true, candidates: MID_FLIGHT, cursor: 0, chunkSize: 2, stepCount: 1, maxSteps: 10,
        holdsAtCursor: 0, holdCursor: null },
      { judgeChunk: judge, confirmChunk: confirm, markUnconfirmed },
    );
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("unconfirmed_hold");         // NOT chunk_recovered / _partial
    expect(await confirm.mock.results[0].value).toEqual({ accounted: 0 }); // touched ≠ finished
    expect(markUnconfirmed).toHaveBeenCalledWith(0, 1);   // held at the CURRENT cursor, resumable, first hold
    expect(c.persistProgress).not.toHaveBeenCalled();     // the cursor did NOT move past the buyer group
    expect(c.closeCompleted).not.toHaveBeenCalled();      // and the run does NOT claim completion
    expect(c.closeFailed).not.toHaveBeenCalled();         // the worker may be alive
  });
  it("HAPPY PATH unchanged: ok:true advances + self-fires WITHOUT consulting confirmChunk", async () => {
    const confirm = vi.fn(async (_chunk: unknown[]) => ({ accounted: 0 }));
    const c = cfg(base({ cursor: 2, stepCount: 1 }), { confirmChunk: confirm }); // judge default ok:true
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("chunk_done");
    expect(confirm).not.toHaveBeenCalled();               // confirm-poll is the not-ok path ONLY
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2, 0);
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

// ── Gate 1c — TERMINAL 2: the NO-PROGRESS guard ───────────────────────────────────────────────────
// The sweep's RE-ARM (2) now resumes a held run every 5 minutes. The hold path does NOT increment
// stepCount, so the max_steps ceiling can never bind on a repeating hold — without this guard an
// automatically re-armed, deterministically-dying chunk loops forever at 12 posts/hour. This is the
// bound, and it is what makes the automatic resume safe to switch on. Parity with the sibling
// steppers: same wording, same terminal (recurrenceStepper.ts:97, openQuestionsStepper.ts:122).
describe("TERMINAL 2 — no-progress guard (Gate 1c)", () => {
  const holdCfg = (state: MDChainState, closeFailed = vi.fn(async (_r: string) => {})) =>
    cfg(state, {
      judgeChunk: vi.fn(async () => ({ ok: false })),
      confirmChunk: vi.fn(async () => ({ accounted: 0 })),
      closeFailed,
    });

  it(`(1c) the ${HOLD_LIMIT}rd consecutive hold at the SAME cursor closes failed with the signed text`, async () => {
    const closeFailed = vi.fn(async (_r: string) => {});
    const c = holdCfg(base({ cursor: 2, stepCount: 1, holdCursor: 2, holdsAtCursor: HOLD_LIMIT - 1 }), closeFailed);
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("no_progress_failed");
    expect(closeFailed).toHaveBeenCalledWith("no_progress at cursor 2 — market discovery halted");
    expect(c.markUnconfirmed).not.toHaveBeenCalled();     // it is a TERMINAL, not another hold
    expect(c.selfFire).not.toHaveBeenCalled();
  });

  it("(1c) holds 1 and 2 at the same cursor still HOLD — a slow worker is not a stuck one", async () => {
    for (const prior of [0, 1]) {
      const c = holdCfg(base({ cursor: 2, stepCount: 1, holdCursor: prior === 0 ? null : 2, holdsAtCursor: prior }));
      const out = await runMarketDiscoveryStep(c);
      expect(out.outcome).toBe("unconfirmed_hold");
      expect(c.markUnconfirmed).toHaveBeenCalledWith(2, prior + 1);
      expect(c.closeFailed).not.toHaveBeenCalled();
    }
  });

  it("(1c) a hold at a DIFFERENT cursor is progress — the count restarts at 1, never accumulates", async () => {
    const c = holdCfg(base({ cursor: 4, stepCount: 2, holdCursor: 2, holdsAtCursor: HOLD_LIMIT - 1 }));
    const out = await runMarketDiscoveryStep(c);
    expect(out.outcome).toBe("unconfirmed_hold");        // NOT no_progress_failed
    expect(c.markUnconfirmed).toHaveBeenCalledWith(4, 1);
    expect(c.closeFailed).not.toHaveBeenCalled();
  });

  it("(1c) progress RESETS the count: a completed chunk persists holdsAtCursor 0", async () => {
    const c = cfg(base({ cursor: 2, stepCount: 1, holdCursor: 2, holdsAtCursor: HOLD_LIMIT - 1 }));
    const out = await runMarketDiscoveryStep(c);        // judgeChunk defaults ok:true
    expect(out.outcome).toBe("chunk_done");
    expect(c.persistProgress).toHaveBeenCalledWith(4, 2, 0);
  });

  it("(1c) two holds then progress then a hold at the same cursor does NOT terminate", async () => {
    // The realistic rescue: hold, hold, the sweep re-arms, the chunk lands, a later chunk holds once.
    const after = cfg(base({ cursor: 4, stepCount: 2, holdCursor: null, holdsAtCursor: 0 }), {
      judgeChunk: vi.fn(async () => ({ ok: false })),
      confirmChunk: vi.fn(async () => ({ accounted: 0 })),
    });
    const out = await runMarketDiscoveryStep(after);
    expect(out.outcome).toBe("unconfirmed_hold");
    expect(after.markUnconfirmed).toHaveBeenCalledWith(4, 1);
  });
});

// ── Gate 1c — the adopt path CONSUMES the hold marker ─────────────────────────────────────────────
describe("adopt: consuming the hold marker (Gate 1c)", () => {
  const HELD = `${HOLD_NOTE_PREFIX} chunk at cursor 3 not yet accounted — worker may be alive; awaiting resume`;

  // RED ON REVERT. The old predicate was `status !== "running"` alone, so a held row — which IS
  // 'running' — kept its marker for the whole resumed fire and the sweep re-armed it again 5 minutes
  // later, on top of live work.
  it("(1c) a RUNNING row carrying the hold marker is re-opened, clearing the marker", () => {
    expect(shouldReopenAdoptedRun("running", HELD)).toBe(true);
  });

  it("(1c) a RUNNING row with no marker is left untouched — never interrupt a live self-chain", () => {
    expect(shouldReopenAdoptedRun("running", null)).toBe(false);
    expect(shouldReopenAdoptedRun("running", "")).toBe(false);
    // A genuinely different note is not the marker and must not be consumed.
    expect(shouldReopenAdoptedRun("running", "stalled partway and was closed out automatically")).toBe(false);
  });

  it("(1c) REGRESSION GUARD (passes under both bodies): a failed/unconfirmed row is still re-opened", () => {
    expect(shouldReopenAdoptedRun("failed", "max_steps (12) exceeded — market discovery halted")).toBe(true);
    expect(shouldReopenAdoptedRun(null, null)).toBe(true);
  });
});
