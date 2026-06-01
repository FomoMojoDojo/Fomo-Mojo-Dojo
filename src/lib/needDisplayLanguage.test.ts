import { describe, expect, it } from "vitest";
import { rewriteJobContextPhrase, sanitizeStaleReason, humanSourceLabel } from "./needDisplayLanguage";

describe("rewriteJobContextPhrase", () => {
  it("replaces known step label with human phrase", () => {
    expect(rewriteJobContextPhrase("Identify main competitors in specialty coffee"))
      .toBe("supplier evaluation");
  });

  it("cleans 'before work on X starts' → 'before X starts'", () => {
    const result = rewriteJobContextPhrase("missing data before work on supplier evaluation starts");
    expect(result).toBe("missing data before supplier evaluation starts");
  });

  it("leaves clean strings unchanged", () => {
    const s = "Buyers evaluate reliability before committing.";
    expect(rewriteJobContextPhrase(s)).toBe(s);
  });
});

describe("sanitizeStaleReason", () => {
  it("replaces Phase 78E pipeline language", () => {
    const result = sanitizeStaleReason("Replaced by evidence-derived needs from Phase 78E active file analysis");
    expect(result).not.toContain("Phase 78E");
    expect(result).not.toContain("evidence-derived");
    expect(result.length).toBeGreaterThan(10);
  });

  it("replaces 'replaced by' language", () => {
    const result = sanitizeStaleReason("Replaced by newer needs from updated analysis");
    expect(result.toLowerCase()).not.toContain("replaced by");
  });

  it("returns fallback for null", () => {
    const result = sanitizeStaleReason(null);
    expect(result.length).toBeGreaterThan(5);
  });

  it("passes through clean human-readable stale reasons", () => {
    const clean = "The job map changed after new steps were added.";
    expect(sanitizeStaleReason(clean)).toBe(clean);
  });
});

describe("humanSourceLabel", () => {
  it("labels customer/interview paths", () => {
    expect(humanSourceLabel("primary_research/customer_interviews")).toBe("Customer interviews");
  });

  it("labels public/baseline paths", () => {
    expect(humanSourceLabel("public_baseline/market_data")).toBe("Public research");
    expect(humanSourceLabel("social_signals")).toBe("Public research");
  });

  it("labels upload/org/company paths", () => {
    expect(humanSourceLabel("uploaded/company/survey.csv")).toBe("Uploaded materials");
    expect(humanSourceLabel("org_file_upload")).toBe("Uploaded materials");
  });

  it("returns null for unknown paths", () => {
    expect(humanSourceLabel("unknown_weird_path_xyz")).toBeNull();
  });

  it("returns null for null/empty", () => {
    expect(humanSourceLabel(null)).toBeNull();
    expect(humanSourceLabel("")).toBeNull();
  });
});
