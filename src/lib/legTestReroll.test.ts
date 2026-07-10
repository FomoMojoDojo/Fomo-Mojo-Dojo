// CH-0b — the leg-test re-roll declares itself.
//
// These tests pin the wiring law at the supabase boundary: (1) the per-leg
// origin-merge delete of generated test rows goes THROUGH the declared RPC
// (remove_tests_for_leg_reroll, actor 'generate-leg-tests') — never a raw
// tests delete; (2) an RPC refusal (the preserved-class floor) surfaces as an
// HONEST per-leg error while the other legs continue and totals count the
// failure; (3) operator-covered legs never reach the RPC at all.
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeLegTests } from "../../supabase/functions/_shared/legTestSynthesis.ts";

type RpcCall = { fn: string; params: Record<string, unknown> };

// Deterministic scripted Ollama: 14b returns a complete test derived from the
// condition; 70b keeps everything.
function stubOllama() {
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const content =
      body.model === "llama3:70b"
        ? JSON.stringify({ keep: true, reason: "ok" })
        : JSON.stringify({
            hypothesis: "families keep using the tool",
            expected_positive_signal: "weekly check-ins continue",
            expected_negative_signal: "logins stop after week one",
          });
    return { ok: true, json: async () => ({ message: { content } }) } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

// Fake supabase capturing the write boundary. `existing` seeds the tests-for-legs
// load; `refuseLegIds` makes the RPC raise for those legs (preserved-class floor).
function fakeDb(existing: Array<{ id: string; action_id: string; source?: string | null }>, refuseLegIds: string[] = []) {
  const rpcCalls: RpcCall[] = [];
  const inserts: Array<Record<string, unknown>> = [];
  const db = {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ in: async () => ({ data: existing }) }) }),
      insert: async (row: Record<string, unknown>) => {
        if (table !== "tests") throw new Error(`unexpected insert into ${table}`);
        inserts.push(row);
        return { error: null };
      },
      // The law: no raw delete of tests from this module. Reaching this throws.
      delete: () => {
        throw new Error("raw tests delete used — the re-roll must go through remove_tests_for_leg_reroll");
      },
    }),
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcCalls.push({ fn, params });
      const legIds = (params?.p_leg_ids as string[]) ?? [];
      if (legIds.some((id) => refuseLegIds.includes(id))) {
        return { error: { message: "leg re-roll cannot remove PRESERVED-CLASS tests (test-preservation law)" } };
      }
      return { data: legIds.length, error: null };
    },
  };
  return { db, rpcCalls, inserts };
}

const leg = (id: string) => ({
  id,
  move: `move ${id}`,
  condition: `condition ${id}`,
  route_title: "Route R",
  route_description: null,
});

const baseArgs = {
  companyId: "co-1",
  companyName: "Test Co",
  ollamaUrl: "http://127.0.0.1:11434/v1",
  nowIso: "2026-07-10T00:00:00Z",
  write: true,
};

describe("leg-test re-roll declares itself (CH-0b)", () => {
  it("re-rolls a leg's generated tests through the declared RPC — once per leg, actor 'generate-leg-tests', never a raw delete", async () => {
    stubOllama();
    const { db, rpcCalls, inserts } = fakeDb([
      { id: "t-old-1", action_id: "leg-1", source: "generate-leg-tests:2026-07-03" },
    ]);
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg("leg-1"), leg("leg-2")] });

    // leg-1 had a prior generated test → exactly one RPC call, correctly shaped.
    expect(rpcCalls).toEqual([
      { fn: "remove_tests_for_leg_reroll", params: { p_leg_ids: ["leg-1"], p_actor: "generate-leg-tests" } },
    ]);
    // leg-2 had nothing to re-roll → no RPC call, straight to insert.
    expect(inserts).toHaveLength(2);
    expect(perLeg.every((l) => l.written)).toBe(true);
  });

  it("an RPC refusal (preserved-class floor) is an honest per-leg error — no insert for that leg, other legs continue, totals count it", async () => {
    stubOllama();
    const { db, inserts } = fakeDb(
      [
        { id: "t-old-1", action_id: "leg-1", source: "generate-leg-tests:2026-07-03" },
        { id: "t-old-2", action_id: "leg-2", source: "generate-leg-tests:2026-07-03" },
      ],
      ["leg-1"], // leg-1 carries a preserved-class test → RPC refuses
    );
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg("leg-1"), leg("leg-2")] });

    const refused = perLeg.find((l) => l.leg_id === "leg-1");
    const survived = perLeg.find((l) => l.leg_id === "leg-2");
    expect(refused?.written).toBe(false);
    expect(refused?.error).toContain("PRESERVED-CLASS");
    expect(survived?.written).toBe(true);
    expect(survived?.error).toBeUndefined();
    // Only leg-2's fresh test was inserted — the refused leg's old test stands.
    expect(inserts).toHaveLength(1);
    expect(inserts[0].action_id).toBe("leg-2");
  });

  it("operator-covered legs are skipped upstream and never reach the RPC", async () => {
    stubOllama();
    const { db, rpcCalls, inserts } = fakeDb([
      { id: "t-op", action_id: "leg-1", source: "manual_inline" },
    ]);
    const perLeg = await synthesizeLegTests({ ...baseArgs, supabase: db as never, legs: [leg("leg-1")] });

    expect(rpcCalls).toHaveLength(0);
    expect(inserts).toHaveLength(0);
    expect(perLeg[0].preserved_operator).toBe(true);
  });
});
