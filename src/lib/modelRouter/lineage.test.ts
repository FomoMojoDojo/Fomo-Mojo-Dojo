// ── SP-460 / SP-468: the lane is decided by lineage, and fails closed ─────────────────────────────
// Each case is a way the lane could be opened by accident. The predicate must refuse all of them.
import { describe, expect, it } from "vitest";
import {
  lineageAllowsExternal, patternRouteProvenance, resolveModel,
  LINEAGE_PUBLIC_NEED_SOURCE_PATHS, EXTERNAL_GENERATOR, EXTERNAL_JUDGE, LOCAL_GENERATOR, LOCAL_JUDGE,
} from "./resolveModel";

const clean = {
  hasClientMaterial: false as boolean | null | undefined,
  signalSourceTypes: ["public_baseline_run", "website"],
  needSourcePaths: ["outside_voice_read"],
};

describe("SP-460 lineageAllowsExternal", () => {
  it("opens the lane for a company with no client material and public-by-source inputs", () => {
    expect(lineageAllowsExternal(clean)).toBe(true);
  });

  it("SP-460: admits a need whose source_path is outside_voice_read, which is NOT a public provenance", () => {
    // the whole point of the ruling: by label this need would close the lane
    expect(LINEAGE_PUBLIC_NEED_SOURCE_PATHS.has("outside_voice_read")).toBe(true);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: ["outside_voice_read", "public_research"] })).toBe(true);
  });

  it("ONE row of client material closes the lane", () => {
    expect(lineageAllowsExternal({ ...clean, hasClientMaterial: true })).toBe(false);
  });

  it("a lookup nobody ran closes the lane (null / undefined are not false)", () => {
    expect(lineageAllowsExternal({ ...clean, hasClientMaterial: null })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, hasClientMaterial: undefined })).toBe(false);
  });

  it("one non-public signal source closes the lane", () => {
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: ["public_baseline_run", "uploaded_file"] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: ["public_baseline_run", "interview"] })).toBe(false);
  });

  it("an unknown, NULL or unselected signal source closes the lane", () => {
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: ["public_baseline_run", "brand_new_lane"] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: ["public_baseline_run", null] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: ["public_baseline_run", undefined] })).toBe(false);
  });

  it("an EMPTY signal set closes the lane — an unqualified call is never sent out", () => {
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: [] })).toBe(false);
  });

  it("a need source_path off the lineage allowlist closes the lane", () => {
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: ["file_proposal:abc"] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: ["interview"] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: ["intake.quiz"] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: [""] })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: [null] })).toBe(false);
  });

  it("a call over quotes alone (no needs) is allowed — the needs array may be empty", () => {
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: [] })).toBe(true);
  });

  it("a non-array where an array belongs closes the lane", () => {
    expect(lineageAllowsExternal({ ...clean, signalSourceTypes: undefined as never })).toBe(false);
    expect(lineageAllowsExternal({ ...clean, needSourcePaths: undefined as never })).toBe(false);
  });
});

describe("SP-468 patternRouteProvenance feeds resolveModel", () => {
  it("an open lane reaches the external models", () => {
    const p = patternRouteProvenance(clean);
    expect(p).toBe("public_observed");
    expect(resolveModel({ role: "generator", inputs: [{ provenance: p }] }).model).toBe(EXTERNAL_GENERATOR);
    expect(resolveModel({ role: "judge", inputs: [{ provenance: p }] }).model).toBe(EXTERNAL_JUDGE);
  });

  it("a closed lane reaches the local models", () => {
    const p = patternRouteProvenance({ ...clean, hasClientMaterial: true });
    expect(p).toBeNull();
    expect(resolveModel({ role: "generator", inputs: [{ provenance: p }] }).model).toBe(LOCAL_GENERATOR);
    expect(resolveModel({ role: "judge", inputs: [{ provenance: p }] }).model).toBe(LOCAL_JUDGE);
  });

  it("Charter's measured lineage routes LOCAL (SP-464): 4 of 7 material kinds hold rows", () => {
    // all 330 judged review signals ARE public by source; the company's own material closes the lane
    const charter = { hasClientMaterial: true, signalSourceTypes: Array(330).fill("public_baseline_run"), needSourcePaths: ["outside_voice_read"] };
    expect(lineageAllowsExternal(charter)).toBe(false);
    expect(resolveModel({ role: "judge", inputs: [{ provenance: patternRouteProvenance(charter) }] }).provider).toBe("local_ollama");
  });
});
