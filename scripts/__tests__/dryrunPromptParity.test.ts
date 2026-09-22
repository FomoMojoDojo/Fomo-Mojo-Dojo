// The dry-run tool inlines three prompts it must not own (2026-09-22). It cannot import their modules —
// those take a supabase handle and carry .from(...) calls, and the tool's whole claim is that its module
// graph cannot write. So each copy is pinned here against the ONE source of truth, byte for byte. A drift
// in either direction is red: the tool would then be judging with a prompt the pipeline no longer uses,
// and every dry-run verdict the operator reads would be about a criterion that does not exist.
//
// Plant: change one word in any inlined prompt (or in its source) → the matching assertion fails.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BUYER_SYSTEM, REFRAME_SYSTEM, SAME_MARKET_CRITERION, SAME_MARKET_SYSTEM } from "../dryrun-market-criterion.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

/** Pull a `const NAME = "..." + "...";` string-concat literal out of a source file and evaluate it. */
function literalOf(src: string, name: string): string {
  const at = src.indexOf(`export const ${name} =`);
  const from = at >= 0 ? at : src.indexOf(`const ${name} =`);
  assert(from >= 0, `${name} not found in source`);
  const end = src.indexOf(";\n", from);
  const body = src.slice(src.indexOf("=", from) + 1, end);
  return Function(`"use strict"; return (${body.replace(/\bSAME_MARKET_CRITERION\b/g, JSON.stringify(SAME_MARKET_CRITERION))});`)() as string;
}

Deno.test("the reframe prompt matches marketPortfolioDiscovery.ts byte for byte", async () => {
  const src = await read("../../supabase/functions/_shared/marketPortfolioDiscovery.ts");
  assertEquals(REFRAME_SYSTEM, literalOf(src, "REFRAME_SYSTEM"));
});

Deno.test("the same-market criterion and system prompt match marketPortfolioDiscovery.ts byte for byte", async () => {
  const src = await read("../../supabase/functions/_shared/marketPortfolioDiscovery.ts");
  assertEquals(SAME_MARKET_CRITERION, literalOf(src, "SAME_MARKET_CRITERION"));
  assertEquals(SAME_MARKET_SYSTEM, literalOf(src, "SAME_MARKET_SYSTEM"));
});

Deno.test("the buyer-perspective prompt matches stepPerspectiveJudge.ts byte for byte", async () => {
  const src = await read("../../supabase/functions/_shared/stepPerspectiveJudge.ts");
  // That prompt is an inline `content:` literal, not a named const — slice it from its first clause.
  const from = src.indexOf('"You judge whose job a process step describes.');
  assert(from > 0);
  const end = src.indexOf('",\n', from) + 1;
  const body = src.slice(from, end).replace(/\n\s+/g, "\n");
  const source = Function(`"use strict"; return (${body});`)() as string;
  assertEquals(BUYER_SYSTEM, source);
});

Deno.test("the tool constructs no supabase client and names no table", async () => {
  const tool = await read("../dryrun-market-criterion.ts");
  const code = tool.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  for (const forbidden of ["createClient", "@supabase/", ".from(", ".rpc(", ".insert(", ".upsert("]) {
    assert(!code.includes(forbidden), `the dry-run tool must not contain ${forbidden}`);
  }
  // and it imports only the two PURE modules
  const imports = [...tool.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assertEquals(imports.sort(), [
    "../supabase/functions/_shared/marketMeansTerms.ts",
    "../supabase/functions/_shared/solutionAgnosticJudge.ts",
  ]);
});
