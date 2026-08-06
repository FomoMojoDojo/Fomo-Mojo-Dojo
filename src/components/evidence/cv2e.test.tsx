// CV-2e — verbatim quote guard, language rule, and render-boundary primitive.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { liftVerbatimQuote, pickEventDate } from "@/lib/verbatimQuote";
import { US_ENGLISH_RULE, flagBritishisms } from "../../../supabase/functions/_shared/languageRule";
import SignalQuote, { AS_CAPTURED_LABEL } from "./SignalQuote";

const SRC = "The board voted to commoditise the shuttle service in 2016.";

describe("CV-2e GOAL 1 — verbatim quote guard (code mirror of the DB CHECK)", () => {
  it("admits a byte-exact substring; refuses drift, model text, and empty", () => {
    expect(liftVerbatimQuote(SRC, "commoditise the shuttle service")).toEqual({
      quote: "commoditise the shuttle service",
      quote_source_text: SRC,
    });
    // FALSIFICATION — a ONE-CHAR drift (z) is not a substring → refused
    expect(liftVerbatimQuote(SRC, "commoditize the shuttle service")).toBeNull();
    // model paraphrase not present in source → refused (substitution guard)
    expect(liftVerbatimQuote(SRC, "The company is commoditizing its services")).toBeNull();
    // no source / empty candidate → no quote (honest absence)
    expect(liftVerbatimQuote(null, "anything")).toBeNull();
    expect(liftVerbatimQuote(SRC, "   ")).toBeNull();
  });

  it("event date: accepts a real ISO date (day) or a month, never infers one", () => {
    expect(pickEventDate("2016-05-01")).toEqual({ date: "2016-05-01", precision: "day" });
    expect(pickEventDate("2016-05-01T09:00:00Z")).toEqual({ date: "2016-05-01", precision: "day" });
    // month precision → first of month, flagged 'month' (self-describing)
    expect(pickEventDate("2026-04")).toEqual({ date: "2026-04-01", precision: "month" });
    expect(pickEventDate("2026-13")).toBeNull(); // invalid month
    // absence-isn't-a-verdict — a bare year / prose / 'Captured' → NULL, never inferred
    expect(pickEventDate("2016")).toBeNull();
    expect(pickEventDate("Captured")).toBeNull();
    expect(pickEventDate(null)).toBeNull();
    expect(pickEventDate("2016-13-40")).toBeNull();
  });
});

describe("CV-2e GOAL 4 — language rule (instruction + judge criterion)", () => {
  it("flagBritishisms fires on the logged Britishisms, stays quiet on US spelling", () => {
    expect(flagBritishisms("They are commoditising and categorised the utilisation")).toEqual(
      expect.arrayContaining(["commoditising", "categorised", "utilisation"]),
    );
    // US spellings and genuine -ise words never false-positive
    expect(flagBritishisms("organize, utilization, categorized, specialize, analyze")).toEqual([]);
    expect(flagBritishisms("We exercise caution and comprise a surprise franchise")).toEqual([]);
  });

  it("the proposal generator carries the instruction AND the judge criterion", () => {
    const gen = readFileSync(
      join(process.cwd(), "supabase/functions/generate-first-read-proposal/index.ts"),
      "utf8",
    );
    // FALSIFICATION target: removing either line reddens this test
    expect(gen).toContain("US_ENGLISH_RULE");
    expect(gen).toContain("flagBritishisms");
    // the rule text itself is a real US-English instruction
    expect(US_ENGLISH_RULE).toMatch(/US English/i);
  });
});

describe("CV-2e GOAL 2/3 — render-boundary quote primitive", () => {
  it("renders the verbatim quote with the 'as captured' label; dated shows the date", () => {
    const { container } = render(<SignalQuote quote="commoditise the shuttle service" eventDate="2016-05-01" />);
    const bq = container.querySelector("blockquote");
    expect(bq?.textContent).toContain("commoditise the shuttle service");
    const cap = container.querySelector(".cvs-signal-quote-cap")?.textContent || "";
    expect(cap).toContain(AS_CAPTURED_LABEL);
    expect(cap).toContain("2016"); // the visible source date is shown, not "Captured"
  });

  it("undated quote renders the label without a date", () => {
    const { container } = render(<SignalQuote quote="a real captured line" />);
    const cap = container.querySelector(".cvs-signal-quote-cap")?.textContent || "";
    expect(cap.trim()).toBe(AS_CAPTURED_LABEL); // no ' · date' appended
  });

  it("quote-less signal renders NOTHING — no quote machinery (render-boundary)", () => {
    const empty = render(<SignalQuote quote={null} />);
    expect(empty.container.querySelector("blockquote")).toBeNull();
    expect(empty.container.querySelector(".cvs-signal-quote-cap")).toBeNull();
    const blank = render(<SignalQuote quote="   " />);
    expect(blank.container.querySelector("figure")).toBeNull();
  });
});
