// FD-3 TRIPWIRE — FrontDoorMapAct.
//
// Proves: (a) only PUBLISHED industry_keys ever reach the render/option path;
// (b) an unpublished key (coffee-cafe) renders NOTHING — auto-select falls back,
// never a wrong map; (c) the three render states — matched (no picker), no-match
// fallback, zero-published defensive empty (RG-1 acceptance law: honest empty).
//
// Falsification-validated (gate report): forcing an unpublished coffee-cafe row
// into the hook's data turns the "coffee-cafe never renders" assertion RED naming
// the leak; filtering it back to published-only goes GREEN.

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// ── Controllable fakes for the two hooks FrontDoorMapAct consumes ─────────────
let COMPANY: { industry_key?: string | null } | null = { industry_key: null };
let MAPS = new Map<string, { industry_key: string; industry_label: string; taxonomy_version: string | null; steps: { step_number: number; step_label: string; description: string }[] }>();
let LOADING = false;

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: COMPANY }) }));
vi.mock("@/hooks/useIndustryReferenceMaps", () => ({
  useIndustryReferenceMaps: () => ({ maps: MAPS, keys: [...MAPS.keys()].sort(), loading: LOADING }),
}));

import FrontDoorMapAct from "./FrontDoorMapAct";

const stepFor = (label: string) => ({ step_number: 1, step_label: label, description: `desc for ${label}` });
const mapFor = (key: string, label: string) => ({ industry_key: key, industry_label: label, taxonomy_version: "fd1-priority-8", steps: [stepFor(`${label} step`)] });

// The hook itself filters is_published=true, so a PUBLISHED map set never contains
// coffee-cafe. These fixtures mirror that: the "published" set is the 6.
function publishedSix() {
  const m = new Map<string, ReturnType<typeof mapFor>>();
  for (const [k, l] of [
    ["b2b-saas", "Business Software Adoption"],
    ["cloud-infrastructure", "Cloud Infrastructure Setup"],
    ["environmental-remediation", "Environmental Remediation"],
    ["home-improvement-remodeling", "Home Improvement Planning"],
    ["insurance-agency", "Insurance Coverage"],
    ["nonprofit-social-services", "Seeking Support"],
  ]) m.set(k, mapFor(k, l));
  return m;
}

describe("FrontDoorMapAct — FD-3 tripwire", () => {
  it("MATCHED: auto-selects the company's industry map and renders NO picker", () => {
    COMPANY = { industry_key: "nonprofit-social-services" };
    MAPS = publishedSix();
    LOADING = false;
    render(<FrontDoorMapAct />);
    // the matched map's step renders…
    expect(screen.getByText("Seeking Support step")).toBeTruthy();
    // …and NO fallback selector exists in the matched state.
    expect(
      screen.queryByText("No standard map matched this company's industry yet. Choose one:"),
      "a picker rendered in the MATCHED state — FD-3 forbids it",
    ).toBeNull();
    // attribution always printed on a rendered map.
    expect(screen.getByText(/Reference model · Jobs-to-be-Done \/ ODI framework · fd1-priority-8/)).toBeTruthy();
  });

  it("NO-MATCH: a NULL / non-published key falls back to the selector, renders no map", () => {
    COMPANY = { industry_key: null };
    MAPS = publishedSix();
    render(<FrontDoorMapAct />);
    expect(screen.getByText("No standard map matched this company's industry yet. Choose one:")).toBeTruthy();
    // no map body without a pick
    expect(screen.queryByText("Seeking Support step")).toBeNull();
  });

  it("coffee-cafe (unpublished) NEVER renders — its key isn't in the published set, so it falls back", () => {
    // A company keyed to coffee-cafe, with the honest published-only set (no coffee-cafe).
    COMPANY = { industry_key: "coffee-cafe" };
    MAPS = publishedSix();
    render(<FrontDoorMapAct />);
    // The coffee-cafe map does NOT render; the surface falls back.
    expect(
      screen.queryByText(/Coffee Shop Visit/),
      "LEAK: coffee-cafe (is_published=false) rendered on the client front-door surface",
    ).toBeNull();
    expect(screen.getByText("No standard map matched this company's industry yet. Choose one:")).toBeTruthy();
  });

  it("DEFENSIVE EMPTY: zero published maps → the defensive-empty string, never a crash", () => {
    COMPANY = { industry_key: "nonprofit-social-services" };
    MAPS = new Map();
    render(<FrontDoorMapAct />);
    expect(screen.getByText("That industry map isn't published yet.")).toBeTruthy();
  });
});
