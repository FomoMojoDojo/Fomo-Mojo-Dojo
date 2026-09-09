// GATE E (2026-09-09) — two constants that were wrong about the work in front of them.
import { describe, expect, it } from "vitest";
import {
  OFFERING_KIND_HINTS, offeringStructureViolations,
} from "../../../supabase/functions/_shared/publicReadGuards.ts";
import {
  OQ_MAX_STEPS_CEILING, deriveMaxSteps, runOpenQuestionsStep, type OQChainState,
} from "../../../supabase/functions/_shared/openQuestionsStepper.ts";

// ── E1 — the offering kind_hint vocabulary ───────────────────────────────────────────────────────
// Brand AI's offering read was rejected WHOLE on `item_bad_kind_hint · kind_hint=platform`. A brand
// operating system is a platform; the generator described it accurately against a set that had no
// word for it. The guard is unchanged — only its vocabulary widened.
const REFS = new Set(["S1", "O1"]);
const item = (kind_hint: string) => ({
  items: [{ label: "Brand OS", statement: "structures brand guidelines into machine-readable intelligence", refs: ["S1"], kind_hint }],
  open_questions: [],
});

describe("E1 — offering kind_hint accepts platform, and still rejects an unknown hint", () => {
  it("kind_hint=platform PASSES the structure guard", () => {
    expect(offeringStructureViolations(item("platform"), REFS)).toEqual([]);
  });

  it("kind_hint=widget STILL rejects, with the same violation code", () => {
    const v = offeringStructureViolations(item("widget"), REFS);
    expect(v).toHaveLength(1);
    expect(v[0].code).toBe("item_bad_kind_hint");
    expect(v[0].detail).toContain("kind_hint=widget");
  });

  it("the five original hints are untouched", () => {
    for (const k of ["product", "service", "program", "format", "channel"]) {
      expect(offeringStructureViolations(item(k), REFS)).toEqual([]);
      expect(OFFERING_KIND_HINTS.has(k)).toBe(true);
    }
    expect(OFFERING_KIND_HINTS.has("platform")).toBe(true);
    expect(OFFERING_KIND_HINTS.size).toBe(6);
  });

  it("VACUOUS PROOF — an empty hint and a missing hint still violate", () => {
    expect(offeringStructureViolations(item(""), REFS)[0].code).toBe("item_bad_kind_hint");
    expect(offeringStructureViolations({ items: [{ label: "x", statement: "y", refs: ["S1"] }], open_questions: [] }, REFS)[0].code)
      .toBe("item_bad_kind_hint");
  });
});

// ── E3 — the derived step bound ──────────────────────────────────────────────────────────────────
describe("E3 — maxSteps is derived from the manifest, not a constant", () => {
  it("Brand AI's shape: 133 anchors at chunk 3 derives 47", () => {
    expect(deriveMaxSteps(133, 3)).toBe(47); // ceil(133/3)=45 chunks + plan + finalize
  });

  it("a 6-anchor run derives 4", () => {
    expect(deriveMaxSteps(6, 3)).toBe(4);
  });

  it("a 2000-anchor run is capped at the 500 ceiling, not run unbounded", () => {
    expect(deriveMaxSteps(2000, 3)).toBe(OQ_MAX_STEPS_CEILING);
    expect(OQ_MAX_STEPS_CEILING).toBe(500);
  });

  it("degenerate inputs cannot produce an unbounded or zero bound", () => {
    expect(deriveMaxSteps(0, 3)).toBe(2);      // plan + finalize only
    expect(deriveMaxSteps(10, 0)).toBe(12);    // chunkSize 0 floors to 1
    expect(deriveMaxSteps(-5, 3)).toBe(2);
  });
});

/** Drive the real stepper to completion, one step per fire, exactly as the edge function does. */
async function driveOpenQuestions(anchorCount: number, chunkSize = 3, seedMaxSteps = 25) {
  let state: OQChainState = { planned: false, anchors: [], cursor: 0, chunkSize, stepCount: 0, maxSteps: seedMaxSteps };
  const anchors = Array.from({ length: anchorCount }, (_, i) => `a${i}`);
  const chunks: string[][] = [];
  let outcome = ""; let failedReason = ""; let fires = 0; let finalized = false;

  for (;;) {
    fires++;
    const r = await runOpenQuestionsStep({
      state,
      plan: () => Promise.resolve({ anchors }),
      runChunk: (c) => { chunks.push(c); return Promise.resolve({ ok: true }); },
      finalize: () => { finalized = true; return Promise.resolve(); },
      persistPlanned: (a, maxSteps) => { state = { ...state, planned: true, anchors: a, cursor: 0, maxSteps, anchorCount: a.length }; return Promise.resolve(); },
      persistProgress: (cursor, stepCount) => { state = { ...state, cursor, stepCount }; return Promise.resolve(); },
      closeCompleted: () => { outcome = "completed"; return Promise.resolve(); },
      closeFailed: (reason) => { outcome = "failed"; failedReason = reason; return Promise.resolve(); },
      selfFire: () => Promise.resolve(),
    });
    if (r.outcome === "terminate_max_steps" || r.outcome === "finalized" || r.outcome === "planned_empty" || r.outcome === "no_progress_failed") break;
    if (fires > 2000) throw new Error("runaway — the bound did not hold");
  }
  return { outcome, failedReason, fires, chunks, state, finalized };
}

describe("E3 — the stepper completes the work the old constant cut short", () => {
  it("133 anchors: derives 47, processes every anchor, and COMPLETES", async () => {
    const r = await driveOpenQuestions(133, 3);
    expect(r.state.maxSteps).toBe(47);
    expect(r.state.anchorCount).toBe(133);
    expect(r.chunks).toHaveLength(45);                    // ceil(133/3) — the 45 steps of real work
    expect(r.chunks.flat()).toHaveLength(133);            // NOT 75: nothing left on the floor
    expect(r.state.cursor).toBe(133);
    expect(r.outcome).toBe("completed");
    expect(r.finalized).toBe(true);
  });

  it("VACUOUS PROOF — the OLD constant 25 halts the same run at cursor 75", async () => {
    // This is what actually happened to Brand AI. Pinning it proves the test above is measuring the
    // derivation and not a harness that would pass either way.
    let state: OQChainState = { planned: true, anchors: Array.from({ length: 133 }, (_, i) => `a${i}`), cursor: 0, chunkSize: 3, stepCount: 0, maxSteps: 25 };
    const chunks: string[][] = [];
    let reason = "";
    for (let i = 0; i < 200; i++) {
      const r = await runOpenQuestionsStep({
        state,
        plan: () => Promise.resolve({ anchors: state.anchors }),
        runChunk: (c) => { chunks.push(c); return Promise.resolve({ ok: true }); },
        finalize: () => Promise.resolve(),
        persistPlanned: () => Promise.resolve(),
        persistProgress: (cursor, stepCount) => { state = { ...state, cursor, stepCount }; return Promise.resolve(); },
        closeCompleted: () => Promise.resolve(),
        closeFailed: (rsn) => { reason = rsn; return Promise.resolve(); },
        selfFire: () => Promise.resolve(),
      });
      if (r.outcome === "terminate_max_steps") break;
    }
    expect(chunks.flat()).toHaveLength(75);   // Brand AI's exact cursor
    expect(reason).toContain("max_steps (25) exceeded");
  });

  it("the ceiling still terminates a runaway, with a diagnostic note", async () => {
    const r = await driveOpenQuestions(2000, 3);
    expect(r.state.maxSteps).toBe(OQ_MAX_STEPS_CEILING);
    expect(r.outcome).toBe("failed");
    // the note must let an operator tell "genuinely enormous" from "stopped advancing"
    expect(r.failedReason).toContain("max_steps (500) exceeded");
    expect(r.failedReason).toContain("anchors=2000");
    expect(r.failedReason).toContain("chunkSize=3");
    expect(r.failedReason).toContain("stepCount=500");
    expect(r.failedReason).toContain("cursor=");
  });

  it("a 6-anchor run derives 4 and completes in 2 chunks", async () => {
    const r = await driveOpenQuestions(6, 3);
    expect(r.state.maxSteps).toBe(4);
    expect(r.chunks).toHaveLength(2);
    expect(r.outcome).toBe("completed");
  });

  it("an empty manifest completes honestly without inventing steps", async () => {
    const r = await driveOpenQuestions(0, 3);
    expect(r.state.maxSteps).toBe(2);
    expect(r.outcome).toBe("completed");
    expect(r.chunks).toHaveLength(0);
  });
});
