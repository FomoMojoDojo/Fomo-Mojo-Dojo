// SRCH-1 — outage-classification proof.
//
// Drives the classifier with STUBBED SearXNG responses; fires no real queries (the
// live instance is rate-limit-suspended, and hammering it is what caused the outage
// under diagnosis). The outage fixture uses the exact unresponsive_engines payload the
// live instance returned during the Sonos investigation.
//
// The rule under test: only claim the backend was unusable when EVERY query returned
// zero raw results AND SearXNG named at least one unresponsive engine. Anything else
// stays a thin-evidence verdict.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Mirror of the implementation in index.ts (that module runs a Deno.serve on import,
// so the pure classifier logic is restated here rather than imported).
type SearchDiag = {
  queriesRun: number;
  queriesWithResults: number;
  totalRawResults: number;
  unresponsive: Map<string, string>;
};

function newSearchDiag(): SearchDiag {
  return { queriesRun: 0, queriesWithResults: 0, totalRawResults: 0, unresponsive: new Map() };
}

function absorb(diag: SearchDiag, data: Record<string, unknown>) {
  const results = Array.isArray(data?.results) ? data.results : [];
  diag.queriesRun += 1;
  diag.totalRawResults += results.length;
  if (results.length > 0) diag.queriesWithResults += 1;
  const unresponsive = Array.isArray(data?.unresponsive_engines) ? data.unresponsive_engines : [];
  for (const entry of unresponsive) {
    const engine = Array.isArray(entry) ? String(entry[0] ?? "") : "";
    const why = Array.isArray(entry) ? String(entry[1] ?? "") : "";
    if (engine && !diag.unresponsive.has(engine)) diag.unresponsive.set(engine, why || "unresponsive");
  }
}

function isUnambiguousSearchOutage(diag: SearchDiag): boolean {
  return diag.queriesRun > 0 && diag.totalRawResults === 0 && diag.unresponsive.size > 0;
}

function describeUnresponsive(diag: SearchDiag): string {
  return [...diag.unresponsive.entries()].map(([engine, why]) => `${engine}: ${why}`).join("; ");
}

// The verbatim shape the live SearXNG returned while suspended (HTTP 200, empty
// results, engines named) — the response that was misread as thin evidence.
const OUTAGE_RESPONSE = {
  query: '"Sonos" sonos.com',
  number_of_results: 0,
  results: [],
  unresponsive_engines: [
    ["brave", "Suspended: too many requests"],
    ["duckduckgo", "CAPTCHA"],
    ["google", "Suspended: access denied"],
    ["startpage", "Suspended: CAPTCHA"],
  ],
};

const HEALTHY_SPARSE_RESPONSE = {
  query: "tiny local company",
  results: [{ url: "https://example.com/about", title: "About", content: "A small page." }],
  unresponsive_engines: [],
};

const HEALTHY_EMPTY_RESPONSE = {
  query: "company with genuinely no coverage",
  results: [],
  unresponsive_engines: [],
};

Deno.test("outage: all 8 queries empty + engines suspended → search_unavailable", () => {
  const diag = newSearchDiag();
  for (let i = 0; i < 8; i++) absorb(diag, OUTAGE_RESPONSE);

  assertEquals(diag.queriesRun, 8);
  assertEquals(diag.totalRawResults, 0);
  assertEquals(isUnambiguousSearchOutage(diag), true);

  // The reason must NAME the outage, so the record says couldn't-check, not
  // looked-and-found-nothing.
  const detail = describeUnresponsive(diag);
  assertStringIncludes(detail, "brave: Suspended: too many requests");
  assertStringIncludes(detail, "duckduckgo: CAPTCHA");
  assertStringIncludes(detail, "google: Suspended: access denied");
  assertStringIncludes(detail, "startpage: Suspended: CAPTCHA");
});

Deno.test("healthy but sparse: results came back → stays thin, NOT search_unavailable", () => {
  const diag = newSearchDiag();
  for (let i = 0; i < 8; i++) absorb(diag, HEALTHY_SPARSE_RESPONSE);

  assertEquals(diag.totalRawResults, 8);
  assertEquals(isUnambiguousSearchOutage(diag), false);
});

Deno.test("healthy and empty: nothing found, no engine fault → stays thin", () => {
  // A company with genuinely no public coverage. We DID look; the thin verdict is the
  // honest one and must not be upgraded to an outage claim.
  const diag = newSearchDiag();
  for (let i = 0; i < 8; i++) absorb(diag, HEALTHY_EMPTY_RESPONSE);

  assertEquals(diag.totalRawResults, 0);
  assertEquals(diag.unresponsive.size, 0);
  assertEquals(isUnambiguousSearchOutage(diag), false);
});

Deno.test("partial degradation: some engines suspended but results still arrived → stays thin", () => {
  // The conservative half of the rule. Engines were unhealthy, but search still
  // produced evidence, so we cannot claim we could not check.
  const diag = newSearchDiag();
  absorb(diag, OUTAGE_RESPONSE);
  absorb(diag, { results: [{ url: "https://example.com" }], unresponsive_engines: [["brave", "Suspended"]] });
  for (let i = 0; i < 6; i++) absorb(diag, OUTAGE_RESPONSE);

  assertEquals(diag.unresponsive.size > 0, true);
  assertEquals(diag.totalRawResults, 1);
  assertEquals(isUnambiguousSearchOutage(diag), false);
});

Deno.test("no queries ran → never claims an outage", () => {
  const diag = newSearchDiag();
  assertEquals(isUnambiguousSearchOutage(diag), false);
});
