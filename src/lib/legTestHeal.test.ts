// HEAL — a deficiency-caused leg-test decline SELF-HEALS (operator ruling 2026-07-22).
//
// These tests pin the behavior at the supabase boundary: when the honesty judge declines
// a test AND the source condition is itself indicted by the CG-1 deficiency judge, the
// system rewrites that ONE condition (surgical, hardened path), rebinds the leg, and
// retries the test ONCE — bounded. Any other decline reason → stamp and stop. Sibling
// conditions and their tests are byte-intact by construction.
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeLegTests } from "../../supabase/functions/_shared/legTestSynthesis.ts";
import { contentIdentity } from "../../supabase/functions/_shared/contentIdentity.ts";

const SOURCE = "Users encounter frequent problems finding what they need.";
const HEALED = "Users can quickly find what they need with clear guidance.";
const SIBLING = "Teams can agree on what a good outcome looks like.";
const POS_HYP = "Clear guidance helps users find what they need."; // positive test hypothesis
const DEF_HYP = "Users keep hitting problems finding what they need."; // deficiency test hypothesis

// Content-routed Ollama stub. Each pass supplies the four decision points; the router
// dispatches by system-prompt signature and (where it matters) the condition/hypothesis
// text carried in the user message, so a retry that sees the HEALED condition can be
// judged differently from the first attempt on the SOURCE condition.
type Script = {
  genTest: (user: string) => { hypothesis: string; expected_positive_signal: string; expected_negative_signal: string };
  judgeTest: (user: string) => { keep: boolean; reason: string };
  judgeCondition: (user: string) => { keep: boolean; reason: string };
  revise: (user: string) => string;
};
function stub(script: Script) {
  const calls = { genTest: 0, judgeTest: 0, judgeCondition: 0, revise: 0 };
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const sys = String(body.messages?.[0]?.content ?? "");
    const user = String(body.messages?.[1]?.content ?? "");
    let content = "{}";
    if (body.model !== "llama3:70b") {
      if (sys.includes("REVISE a single strategic CONDITION")) { calls.revise++; content = JSON.stringify({ condition: script.revise(user) }); }
      else { calls.genTest++; content = JSON.stringify(script.genTest(user)); }
    } else {
      if (sys.includes("belief-only TEST")) { calls.judgeTest++; content = JSON.stringify(script.judgeTest(user)); }
      else { calls.judgeCondition++; content = JSON.stringify(script.judgeCondition(user)); }
    }
    return { ok: true, json: async () => ({ message: { content } }) } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

// Fake supabase capturing every write; serves the route's wwhtbt for the surgical reconcile.
function fakeDb(routeWwt: Array<Record<string, unknown>>) {
  const inserts: Record<string, Array<Record<string, unknown>>> = { tests: [], condition_removals: [] };
  const updates: Array<{ table: string; id: unknown; payload: Record<string, unknown> }> = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, _v: unknown) => ({
          in: async () => ({ data: [] }), // no existing tests → no reroll
          maybeSingle: async () => ({ data: table === "routes" ? { what_would_have_to_be_true: routeWwt } : null }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => { (inserts[table] ??= []).push(row); return { error: null }; },
      update: (payload: Record<string, unknown>) => ({ eq: async (_c: string, id: unknown) => { updates.push({ table, id, payload }); return { error: null }; } }),
      delete: () => { throw new Error("raw delete forbidden"); },
    }),
    rpc: async () => ({ data: 0, error: null }),
  };
  return { db, inserts, updates };
}

const leg = () => ({
  id: "leg-1",
  move: "Watch how people search over a month.",
  condition: SOURCE,
  route_id: "route-1",
  route_title: "Make it easier to find things",
  route_description: null as string | null,
  wwhtbt: [{ condition: SOURCE, satisfied_flag: false, leg_class: "test" }],
});
const routeWwt = () => [
  { source: "generate-route-conditions:2026-07-22", condition: SOURCE, satisfied_flag: false },
  { source: "generate-route-conditions:2026-07-22", condition: SIBLING, satisfied_flag: false },
];
const baseArgs = { companyId: "co-1", companyName: "Test Co", ollamaUrl: "http://127.0.0.1:11434/v1", nowIso: "2026-07-22T00:00:00Z", write: true };

describe("leg-test self-heal on deficiency-caused decline (operator ruling 2026-07-22)", () => {
  it("HEALS: rewrites the source condition, rebinds the leg, retries — a passing test lands, no decline stamp", async () => {
    const calls = stub({
      genTest: (user) => user.includes(HEALED)
        ? { hypothesis: POS_HYP, expected_positive_signal: "more people find it fast", expected_negative_signal: "searches still fail" }
        : { hypothesis: DEF_HYP, expected_positive_signal: "fewer complaints", expected_negative_signal: "complaints persist" },
      judgeTest: (user) => user.includes(POS_HYP) ? { keep: true, reason: "ok" } : { keep: false, reason: "deficiency-as-the-bet" },
      judgeCondition: (user) => user.includes(HEALED) ? { keep: true, reason: "Meets all criteria" } : { keep: false, reason: "DEFICIENCY-AS-THE-CONDITION" },
      revise: () => HEALED,
    });
    const { db, inserts, updates } = fakeDb(routeWwt());
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg()] });

    // A test was written; no decline stamp on the leg.
    expect(perLeg[0].written).toBe(true);
    expect(inserts.tests).toHaveLength(1);
    expect(inserts.tests[0].hypothesis).toBe(POS_HYP);
    const legStamp = updates.filter((u) => u.id === "leg-1" && "what_would_have_to_be_true" in u.payload);
    const lastLeg = legStamp.at(-1)?.payload.what_would_have_to_be_true as Array<Record<string, unknown>>;
    expect(lastLeg[0].test_declined).toBeUndefined();      // never stamped declined
    expect(lastLeg[0].condition).toBe(HEALED);             // rebound in place

    // Surgical audit with AUTO-HEAL provenance.
    expect(inserts.condition_removals).toHaveLength(1);
    const audit = inserts.condition_removals[0];
    expect(audit.reason).toBe("condition_auto_healed");
    expect(audit.actor).toBe("generate-leg-tests:auto-heal");
    expect(audit.affected_leg_ids).toEqual(["leg-1"]);
    expect(audit.condition_identity).toBe(await contentIdentity(SOURCE));

    // Bounded: exactly one retry — the leg-test judge ran twice total (initial + one retry).
    expect(calls.judgeTest).toBe(2);
    expect(calls.revise).toBe(1);
  });

  it("SIBLING byte-intact: only the matching condition element is replaced on the route", async () => {
    stub({
      genTest: (user) => user.includes(HEALED)
        ? { hypothesis: POS_HYP, expected_positive_signal: "a", expected_negative_signal: "b" }
        : { hypothesis: DEF_HYP, expected_positive_signal: "a", expected_negative_signal: "b" },
      judgeTest: (user) => user.includes(POS_HYP) ? { keep: true, reason: "ok" } : { keep: false, reason: "deficiency-as-the-bet" },
      judgeCondition: (user) => user.includes(HEALED) ? { keep: true, reason: "ok" } : { keep: false, reason: "deficiency" },
      revise: () => HEALED,
    });
    const before = routeWwt();
    const { db, updates } = fakeDb(before);
    await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg()] });

    const routeUpdate = updates.find((u) => u.table === "routes" && u.id === "route-1" && "what_would_have_to_be_true" in u.payload);
    const after = routeUpdate!.payload.what_would_have_to_be_true as Array<Record<string, unknown>>;
    expect(after[0].condition).toBe(HEALED);               // index 0 healed
    expect(after[1]).toEqual(before[1]);                   // sibling byte-intact
    expect(after[1].condition).toBe(SIBLING);
  });

  it("does NOT heal a non-deficiency decline: no rewrite, no audit, original reason stamped", async () => {
    const calls = stub({
      genTest: () => ({ hypothesis: DEF_HYP, expected_positive_signal: "a", expected_negative_signal: "b" }),
      judgeTest: () => ({ keep: false, reason: "fabricated — invents numbers not grounded in the move" }),
      judgeCondition: () => ({ keep: false, reason: "DEFICIENCY-AS-THE-CONDITION" }), // would fire, but (a) gate blocks
      revise: () => HEALED,
    });
    const { db, inserts, updates } = fakeDb(routeWwt());
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg()] });

    expect(perLeg[0].written).toBe(false);
    expect(inserts.tests).toHaveLength(0);
    expect(inserts.condition_removals).toHaveLength(0);    // no heal
    expect(calls.revise).toBe(0);
    expect(calls.judgeCondition).toBe(0);                  // (a) short-circuits before (b) is consulted
    const stamp = updates.find((u) => u.id === "leg-1")!.payload.what_would_have_to_be_true as Array<Record<string, unknown>>;
    expect(stamp[0].test_declined).toBe(true);
    expect(stamp[0].test_declined_reason).toContain("fabricated");
    expect(stamp[0].test_declined_retry_reason).toBeUndefined(); // no retry happened
  });

  it("BOUNDED: heal fires, condition rewritten, but the retried test is ALSO declined → final stamp with BOTH reasons, no loop", async () => {
    const calls = stub({
      genTest: (user) => user.includes(HEALED)
        ? { hypothesis: POS_HYP, expected_positive_signal: "a", expected_negative_signal: "b" }
        : { hypothesis: DEF_HYP, expected_positive_signal: "a", expected_negative_signal: "b" },
      // Every leg-test judgment declines — the first as deficiency, the retry for polarity.
      judgeTest: (user) => user.includes(POS_HYP) ? { keep: false, reason: "polarity — positive signal points at the problem" } : { keep: false, reason: "deficiency-as-the-bet" },
      judgeCondition: (user) => user.includes(HEALED) ? { keep: true, reason: "ok" } : { keep: false, reason: "deficiency-as-the-condition" },
      revise: () => HEALED,
    });
    const { db, inserts, updates } = fakeDb(routeWwt());
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg()] });

    expect(perLeg[0].written).toBe(false);
    expect(inserts.tests).toHaveLength(0);
    expect(inserts.condition_removals).toHaveLength(1);    // the heal DID rewrite the condition
    // Bounded: exactly ONE retry — the leg-test judge ran twice (initial + retry), never more.
    expect(calls.judgeTest).toBe(2);
    const stamp = updates.find((u) => u.id === "leg-1" && (u.payload.what_would_have_to_be_true as Array<Record<string, unknown>>)[0].test_declined)!
      .payload.what_would_have_to_be_true as Array<Record<string, unknown>>;
    expect(stamp[0].test_declined_reason).toBe("deficiency-as-the-bet");                 // original, verbatim
    expect(stamp[0].test_declined_retry_reason).toBe("polarity — positive signal points at the problem"); // retry, verbatim
  });
});
