// V2-6d — fetch-and-retain quote supply. The producer + byte-exact CHECK are unchanged;
// these prove the DISPOSITION logic is honest (lifted / fetch_failed / fetched_no_quote),
// idempotent, source-agnostic (competitor-discovery flows the same path), and rate-shaped.

import { describe, it, expect } from "vitest";
import { liftQuoteFromFetch, signalQuoteUpdate, FETCH_RATE_SHAPE } from "./quoteSupply";
import { liftVerbatimQuote } from "../verbatimQuote";

// Realistic retained page text (what fetchAndExtract would return for a fetchable source).
const PAGE =
  "Edgewood Center offers a continuum of mental healthcare for youth and families across the San Francisco Bay Area. Our crisis stabilization unit is the only one serving children under twelve.";

// Simulate what the edge orchestration passes to the pure core per signal.
function fetchResult(over: Partial<{ ok: boolean; text: string }> = {}) {
  return { ok: true, text: PAGE, ...over };
}

describe("V2-6d — liftQuoteFromFetch (honest disposition)", () => {
  it("fetched real text → lifted, byte-exact, verified by the CHECK", () => {
    const out = liftQuoteFromFetch(fetchResult(), null, "crisis stabilization unit children");
    expect(out.disposition).toBe("lifted");
    expect(PAGE.includes(out.quote!)).toBe(true); // never fuzzy
    expect(liftVerbatimQuote(PAGE, out.quote!)).not.toBeNull(); // the authority agrees
    expect(out.quote_source_text).toBe(PAGE);
  });

  it("FALSIFICATION: a one-char drift in the fetched basis makes the CHECK refuse the lifted quote", () => {
    const out = liftQuoteFromFetch(fetchResult(), null, "crisis stabilization unit");
    const quote = out.quote!;
    expect(liftVerbatimQuote(PAGE, quote)).not.toBeNull();
    // Drift exactly one char OF the selected span's occurrence in the page.
    const drifted = PAGE.replace(quote, "Z" + quote.slice(1));
    expect(drifted).not.toBe(PAGE);
    expect(drifted.includes(quote)).toBe(false);
    expect(liftVerbatimQuote(drifted, quote)).toBeNull(); // refuses — byte-exact is the authority
  });

  it("fetch failed (bot-wall / 4xx-5xx / timeout) → fetch_failed, no quote", () => {
    const out = liftQuoteFromFetch(fetchResult({ ok: false, text: "" }), null, "x");
    expect(out.disposition).toBe("fetch_failed");
    expect(out.quote).toBeUndefined();
    expect(out.quote_source_text).toBeUndefined();
    expect(out.event_date).toBeUndefined();
  });

  it("fetched but only boilerplate/nav → fetched_no_quote (never padded)", () => {
    const boiler = "Cookie policy. We use cookies to improve your experience. © 2024 All rights reserved. Sign in.";
    const out = liftQuoteFromFetch(fetchResult({ text: boiler }), null, "x");
    expect(out.disposition).toBe("fetched_no_quote");
    expect(out.quote).toBeUndefined();
  });

  it("fetched but too short to yield a line → fetched_no_quote", () => {
    const out = liftQuoteFromFetch(fetchResult({ text: "short" }), null, "x");
    expect(out.disposition).toBe("fetched_no_quote");
  });

  it("event date rides ONLY when the signal visibly carried an ISO date (pickEventDate law)", () => {
    expect(liftQuoteFromFetch(fetchResult(), "2024-05-01", "crisis").event_date).toBe("2024-05-01");
    expect(liftQuoteFromFetch(fetchResult(), "last spring", "crisis").event_date).toBeNull(); // prose → never inferred
    expect(liftQuoteFromFetch(fetchResult(), null, "crisis").event_date).toBeNull();
  });

  it("GOAL 4 — source-agnostic: a competitor-discovery-shaped signal flows the same path", () => {
    // The pure core takes only { ok, text } + date + hint — it has no notion of source_type,
    // so a competitor_discovery_run signal lifts identically to a public_baseline_run one.
    const competitorPage =
      "The rival provider markets a 24-hour intake line and same-day assessments for adolescents in crisis.";
    const out = liftQuoteFromFetch({ ok: true, text: competitorPage }, null, "same-day assessments adolescents");
    expect(out.disposition).toBe("lifted");
    expect(competitorPage.includes(out.quote!)).toBe(true);
  });
});

describe("V2-6d — signalQuoteUpdate (write-scope law: exactly three render columns)", () => {
  it("a lifted outcome writes ONLY quote / quote_source_text / event_date", () => {
    const out = liftQuoteFromFetch(fetchResult(), "2024-05-01", "crisis stabilization unit");
    const update = signalQuoteUpdate(out)!;
    // FALSIFICATION guard: any claim/identity/verdict column added here fails this set.
    expect(new Set(Object.keys(update))).toEqual(new Set(["quote", "quote_source_text", "event_date"]));
    expect(update.quote).toBe(out.quote);
    expect(update.event_date).toBe("2024-05-01");
  });
  it("a non-lifted outcome produces no write (nothing to update)", () => {
    expect(signalQuoteUpdate(liftQuoteFromFetch(fetchResult({ ok: false, text: "" }), null, "x"))).toBeNull();
    expect(signalQuoteUpdate(liftQuoteFromFetch(fetchResult({ text: "short" }), null, "x"))).toBeNull();
  });
});

describe("V2-6d — FETCH_RATE_SHAPE (the burst is capped — SRCH-1 lesson)", () => {
  it("concurrency is a modest cap, not a burst", () => {
    expect(FETCH_RATE_SHAPE.concurrency).toBeGreaterThanOrEqual(1);
    expect(FETCH_RATE_SHAPE.concurrency).toBeLessThanOrEqual(5);
  });
  it("a positive inter-request delay floor is present, min <= max", () => {
    expect(FETCH_RATE_SHAPE.minDelayMs).toBeGreaterThan(0);
    expect(FETCH_RATE_SHAPE.maxDelayMs).toBeGreaterThanOrEqual(FETCH_RATE_SHAPE.minDelayMs);
  });
  it("the run time budget stops before the ~150s edge cut (resume-by-reclick continues)", () => {
    expect(FETCH_RATE_SHAPE.runTimeBudgetMs).toBeGreaterThan(0);
    expect(FETCH_RATE_SHAPE.runTimeBudgetMs).toBeLessThan(150_000);
  });
});
