import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clampSearchBudget, SEARCH_BUDGET_DEFAULT } from "./searchBudget.ts";
Deno.test("search_budget: 1..16 honoured, everything else is the default 16", () => {
  assertEquals([clampSearchBudget(1), clampSearchBudget(6), clampSearchBudget(16)], [1, 6, 16]);
  for (const v of [undefined, null, 0, -1, 17, 2.5, "1", NaN, {}]) assertEquals(clampSearchBudget(v), SEARCH_BUDGET_DEFAULT, String(v));
});
