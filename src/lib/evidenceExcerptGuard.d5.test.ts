// D5 (2026-11-16): the merge step's [section …] tag is stripped before the word-for-word check.
import { describe, it, expect } from "vitest";
import { applyUploadExcerptGuard, stripMergeSectionTag } from "./evidenceExcerptGuard";

const SIDECAR = "[Page 3] The board approved a 48-hour thank-you call for every first gift.\n\n[Page 4] Families wait days for a call back.";
const draft = (evidence_excerpt: string) => ({ evidence_excerpt, claim_text: "claim", raw_payload: {} });

describe("stripMergeSectionTag", () => {
  it.each([
    ["- [section 4] The board approved", "The board approved"],
    ["[section 12] The board approved", "The board approved"],
    ["- [sections 2, 7] The board approved", "The board approved"],
    ["[Sections 2,7,11]   The board approved", "The board approved"],
  ])("%s → the passage", (input, out) => expect(stripMergeSectionTag(input)).toBe(out));
  it.each(["The board approved [section 4] later", "[Page 3] The board approved", "[sectionX] text", ""])(
    "%s is left alone", (input) => expect(stripMergeSectionTag(input)).toBe(input));
});

describe("applyUploadExcerptGuard with a tagged quote", () => {
  it("a tagged quote that is otherwise word for word is KEPT, without the tag", () => {
    const r = applyUploadExcerptGuard(draft("- [section 2] The board approved a 48-hour thank-you call for every first gift."), SIDECAR);
    expect(r.dropped).toBe(false);
    expect(r.evidence_excerpt).toBe("The board approved a 48-hour thank-you call for every first gift.");
    expect((r.raw_payload as { excerpt_guard: Record<string, unknown> }).excerpt_guard).toEqual({ basis: "sidecar", traced: true, section_tag_stripped: true });
  });
  it("a tagged quote whose passage is NOT in the document is still blanked", () => {
    const r = applyUploadExcerptGuard(draft("[section 2] The board approved a monthly gala."), SIDECAR);
    expect(r.dropped).toBe(true);
    expect(r.evidence_excerpt).toBe("");
  });
  it("an untagged quote behaves as before", () => {
    const r = applyUploadExcerptGuard(draft("Families wait days for a call back."), SIDECAR);
    expect(r.dropped).toBe(false);
    expect((r.raw_payload as { excerpt_guard: Record<string, unknown> }).excerpt_guard).toEqual({ basis: "sidecar", traced: true });
  });
});
