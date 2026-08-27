// R3b client-voice birth-guard tests — each MUST fail if its guard is removed (load-bearing).
// The module lives under supabase/functions/_shared (edge-mounted, reuses the R3 faithfulness rail);
// this test lives under src/** so the vitest suite runs it.
import { describe, expect, it } from "vitest";
import { admitClientVoice } from "../../../supabase/functions/_shared/clientVoiceGuard.ts";

// The client's OWN page text (self-descriptive channel copy).
const PAGE =
  "We partner with independent cafés and roasters across Los Angeles. " +
  "All of our coffees are available in 12 oz bags and for wholesale partners. " +
  "Cafe Barra holds a near-monopoly position in two specific niches. " + // planted analysis (also on page — verbatim)
  "6. The 2019-2020 crisis left a reputational dent.";                    // planted numbered analysis artifact

describe("R3b classification guard — analysis-flavored lifts are refused (item-31 test)", () => {
  it("ADMITS a self-descriptive channel statement (verbatim)", () => {
    const r = admitClientVoice("All of our coffees are available in 12 oz bags and for wholesale partners.", PAGE);
    expect(r.admit).toBe(true);
  });

  it("REFUSES an analysis-marker lift even though it is verbatim on the page (classification load-bearing)", () => {
    // 'near-monopoly' + 'market position' language: no org promotes itself this way. Verbatim but refused.
    expect(admitClientVoice("Cafe Barra holds a near-monopoly position in two specific niches.", PAGE))
      .toEqual({ admit: false, reason: "class_analysis_marker" });
  });

  it("REFUSES a numbered-list analysis artifact (the exact item-31 leak shape)", () => {
    expect(admitClientVoice("6. The 2019-2020 crisis left a reputational dent.", PAGE))
      .toEqual({ admit: false, reason: "class_numbered_artifact" });
  });

  it("REFUSES a 'growth constraint / brand invisibility' analysis read", () => {
    const p = "Our growth constraint is brand invisibility and thin DTC discovery.";
    expect(admitClientVoice("Our growth constraint is brand invisibility and thin DTC discovery.", p).admit).toBe(false);
  });

  it("still enforces FAITHFULNESS: a non-verbatim self-descriptive lift is refused (E4)", () => {
    expect(admitClientVoice("We are the best roaster in the entire country.", PAGE).admit).toBe(false);
  });
});
