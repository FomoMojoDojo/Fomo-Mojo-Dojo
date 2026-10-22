// Ruling 10 (2026-10-22) — per-run search topics for a domain plan. Pure: no I/O, no model, no HTTP.
//   T1  topics passed ⇒ the built domain prompt carries them as a numbered list (and the sha therefore moves)
//   T2  no topics ⇒ the domain prompt is byte-identical to the no-topics build (the snapshot test pins that build)
//   T3  a topic over MAX_TOPIC_CHARS, a blank, a duplicate, a newline, a non-array, too many ⇒ refused
//   T4  an unknown body key is still refused (public-baseline and the wrapper), including a misspelled topics key
//   T5  topics on a run that would not use them (name-only, seed_lane_only, openai) ⇒ refused
//   T6  wiring: both handlers refuse unknown keys and parse topics before work; the main call passes them; the ledger records
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BASELINE_BODY_KEYS, domainTopicsBlock, MAX_TOPIC_CHARS, MAX_TOPICS, numberedIntents, parseSearchTopics, RESEARCH_BODY_KEYS, SEARCH_TOPICS_KEY, topicsRefusalForRun } from "./searchTopics.ts";
import { buildNameOnlyBrief, claudeWebSearchPrompt } from "./nameOnlyLane.ts";
import { unknownBodyKeys } from "./bodyMode.ts";
import { promptShaOf } from "./webSearchLedger.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const BASE = { companyName: "Acme Broadband", website: "https://acme.example", domain: "acme.example", schemaHint: "{}" };
const TOPICS = ["Acme 10-K 2025 broadband subscribers", "Acme fixed wireless competition 2026"];

Deno.test("T1 topics passed ⇒ the domain prompt carries each as a numbered search intent; the prompt sha moves", async () => {
  const p = claudeWebSearchPrompt({ ...BASE, searchTopics: TOPICS });
  assert(p.includes("1. Acme 10-K 2025 broadband subscribers\n2. Acme fixed wireless competition 2026\n"), "numbered list in the prompt");
  assert(p.includes(domainTopicsBlock(TOPICS)), "the one block builder");
  assert(await promptShaOf(p) !== await promptShaOf(claudeWebSearchPrompt(BASE)), "the topics are inside the prompt sha");
});
Deno.test("T2 no topics (absent, null, empty) ⇒ the domain prompt is byte-identical", () => {
  const base = claudeWebSearchPrompt(BASE);
  assertEquals(claudeWebSearchPrompt({ ...BASE, searchTopics: null }), base);
  assertEquals(claudeWebSearchPrompt({ ...BASE, searchTopics: [] }), base);
  assertEquals(domainTopicsBlock(null), "");
});
Deno.test("T2b the numbered shape is the name-only brief's — one shape for both", () => {
  assertEquals(numberedIntents(["a", "b"]), "1. a\n2. b");
  const plan = { queryA: "x", queryB: "y" } as never;
  assertEquals(buildNameOnlyBrief(plan), numberedIntents(["x", "y"]));
  // a name-only prompt never carries the domain topics block
  const nameOnly = claudeWebSearchPrompt({ ...BASE, nameOnlyBrief: "1. q", searchTopics: TOPICS });
  assert(!nameOnly.includes("Also run each of these search topics"), "topics are domain-only");
});
Deno.test("T3 refused: over the length limit, blank, duplicate, newline, non-string, non-array, empty, too many", () => {
  assertEquals(parseSearchTopics(undefined), { ok: true, topics: null });
  assertEquals(parseSearchTopics(["  a topic  "]), { ok: true, topics: ["a topic"] });
  assertEquals(parseSearchTopics(["x".repeat(MAX_TOPIC_CHARS)]).ok, true);
  for (const bad of [["x".repeat(MAX_TOPIC_CHARS + 1)], ["  "], ["a", "A"], ["line\nbreak"], [7], "a topic", null, [], Array.from({ length: MAX_TOPICS + 1 }, (_, i) => `t${i}`)]) {
    const v = parseSearchTopics(bad);
    assertEquals(v.ok, false, JSON.stringify(bad));
  }
  const long = parseSearchTopics(["x".repeat(MAX_TOPIC_CHARS + 1)]);
  assert(!long.ok && /max 160/.test(long.detail), "the refusal names the limit");
});
Deno.test("T4 an unknown body key is still refused — including a misspelled topics key", () => {
  assertEquals(unknownBodyKeys({ company_id: "c", search_topics: TOPICS, spend_cap_usd: 2.25 }, BASELINE_BODY_KEYS), []);
  assertEquals(unknownBodyKeys({ company_id: "c", search_topic: TOPICS }, BASELINE_BODY_KEYS), ["search_topic"]);
  assertEquals(unknownBodyKeys({ company_id: "c", topics: TOPICS }, RESEARCH_BODY_KEYS), ["topics"]);
  assert(BASELINE_BODY_KEYS.includes(SEARCH_TOPICS_KEY) && RESEARCH_BODY_KEYS.includes(SEARCH_TOPICS_KEY));
});
Deno.test("T5 topics on a run that would not put them in a prompt are refused, naming why", () => {
  assertEquals(topicsRefusalForRun(TOPICS, { planKind: "domain", seedLaneOnly: false, engine: "claude_websearch" }), null);
  assertEquals(topicsRefusalForRun(null, { planKind: "name_only", seedLaneOnly: true, engine: "openai" }), null);
  assert(topicsRefusalForRun(TOPICS, { planKind: "name_only", seedLaneOnly: false, engine: "claude_websearch" }));
  assert(topicsRefusalForRun(TOPICS, { planKind: "domain", seedLaneOnly: true, engine: "claude_websearch" }));
  assert(topicsRefusalForRun(TOPICS, { planKind: "domain", seedLaneOnly: false, engine: "openai" }));
});
Deno.test("T6 wiring: both handlers refuse unknown keys and bad topics before work; the main call and the ledger carry them", async () => {
  const pb = await read("../public-baseline/index.ts");
  const early = pb.indexOf("unknownBodyKeys(body, BASELINE_BODY_KEYS)");
  assert(early > 0 && early < pb.indexOf("FROZEN_COMPANY_IDS.has(company_id)"), "public-baseline refuses unknown keys before any work");
  assert(pb.indexOf("parseSearchTopics(body.search_topics)") > 0 && pb.indexOf("parseSearchTopics(body.search_topics)") < pb.indexOf("FROZEN_COMPANY_IDS.has(company_id)"), "and parses topics before any work");
  assert(/topicsRefusalForRun\(searchTopics, \{ planKind, seedLaneOnly: false, engine: synthesis_engine \}\)/.test(pb), "refused on a plan that would not use them");
  assert(/topicsRefusalForRun\(searchTopics, \{ planKind: "domain", seedLaneOnly: true/.test(pb), "and on the seed lane");
  assert(pb.includes("if (searchTopics) runLedger.search_topics = searchTopics;"), "recorded on the run ledger");
  assert(pb.includes("...(searchTopics ? { searchTopics } : {}),"), "the main web_search call passes them");
  assert(pb.includes("...(opts.searchTopics?.length ? { searchTopics: opts.searchTopics } : {}) });"), "into the one prompt builder");
  const w = await read("../run-public-research/index.ts");
  assert(w.includes("unknownBodyKeys(body, RESEARCH_BODY_KEYS)") && w.includes("parseSearchTopics(body.search_topics)"), "the wrapper validates");
  assert(/body: stageInput,/.test(w) && /search_topics: topicsVerdict\.topics/.test(w), "and forwards the topics as sent");
});
