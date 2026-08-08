// First Read outside-only — the shared provenance predicate (same module the rail hook and the
// auto-selectors import, so exclusion can never fork between them).
import { describe, it, expect } from "vitest";
import {
  UPLOADED_FILE_SOURCE_TYPE, isDocumentDerivedSourceTypes, documentDerivedClaimIds,
} from "../../../supabase/functions/_shared/firstReadProvenance";

describe("firstReadProvenance", () => {
  it("the boundary marker is signals.source_type='uploaded_file'", () => {
    expect(UPLOADED_FILE_SOURCE_TYPE).toBe("uploaded_file");
  });

  it("isDocumentDerivedSourceTypes: true iff ANY backing source_type is an uploaded file", () => {
    expect(isDocumentDerivedSourceTypes(["public_baseline_run", "uploaded_file"])).toBe(true);
    expect(isDocumentDerivedSourceTypes(["public_baseline_run", "competitor_discovery_run"])).toBe(false);
    expect(isDocumentDerivedSourceTypes([])).toBe(false);
    expect(isDocumentDerivedSourceTypes([null, undefined])).toBe(false);
  });

  it("documentDerivedClaimIds: a claim with any uploaded_file signal is excluded (strict — mixed still excludes)", () => {
    const refs = [
      { claim_id: "doc", signal_id: "s1" },
      { claim_id: "doc", signal_id: "s2" }, // also public-backed → still excluded (any document touch)
      { claim_id: "pub", signal_id: "s3" },
    ];
    const src = new Map<string, string | null>([["s1", "uploaded_file"], ["s2", "public_baseline_run"], ["s3", "public_baseline_run"]]);
    const out = documentDerivedClaimIds(refs, src);
    expect(out.has("doc")).toBe(true);
    expect(out.has("pub")).toBe(false);
    expect(out.size).toBe(1);
  });

  it("no refs / no file signals → empty exclusion set (told-us & public claims all pass)", () => {
    expect(documentDerivedClaimIds([], new Map()).size).toBe(0);
    const refs = [{ claim_id: "x", signal_id: "s" }];
    expect(documentDerivedClaimIds(refs, new Map([["s", "public_baseline_run"]])).size).toBe(0);
  });
});
