// FIRST-FILL AUTO-CHAIN guards (operator-signed 2026-09-01). The module lives under
// supabase/functions/_shared (edge-mounted, pure); this test lives under src/** so vitest runs it
// against the SAME implementation the edge function imports. Each proof fails if its guard is reverted.
import { describe, it, expect, vi } from "vitest";
import {
  missingPublicReadKinds,
  marketReadIsEmpty,
  marketDiscoveryNeedsFire,
  runFirstReadFill,
  runChainKinds,
  classifyGapPairsAfterTimeout,
  chainKindLedgerStatus,
  chainKindIsTerminal,
  openQuestionsAlreadyPresent,
  PUBLIC_READ_KINDS,
  type PublicReadKind,
  type GenPerKind,
  type ChainKindStep,
  type ChainKindTerminal,
} from "../../../supabase/functions/_shared/firstReadFill.ts";

const cfg = (over: Partial<Parameters<typeof runFirstReadFill>[0]>): Parameters<typeof runFirstReadFill>[0] => ({
  missingKinds: [],
  marketNeedsFire: false,
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
    const out = await runFirstReadFill(cfg({ missingKinds: [], marketNeedsFire: false, generatePublicRead: gen, fireMarketDiscovery: fire, recordKindLedger: rec }));
    expect(gen).not.toHaveBeenCalled();
    expect(fire).not.toHaveBeenCalled();
    expect(out.stageEmpty).toBe(true);
    expect(out.generated).toEqual([]);
    // every kind recorded completed_empty (nothing missing)
    for (const k of PUBLIC_READ_KINDS) expect(rec).toHaveBeenCalledWith(k, "completed_empty");
  });
});

describe("marketDiscoveryNeedsFire — MANIFEST is the completeness authority (not def existence)", () => {
  it("no manifest ⇒ falls back to the legacy def-emptiness gate", () => {
    expect(marketDiscoveryNeedsFire(null, true)).toBe(true);   // no defs → fire
    expect(marketDiscoveryNeedsFire(null, false)).toBe(false); // pre-manifest defs exist → leave alone
  });
  it("completed@total (or completed-empty) ⇒ NEVER re-fires — even when defs would look present", () => {
    expect(marketDiscoveryNeedsFire({ status: "completed", chain_state: { cursor: 6, candidates: new Array(6) } }, false)).toBe(false);
    expect(marketDiscoveryNeedsFire({ status: "completed", chain_state: { cursor: 0, candidates: [] } }, true)).toBe(false); // honest empty completion
  });
  it("FALSIFICATION (the Lumio 1-of-6 stuck bug): a failed/partial manifest with cursor < total ⇒ RE-FIRES, even with a def present", () => {
    // The old gate keyed on def existence → false (no re-fire) → stuck forever. The manifest gate re-fires.
    expect(marketDiscoveryNeedsFire({ status: "failed", chain_state: { cursor: 0, candidates: new Array(6) } }, false)).toBe(true);
    expect(marketDiscoveryNeedsFire({ status: "running", chain_state: { cursor: 2, candidates: new Array(6) } }, false)).toBe(true);
    // an unconfirmed HOLD is a 'running' row with cursor < total → resumes
    expect(marketDiscoveryNeedsFire({ status: "running", chain_state: { cursor: 4, candidates: new Array(6) } }, false)).toBe(true);
    // completed but cursor short of total (defensive) → still resumes
    expect(marketDiscoveryNeedsFire({ status: "completed", chain_state: { cursor: 3, candidates: new Array(6) } }, false)).toBe(true);
  });
});

describe("market discovery firing", () => {
  it("fires only when the manifest needs it; a fire error is isolated (parent still completes)", async () => {
    const fireOk = vi.fn(async () => {});
    const closeParent = vi.fn(async () => {});
    const a = await runFirstReadFill(cfg({ marketNeedsFire: true, fireMarketDiscovery: fireOk, closeParent }));
    expect(fireOk).toHaveBeenCalledTimes(1);
    expect(a.marketFired).toBe(true);
    const fireThrow = vi.fn(async () => { throw new Error("discovery boot failed"); });
    const closeParent2 = vi.fn(async () => {});
    const b = await runFirstReadFill(cfg({ marketNeedsFire: true, fireMarketDiscovery: fireThrow, closeParent: closeParent2 }));
    expect(b.marketFired).toBe(false);
    expect(closeParent2).toHaveBeenCalledTimes(1); // isolated — parent completed anyway
  });
});

// ── Chain kinds (own-words → public gap-pairs): the fill-stage extension ─────────────────────────
// A tiny step builder + a ledger recorder that captures every (kind, status, note) so each guard
// asserts LEDGER / call structure, never rendered text.
type LedgerRow = { kind: string; status: ChainKindTerminal; note?: string };
function ledger() {
  const rows: LedgerRow[] = [];
  return { rows, record: vi.fn(async (kind: string, status: ChainKindTerminal, note?: string) => { rows.push({ kind, status, note }); }) };
}
const step = (
  kind: string,
  present: boolean | (() => Promise<boolean>),
  run: ChainKindStep["run"],
): ChainKindStep => ({
  kind,
  alreadyPresent: typeof present === "function" ? present : async () => present,
  run,
});

describe("chain kinds — dependency order (own-words terminates before deltas start)", () => {
  it("runs strictly sequentially: deltas.run is not called until own-words.run has resolved", async () => {
    const timeline: string[] = [];
    let ownWordsResolved = false;
    const ow = step("own_words", false, async () => {
      timeline.push("ow:start");
      await new Promise((r) => setTimeout(r, 5));
      ownWordsResolved = true;
      timeline.push("ow:end");
      return { status: "completed" };
    });
    const gp = step("public_gap_pairs", false, async () => {
      // GUARD: if deltas could start while own-words was still running, this would be false.
      expect(ownWordsResolved).toBe(true);
      timeline.push("gp:start");
      return { status: "completed" };
    });
    const lg = ledger();
    const out = await runChainKinds([ow, gp], { recordChainLedger: lg.record });
    expect(timeline).toEqual(["ow:start", "ow:end", "gp:start"]);
    expect(out.map((o) => o.status)).toEqual(["completed", "completed"]);
  });
});

describe("chain kinds — first-fill-only", () => {
  it("(own-words) an existing own_words artifact is skipped; deltas still runs", async () => {
    const owRun = vi.fn(async () => ({ status: "completed" as const }));
    const gpRun = vi.fn(async () => ({ status: "completed" as const }));
    const lg = ledger();
    const out = await runChainKinds(
      [step("own_words", true, owRun), step("public_gap_pairs", false, gpRun)],
      { recordChainLedger: lg.record },
    );
    expect(owRun).not.toHaveBeenCalled();               // never regenerated
    expect(gpRun).toHaveBeenCalledTimes(1);             // the rest still runs
    expect(out[0].status).toBe("skipped");
    expect(lg.rows[0]).toMatchObject({ kind: "own_words", status: "completed_empty" });
    expect(lg.rows[1]).toMatchObject({ kind: "public_gap_pairs", status: "completed" });
  });

  it("(deltas) an existing gap-pairs artifact is skipped (no delta run)", async () => {
    const gpRun = vi.fn(async () => ({ status: "completed" as const }));
    const lg = ledger();
    const out = await runChainKinds([step("public_gap_pairs", true, gpRun)], { recordChainLedger: lg.record });
    expect(gpRun).not.toHaveBeenCalled();
    expect(out[0].status).toBe("skipped");
    expect(lg.rows[0]).toMatchObject({ kind: "public_gap_pairs", status: "completed_empty" });
  });

  it("no-op on a filled company: both present ⇒ zero producer calls, both skipped", async () => {
    const owRun = vi.fn(async () => ({ status: "completed" as const }));
    const gpRun = vi.fn(async () => ({ status: "completed" as const }));
    const lg = ledger();
    const out = await runChainKinds(
      [step("own_words", true, owRun), step("public_gap_pairs", true, gpRun)],
      { recordChainLedger: lg.record },
    );
    expect(owRun).not.toHaveBeenCalled();
    expect(gpRun).not.toHaveBeenCalled();
    expect(out.every((o) => o.status === "skipped")).toBe(true);
  });

  it("structurally incapable of superseding: a presence-check throw records failed WITHOUT running", async () => {
    const owRun = vi.fn(async () => ({ status: "completed" as const }));
    const lg = ledger();
    const out = await runChainKinds(
      [step("own_words", async () => { throw new Error("db down"); }, owRun)],
      { recordChainLedger: lg.record },
    );
    expect(owRun).not.toHaveBeenCalled();               // never risk regenerating over an unconfirmed artifact
    expect(out[0].status).toBe("failed");
    expect(lg.rows[0]).toMatchObject({ kind: "own_words", status: "failed" });
    expect(lg.rows[0].note).toMatch(/presence check failed/);
  });
});

describe("chain kinds — two-phase own-words honesty", () => {
  it("plan-then-failed-write does NOT report own_words completed (no claims materialized)", async () => {
    // The write phase 409s (frozen plan produced no candidates) → completed_empty, never completed.
    const owEmpty = step("own_words", false, async () => ({ status: "completed_empty", note: "plan 3 · no candidates" }));
    const lg = ledger();
    const out = await runChainKinds([owEmpty], { recordChainLedger: lg.record });
    expect(out[0].status).not.toBe("completed");
    expect(out[0].status).toBe("completed_empty");
    expect(lg.rows[0]).toMatchObject({ kind: "own_words", status: "completed_empty" });
  });
});

describe("chain kinds — failure isolation", () => {
  it("own-words write throws ⇒ own_words ledger=failed, deltas still runs, both recorded", async () => {
    const owThrow = step("own_words", false, async () => { throw new Error("write boom"); });
    const gpRun = vi.fn(async () => ({ status: "completed" as const }));
    const lg = ledger();
    const out = await runChainKinds([owThrow, step("public_gap_pairs", false, gpRun)], { recordChainLedger: lg.record });
    expect(out[0].status).toBe("failed");
    expect(lg.rows[0]).toMatchObject({ kind: "own_words", status: "failed" });
    expect(lg.rows[0].note).toMatch(/threw/);
    expect(gpRun).toHaveBeenCalledTimes(1);             // isolated — the next kind runs on the inference fallback
    expect(out[1].status).toBe("completed");
  });

  it("frozen refusal: a step whose producer refuses records failed with the refusal note", async () => {
    const owFrozen = step("own_words", false, async () => ({ status: "failed", note: "refused: company frozen" }));
    const lg = ledger();
    const out = await runChainKinds([owFrozen], { recordChainLedger: lg.record });
    expect(out[0].status).toBe("failed");
    expect(lg.rows[0].note).toMatch(/frozen/);
  });
});

describe("chain kinds — public-delta 504 confirm-poll (worker outran the gateway)", () => {
  // The three outcomes of classifyGapPairsAfterTimeout, the pure core of gapPairsStep.run()'s 504 branch.
  it("integrity row completed (or skipped_empty_input) ⇒ 'completed' (the isolate finished server-side)", () => {
    expect(classifyGapPairsAfterTimeout("completed")).toBe("completed");
    expect(classifyGapPairsAfterTimeout("skipped_empty_input")).toBe("completed");
  });

  it("integrity row failed ⇒ 'failed' (a real worker failure the isolate recorded)", () => {
    expect(classifyGapPairsAfterTimeout("failed")).toBe("failed");
  });

  it("no conclusive row within the poll window ⇒ 'unconfirmed', NEVER 'failed'", () => {
    // null (no row), an in-flight 'planned', and an unknown status all defer — the 504 must not be
    // read as a failure when the worker may still be completing.
    expect(classifyGapPairsAfterTimeout(null)).toBe("unconfirmed");
    expect(classifyGapPairsAfterTimeout(undefined)).toBe("unconfirmed");
    expect(classifyGapPairsAfterTimeout("planned")).toBe("unconfirmed");
    expect(classifyGapPairsAfterTimeout(null)).not.toBe("failed");
  });

  // STANDING LAW — an unearned status is not a status. This guard asserts the LEDGER STATUS the
  // unconfirmed terminal is written as (path (b): CHECK-constrained column → non-terminal 'running'),
  // NOT the note. A migration adding an 'unconfirmed' status value is owed.
  it("unconfirmed is written as the non-terminal ledger status 'running' — never completed, never failed", () => {
    expect(chainKindLedgerStatus("unconfirmed")).toBe("running");
    expect(chainKindLedgerStatus("unconfirmed")).not.toBe("completed");
    expect(chainKindLedgerStatus("unconfirmed")).not.toBe("failed");
    // the earned terminals it must not disturb:
    expect(chainKindLedgerStatus("completed")).toBe("completed");
    expect(chainKindLedgerStatus("completed_empty")).toBe("completed");
    expect(chainKindLedgerStatus("failed")).toBe("failed");
  });
});

describe("chain kinds — open_questions handoff (fire-and-forget stepper dispatch)", () => {
  // The fill NEVER writes 'completed' for the handed-off stepper work it did not observe.
  it("'handed_off' maps to the non-terminal ledger status 'running' — never completed, never failed", () => {
    expect(chainKindLedgerStatus("handed_off")).toBe("running");
    expect(chainKindLedgerStatus("handed_off")).not.toBe("completed");
    expect(chainKindLedgerStatus("handed_off")).not.toBe("failed");
    expect(chainKindIsTerminal("handed_off")).toBe(false); // no finished_at — the stepper's row closes it
  });

  it("a handed_off step is recorded (running) and does not fail the run", async () => {
    const oqRun = vi.fn(async () => ({ status: "handed_off" as const, note: "handed off · run=42" }));
    const lg = ledger();
    const out = await runChainKinds([step("open_questions", false, oqRun)], { recordChainLedger: lg.record });
    expect(oqRun).toHaveBeenCalledTimes(1);
    expect(out[0].status).toBe("handed_off");
    expect(lg.rows[0]).toMatchObject({ kind: "open_questions", status: "handed_off" });
    expect(chainKindLedgerStatus(lg.rows[0].status)).toBe("running"); // asserts the LEDGER status, not the note
  });
});

describe("open_questions first-fill-only predicate (skip on rows OR in-flight run)", () => {
  it("skips when delta-driven questions already exist", () => {
    expect(openQuestionsAlreadyPresent({ hasSilentDeltaRows: true, hasRunningStepper: false })).toBe(true);
  });
  it("skips when a stepper run is already in-flight (no double-fire)", () => {
    expect(openQuestionsAlreadyPresent({ hasSilentDeltaRows: false, hasRunningStepper: true })).toBe(true);
  });
  it("fires only when NEITHER holds (cascade_gap alone never blocks — different source_kind)", () => {
    expect(openQuestionsAlreadyPresent({ hasSilentDeltaRows: false, hasRunningStepper: false })).toBe(false);
  });
});
