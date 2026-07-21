// RG-1 — REGISTER-GUARD TRIPWIRE.
//
// Proves internal-register text CANNOT render on a guarded client surface, and
// that the guard — not deriveAudienceShort's 40-char limit — is what blocks it.
//
// The load-bearing fixture is "schools": internal_inferred, and its noun phrase
// is 7 chars, so the length limit passes it (that is exactly how 8 of Edgewood's
// 11 real rows sailed through). If the register guard is what protects the
// surface, "schools" is blocked anyway. If someone deletes or inverts the guard,
// this file goes red naming the leaked string and the surface.
//
// House standard: falsification-validated. Inverting admitForSurface must turn
// these red (proven in the gate report). And per the A2B-3 lesson, the block
// assertions are written so they can ONLY pass because the register guard held —
// never because some redundant shield (like the 40-char limit) happened to fire.
// The "schools" fixture is the guarantee of that: length does not save it.

import { describe, expect, it } from "vitest";
import { admitForSurface, isPublicRegister, type RegisterSurface } from "./registerGuard";
import { deriveAudienceShort } from "@/views/client/home/shared";

// Real registers, from the market_options CHECK / odi_market_definitions data.
const INTERNAL_INFERRED_SHORT = { market_register: "internal_inferred", job_executor: "Schools" }; // 7 chars
const INTERNAL_DECLARED = { market_register: "internal_declared", job_executor: "Families and caregivers of at-risk youth aged 5-26" };
const PUBLIC_INFERRED = { market_register: "public_inferred", job_executor: "Families and youth seeking specialized support" };
const NULL_REGISTER = { market_register: null, job_executor: "Community members" };
const MISSING_REGISTER = { job_executor: "Funders" }; // field absent entirely

// The audience path, exactly as ClientRefinePreviewView wires it: guard first,
// derive only if admitted. This is the render-boundary behaviour under test.
function audienceLine(row: { market_register?: string | null; job_executor?: string }, surface: RegisterSurface): string | null {
  return admitForSurface(row, surface) ? deriveAudienceShort(row.job_executor) : null;
}

describe("RG-1 register guard — admitForSurface", () => {
  it("blocks internal_inferred on the outside surface EVEN when short enough to pass the 40-char limit", () => {
    // Length does not save it: prove the phrase would otherwise render, then prove the guard blocks it.
    expect(deriveAudienceShort(INTERNAL_INFERRED_SHORT.job_executor)).toBe("schools"); // length limit passes it
    expect(
      admitForSurface(INTERNAL_INFERRED_SHORT, "outside"),
      `LEAK: internal_inferred "schools" admitted on the OUTSIDE surface — the 40-char limit ` +
      `passed it and the register guard failed to block it.`,
    ).toBe(false);
    expect(
      audienceLine(INTERNAL_INFERRED_SHORT, "outside"),
      `LEAK: internal-register text "schools" reached rendered outside copy.`,
    ).toBeNull();
  });

  it("blocks internal registers on the decision surface (the live A2B-1 hole)", () => {
    for (const row of [INTERNAL_INFERRED_SHORT, INTERNAL_DECLARED]) {
      expect(
        admitForSurface(row, "decision"),
        `LEAK: ${row.market_register} "${row.job_executor}" admitted on the DECISION surface (audience copy).`,
      ).toBe(false);
      expect(audienceLine(row, "decision"), `LEAK: ${row.market_register} text reached the decision-screen audience line.`).toBeNull();
    }
  });

  it("blocks NULL and missing register on every guarded surface (unclassified BLOCKS)", () => {
    for (const surface of ["outside", "decision"] as const) {
      expect(admitForSurface(NULL_REGISTER, surface), `LEAK: NULL register admitted on ${surface}.`).toBe(false);
      expect(admitForSurface(MISSING_REGISTER, surface), `LEAK: missing register admitted on ${surface}.`).toBe(false);
      expect(admitForSurface(null, surface), `LEAK: null row admitted on ${surface}.`).toBe(false);
      expect(admitForSurface(undefined, surface), `LEAK: undefined row admitted on ${surface}.`).toBe(false);
    }
  });

  it("ADMITS public registers on outside and decision — the guard must not over-block", () => {
    for (const surface of ["outside", "decision"] as const) {
      expect(
        admitForSurface(PUBLIC_INFERRED, surface),
        `OVER-BLOCK: public_inferred wrongly blocked on ${surface} — a real public market would show an empty slot.`,
      ).toBe(true);
    }
    // And the public row's text does render through the audience path.
    expect(audienceLine(PUBLIC_INFERRED, "decision")).toBe("families and youth");
  });

  it("diagnose is permissive BY DESIGN — all registers admitted there and nowhere else", () => {
    for (const row of [INTERNAL_INFERRED_SHORT, INTERNAL_DECLARED, PUBLIC_INFERRED, NULL_REGISTER]) {
      expect(admitForSurface(row, "diagnose"), `diagnose must admit ${row.market_register} — it shows the say/see split`).toBe(true);
    }
  });

  it("isPublicRegister is the single predicate and treats non-strings as non-public", () => {
    expect(isPublicRegister("public_inferred")).toBe(true);
    expect(isPublicRegister("publicly_declared")).toBe(true);
    expect(isPublicRegister("internal_inferred")).toBe(false);
    expect(isPublicRegister("internal_declared")).toBe(false);
    expect(isPublicRegister(null)).toBe(false);
    expect(isPublicRegister(undefined)).toBe(false);
    expect(isPublicRegister("")).toBe(false);
  });
});
