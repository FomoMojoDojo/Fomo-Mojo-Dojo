// V2-5c — the 'analytic' provenance value: writer stamps it, and every client-facing
// admission path excludes it (fail-toward-blocked). Falsification-validated.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { deriveClaimProvenance } from "@/lib/evidenceMappers";
import { isPublicProvenance, isAnalyticProvenance } from "@/lib/registerGuard";
import { splitPerception } from "@/lib/firstRead/perceptionGuard";

describe("V2-5c — deriveClaimProvenance stamps 'analytic' for all-analysis backing", () => {
  it("all mojo_analysis → 'analytic'; all uploaded_file+organization → 'internal_declared'", () => {
    expect(deriveClaimProvenance([{ sourceType: "mojo_analysis", band: "organization" }])).toBe("analytic");
    expect(deriveClaimProvenance([{ sourceType: "mojo_analysis", band: "outside" }, { sourceType: "mojo_analysis", band: "customer" }])).toBe("analytic");
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "organization" }])).toBe("internal_declared");
    // FALSIFICATION: a public_baseline signal is NOT analytic
    expect(deriveClaimProvenance([{ sourceType: "public_baseline_run", band: "outside" }])).toBe("public_observed");
    expect(deriveClaimProvenance([])).toBe("public_observed");
  });

  it("MIXED backing (analytic + public) stays 'public_observed' (reported rule, not analytic)", () => {
    expect(deriveClaimProvenance([
      { sourceType: "mojo_analysis", band: "organization" },
      { sourceType: "public_baseline_run", band: "outside" },
    ])).toBe("public_observed");
  });
});

describe("V2-5c — client-facing admission is an allowlist (fail-toward-blocked)", () => {
  it("isPublicProvenance admits ONLY public_observed; 'analytic' and every other value BLOCK", () => {
    expect(isPublicProvenance("public_observed")).toBe(true);
    expect(isPublicProvenance("analytic")).toBe(false); // the new value cannot leak
    expect(isPublicProvenance("internal_declared")).toBe(false);
    expect(isPublicProvenance("client_attested")).toBe(false);
    expect(isPublicProvenance("some_future_value")).toBe(false); // unknown blocks by omission
    expect(isPublicProvenance(null)).toBe(false);
    expect(isAnalyticProvenance("analytic")).toBe(true);
    expect(isAnalyticProvenance("public_observed")).toBe(false);
  });
});

// ── Sweep every client-facing claim-admission site with a planted analytic row ──
// VOICE-CLEAN text on purpose: so the ONLY thing blocking it is the provenance allowlist
// (isPublicProvenance), not the V2-5b analytic-voice guard — this isolates the SITE guard.
const analyticRow = { id: "a1", statement: "Edgewood operates residential campuses across the Bay Area.", topic: "unknown", provenance: "analytic" };
const publicRow = { id: "p1", statement: "Edgewood is a leading nonprofit provider of youth mental health services.", topic: "market", provenance: "public_observed" };

// SITE 1 — the Act 3 Message band (OutsideMessageBand → isPublicProvenance).
let perceptionState: { claims: Array<typeof analyticRow>; loading: boolean } = { claims: [], loading: false };
vi.mock("@/hooks/useOutsidePerception", () => ({ useOutsidePerception: () => perceptionState }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "c1" } }) }));
import OutsideMessageBand from "@/components/client-view/story/movement/OutsideMessageBand";

describe("V2-5c — SITE 1: Message band excludes a planted analytic row; admits public", () => {
  it("analytic never renders; the public row does (guard can fail)", () => {
    perceptionState = { claims: [analyticRow, publicRow], loading: false };
    const { container } = render(<OutsideMessageBand />);
    const text = container.textContent || "";
    expect(text).not.toContain("analysis suggests"); // analytic blocked at the render boundary
    expect(text).toContain("leading nonprofit provider"); // public admitted
    expect(container.querySelectorAll(".cvs-ob-msg").length).toBe(1);
  });
});

describe("V2-5c — SITE 2: export perception filter (ExportButton uses isPublicProvenance)", () => {
  it("the same filter chain drops analytic, keeps public", () => {
    // ExportButton: perceptionClaims.filter(isPublicProvenance) → splitPerception → dedupe
    const kept = splitPerception(
      [analyticRow, publicRow].filter((c) => isPublicProvenance(c.provenance)),
      (c) => c.statement,
    ).admitted;
    expect(kept.map((c) => c.id)).toEqual(["p1"]);
  });
});
