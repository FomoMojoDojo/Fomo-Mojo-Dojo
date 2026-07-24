// V2-6d — fetch-and-retain quote supply (pure core).
//
// The receipts gap on the default engine (V2-6c live finding: the JSON-only synthesis
// prompt emits zero web_search citations) is closed deterministically: AFTER signals
// mint, fetch each quote-less signal's OWN source_url, retain what actually comes back,
// and lift a byte-exact quote from the retained text with the SHIPPED producer. No model,
// no prompt change — the fragile public-baseline generator stays untouched. This same
// mechanism covers competitor-discovery-minted signals (source URLs with no fetched body,
// the exact gap named at V2-6): the pass is source_type-agnostic — it selects any
// quote-less signal that carries an http(s) source_url.
//
// This module is the PURE core (disposition + rate-shape config); the edge function
// retain-quote-supply does the impure orchestration (query, chunked fetch, ledger, write)
// and calls liftQuoteFromFetch per signal. signals_quote_verbatim (byte-exact
// liftVerbatimQuote inside produceQuote) stays the sole authority — a bot-walled or failed
// fetch, or a page with no quotable prose, yields honest absence, never a padded quote.

import { produceQuote } from "./quoteProducer.ts";

export type QuoteDisposition =
  | "lifted" // fetched, and a byte-exact verbatim line was produced
  | "fetch_failed" // bot-wall / 4xx-5xx / timeout / non-HTML — the fetch itself did not yield text
  | "fetched_no_quote"; // fetched real text, but no quotable prose line (boilerplate/nav/too short)

export interface LiftOutcome {
  disposition: QuoteDisposition;
  /** Present only when disposition === "lifted". */
  quote?: string;
  quote_source_text?: string;
  event_date?: string | null;
}

/**
 * Decide the disposition for one signal from its fetch result, and (when lifted) produce
 * the byte-exact quote + its retained source + a visible date. PURE — no I/O.
 *
 * - `fetch.ok === false` → `fetch_failed` (never retried into synthesis, never padded).
 * - fetched text present → run the SHIPPED produceQuote (boilerplate-refused, longest /
 *   relevance selection, byte-exact CHECK). No line → `fetched_no_quote`.
 * - A date rides ONLY when the signal visibly carried one (pickEventDate law, inside
 *   produceQuote) — never inferred from the page.
 */
export function liftQuoteFromFetch(
  fetch: { ok: boolean; text: string },
  dateCandidate: string | null | undefined,
  relevanceHint: string | null | undefined,
): LiftOutcome {
  if (!fetch.ok) return { disposition: "fetch_failed" };
  const produced = produceQuote(fetch.text, dateCandidate ?? null, relevanceHint ?? "");
  if (!produced) return { disposition: "fetched_no_quote" };
  return {
    disposition: "lifted",
    quote: produced.quote,
    quote_source_text: produced.quote_source_text,
    event_date: produced.event_date,
  };
}

/** The columns a lift is allowed to write — the write-scope law in one place (GOAL 5). */
export interface SignalQuoteUpdate {
  quote: string;
  quote_source_text: string;
  event_date: string | null;
}

/**
 * Build the signal-row update for a lifted outcome. This is the ONLY thing the pass writes
 * to a signal: quote / quote_source_text / event_date — no claim, identity, or verdict
 * column. Returns null for a non-lifted outcome (nothing to write). Keeping the payload
 * shape here makes the write-scope invariant unit-testable and impossible to widen by
 * accident in the edge orchestration.
 */
export function signalQuoteUpdate(outcome: LiftOutcome): SignalQuoteUpdate | null {
  if (outcome.disposition !== "lifted" || outcome.quote == null || outcome.quote_source_text == null) return null;
  return {
    quote: outcome.quote,
    quote_source_text: outcome.quote_source_text,
    event_date: outcome.event_date ?? null,
  };
}

// Rate-shape the fetch burst. SRCH-1 lesson: a burst trips bot detection. A modest
// concurrency cap plus a jittered inter-request delay keeps the pass polite; the run
// time budget stops the pass before the ~150s edge-isolate response cut, and
// resume-by-reclick (quote IS NULL filter) continues from where it stopped.
export const FETCH_RATE_SHAPE = {
  /** At most this many fetches in flight — a modest cap, not a burst. */
  concurrency: 3,
  /** Jittered inter-request floor/ceiling (ms) between fetches within a lane. */
  minDelayMs: 250,
  maxDelayMs: 700,
  /** Per-URL fetch timeout (matches the crawl's fetchAndExtract). */
  perUrlTimeoutMs: 20_000,
  /** Stop the pass at this wall-clock; remaining quote-less signals resume on re-click. */
  runTimeBudgetMs: 110_000,
} as const;
