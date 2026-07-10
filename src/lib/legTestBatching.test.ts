// CH-1 — leg-test swap-batching equivalence tests (mirrors routeLegBatching).
//
// synthesizeLegTests now runs ALL 14b generations for a chunk before ALL 70b
// judgments. These tests prove, at the Ollama fetch boundary, that (1) every
// judge call receives exactly the (leg, generated test) pair the old
// interleaved order would have fed it — generation depends only on the leg
// (+its route grounding), judgment only on (leg, generated test), so phase
// order cannot change any model input — and (2) the batching property holds:
// the call sequence is gen×K then judge×K, never interleaved. Operator-covered
// legs still skip generation entirely, and the returned outcomes keep the
// caller's leg order.
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeLegTests } from "../../supabase/functions/_shared/legTestSynthesis.ts";

type Call = { model: string; user: string };

// Deterministic scripted Ollama: 14b returns a test derived from the leg's
// condition text; 70b keeps everything. Captures every call in order.
function stubOllama(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = String(body?.messages?.[1]?.content ?? "");
    calls.push({ model: body.model, user });
    const content =
      body.model === "llama3:70b"
        ? JSON.stringify({ keep: true, reason: "ok" })
        : JSON.stringify({
            hypothesis: `HYP FOR [${user.match(/reads as a problem\): (.*)\n/)?.[1] ?? "?"}]`,
            expected_positive_signal: "families keep showing up",
            expected_negative_signal: "families stop showing up",
          });
    return { ok: true, json: async () => ({ message: { content } }) } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

function fakeDb(existing: Array<{ id: string; action_id: string; source?: string | null }> = []) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: existing }) }) }),
      insert: async () => ({ error: null }),
      delete: () => {
        throw new Error("raw tests delete used — the re-roll must go through remove_tests_for_leg_reroll");
      },
    }),
    rpc: async () => ({ data: 0, error: null }),
  };
}

const leg = (id: string, condition: string) => ({
  id,
  move: `move for ${id}`,
  condition,
  route_title: "Route R",
  route_description: null,
});

const baseArgs = {
  companyId: "co-1",
  companyName: "Test Co",
  ollamaUrl: "http://127.0.0.1:11434/v1",
  nowIso: "2026-07-10T00:00:00Z",
  write: false,
};

describe("leg-test swap batching (CH-1)", () => {
  it("all generations run before any judgment (the swap-reduction property)", async () => {
    const calls = stubOllama();
    await synthesizeLegTests({
      ...baseArgs,
      supabase: fakeDb() as never,
      legs: [leg("l1", "cond A"), leg("l2", "cond B"), leg("l3", "cond C")],
    });
    const seq = calls.map((c) => (c.model === "llama3:70b" ? "J" : "G")).join("");
    expect(seq).toBe("GGGJJJ");
  });

  it("judge inputs are byte-equivalent to the interleaved order: each judge call carries its own leg's condition + THAT leg's generated hypothesis", async () => {
    const calls = stubOllama();
    const conditions = ["families trust the intake", "criteria are clear to families", "the pilot retains families"];
    const perLeg = await synthesizeLegTests({
      ...baseArgs,
      supabase: fakeDb() as never,
      legs: conditions.map((c, i) => leg(`l${i + 1}`, c)),
    });

    const judgeCalls = calls.filter((c) => c.model === "llama3:70b");
    expect(judgeCalls).toHaveLength(conditions.length);
    for (const condition of conditions) {
      // Exactly one judge call carries this condition, and it carries the
      // hypothesis generated FOR this condition — the same pairing the
      // interleaved order produces.
      const mine = judgeCalls.filter((c) => c.user.includes(`Condition: ${condition}`));
      expect(mine).toHaveLength(1);
      expect(mine[0].user).toContain(`HYP FOR [${condition}]`);
    }
    // And the outcomes keep the caller's leg order.
    expect(perLeg.map((l) => l.leg_id)).toEqual(["l1", "l2", "l3"]);
  });

  it("operator-covered legs skip generation entirely and keep their position in the returned order", async () => {
    const calls = stubOllama();
    const perLeg = await synthesizeLegTests({
      ...baseArgs,
      write: true, // operator-skip reads existing tests only in write mode
      supabase: fakeDb([{ id: "t-op", action_id: "l2", source: "manual_inline" }]) as never,
      legs: [leg("l1", "cond A"), leg("l2", "cond B"), leg("l3", "cond C")],
    });
    // No generation for l2; sequence still batched for the rest.
    const seq = calls.map((c) => (c.model === "llama3:70b" ? "J" : "G")).join("");
    expect(seq).toBe("GGJJ");
    expect(perLeg.map((l) => l.leg_id)).toEqual(["l1", "l2", "l3"]);
    expect(perLeg[1].preserved_operator).toBe(true);
  });
});
