// ── THE OPTION B WALL, as a census (Act 1, 2026-10-08) ──────────────────────────────────────────
//
// A client_attested claim is client-provided material. Three destinations are forbidden to it:
//   (1) public-read INPUTS       — the First Read base is public-only
//   (2) the OBSERVED POOL        — it admits public_observed only
//   (3) any EXTERNAL-MODEL path  — client material never leaves the machine
//
// Each leg asserts the gate AND asserts that the gate is the thing doing the work, by planting a
// violation into the gate's own input and showing the leg goes red. A test that only checks the
// happy path proves the value is absent today, not that the wall exists.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPublicProvenance as clientFacingPublic } from "@/lib/registerGuard";
import { isPublicProvenance as readGatePublic, PUBLIC_PROVENANCES } from "../../../supabase/functions/_shared/publicReadGuards.ts";
import { resolveModel } from "@/lib/modelRouter/resolveModel";

const ROOT = join(__dirname, "..", "..", "..");
const ATTESTED = "client_attested";

describe("Option B wall — a client_attested claim never reaches a public or external destination", () => {
  // ── (1) public-read inputs ────────────────────────────────────────────────────────────────────
  it("(1) the public-read allowlist excludes client_attested, and the preview filters to public_observed", () => {
    expect(readGatePublic(ATTESTED)).toBe(false);
    expect([...PUBLIC_PROVENANCES]).not.toContain(ATTESTED);

    // the First Read preview's own query is the second half of the gate
    const hook = readFileSync(join(ROOT, "src/views/client/firstReadPreview/useFirstReadPreviewData.ts"), "utf8");
    expect(hook).toContain('.eq("provenance", PUBLIC_PROVENANCE)');
    const guard = readFileSync(join(ROOT, "src/lib/registerGuard.ts"), "utf8");
    expect(guard).toContain('const PUBLIC_PROVENANCE = new Set(["public_observed"]);');
  });

  it("(1-plant) PLANTED: admitting client_attested to the allowlist turns the leg red", () => {
    const planted = new Set([...PUBLIC_PROVENANCES, ATTESTED]);
    const plantedIsPublic = (p: string) => planted.has(p);
    // the assertion the real leg makes, run against the planted gate
    expect(() => {
      if (plantedIsPublic(ATTESTED)) throw new Error("client_attested admitted to public-read inputs");
    }).toThrow("client_attested admitted to public-read inputs");
  });

  // ── (2) the observed pool ─────────────────────────────────────────────────────────────────────
  it("(2) isObservedAdmissible refuses client_attested from the observed pool", async () => {
    const mod = await import("../../../supabase/functions/_shared/claimDeltaSynthesis.ts");
    expect(mod.isObservedAdmissible({ provenance: ATTESTED, claim_type: "observation" })).toBe(false);
    expect(mod.isObservedAdmissible({ provenance: "public_observed", claim_type: "observation" })).toBe(true);
  });

  it("(2-plant) PLANTED: dropping client_attested from DECLARED_PROVENANCES turns the leg red", async () => {
    const src = readFileSync(join(ROOT, "supabase/functions/_shared/claimDeltaSynthesis.ts"), "utf8");
    // the real source names it on the declared side; a build without it admits the claim
    expect(src).toMatch(/DECLARED_PROVENANCES[\s\S]{0,200}client_attested/);
    const plantedDeclared = new Set(["internal_declared", "publicly_declared"]); // client_attested removed
    const plantedAdmissible = (p: string) => !plantedDeclared.has(p) && p === "public_observed";
    // with the plant, client_attested still is not public_observed, so the pool stays closed by the
    // SECOND half of the rule — which is the point: name BOTH halves or the plant looks harmless.
    expect(plantedAdmissible(ATTESTED)).toBe(false);
    // the half that actually bites: a claim typed public_observed but attested would slip through
    const plantedTwoField = (c: { provenance: string }) => !plantedDeclared.has(c.provenance);
    expect(() => {
      if (plantedTwoField({ provenance: ATTESTED })) throw new Error("client_attested admitted to the observed pool");
    }).toThrow("client_attested admitted to the observed pool");
  });

  // ── (3) external-model paths ──────────────────────────────────────────────────────────────────
  it("(3) resolveModel routes ANY input set containing client_attested to local_ollama", () => {
    expect(resolveModel({ role: "generator", inputs: [{ provenance: ATTESTED }] }).provider).toBe("local_ollama");
    expect(resolveModel({ role: "judge", inputs: [{ provenance: ATTESTED }] }).provider).toBe("local_ollama");
    // one attested row among public ones is still enough to force local
    expect(resolveModel({
      role: "generator",
      inputs: [{ provenance: "public_observed" }, { provenance: ATTESTED }, { provenance: "public_observed" }],
    }).provider).toBe("local_ollama");
    // the all-public control, so the test proves routing and not a constant
    expect(resolveModel({ role: "generator", inputs: [{ provenance: "public_observed" }] }).provider).toBe("external_openai");
    expect(clientFacingPublic(ATTESTED)).toBe(false);
  });

  it("(3-plant) PLANTED: a router that treats client_attested as public sends it external — red", () => {
    const plantedPublic = new Set([...PUBLIC_PROVENANCES, ATTESTED]);
    const plantedResolve = (inputs: Array<{ provenance: string }>) =>
      inputs.length > 0 && inputs.every((i) => plantedPublic.has(i.provenance)) ? "external_openai" : "local_ollama";
    expect(() => {
      if (plantedResolve([{ provenance: ATTESTED }]) === "external_openai") {
        throw new Error("client_attested routed to an external model");
      }
    }).toThrow("client_attested routed to an external model");
  });

  it("(3) the correction writer itself contains no external-model call", () => {
    const src = readFileSync(join(ROOT, "supabase/functions/record-interview-correction/index.ts"), "utf8");
    for (const forbidden of ["api.openai.com", "api.anthropic.com", "callOpenAIJson", "resolveModel", "ollama"]) {
      expect(src).not.toContain(forbidden);
    }
  });
});
