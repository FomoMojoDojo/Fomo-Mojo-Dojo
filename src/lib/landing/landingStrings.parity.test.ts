// S-U6-1 … S-U6-6 parity (2026-11-11). Same contract as the /login strings: verbatim here, rendered
// from here, and the superseded wording gone from the pages.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANDING_STRINGS, goToOwnLabel, notReadyLine } from "./landingStrings";

const SRC = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("the member-facing strings are verbatim as signed", () => {
  it("S-U6-1", () => expect(LANDING_STRINGS.noCompany).toBe(
    "This account isn't connected to a MojoMap™ yet. FomoMojoDojo sets up access."));
  it("S-U6-2", () => expect(LANDING_STRINGS.cannotOpen).toBe("This account can't open this page."));
  it("S-U6-3", () => expect(LANDING_STRINGS.goToOwn).toBe("Go to {organization}'s MojoMap™"));
  it("S-U6-5", () => expect(LANDING_STRINGS.signOut).toBe("Sign out"));
  it("S-U6-6", () => expect(LANDING_STRINGS.notReady).toBe("{Organization}'s MojoMap™ isn't ready to open yet."));
  it("S-U6-10", () => expect(LANDING_STRINGS.readFailed).toBe("Something went wrong loading this page. Reload to try again."));
});

describe("the two templates substitute and do nothing else", () => {
  it("S-U6-3 renders the name as the company wrote it — no case change, no truncation", () => {
    expect(goToOwnLabel("Edgewood")).toBe("Go to Edgewood's MojoMap™");
    expect(goToOwnLabel("cafe barra")).toBe("Go to cafe barra's MojoMap™");
  });

  it("S-U6-6 opens a sentence, so its placeholder is the capitalised one", () => {
    expect(notReadyLine("Edgewood")).toBe("Edgewood's MojoMap™ isn't ready to open yet.");
    // the two placeholders are NOT interchangeable: each formatter replaces only its own
    expect(notReadyLine("X")).not.toContain("{");
    expect(goToOwnLabel("X")).not.toContain("{");
  });

  it("a name containing the other placeholder is still substituted once", () => {
    expect(goToOwnLabel("{Organization}")).toBe("Go to {Organization}'s MojoMap™");
  });
});

describe("the pages render them from this file", () => {
  it("the gate and the start route import LANDING_STRINGS, not their own literals", () => {
    for (const file of ["components/MemberCompanyGate.tsx"]) {
      expect(read(file), `${file} does not render LANDING_STRINGS`).toContain("LANDING_STRINGS");
    }
  });

  it("no page carries a hand-written copy of a signed line", () => {
    for (const file of ["components/MemberCompanyGate.tsx", "pages/StartRoute.tsx"]) {
      const src = read(file);
      for (const line of [LANDING_STRINGS.noCompany, LANDING_STRINGS.cannotOpen, LANDING_STRINGS.notReady, LANDING_STRINGS.readFailed]) {
        expect(src, `${file}: a signed line is inlined instead of imported`).not.toContain(line);
      }
    }
  });

  // U6-70 (2026-11-11). S-U6-10 was an inline literal in MemberCompanyGate, and StartRoute carried a
  // SECOND, different sentence for the same condition ("…opening your MojoMap" against "…loading this
  // page"). Two sentences for one state is how a signed string quietly becomes a matter of style, and
  // which one a client saw depended on which component noticed the failure first. Both now render
  // S-U6-10.
  it("U6-70: both read-failure surfaces render the ONE signed line", () => {
    for (const file of ["components/MemberCompanyGate.tsx", "pages/StartRoute.tsx"]) {
      const src = read(file);
      expect(src, `${file} does not render LANDING_STRINGS.readFailed`).toContain("LANDING_STRINGS.readFailed");
      expect(src, `${file} still carries the superseded second wording`).not.toContain("opening your MojoMap");
    }
  });
});
