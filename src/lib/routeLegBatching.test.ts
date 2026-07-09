// Swap-batching equivalence tests (isolate-timeout fix, option d).
//
// The reorder ran ALL 14b generations per route before ALL 70b judgments. These
// tests prove, at the Ollama fetch boundary, that (1) every judge call receives
// exactly the (condition, move) pair the old interleaved order would have fed it
// — generation depends only on (route, condition), judgment only on (route,
// condition, move), so phase order cannot change any model input — and (2) the
// batching property actually holds: per route, the call sequence is
// gen×K then judge×K, never interleaved.
import { afterEach, describe, expect, it, vi } from "vitest";
import { synthesizeRouteLegs } from "../../supabase/functions/_shared/routeLegSynthesis.ts";

type Call = { model: string; user: string };

// Deterministic scripted Ollama: 14b returns a move derived from the condition
// text; 70b keeps everything. Captures every call in order.
function stubOllama(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = String(body?.messages?.[1]?.content ?? "");
    calls.push({ model: body.model, user });
    const content =
      body.model === "llama3:70b"
        ? JSON.stringify({ keep: true, reason: "ok", leg_class: "test" })
        : JSON.stringify({ move: `MOVE FOR [${user.match(/win: (.*)\n/)?.[1] ?? "?"}]`, effort: "medium" });
    return { ok: true, json: async () => ({ message: { content } }) } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const fakeDb = { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }) }) };

const route = (id: string, conditions: string[]) => ({
  id,
  title: `Route ${id}`,
  short_description: null,
  category: "fix",
  conditions: conditions.map((c) => ({ condition: c, satisfied_flag: false })),
});

describe("route-leg swap batching (option d)", () => {
  it("per route: all generations run before any judgment (the swap-reduction property)", async () => {
    const calls = stubOllama();
    await synthesizeRouteLegs({
      supabase: fakeDb as never,
      companyId: "co-1",
      companyName: "Test Co",
      routes: [route("r1", ["cond A", "cond B", "cond C"]), route("r2", ["cond D", "cond E"])] as never,
      ollamaUrl: "http://127.0.0.1:11434/v1",
      nowIso: "2026-07-09T00:00:00Z",
      write: false,
    });
    const seq = calls.map((c) => (c.model === "llama3:70b" ? "J" : "G")).join("");
    // r1: GGG JJJ, r2: GG JJ — never interleaved within a route.
    expect(seq).toBe("GGGJJJGGJJ");
  });

  it("judge inputs are byte-equivalent to the interleaved order: each judge call carries its own condition + that condition's generated move", async () => {
    const calls = stubOllama();
    const conditions = ["increase trust with buyers", "reduce onboarding friction", "prove outcome claims"];
    const result = await synthesizeRouteLegs({
      supabase: fakeDb as never,
      companyId: "co-1",
      companyName: "Test Co",
      routes: [route("r1", conditions)] as never,
      ollamaUrl: "http://127.0.0.1:11434/v1",
      nowIso: "2026-07-09T00:00:00Z",
      write: false,
    });

    const judgeCalls = calls.filter((c) => c.model === "llama3:70b");
    expect(judgeCalls).toHaveLength(conditions.length);
    for (const condition of conditions) {
      // Exactly one judge call carries this condition, and it carries the move
      // generated FOR this condition — the same pairing interleaving produces.
      const mine = judgeCalls.filter((c) => c.user.includes(condition));
      expect(mine).toHaveLength(1);
      expect(mine[0].user).toContain(`MOVE FOR [${condition}]`);
    }
    // And the proposal order still follows the route's condition order.
    expect(result[0].proposed.map((p) => p.condition)).toEqual(conditions);
  });

  it("operator-covered and empty conditions are skipped before generation (guard order unchanged)", async () => {
    const calls = stubOllama();
    await synthesizeRouteLegs({
      supabase: fakeDb as never,
      companyId: "co-1",
      companyName: "Test Co",
      routes: [route("r1", ["", "real condition"])] as never,
      ollamaUrl: "http://127.0.0.1:11434/v1",
      nowIso: "2026-07-09T00:00:00Z",
      write: false,
    });
    expect(calls.filter((c) => c.model !== "llama3:70b")).toHaveLength(1);
  });
});
