import { describe, expect, it } from "vitest";
import { applyUploadExcerptGuard } from "./evidenceExcerptGuard";

// Rulings 5–7 (2026-09-14): the E4 excerpt guard on the UPLOAD path, sidecar as basis. A signal whose excerpt
// cannot be traced is KEPT as interpretation-only (claim_text stays; excerpt blanked; gate recorded).
const SIDECAR = ". We are the heart of youth mental health in the Bay Area - a place where every young person and family feels seen, supported, and inspired. We strive to be a beacon in mental health care, setting the standard for innovative, compassionate, and lasting impact in our community, creating pathways to brighter futures for every child we serve.";

describe("applyUploadExcerptGuard", () => {
  it("blanks an absence-as-evidence excerpt by TRACEABILITY, keeps the interpretation, records the gate", () => {
    const draft = { claim_text: "There is a need to establish clear metrics of success.", evidence_excerpt: "missing_information: financial performance or metrics of success", raw_payload: { claim: "x", evidence: "missing_information: financial performance or metrics of success" } };
    const out = applyUploadExcerptGuard(draft, SIDECAR);
    expect(out.dropped).toBe(true);
    expect(out.evidence_excerpt).toBe("");
    expect(draft.claim_text).toBe("There is a need to establish clear metrics of success."); // the interpretation survives
    expect(out.raw_payload).toMatchObject({ claim: "x", excerpt_guard: { basis: "sidecar", traced: false, blanked_excerpt: "missing_information: financial performance or metrics of success" } });
  });
  it("blanks any untraceable excerpt — the prefix is not the trigger", () => {
    const out = applyUploadExcerptGuard({ claim_text: "c", evidence_excerpt: "target demographics beyond 'every young person and family'", raw_payload: {} }, SIDECAR);
    expect(out.dropped).toBe(true);
    expect(out.evidence_excerpt).toBe("");
  });
  it("passes a traceable excerpt verbatim (case/whitespace-insensitive, as normalizeForHash)", () => {
    const q = "We strive to be a beacon in mental health care, setting the standard for innovative, compassionate, and lasting impact in our community";
    const out = applyUploadExcerptGuard({ claim_text: "c", evidence_excerpt: q, raw_payload: { a: 1 } }, SIDECAR);
    expect(out.dropped).toBe(false);
    expect(out.evidence_excerpt).toBe(q);
    expect(out.raw_payload).toEqual({ a: 1, excerpt_guard: { basis: "sidecar", traced: true } });
  });
  it("a comma-joined pair of real sentences is NOT a substring — blanked (the merge artefact)", () => {
    const out = applyUploadExcerptGuard({ claim_text: "c", evidence_excerpt: "We are the heart of youth mental health in the Bay Area - a place where every young person and family feels seen, supported, and inspired.,We strive to be a beacon", raw_payload: {} }, SIDECAR);
    expect(out.dropped).toBe(true);
  });
  it("an empty excerpt (Torres gap finding: absence motivates, does not attest) passes untouched", () => {
    const out = applyUploadExcerptGuard({ claim_text: "gap-motivated opportunity", evidence_excerpt: "", raw_payload: {} }, SIDECAR);
    expect(out.dropped).toBe(false);
    expect(out.evidence_excerpt).toBe("");
  });
  it("no sidecar basis ⇒ untouched (honest limit), nothing recorded", () => {
    const out = applyUploadExcerptGuard({ claim_text: "c", evidence_excerpt: "missing_information: x", raw_payload: { k: 1 } }, null);
    expect(out.dropped).toBe(false);
    expect(out.evidence_excerpt).toBe("missing_information: x");
    expect(out.raw_payload).toEqual({ k: 1 });
  });
});
