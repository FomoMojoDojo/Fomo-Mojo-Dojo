import { describe, expect, it } from "vitest";
import { QUOTE_GUARD_VERSION, QUOTE_WARRANT_BASES, sourceKeyForSignal, warrantKey, warrantKeySet, warrantsQuotation } from "./quoteWarrant";

describe("quote warrant (operator ruling 2026-09-14: mint_time | sidecar at guard_version 1)", () => {
  it("passed against the mint-time page or the sidecar warrants a quotation", () => {
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "quote_source_text", guard_version: 1 })).toBe(true);
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "sidecar", guard_version: 1 })).toBe(true);
  });
  it("a pass against a later copy of the page does NOT — snapshot / refetch say the words are on the page now", () => {
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "page_snapshot", guard_version: 1 })).toBe(false);
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "refetch", guard_version: 1 })).toBe(false);
  });
  it("blanked, no_basis, a missing record, or another guard version never warrant", () => {
    expect(warrantsQuotation({ verdict: "blanked", basis_kind: "sidecar", guard_version: 1 })).toBe(false);
    expect(warrantsQuotation({ verdict: "no_basis", basis_kind: "none", guard_version: 1 })).toBe(false);
    expect(warrantsQuotation(null)).toBe(false);
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "sidecar", guard_version: 2 })).toBe(false);
  });
  it("the ruling's constants are what the code enforces", () => {
    expect(QUOTE_GUARD_VERSION).toBe(1);
    expect([...QUOTE_WARRANT_BASES]).toEqual(["quote_source_text", "sidecar"]);
  });
  it("source key mirrors the writer: url, else file:<path>, else proposal:<id>", () => {
    expect(sourceKeyForSignal({ source_url: "https://x.test/p", source_id: "r1" })).toBe("https://x.test/p");
    expect(sourceKeyForSignal({ source_url: null, source_id: "p1" }, "zz/doc.md")).toBe("file:zz/doc.md");
    expect(sourceKeyForSignal({ source_url: "", source_id: "p1" })).toBe("proposal:p1");
  });
  it("warrant keys match by content identity, whitespace/case-insensitive", async () => {
    const k1 = await warrantKey("https://x.test/p", "Families  wait THREE weeks.");
    const k2 = await warrantKey("https://x.test/p", "families wait three weeks.");
    expect(k1).toBe(k2);
    const set = warrantKeySet([{ source_url: "https://x.test/p", excerpt_identity: k1.split("|#|")[1], verdict: "passed", basis_kind: "quote_source_text", guard_version: 1 },
                               { source_url: "https://x.test/p", excerpt_identity: "other", verdict: "passed", basis_kind: "refetch", guard_version: 1 }]);
    expect(set.has(k1)).toBe(true);
    expect(set.size).toBe(1);
  });
});
