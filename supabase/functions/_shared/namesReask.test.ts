// ── N1a / N1b / N1c / V4a (operator rulings, 2026-10-14) ────────────────────────────────────────
//
// WHY. Wasabi's fourth stage attempt was refused by N1 (audit 10341) on
// `value (you): AI [name]` — the line said "backups and AI datasets" and none of its three cited
// rows states "AI", though TEN rows in the live pool do. Three faults and one gap showed up at once:
//
//   N1a  "AI" is a two-letter abbreviation. It names a CATEGORY, not a thing, exactly as "regulated"
//        does — and category claims belong to the judge's grounding check, by the same ruling that
//        left "regulated" there. Three letters or more stays a name: CRM, SMBs, NVMe, JRVS identify
//        something specific enough to be stated or not.
//   N1b  ua[2] came back classed our_read (it cites a finding), so N1 never examined it — and
//        "Wasabi Fire" and "AI/ML", the exact names the ruling exists to catch, went unchecked.
//        Calling a line our read licenses the READING, not the invention of a product name. A
//        finding cannot satisfy it: a name appearing only there is a name we gave ourselves.
//   N1c  The refusal never reached the model. Ten pool rows stated the token the line needed and it
//        had no way to know. One bounded re-ask now hands it the refused specifics AND the ids of
//        rows that state each — and the answer faces every gate again. Code never rewrites a line.
//   V4a  The audit row stored ref tokens (S5, O3, F1), which mean nothing outside the run that
//        minted them.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nameShaped, namesIn, s1Unsourced, unsourcedNames } from "./classFactCheck.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── N1a ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("N1a. a lone all-caps token of exactly TWO letters is not a name", () => {
  for (const t of ["AI", "TV", "ML", "UX", "IT", "BI"]) {
    assertEquals(nameShaped(t), false, `${t} names a category, not a thing — the judge's business`);
  }
  // the refused line: "AI" goes, "S3" stays
  assertEquals(namesIn("cloud storage with S3 compatibility, supporting backups and AI datasets"), ["S3"]);
});

Deno.test("N1a. all-caps THREE or more is still a name", () => {
  for (const t of ["CRM", "SMBs", "JRVS", "NVMe", "FedRAMP", "SunRise"]) {
    assertEquals(nameShaped(t), true, `${t} identifies something specific`);
  }
});

Deno.test("N1a. slash and digit tokens are still names, including two-letter stems", () => {
  for (const t of ["AI/ML", "S3", "H100", "Medi-Cal/Medicare", "B2B2C"]) {
    assertEquals(nameShaped(t), true, `${t} carries a slash or digit — still a name`);
  }
  // this is the distinction that matters: bare AI is out, AI/ML is in
  assertEquals(nameShaped("AI"), false);
  assertEquals(nameShaped("AI/ML"), true);
});

Deno.test("N1a. a two-letter token is dropped only when it is ALL-CAPS and alone", () => {
  assertEquals(nameShaped("Hi"), false, "a plain Capitalized word was never a name");
  assertEquals(namesIn("partnering with AI Labs on delivery").includes("AI Labs"), true,
    "a multi-word run containing a two-letter token is still a name");
});

// ── N1b ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("N1b. an our_read line naming a product absent from its cited rows is refused", () => {
  const r = s1Unsourced({
    field: "unique_attributes[2]", cls: "our_read", companyName: "Wasabi Technologies",
    text: "AI-focused storage solutions like Wasabi Fire and Wasabi AiR support AI/ML workloads",
    citedSourceTexts: ["Liverpool FC quoted at NAB 2024: 'Wasabi AiR significantly reduces our manual efforts'"],
  });
  // the exact 2322e6db case, now examined because N1b brought our_read into scope
  assertEquals(r.unsourced_names?.sort(), ["AI/ML", "Wasabi Fire"]);
  assert(r.unsourced.some((u) => u.kind === "name" && u.token === "Wasabi Fire"), "and it refuses");
  assert(r.examined > 0, "an our_read line is no longer examined: 0");
});

Deno.test("N1b. an our_read line whose names ARE in a cited row passes", () => {
  const r = s1Unsourced({
    field: "unique_attributes[2]", cls: "our_read", companyName: "Wasabi Technologies",
    text: "Wasabi Fire and Wasabi AiR support AI/ML workloads",
    citedSourceTexts: ["infrastructure (Wasabi Fire NVMe tier, Wasabi AiR metadata) serving AI/ML workloads"],
  });
  assertEquals(r.unsourced_names, []);
});

Deno.test("N1b. a name present ONLY in a cited finding does not satisfy it", async () => {
  // The exclusion is the caller's: it passes only NON-FINDING rows as sources. Both halves pinned.
  const src = await read("../generate-public-read/index.ts");
  // F1: the closure reads fieldClasses[kind] instead of stamping the payload itself, so its
  // signature dropped the payload. The filter this test pins is unchanged.
  const fn = src.slice(src.indexOf("s1Refusal: (kind, _payload) =>"));
  const body = fn.slice(0, fn.indexOf("\n      },"));
  assert(body.includes('kindByRef.get(r) !== "finding"'), "the stage caller excludes findings by kind");
  const prm = await read("./publicReadPromote.ts");
  assert(prm.includes("!findingIds.has(id)"), "and so does the promote caller");
  // and the predicate itself: with the finding's text withheld, the name is unsourced
  assertEquals(unsourcedNames({ text: "Wasabi Fire is a tier", cls: "our_read", citedSourceTexts: [], companyName: "Wasabi Technologies" }),
    ["Wasabi Fire"]);
});

Deno.test("N1b. an UNCLASSED line is still out of scope — it cites nothing to be tested against", () => {
  assertEquals(unsourcedNames({ text: "Wasabi Fire and AI/ML", cls: null, citedSourceTexts: [] }), []);
  assertEquals(s1Unsourced({ field: "f", cls: null, text: "Wasabi Fire", citedSourceTexts: [] }).examined, 0);
});

// ── N1c ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("N1c. exactly ONE re-ask, and only on the S1/N1 refusal", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("for (;;) {"));
  assert(fn.includes("if (g.sourcingDetail !== undefined && !reasked && deps.reaskOnSourcingRefusal) {"),
    "gated on the S1 refusal AND on the shared `reasked` flag");
  // the SAME flag the class re-ask uses, so a kind gets at most one second attempt in total
  // C1-R (2026-10-15) added a THIRD path — the C1-S trigger inside commit. All three set the one
  // flag, which is what keeps the budget at one attempt per stage however the first was refused.
  const sets = [...fn.matchAll(/reasked = true;/g)].length;
  assertEquals(sets, 3, "sourcing, continuity and class paths all set the one flag");
  assert(fn.includes("if (next) { payload = next; reasked = true; continue; }"),
    "the fresh payload re-enters the loop");
});

Deno.test("N1c. the re-asked payload faces EVERY gate again", async () => {
  const src = await read("./publicReadPerKind.ts");
  // `continue` returns to the top of for(;;), which calls runGates — the whole sequence
  const loop = src.slice(src.indexOf("for (;;) {"));
  const gatesAt = loop.indexOf("const g = await runGates(kind, payload);");
  const reaskAt = loop.indexOf("if (g.sourcingDetail !== undefined");
  assert(gatesAt >= 0 && reaskAt > gatesAt, "the re-ask sits INSIDE the loop whose head calls runGates");
  // The SOURCING branch itself must `continue` — slicing from here and finding any `continue` is not
  // enough, because the class re-ask further down has one too, so a `break` planted in THIS branch
  // would pass while sending the re-asked payload straight past every gate.
  const branch = loop.slice(reaskAt, loop.indexOf("await reject(kind, g.guard", reaskAt));
  assert(/if \(next\) \{ payload = next; reasked = true; continue; \}/.test(branch),
    "the sourcing re-ask continues back to the loop head — never breaks out of it");
  assert(!/if \(next\)[^\n]*break;/.test(branch), "a break here would skip runGates entirely");
  // and runGates runs the full ordered sequence, S1 included
  const rg = src.slice(src.indexOf("const runGates = async"));
  for (const g of ["citation_outside_ledger", "offering_structure", "framing_vocab",
                   "citation_not_live_public", "deps.s1Refusal", "deps.judge("]) {
    assert(rg.includes(g), `${g} still runs on the second attempt`);
  }
});

Deno.test("N1c. CODE NEVER REWRITES A LINE — the re-ask returns the model's own answer", async () => {
  const src = await read("../generate-public-read/index.ts");
  // C1-R (2026-10-15) added the `because` argument and a continuity branch ahead of the sourcing
  // one, so the slice starts at the SOURCING branch itself rather than at the callback head.
  const fn = src.slice(src.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  const body = fn.slice(0, fn.indexOf("\n      reaskOnClassRefusal:"));
  // L1 (2026-10-15): the call carries its attempt and its role, so its cost row names them.
  assert(body.includes("const again = await run(genChoice, sys, user, 0.2,"), "the model answers again");
  assert(body.includes('attempt: (attemptNo[kind as Kind] ?? 1) + 1, role: "generator"'),
    "ledgered as the attempt it produces");
  assert(body.includes("return again;"), "and its answer is what is returned");
  // no splice, no patch, no field surgery
  assert(!/payload\[/.test(body), "the refused payload is never edited in place");
  assert(!body.includes("...payload"), "nor merged into");
});

Deno.test("N1c. the re-ask prompt names the refused tokens AND the rows that state each", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  const body = fn.slice(0, fn.indexOf("\n      reaskOnClassRefusal:"));
  // NP (2026-10-15): the private supportFor lookup is gone — the ONE feedback builder does it, for
  // this branch and the continuity branch alike, and it also carries each line's continuity status.
  assert(body.includes("reaskFeedbackBlock({"), "it looks up supporting rows");
  const shared = await read("./reaskFeedback.ts");
  assert(shared.includes("export function nameSupport("), "through the shared name-support lookup");
  assert(shared.includes('`"${n.name}" -> ${n.support.join(", ")}`'), "and names them in the prompt");
  assert(shared.includes("stated in NO row of this ledger"), "and says so when there are none");
  assert(body.includes("${block}"), "the block reaches the user prompt");
  // the support set obeys N1b: record/you only, findings excluded — now stated once, in canSource
  assert(shared.includes('return row.cls === "record" || row.cls === "you";'), "only record/you rows are offered");
  assert(shared.includes('if (row.kind === "finding") return false;'),
    "and never a finding — offering one would be a trap under N1b");
});

Deno.test("N1c. each attempt is audited", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("for (;;) {"));
  const reaskAt = fn.indexOf("if (g.sourcingDetail !== undefined");
  const block = fn.slice(reaskAt, reaskAt + 900);
  assert(block.includes('deps.recordIntegrity?.(kind, { status: "rejected"'),
    "the first refusal is recorded BEFORE the retry");
  assert(block.includes("attempt 1 of 2; re-asked"), "and says which attempt it was");
  assert(block.indexOf("recordIntegrity") < block.indexOf("deps.reaskOnSourcingRefusal("),
    "audited first, then re-asked — a crash in the retry cannot erase the record");
});

// ── V4a ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("V4a. the refused payload is stored with RESOLVED IDS, not ref tokens", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("const refusedPayload = refusedRaw\n        ? translateCitations(refusedRaw, uuidByRef) as Record<string, unknown>"),
    "the payload goes through translateCitations — the SAME translator the write path uses");
  assert(!src.includes("const refusedPayload = row.status === \"rejected\" ? (row.payload ?? null) : null;"),
    "the untranslated capture is gone — that is what put S5/O3/F1 on audit 10341");
  // the ref->id map is still recorded beside it, built from the RAW payload
  assert(src.includes("const refusedCitations = refusedRaw"), "the map is built from the raw refs");
});

Deno.test("V4a. translateCitations rewrites every citation key shape", async () => {
  const { translateCitations } = await import("./publicReadStorage.ts");
  const m = new Map([["S5", "aaaa-1"], ["O3", "bbbb-2"], ["F1", "cccc-3"]]);
  const out = translateCitations({
    market_category: "x", market_category_citations: ["S5"],
    unique_attributes: [{ text: "y", citations: ["O3", "F1"] }],
  }, m) as Record<string, unknown>;
  assertEquals(out.market_category_citations, ["aaaa-1"]);
  assertEquals((out.unique_attributes as Array<{ citations: string[] }>)[0].citations, ["bbbb-2", "cccc-3"]);
  assertEquals(out.market_category, "x", "prose is untouched");
});
