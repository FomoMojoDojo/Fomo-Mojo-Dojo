// Ruling 1 (2026-10-22): own-words selection within the existing cap takes the seed host first, then each related host in
// effect, round-robin; with no host order (no confirmed entity) the selection is the original one, byte-identical.
// Ruling 2: each model is ledgered at its own signed price — gpt-4.1 is never priced as gpt-4.1-mini.
import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectOwnWords, type SelOwnWord } from "./publicReadSelection.ts";
import { openaiRecordsByModel } from "./recordModelCall.ts";

const row = (i: number, host: string, day: string): SelOwnWord & { source_url: string } => ({ id: `${host}-${String(i).padStart(2, "0")}`, quote: `q ${host} ${i}`, judge_kind: null, content_identity: `ci-${host}-${i}`, created_at: `2026-10-${day}T00:00:00Z`, source_url: `https://www.${host}/p${i}` });
const cox = Array.from({ length: 30 }, (_, i) => row(i, "cox.com", "20"));
const spec = Array.from({ length: 8 }, (_, i) => row(i, "spectrum.com", "21"));
const char = Array.from({ length: 4 }, (_, i) => row(i, "corporate.charter.com", "21"));
const all = [...cox, ...spec, ...char];
const active = new Set(all.map((r) => r.content_identity!));
const ok = () => true;

Deno.test("no host order ⇒ the original selection (oldest first) — byte-identical", () => {
  const a = selectOwnWords(all, 25, active, ok), b = selectOwnWords(all, 25, active, ok, null);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assertEquals(a.kept.every((w) => w.id.startsWith("cox.com")), true, "the cap is spent on the 25 oldest cox rows");
});

Deno.test("host order ⇒ seed first, then each related host, round-robin within the same cap", () => {
  const r = selectOwnWords(all, 25, active, ok, { seed: "spectrum.com", related: ["charter.com", "cox.com"] });
  assertEquals(r.kept.length, 25);
  assertEquals(r.kept.slice(0, 3).map((w) => w.id), ["spectrum.com-00", "corporate.charter.com-00", "cox.com-00"]);
  const n = (h: string) => r.kept.filter((w) => w.id.startsWith(h)).length;
  assertEquals([n("spectrum.com"), n("corporate.charter.com"), n("cox.com")], [8, 4, 13]);
  assertEquals(r.dropped.filter((d) => d.reason === "over_cap").length, 17);
});

Deno.test("ruling 2: per-model records at the signed rates — gpt-4.1 $2/$8, gpt-4.1-mini $0.40/$1.60", () => {
  const recs = openaiRecordsByModel(new Map([["gpt-4.1", { prompt_tokens: 1_000_000, completion_tokens: 100_000 }], ["gpt-4.1-mini", { prompt_tokens: 1_000_000, completion_tokens: 100_000 }]]));
  assertAlmostEquals(recs.find((r) => r.model === "gpt-4.1")!.usd!, 2.8, 1e-9);
  assertAlmostEquals(recs.find((r) => r.model === "gpt-4.1-mini")!.usd!, 0.56, 1e-9);
  assert(recs.every((r) => r.provider === "openai"));
});
