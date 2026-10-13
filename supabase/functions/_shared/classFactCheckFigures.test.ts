// ── G1–G3 (operator rulings, 2026-10-13): the figure defects ────────────────────────────────────
//
// Two defects were filed Oct 8 and reproduced on Edgewood's real rows:
//   (1) FIGURE_RE's trailing \b dropped % and +, because no word boundary sits between '%' and a
//       space. Every percentage in the record was therefore unsourceable: the probe read
//       "90 family-placement…" while the row read "90%+ family-placement…".
//   (2) Probes are a contiguous word run in OUR order, so a true record fact in a different order
//       ("in 1993 Edgewood established…" vs "…since 1993, with over 90%") was declared unsourced.
//
// G1 replaces the regex. G2 adds a second chance for FIGURES ONLY — a high-entropy token whose bare
// presence in one cited row IS the sourcing. Exclusivity and reach keep requiring a window, because
// a bare "only" appears in half the corpus and would make the check pass trivially.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideFieldClass, extractSpecifics, specificIsSourced, specificIsSourcedWithSecondChance } from "./classFactCheck.ts";

// The real Edgewood rows these defects were found on.
const R99 = "Lists Edgewood as a key resource for families; highlights the Kinship program's national-first status and 90%+ family-placement retention rate over three decades.";
const RDF = "Kinship Support Network celebrates 30 years; in 1993 Edgewood established the first kinship program in the country; over 90% of youth served stayed in family settings to age 18; model replicated throughout U.S. and internationally.";
const RFH = "Findhelp.org lists multiple Edgewood programs covering SF and San Mateo counties; TBS program serves ages 3-21 with Medi-Cal/Medicare.";

const figures = (t: string) => extractSpecifics(t).filter((s) => s.kind === "figure").map((s) => s.token);

Deno.test("1. a percentage is captured with its % and + — FIGURE_RE keeps the suffix", () => {
  assertEquals(figures("a 90%+ retention rate"), ["90%+"]);
  assertEquals(figures("over 90% of youth"), ["90%"]);
});

Deno.test("2. (b) PASSES a 90%+ figure verbatim in a cited record row", () => {
  const d = decideFieldClass({
    field: "unique_attributes[1]", cls: "our_read",
    text: "a 90%+ family-placement retention rate over three decades",
    citedSourceTexts: [R99],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
});

Deno.test("3. a range is one token, not two halves", () => {
  assertEquals(figures("the program serves ages 3-21 with Medi-Cal"), ["3-21"]);
  assertEquals(figures("youth 5-17 years of age"), ["5-17"]);
});

Deno.test("4. currency and scale survive capture", () => {
  assertEquals(figures("a $1.2M grant"), ["$1.2M"]);
  assertEquals(figures("a $350K solvency grant"), ["$350K"]);
  assertEquals(figures("170+ years of history"), ["170+"]);
  assertEquals(figures("4,000 community members"), ["4,000"]);
  // the number core never ends on a separator: the old regex captured "1." from "$1.2M"
  assert(!figures("a $1.2M grant").includes("1."), "no token ends on a separator");
});

Deno.test("5. an ISO date does not become a range (year-only ruling, 2026-10-07)", () => {
  assertEquals(figures("snapshot 2025-02-01"), ["2025"]);
  assertEquals(figures("read 2026-09-11 and 2024-01-01"), ["2026", "2024"]);
  for (const t of figures("snapshot 2025-02-01")) {
    assert(!t.includes("-"), `an ISO date must not produce a range token, got "${t}"`);
  }
});

Deno.test("6. a figure in a cited row sources in ANY word order (G2 second chance)", () => {
  const d = decideFieldClass({
    field: "where_to_play", cls: "our_read",
    text: "the first kinship program in the country since 1993, with over 90% of youth staying in family settings",
    citedSourceTexts: [RDF],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
});

Deno.test("7. the second chance NEVER crosses rows", () => {
  // "90%" is in RDF and "3-21" is in RFH; a field citing both may use either, but a token present in
  // NEITHER single row must not be assembled from the pair.
  const ok = decideFieldClass({
    field: "f", cls: "our_read", text: "serving ages 3-21 with over 90% retention",
    citedSourceTexts: [RDF, RFH],
  });
  assertEquals(ok.branch, "sourced", JSON.stringify(ok.unsourced));
  // the control: a figure in no row at all
  const bad = decideFieldClass({
    field: "f", cls: "our_read", text: "serving 12,500 families",
    citedSourceTexts: [RDF, RFH],
  });
  assertEquals(bad.unsourced.map((u) => u.token), ["12,500"]);
  // The per-row rule, asserted directly: each figure clears against ONE row ALONE. Asserted on the
  // second-chance function, because that is the one whose per-row property is at issue — the
  // windowed probes cannot reach "90%" in RDF at all (that is defect 2, test 6).
  const sp = extractSpecifics("serving ages 3-21 with over 90% retention").filter((s) => s.kind === "figure");
  for (const s of sp) {
    const perRow = [RDF, RFH].some((r) => specificIsSourcedWithSecondChance(s, [r]));
    assert(perRow, `"${s.token}" must source against ONE row on its own, not the pair`);
  }
  // and the concatenation is NOT a row: a RANGE whose halves sit in different rows must stay
  // unsourced. "3-21" is in neither "serves ages 3 and up" nor "to age 21" — only in their
  // concatenation, which is exactly what must not count.
  const split = extractSpecifics("serving ages 3-21").filter((s) => s.kind === "figure")[0];
  assertEquals(split.token, "3-21");
  assertEquals(
    specificIsSourcedWithSecondChance(split, ["serves ages 3 and up", "to age 21"]), false,
    "two rows must not jointly source a token neither states",
  );
  // the same token DOES clear against the one row that states it whole
  assertEquals(specificIsSourcedWithSecondChance(split, [RFH]), true);

  // ── the WINDOWED path is where cross-row assembly can actually leak ───────────────────────────
  // A bare token has no internal whitespace, so "in one row" and "in the rows joined" are the same
  // predicate for the second chance — the concatenation risk lives in the MULTI-WORD probes. This
  // leg is the one that catches a gate that joins its cited texts: the probe "only kinship program
  // in" exists only ACROSS the boundary of these two rows, and must not source.
  const excl = extractSpecifics("the only kinship program in the country").find((x) => x.token === "only")!;
  assertEquals(
    specificIsSourced(excl, ["we run the only", "kinship program in the country"]), false,
    "a probe that exists only across a row boundary must not source",
  );
  // and it DOES source against a single row that carries the whole run
  assertEquals(specificIsSourced(excl, ["we run the only kinship program in the country"]), true);
});

Deno.test("8. the second chance is FIGURES ONLY — a bare exclusivity word still cannot source itself", () => {
  // R99 contains the word "first" (as "national-first status") but not our construction.
  const d = decideFieldClass({
    field: "unique_attributes[1]", cls: "our_read",
    text: "the first kinship program in the country, with a 90%+ family-placement retention rate over three decades",
    citedSourceTexts: [R99],
  });
  assertEquals(d.branch, "judge_required", "the figure clears; the exclusivity word does not");
  assertEquals(d.unsourced.map((u) => `${u.kind}:${u.token}`), ["exclusivity:first"]);
  // the original rule, restated: a row that merely contains "only" does not source it
  const only = extractSpecifics("the only youth CSU anywhere").find((s) => s.token === "only")!;
  assertEquals(specificIsSourced(only, ["we are only getting started"]), false);
  // and a bare reach word is not rescued either
  const reach = decideFieldClass({
    field: "f", cls: "our_read", text: "we serve families in San Francisco",
    citedSourceTexts: [RFH],
  });
  assertEquals(reach.unsourced.map((u) => u.token), ["San Francisco"], "SF ≠ San Francisco; reach gets no second chance");
});

Deno.test("9. a figure in NO cited row stays unsourced", () => {
  const d = decideFieldClass({
    field: "f", cls: "our_read", text: "a 99.9% success rate",
    citedSourceTexts: [R99, RDF, RFH],
  });
  assertEquals(d.unsourced.map((u) => `${u.kind}:${u.token}`), ["figure:99.9%"]);
});

Deno.test("10. the whole Edgewood kinship line sources once BOTH rows are cited", () => {
  const d = decideFieldClass({
    field: "unique_attributes[1]", cls: "our_read",
    text: "the first kinship program in the country, with a 90%+ family-placement retention rate over three decades",
    citedSourceTexts: [R99, RDF],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
  assertEquals(d.unsourced, []);
});
