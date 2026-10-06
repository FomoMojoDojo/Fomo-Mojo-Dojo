// THE SHARED RETRY BUDGET (operator rulings 2026-10-05, third set). The three acceptance specs:
//   * a judge-rejected slot gets ONE retry; a second rejection stages nothing for that kind
//   * accepted slots are BYTE-IDENTICAL before and after a sibling's retry
//   * a GATE retry consumes the kind's retry — no judge retry follows it
// Exercised over injected generate/judge callbacks, so every branch is deterministic and no model
// is called. The edge function supplies the real ones.
import { describe, it, expect } from "vitest";
import { runKind, spliceSlotAt, getSlotAt, type GenerateFn, type JudgeFn } from "../../../supabase/functions/_shared/readSlotsRun";

const PAYLOAD = {
  market_category: "what the business is",
  market_category_citations: ["m1"],
  unique_attributes: [{ text: "first in full", citations: ["a1"] }, { text: "second in full", citations: ["b1"] }],
};
const line = (t: string, c: string[] = []) => ({ text: t, citations: c });
const GOOD_A = line("a differentiator line of real length one", ["a1"]);
const GOOD_B = line("a differentiator line of real length two", ["b1"]);
const GOOD_CAT = line("a category context line of real length", ["m1"]);
const posSlots = (a = GOOD_A) => ({ differentiators: [a, GOOD_B], category_context: GOOD_CAT });

const accept = { entailed: true, vocab_ok: true, category_sanity_ok: true, accept: true };
const reject = (reason: string) => ({ entailed: false, vocab_ok: true, category_sanity_ok: true, accept: false, reason });

/** A judge that rejects the named paths on the calls listed, accepting everything else. */
function judgeRejecting(plan: Array<string[]>): { fn: JudgeFn; calls: number } {
  const state = { calls: 0 };
  const fn: JudgeFn = (slots) => {
    const bad = plan[state.calls] ?? [];
    state.calls++;
    const out: Record<string, unknown> = {};
    const paths = [...(Array.isArray(slots.differentiators) ? slots.differentiators : []).map((_, i) => `differentiators[${i}]`), "category_context"];
    for (const p of paths) out[p] = bad.includes(p) ? reject(`${p} merged two things the read keeps apart`) : accept;
    return Promise.resolve({ slots: out });
  };
  return { get calls() { return state.calls; }, fn } as { fn: JudgeFn; calls: number };
}

describe("judge re-ask", () => {
  it("a judge-rejected slot gets ONE retry, and a clean fix is accepted", async () => {
    const seen: string[] = [];
    const generate: GenerateFn = (mode, ctx) => {
      seen.push(mode);
      if (mode === "initial") return Promise.resolve(posSlots(line("a BAD differentiator that merges two places", ["a1"])));
      expect(mode).toBe("judge_retry");
      expect(ctx.rejected?.map((r) => r.field)).toEqual(["differentiators[0]"]);
      expect(ctx.rejected?.[0].reason).toMatch(/merged two things/);
      return Promise.resolve({ fixes: { "differentiators[0]": GOOD_A } });
    };
    const j = judgeRejecting([["differentiators[0]"], []]);
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge: j.fn });
    expect(out.ok).toBe(true);
    expect(out.retry_used_by).toBe("judge");
    expect(out.generator_calls).toBe(2);
    expect(seen).toEqual(["initial", "judge_retry"]);
    expect(out.attempts.map((a) => a.kind_of_attempt)).toEqual(["initial", "judge_retry"]);
  });

  it("a SECOND judge rejection stages nothing for that kind", async () => {
    const generate: GenerateFn = (mode) =>
      Promise.resolve(mode === "initial"
        ? posSlots(line("a BAD differentiator that merges two places", ["a1"]))
        : { fixes: { "differentiators[0]": line("still a bad differentiator line here", ["a1"]) } });
    const j = judgeRejecting([["differentiators[0]"], ["differentiators[0]"]]);
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge: j.fn });
    expect(out.ok).toBe(false);
    expect(out.generator_calls).toBe(2);               // never a third
    expect(out.per_slot.find((s) => s.field === "differentiators[0]")!.accepted).toBe(false);
    expect(out.retry_unavailable_reason).toMatch(/already spent by the judge failure/);
  });

  it("accepted slots are BYTE-IDENTICAL before and after a sibling's retry", async () => {
    const initial = posSlots(line("a BAD differentiator that merges two places", ["a1"]));
    const generate: GenerateFn = (mode) =>
      Promise.resolve(mode === "initial" ? initial : { fixes: { "differentiators[0]": GOOD_A } });
    const j = judgeRejecting([["differentiators[0]"], []]);
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge: j.fn });
    expect(out.ok).toBe(true);
    // the untouched sibling and the category line are the SAME OBJECTS, not merely equal
    expect(getSlotAt(out.slots, "differentiators[1]")).toBe(GOOD_B);
    expect(getSlotAt(out.slots, "category_context")).toBe(GOOD_CAT);
    expect(JSON.stringify(getSlotAt(out.slots, "differentiators[1]"))).toBe(JSON.stringify(GOOD_B));
    // and the rejected one really was replaced
    expect(getSlotAt(out.slots, "differentiators[0]")).toBe(GOOD_A);
  });
});

describe("the shared retry budget", () => {
  it("a GATE retry consumes the kind's retry — no judge retry follows", async () => {
    const seen: string[] = [];
    // attempt 1 breaks the cap (gate); the gate retry is clean on length but the judge rejects it.
    const generate: GenerateFn = (mode) => {
      seen.push(mode);
      if (mode === "initial") return Promise.resolve(posSlots(line("x".repeat(400), ["a1"])));
      return Promise.resolve(posSlots(line("a differentiator line of real length one", ["a1"])));
    };
    const j = judgeRejecting([["differentiators[0]"]]);   // the ONLY judge call rejects
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge: j.fn });
    expect(out.ok).toBe(false);
    expect(out.retry_used_by).toBe("gate");
    expect(seen).toEqual(["initial", "gate_retry"]);      // never a judge_retry
    expect(out.generator_calls).toBe(2);
    expect(out.retry_unavailable_reason).toMatch(/already spent by the gate failure/);
  });

  it("the deterministic gate runs BEFORE the judge — a capped slot costs no judge call", async () => {
    let judged = 0;
    const judge: JudgeFn = () => { judged++; return Promise.resolve({ slots: {} }); };
    const generate: GenerateFn = () => Promise.resolve(posSlots(line("x".repeat(400), ["a1"])));
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge });
    expect(out.ok).toBe(false);
    expect(judged).toBe(0);                                // both attempts died on length
    expect(out.attempts.every((a) => a.stage_reached === "deterministic")).toBe(true);
  });

  it("the retry output runs the FULL gate again, in order", async () => {
    // the gate retry fixes the length but invents a citation → caught deterministically, not by the judge
    let judged = 0;
    const judge: JudgeFn = () => { judged++; return Promise.resolve({ slots: {} }); };
    const generate: GenerateFn = (mode) =>
      Promise.resolve(mode === "initial"
        ? posSlots(line("x".repeat(400), ["a1"]))
        : posSlots(line("a differentiator line of real length one", ["NOT-A-SOURCE-REF"])));
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge });
    expect(out.ok).toBe(false);
    expect(judged).toBe(0);
    expect(out.violations.map((v) => v.kind)).toContain("unknown_citation");
  });

  it("a clean first attempt spends no retry at all", async () => {
    const generate: GenerateFn = () => Promise.resolve(posSlots());
    const j = judgeRejecting([[]]);
    const out = await runKind({ kind: "positioning", payload: PAYLOAD, generate, judge: j.fn });
    expect(out).toMatchObject({ ok: true, generator_calls: 1, retry_used_by: "none" });
    expect(out.attempts).toHaveLength(1);
  });
});

describe("spliceSlotAt", () => {
  it("replaces an indexed line and leaves every sibling identical", () => {
    const before = posSlots();
    const after = spliceSlotAt(before, "differentiators[1]", GOOD_A);
    expect(getSlotAt(after, "differentiators[0]")).toBe(GOOD_A);
    expect(getSlotAt(after, "differentiators[1]")).toBe(GOOD_A);
    expect(after.category_context).toBe(GOOD_CAT);
    expect(before.differentiators).toHaveLength(2);        // the input is never mutated
    expect(getSlotAt(before, "differentiators[1]")).toBe(GOOD_B);
  });
  it("replaces a scalar line", () => {
    const after = spliceSlotAt({ how_to_win_line: GOOD_A }, "how_to_win_line", GOOD_B);
    expect(after.how_to_win_line).toBe(GOOD_B);
  });
});

// ── VERBATIM SLOTS COST NO MODEL CALL (acceptance, 2026-10-05 fourth set) ───────────────────────
describe("the verbatim path", () => {
  const PAY = {
    market_category: "what the business is", market_category_citations: ["m1"],
    unique_attributes: [{ text: "x".repeat(133), citations: ["a1"] }, { text: "y".repeat(111), citations: ["b1"] }],
  };
  const verbatimSlots = {
    differentiators: [
      { text: "x".repeat(133), citations: ["a1"], path: "verbatim" },
      { text: "y".repeat(111), citations: ["b1"], path: "verbatim" },
    ],
    category_context: line("a category context line of real length", ["m1"]),
  };

  it("a <=140 source differentiator yields a byte-identical slot and is NEVER judged", async () => {
    let judged = 0;
    const judge: JudgeFn = (slots) => {
      judged++;
      // the judge only ever sees the category line as something it must rule on
      return Promise.resolve({ slots: { category_context: accept } });
    };
    const generate: GenerateFn = () => Promise.resolve(verbatimSlots);
    const out = await runKind({
      kind: "positioning", payload: PAY, generate, judge,
      verbatimPaths: ["differentiators[0]", "differentiators[1]"],
    });
    expect(out.ok).toBe(true);
    expect(out.generator_calls).toBe(1);
    // byte-identical to the source
    expect((getSlotAt(out.slots, "differentiators[0]") as { text: string }).text).toBe(PAY.unique_attributes[0].text);
    expect((getSlotAt(out.slots, "differentiators[1]") as { text: string }).text).toBe(PAY.unique_attributes[1].text);
    // accepted by construction, with the reason recorded rather than a judge verdict
    const d0 = out.per_slot.find((s) => s.field === "differentiators[0]")!;
    expect(d0.accepted).toBe(true);
    expect(d0.verdict?.reason).toMatch(/verbatim/);
    expect(judged).toBe(1);                       // one call, for the category line only
  });

  it("when EVERY slot is verbatim the judge is never called at all", async () => {
    // Only differentiators take the verbatim path in slice 1, so an all-verbatim kind cannot occur
    // on today's shapes — this pins the runGate branch for when one can.
    const CAT = "a market category of real length here";
    const payload = { ...PAY, market_category: CAT, market_category_citations: ["m1"] };
    let judged = 0;
    const judge: JudgeFn = () => { judged++; return Promise.resolve({ slots: {} }); };
    const generate: GenerateFn = () => Promise.resolve({
      differentiators: verbatimSlots.differentiators,
      category_context: { text: CAT, citations: ["m1"], path: "verbatim" },
    });
    const out = await runKind({
      kind: "positioning", payload, generate, judge,
      verbatimPaths: ["differentiators[0]", "differentiators[1]", "category_context"],
    });
    expect(judged).toBe(0);
    expect(out.violations).toEqual([]);
    expect(out.ok).toBe(true);
  });

  it("a >140 source differentiator goes through the GENERATOR path and IS judged", async () => {
    const LONGPAY = {
      ...PAY,
      unique_attributes: [{ text: "z".repeat(141), citations: ["a1"] }, { text: "y".repeat(111), citations: ["b1"] }],
    };
    let judgedPaths: string[] = [];
    const judge: JudgeFn = (slots) => {
      judgedPaths = ["differentiators[0]", "category_context"];
      return Promise.resolve({ slots: { "differentiators[0]": accept, category_context: accept } });
    };
    const generate: GenerateFn = () => Promise.resolve({
      differentiators: [
        line("a generated differentiator within the cap", ["a1"]),
        { text: "y".repeat(111), citations: ["b1"], path: "verbatim" },
      ],
      category_context: line("a category context line of real length", ["m1"]),
    });
    const out = await runKind({
      kind: "positioning", payload: LONGPAY, generate, judge,
      verbatimPaths: ["differentiators[1]"],         // only the SHORT one is copied
    });
    expect(out.ok).toBe(true);
    expect(judgedPaths).toContain("differentiators[0]");   // the long one was judged
    const d1 = out.per_slot.find((s) => s.field === "differentiators[1]")!;
    expect(d1.verdict?.reason).toMatch(/verbatim/);        // the short one was not
  });

  it("a verbatim slot is never the one re-asked after a judge rejection", async () => {
    const generate: GenerateFn = (mode, ctx) => {
      if (mode === "judge_retry") {
        expect(ctx.rejected?.map((r) => r.field)).toEqual(["category_context"]);  // never a differentiator
        return Promise.resolve({ fixes: { category_context: line("a better category context line", ["m1"]) } });
      }
      return Promise.resolve(verbatimSlots);
    };
    let call = 0;
    const judge: JudgeFn = () => {
      call++;
      return Promise.resolve({ slots: { category_context: call === 1 ? reject("too broad") : accept } });
    };
    const out = await runKind({
      kind: "positioning", payload: PAY, generate, judge,
      verbatimPaths: ["differentiators[0]", "differentiators[1]"],
    });
    expect(out.ok).toBe(true);
    expect(out.retry_used_by).toBe("judge");
  });
});
