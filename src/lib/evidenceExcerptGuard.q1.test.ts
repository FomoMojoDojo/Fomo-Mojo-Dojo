// Q1: quote marks are folded for the upload quote check only; the stored excerpt is the document's own span.
import { describe, it, expect } from "vitest";
import { applyUploadExcerptGuard, excerptTracesToSource, foldForQuoteMatch, locateByQuoteFold } from "./evidenceExcerptGuard";
import { normalizeForHash } from "../../supabase/functions/_shared/contentIdentity";

// the REAL pairs (Charter's 10-Q and earnings release, card-evidence-diagnosis.md)
const DOC_10Q = 'Charter Communications, Inc. (together with its controlled subsidiaries, "Charter," or the "Company"), through its Spectrum brand, is the leading Internet and video provider.';
const MODEL_10Q = "Charter Communications, Inc. (together with its controlled subsidiaries, “Charter,” or the “Company”), through its Spectrum brand, is the leading Inte";
const DOC_ER = 'Charter Communications, Inc. (along with its subsidiaries, the "Company" or "Charter") today reported financial and operating results for the three and nine months ended September 30, 2026.';
const MODEL_ER = "Charter Communications, Inc. (along with its subsidiaries, the 'Company' or 'Charter') today reported financial and operating results for the three and nine";
const draft = (x: string) => ({ evidence_excerpt: x, claim_text: "c", raw_payload: {} });

describe("Q1 quote marks", () => {
  it("the exact check refuses both real pairs (the defect)", () => {
    expect(excerptTracesToSource(MODEL_10Q, DOC_10Q)).toBe(false);
    expect(excerptTracesToSource(MODEL_ER, DOC_ER)).toBe(false);
  });
  it("the guard keeps them, storing the DOCUMENT'S span, which itself passes the exact check", () => {
    for (const [m, d] of [[MODEL_10Q, DOC_10Q], [MODEL_ER, DOC_ER]]) {
      const g = applyUploadExcerptGuard(draft(m), d);
      expect(g.dropped).toBe(false);
      expect(g.evidence_excerpt).not.toBe(m);
      expect(d.includes(g.evidence_excerpt)).toBe(true);
      expect(excerptTracesToSource(g.evidence_excerpt, d)).toBe(true);
      expect((g.raw_payload as { excerpt_guard: Record<string, unknown> }).excerpt_guard).toMatchObject({ traced: true, quote_marks_folded: true, model_excerpt: m });
    }
  });
  it("quote marks only: altered words are still refused (honest refusals stay refused)", () => {
    const g = applyUploadExcerptGuard(draft("a $1000 Savings Guarantee"), "a $1,000 Savings Guarantee for customers");
    expect(g.dropped).toBe(true);
    expect(locateByQuoteFold("the “Company” said", 'the "Firm" said')).toBeNull();
  });
  it("an exact match is unchanged (no fold, no flag)", () => {
    const g = applyUploadExcerptGuard(draft("the leading Internet"), DOC_10Q);
    expect(g.evidence_excerpt).toBe("the leading Internet");
    expect((g.raw_payload as { excerpt_guard: Record<string, unknown> }).excerpt_guard.quote_marks_folded).toBeUndefined();
  });
  it("stored hashes do not move: normalizeForHash still distinguishes the marks", () => {
    expect(normalizeForHash("“Charter,”")).not.toBe(normalizeForHash('"Charter,"'));
    expect(foldForQuoteMatch("“A”  'b'").folded).toBe('"a" "b"');
  });
});
