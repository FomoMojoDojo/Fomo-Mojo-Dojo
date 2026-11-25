// ── SP-549: THE LEDGER RECORDS THE MODEL THAT ANSWERED, TAKEN FROM THE RESPONSE ──────────────────
//
// WHAT THIS COST. Brief 5 (2026-11-22) ran 31 pattern-generator calls on qwen3.6:35b and ledgered all
// 31 as `qwen2.5:14b-instruct`, because the name on the row came from the ROUTER'S LANE while an
// override chose the model inside the local caller. Nothing in the ledger could show it; ollama's own
// load log (33 qwen3.6:35b loads, 10 llama3:70b, zero qwen2.5 in the window) was the only witness.
// A name taken from the request can only repeat what the caller already believed.
//
// So the model is read off the RESPONSE. These cases are the shapes a response comes back in.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { servedModelFromOllama } from "./claimDeltaSynthesis.ts";
import { makeRoutedModel } from "./modelRouter.ts";

Deno.test("SP-549: the served model comes from the response, with the request as fallback only", () => {
  // the ordinary case: ollama echoes what answered
  assertEquals(servedModelFromOllama({ model: "qwen3.6:35b" }, "qwen2.5:14b-instruct"), "qwen3.6:35b");
  // the case that put 31 wrong names in the ledger — the response disagrees with the lane, and the
  // RESPONSE wins
  assertEquals(servedModelFromOllama({ model: "qwen3.6:35b", message: { content: "{}" } }, "qwen2.5:14b-instruct"), "qwen3.6:35b");
  // ollama's own tag resolution: a request without a tag comes back tagged
  assertEquals(servedModelFromOllama({ model: "llama3:70b" }, "llama3"), "llama3:70b");
  // a response that names NO model degrades to what was requested rather than ledgering an empty name
  assertEquals(servedModelFromOllama({}, "llama3:70b"), "llama3:70b");
  assertEquals(servedModelFromOllama({ model: "   " }, "llama3:70b"), "llama3:70b");
  assertEquals(servedModelFromOllama({ model: 42 }, "llama3:70b"), "llama3:70b");
  assertEquals(servedModelFromOllama(null, "llama3:70b"), "llama3:70b");
  // whitespace is trimmed, because the string becomes a ledger column
  assertEquals(servedModelFromOllama({ model: " qwen3.6:35b\n" }, "x"), "qwen3.6:35b");
});

Deno.test("SP-549: makeRoutedModel carries the served model out beside the lane's own", async () => {
  // a local caller that reports what answered: `model` stays the LANE's decision (that is what the
  // stamp means) and `servedModel` is what ran. The two differ exactly when an arm overrides the lane.
  const reporting = makeRoutedModel({
    callLocalGenerator: () => Promise.resolve({ content: "{}", servedModel: "qwen3.6:35b" }),
    callLocalJudge: () => Promise.resolve({ content: "{}", servedModel: "llama3:70b" }),
  });
  const gen = await reporting({ role: "generator", provenances: [null], system: "s", user: "u" });
  assertEquals(gen.model, "qwen2.5:14b-instruct");   // the lane's generator
  assertEquals(gen.servedModel, "qwen3.6:35b");      // what answered
  const judge = await reporting({ role: "judge", provenances: [null], system: "s", user: "u" });
  assertEquals(judge.model, "llama3:70b");
  assertEquals(judge.servedModel, "llama3:70b");

  // EVERY EXISTING CALLER STILL COMPILES AND STILL LEDGERS A NAME: a caller that returns the string
  // alone gets the lane's model as its served model, which is the behaviour it had before SP-549.
  const legacy = makeRoutedModel({
    callLocalGenerator: () => Promise.resolve("{}"),
    callLocalJudge: () => Promise.resolve("{}"),
  });
  const old = await legacy({ role: "generator", provenances: [null], system: "s", user: "u" });
  assertEquals(old.servedModel, "qwen2.5:14b-instruct");
});
