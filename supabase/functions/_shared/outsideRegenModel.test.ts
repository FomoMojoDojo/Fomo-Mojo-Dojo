// R4 (2026-10-18) — every model call on the regen path writes a ledger row. Fake transport, fake ledger.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  addToTally, callRegenModel, emptyTally, regenCallSite, regenGenerate, regenJudge, tallyingLedger,
  type RegenLedgerEntry, type RegenTransport,
} from "./outsideRegenModel.ts";
import { sha256Hex } from "./contentIdentity.ts";
import { OPENAI_PRICE_PER_MTOK } from "./modelPricing.ts";

const MODELS = ["gpt-4.1-mini", "gpt-4.1-nano"] as const;
const USAGE = { prompt_tokens: 10, completion_tokens: 5 };
const USD = (10 / 1e6) * OPENAI_PRICE_PER_MTOK.input + (5 / 1e6) * OPENAI_PRICE_PER_MTOK.output;

function okTransport(answer: unknown): RegenTransport {
  return () => Promise.resolve({ content: JSON.stringify(answer), usage: USAGE });
}
function memLedger() {
  const rows: RegenLedgerEntry[] = [];
  return { rows, ledger: (e: RegenLedgerEntry) => { rows.push(e); return Promise.resolve(true); } };
}

Deno.test("one page = generator + judge = EXACTLY two ledger rows, one per role, each priced and sha-stamped", async () => {
  const { rows, ledger } = memLedger();
  const gen = await regenGenerate({ system: "G", user: "PAGE", models: MODELS, transport: okTransport({ statements: ["a"] }), ledger });
  const jud = await regenJudge({ system: "J", user: "PAGE\n- a", models: MODELS, transport: okTransport({ verdicts: [] }), ledger });
  assertEquals(gen.model, "gpt-4.1-mini"); assertEquals(gen.attempt, 1); assertEquals(jud.attempt, 1);
  assertEquals(rows.length, 2, "rows per page");
  assertEquals(rows.map((r) => r.role), ["generator", "judge"]);
  assertEquals(rows.map((r) => r.callSite), ["extract-outside-evidence:generator", "extract-outside-evidence:judge"]);
  for (const r of rows) {
    assertEquals(r.usage.provider, "openai");
    assertEquals(r.usage.model, "gpt-4.1-mini");
    assertEquals(r.usage.prompt_tokens, 10); assertEquals(r.usage.completion_tokens, 5);
    assertEquals(r.usage.usd, USD, "usd is computed from usage, never null when usage came back");
    assert(/^[0-9a-f]{64}$/.test(r.promptSha), "prompt sha is 64 hex");
    assertEquals(r.attempt, 1);
  }
  assertEquals(rows[0].promptSha, await sha256Hex("G\n\nPAGE"), "the generator's own hash shape: system, blank line, user");
  assertEquals(regenCallSite("judge"), "extract-outside-evidence:judge");
});

Deno.test("nano fallback: mini fails ⇒ attempt 1 ledgered with NULL usage, nano answers ⇒ attempt 2 ledgered priced; the answer is nano's", async () => {
  const { rows, ledger } = memLedger();
  const transport: RegenTransport = ({ model }) =>
    model === "gpt-4.1-mini" ? Promise.reject(new Error("gpt-4.1-mini 500: upstream")) : Promise.resolve({ content: "{\"statements\":[\"x\"]}", usage: USAGE });
  const r = await regenGenerate({ system: "G", user: "P", models: MODELS, transport, ledger });
  assertEquals(r.model, "gpt-4.1-nano"); assertEquals(r.attempt, 2);
  assertEquals(rows.length, 2, "both attempts ledgered");
  assertEquals(rows[0].attempt, 1); assertEquals(rows[0].usage.model, "gpt-4.1-mini");
  assertEquals(rows[0].usage.usd, null, "a failed attempt costs an unknown amount — null, never 0");
  assertEquals(rows[0].usage.prompt_tokens, null);
  assertEquals(rows[1].attempt, 2); assertEquals(rows[1].usage.model, "gpt-4.1-nano"); assertEquals(rows[1].usage.usd, USD);
  assertEquals(rows[0].promptSha, rows[1].promptSha, "one prompt, one sha, two attempts");
});

Deno.test("LEDGER BEFORE PARSE: an un-parseable answer is still ledgered; both models failing ⇒ throws AFTER two rows", async () => {
  const { rows, ledger } = memLedger();
  const transport: RegenTransport = () => Promise.resolve({ content: "not json at all", usage: USAGE });
  await assertRejects(() => regenJudge({ system: "J", user: "P", models: MODELS, transport, ledger }), Error, "returned no JSON");
  assertEquals(rows.length, 2);
  assertEquals(rows.map((r) => r.attempt), [1, 2]);
  assert(rows.every((r) => r.usage.usd === USD), "the billed call is priced even though its answer was refused");
});

Deno.test("a transport that returns NO usage ledgers nulls (never zeros) — the row exists, the gap is visible", async () => {
  const { rows, ledger } = memLedger();
  const transport: RegenTransport = () => Promise.resolve({ content: "{}", usage: null });
  await callRegenModel({ role: "generator", system: "G", user: "P", models: MODELS, transport, ledger });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].usage.usd, null); assertEquals(rows[0].usage.prompt_tokens, null);
});

Deno.test("tally: the wrapper counts every entry by role, sums usd, and counts failed writes", async () => {
  const tally = emptyTally();
  let fail = false;
  const inner = (_e: RegenLedgerEntry) => Promise.resolve(!fail);
  const ledger = tallyingLedger(inner, tally);
  await regenGenerate({ system: "G", user: "P", models: MODELS, transport: okTransport({}), ledger });
  fail = true;
  await regenJudge({ system: "J", user: "P", models: MODELS, transport: okTransport({}), ledger });
  assertEquals(tally.generator, 1); assertEquals(tally.judge, 1);
  assertEquals(tally.usd, 2 * USD);
  assertEquals(tally.ledger_failed, 1, "a write recordModelCall reported false is counted, not hidden");
  // addToTally with a null-usd entry adds 0 to usd and still counts the role
  addToTally(tally, { role: "judge", callSite: "x", usage: { provider: "openai", model: "m", prompt_tokens: null, completion_tokens: null, usd: null }, attempt: 1, promptSha: "s" }, true);
  assertEquals(tally.judge, 2); assertEquals(tally.usd, 2 * USD);
});

Deno.test("SOURCE PIN: the function routes BOTH roles through this module, uses the shared transport, and the registry says captured", async () => {
  const fn = await Deno.readTextFile(new URL("../extract-outside-evidence/index.ts", import.meta.url));
  assert(fn.includes('from "../_shared/outsideRegenModel.ts"'), "function imports the module");
  assert(fn.includes("regenGenerate("), "generator goes through regenGenerate");
  assert(fn.includes("regenJudge("), "judge goes through regenJudge");
  assert(fn.includes("callOpenAIJson"), "the transport is the shared callOpenAIJson");
  assert(fn.includes("recordModelCall("), "the ledger is recordModelCall");
  assert(!fn.includes("api.openai.com"), "no raw fetch to OpenAI remains in the function");
  assert(fn.includes("model_calls: tally"), "the integrity row carries the per-run tally");
  const reg = await Deno.readTextFile(new URL("./modelCallSites.ts", import.meta.url));
  const line = reg.split("\n").find((l) => l.includes('site: "extract-outside-evidence"')) ?? "";
  assert(line.includes("captured: true"), `registry line says captured: true — got: ${line.trim()}`);
});
