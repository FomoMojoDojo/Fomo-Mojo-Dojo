// R3 REVIEW GATE (operator ruling 2026-09-04): extract-outside-evidence may regenerate ONLY URLs whose
// outside_recrawl_review row for the given run_id is operator_decision='approve'. Proves the pure gate:
// approved passes; rejected / undecided / no-row refused with a named reason; a missing run_id is refused
// before any URL is considered. RED before the module exists; GREEN after.
import { describe, expect, it } from "vitest";
import { gateRegenUrls, requireRunId } from "../../../supabase/functions/_shared/outsideRecrawlReview";

const ROWS = [
  { source_url: "https://a.example/ok", operator_decision: "approve" },
  { source_url: "https://a.example/no", operator_decision: "reject" },
  { source_url: "https://a.example/undecided", operator_decision: null },
];

describe("requireRunId", () => {
  it("returns the run_id string, null for missing/empty/non-string", () => {
    expect(requireRunId({ run_id: "r-1" })).toBe("r-1");
    expect(requireRunId({})).toBeNull();
    expect(requireRunId({ run_id: "" })).toBeNull();
    expect(requireRunId({ run_id: 42 })).toBeNull();
  });
});

describe("gateRegenUrls", () => {
  it("approved passes; rejected, undecided, and unreviewed are refused with reasons", () => {
    const urls = ["https://a.example/ok", "https://a.example/no", "https://a.example/undecided", "https://a.example/never-reviewed"];
    const g = gateRegenUrls(urls, ROWS);
    expect(g.allowed).toEqual(["https://a.example/ok"]);
    expect(g.refused).toEqual([
      { url: "https://a.example/no", reason: "rejected" },
      { url: "https://a.example/undecided", reason: "not_decided" },
      { url: "https://a.example/never-reviewed", reason: "no_review_row" },
    ]);
  });
  it("no review rows at all → everything refused (never a silent full regen)", () => {
    const g = gateRegenUrls(["https://a.example/ok"], []);
    expect(g.allowed).toEqual([]);
    expect(g.refused).toEqual([{ url: "https://a.example/ok", reason: "no_review_row" }]);
  });
});
