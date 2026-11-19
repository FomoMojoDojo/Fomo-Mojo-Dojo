// A6 (2026-11-18): a stored search snippet is never a page snapshot.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isPageSnapshot, pageSnapshotSql } from "./snapshotBasis.ts";

Deno.test("a search snippet (basis_kind cited_text) is not a page; a crawl, a refetch, an untagged row are", () => {
  assertEquals(isPageSnapshot({ retained_at_mint: true, basis_kind: "cited_text" }), false);
  for (const s of [{ basis_kind: "crawl" }, { refetch_for_verification: true }, {}, null, undefined, "x"]) assertEquals(isPageSnapshot(s), true, JSON.stringify(s));
});
Deno.test("the SQL predicate names the same rule", () => {
  assertEquals(pageSnapshotSql(), "coalesce(structured->>'basis_kind','') <> 'cited_text'");
  assertEquals(pageSnapshotSql("p"), "coalesce(p.structured->>'basis_kind','') <> 'cited_text'");
});
