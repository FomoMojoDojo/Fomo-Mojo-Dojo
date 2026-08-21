// GATE S2 (2026-08-20): deterministic operating-status classifier. Imports the SAME shared module
// the edge function uses. Conservative — negatives ("closed Mondays", "closed-loop") stay unknown.
import { describe, it, expect } from "vitest";
import { classifyOperatingStatus } from "../../../supabase/functions/_shared/operatingStatus";

const c = (evidenceExcerpt: string, sourceTitle?: string) =>
  classifyOperatingStatus({ evidenceExcerpt, sourceTitle }).status;

describe("S2 classifier — positive closure cases", () => {
  it("'permanently closed' → permanently_closed", () => {
    expect(c("This location is permanently closed.")).toBe("permanently_closed");
  });
  it("Yelp 'LE FRENCH ROOSTER - CLOSED' listing marker → permanently_closed", () => {
    expect(c("Yelp listing shows 'LE FRENCH ROOSTER - CLOSED' at 2221 W Olive Ave")).toBe("permanently_closed");
    expect(classifyOperatingStatus({ sourceTitle: "Le French Rooster - CLOSED - Burbank, CA" }).status).toBe("permanently_closed");
  });
  it("'closed temporarily' / 'temporarily closed' → temporarily_closed", () => {
    expect(c("closed temporarily · Updated April 19th, 2026")).toBe("temporarily_closed");
    expect(c("The Burbank café is temporarily closed.")).toBe("temporarily_closed");
  });
  it("'under new management … closed' (no 'temporarily') → temporarily_closed", () => {
    expect(c("going under new management in February so the shop is closed for now")).toBe("temporarily_closed");
  });
  it("'reopened' / 'now open again' wins → open", () => {
    expect(c("The café has reopened under new ownership")).toBe("open");
    expect(c("Temporarily closed last month, but now open again")).toBe("open");
  });
});

describe("S2 classifier — NEGATIVES stay unknown (red-then-green)", () => {
  it("hours: 'closed Mondays' / 'closed on Sundays' / 'closed for the holiday' → unknown", () => {
    // RED: a naive /closed/ match would flag all three as closed.
    for (const s of ["We are closed Mondays", "Closed on Sundays", "Closed for the holiday weekend"]) {
      expect(/closed/i.test(s)).toBe(true); // the naive trap
      expect(c(s)).toBe("unknown"); // GREEN: the classifier refuses
    }
  });
  it("figurative: 'closed-loop recycling' → unknown", () => {
    expect(/closed/i.test("closed-loop recycling system")).toBe(true);
    expect(c("We run a closed-loop recycling system")).toBe("unknown");
  });
  it("bare unqualified 'the café is closed' → unknown (conservative)", () => {
    expect(c("Some reviewers said the café is closed")).toBe("unknown");
  });
  it("no closure language at all → unknown", () => {
    expect(c("Le French Rooster is teaming up with Cafe Barra, a local roaster")).toBe("unknown");
  });
});
