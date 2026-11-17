// O1: the own-words plan resumes across calls (supabase/functions/extract-own-words, _shared/ownWordsExtract.ts).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
// O1 (2026-11-17): a plan run RESUMES — pages already planned under its run_id are never redone, and a
// call returns inside the gateway's wall instead of being cut.
import { PLAN_WALL_MS, remainingPlanUrls } from "./ownWordsExtract.ts";
Deno.test("O1: a resumed plan does only the pages not yet planned under its run_id, in order", () => {
  const urls = ["https://a/1", "https://a/2", "https://a/3", "https://a/4"];
  assertEquals(remainingPlanUrls(urls, ["https://a/2", "https://a/4"]), ["https://a/1", "https://a/3"]);
  assertEquals(remainingPlanUrls(urls, []), urls);
  assertEquals(remainingPlanUrls(urls, urls), []);
});
Deno.test("O1: the plan's wall leaves room for one more page inside the gateway's 150 s", () => {
  assertEquals(PLAN_WALL_MS <= 110_000, true);
});
Deno.test("O1: the function applies the resume and the wall (source)", async () => {
  const src = await Deno.readTextFile(new URL("../extract-own-words/index.ts", import.meta.url));
  assertEquals(src.includes("urls = remainingPlanUrls(urls, planned);"), true);
  assertEquals(src.includes("const WALL_MS = PLAN_WALL_MS;"), true);
});
