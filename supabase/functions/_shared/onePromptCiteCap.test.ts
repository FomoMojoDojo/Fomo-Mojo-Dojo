// ── RP / CR (operator rulings, 2026-10-15) ──────────────────────────────────────────────────────
//
// RP. There were FOUR generator prompts: the generation prompt and three re-asks, each of which
// rebuilt a shorter one from scratch. What the short ones left out mattered. `takenBlock` is the
// ONLY place the prompt names the carried lines and says how many further differentiators to write,
// and no re-ask carried it — so the previous round's attempt 2 wrote FIVE differentiators and
// reworded the carried pricing line as a new our_read line, because nothing told it either fact.
//
//   A re-ask sends the FULL generation prompt plus the shared feedback block. No separate re-ask
//   prompt exists.
//
// CR. CITE_RULE has said "cite AT MOST 3 per claim" since it was written and nothing checked it.
// Wasabi's attempt 2 cited FOUR rows on unique_attributes[1] — 2242bdd1 and c93c7c2d both for
// "Wasabi AiR", one redundant — and so had no room for c30e9189, the one row stating "AI/ML", which
// the feedback block had named. N1 refused the line for that name (audit 10494). The limit stays 3,
// it is enforced among the citation guards, and its refusal enters the SAME feedback block.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CITATION_CAP, overCited, overCitedDetail } from "./publicReadGuards.ts";
import { reaskFeedbackBlock, type SourceRow } from "./reaskFeedback.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── RP: one builder ─────────────────────────────────────────────────────────────────────────────

Deno.test("RP. ONE prompt builder, and it is the only generator prompt template", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("const buildGenUser = (kind: Kind, opts?: { feedback?: string; ask?: string }): string => {"),
    "the builder exists");
  // exactly one site writes the LEDGER header for a generator prompt: the builder
  const headers = [...src.matchAll(/LEDGER \(cite only the bracketed tokens on these lines\)/g)].length;
  assertEquals(headers, 1, "ONE generator prompt template — the builder's. Each re-ask used to write its own.");
  // and every generator/class_fix call goes through it
  const gen = [...src.matchAll(/await run\(genChoice,/g)].length;
  const built = [...src.matchAll(/buildGenUser\(kind as Kind/g)].length;
  assertEquals(gen, 5, "the first answer, the three full re-asks (sourcing, continuity, level — ruling 14), and the class fix");
  assertEquals(built, 5, "all five built by the one builder");
});

Deno.test("RP. the builder sends the WHOLE prompt — carried lines and the differentiator count included", async () => {
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("const buildGenUser = (kind: Kind");
  const body = src.slice(at, src.indexOf("\n    };", at));
  assert(body.includes("${CAT_LIVE}"), "the ledger, live — a row admitted mid-run is citable");
  assert(body.includes("${p.extra}"), "the kind's context block");
  assert(body.includes("${p.ssBlock}"), "the still-sourced lines, with their name rows");
  assert(body.includes("${p.takenBlock}"), "the carried lines AND the differentiator count — what every re-ask lacked");
  assert(body.includes("${opts?.feedback ?? \"\"}"), "and the feedback, when there is any");
  // the parts are captured once, at generation, so a re-ask reuses them rather than rebuilding
  assert(src.includes("genUserParts[kind as Kind] = { extra, ssBlock, takenBlock };"), "captured once per kind");
});

Deno.test("RP. a re-ask prompt differs from the generation prompt by the FEEDBACK BLOCK only", async () => {
  const src = await read("../generate-public-read/index.ts");
  // the two full-regeneration re-asks pass `feedback` and an `ask` that is the same instruction the
  // generation prompt gives, said again ("in full"). They pass NOTHING else: no extra ledger, no
  // substitute context, no shortened rule set.
  for (const marker of ['if (because === "continuity") {', "const results = s1Results[kind as Kind] ?? [];"]) {
    const at = src.indexOf(marker);
    assert(at > 0, `${marker.slice(0, 28)} exists`);
    // the options object, brace-matched — not guessed by indentation, which ran into the next call
    const open = src.indexOf("buildGenUser(kind as Kind, {", at) + "buildGenUser(kind as Kind, ".length;
    let depth = 0, end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const args = src.slice(open, end);
    // The keys at the object's TOP level. Matched at LINE START only: `\b(\w+):` also matches the
    // prompt's own prose ("THE RULE:", "named above:"), which is text the model reads, not an option.
    const top: string[] = [];
    let d = 0;
    for (const ln of args.split("\n")) {
      const m = /^\s*(\w+):/.exec(ln);
      if (m && d === 1) top.push(m[1]);
      for (const ch of ln) { if (ch === "{") d++; else if (ch === "}") d--; }
    }
    assertEquals([...new Set(top)].sort(), ["ask", "feedback"],
      `a re-ask may add feedback and restate the ask, nothing more — got ${JSON.stringify(top)}`);
  }
});

Deno.test("RP. the class re-ask goes through the builder too — and its ONE difference is declared", async () => {
  const src = await read("../generate-public-read/index.ts");
  // it asks for a PATCH of named fields, not the read again: that targeted shape is what keeps the
  // ACCEPTED fields from being rewritten. The difference is named in one place, not open-coded.
  assert(src.includes("const CLASS_FIX_ASK = (fields: readonly string[]): string =>"),
    "the patch-shaped ask is stated once");
  assert(src.includes("buildGenUser(kind as Kind, { feedback: `\\n\\n${ask}`, ask: CLASS_FIX_ASK(askedFields) })"),
    "and the class fix sends the full prompt with it");
  // the shape is EMITTED once, in CLASS_FIX_ASK; the other occurrence is the comment that explains
  // why this one re-ask differs, which is the declaration the ruling asks for.
  const emitted = src.split("\n").filter((l) => l.includes('{"fixes":{') && !l.trim().startsWith("//"));
  assertEquals(emitted.length, 1, "the fixes shape is emitted once — inside CLASS_FIX_ASK, nowhere else");
  assert(src.split("\n").some((l) => l.trim().startsWith("//") && l.includes('{"fixes":{')),
    "and the exception is declared in a comment, not left for a reader to discover");
});

Deno.test("RP. no shortened ledger survives — the `CAT_LIVE || CAT` fallbacks are gone", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(!src.includes("${CAT_LIVE || CAT}"),
    "each re-ask used to build its own header from a fallback catalogue; the builder has one source");
});

// ── CR: the limit, enforced ─────────────────────────────────────────────────────────────────────

Deno.test("CR. the limit is 3, and four citations on one line is a refusal", () => {
  assertEquals(CITATION_CAP, 3, "the limit stays 3 — CITE_RULE's own number");
  const hits = overCited([
    { field: "unique_attributes[1]", refs: ["2242bdd1", "9373abfc", "c93c7c2d", "7638775d"] },
    { field: "value", refs: ["a", "b", "c"] },
    { field: "best_fit", refs: ["a"] },
  ]);
  assertEquals(hits.length, 1, "only the over-cited field");
  assertEquals(hits[0].field, "unique_attributes[1]");
  assertEquals(hits[0].count, 4);
  assert(overCitedDetail(hits).includes("4 citations (max 3)"), "the detail says how many and the cap");
  assert(overCitedDetail(hits).includes("2242bdd1"), "and which rows it cited");
});

Deno.test("CR. a repeated token is ONE row cited twice, not an over-claim", () => {
  assertEquals(overCited([{ field: "f", refs: ["a", "a", "b", "b"] }]).length, 0,
    "the cap is about how many distinct rows a claim rests on");
  assertEquals(overCited([{ field: "f", refs: ["a", "a", "b", "c", "d"] }])[0].count, 4, "distinct rows are counted");
});

Deno.test("CR. it runs in the CITATION GUARD group — after GUARD 1, before the rest", async () => {
  const pk = await read("./publicReadPerKind.ts");
  const g1 = pk.indexOf('guard: "citation_outside_ledger"');
  const cr = pk.indexOf('guard: "citation_cap_exceeded"');
  const g2 = pk.indexOf("GUARD 2: offering structure");
  const g5 = pk.indexOf("GUARD 5 (S1");
  assert(g1 > 0 && cr > g1, "after GUARD 1 — an unresolvable token is refused as that, not counted");
  assert(cr < g2 && cr < g5, "and inside the 1-4 group, before S1 and the judge");
  // deterministic: it reads the stamp, it does not call a model
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("citationCapRefusal: (kind, _payload) => {");
  const body = src.slice(at, src.indexOf("\n      },", at));
  assert(body.includes("overCited(modelCitations[kind as Kind] ?? [])"),
    "over the citations AS THE MODEL WROTE THEM");
  assert(!body.includes("await "), "no model call, no query — a length comparison");
  // and that snapshot is taken BEFORE PASS 2 appends rows we admit from the live record: counting
  // the post-admission stamp would refuse the model for our own addition and misreport the count.
  const stamp = src.slice(src.indexOf("const stampAndDecide = async"));
  const snapAt = stamp.indexOf("modelCitations[kind] = stamped.map(");
  const pass2At = stamp.indexOf("// PASS 2 (ruling 2026-10-08)");
  assert(snapAt > 0 && pass2At > snapAt, "snapshotted before PASS 2 can append a citation");
  assert(stamp.slice(0, snapAt).includes("const stamped = stampFieldClasses("), "straight from the payload");
});

Deno.test("CR. its refusal enters THE SHARED feedback, not a prompt of its own", async () => {
  const pk = await read("./publicReadPerKind.ts");
  const at = pk.indexOf('guard: "citation_cap_exceeded"');
  const blk = pk.slice(at - 240, at + 240);
  assert(blk.includes("sourcingDetail: capped.detail"), "it carries sourcingDetail, so the ONE re-ask fires");
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  const body = fn.slice(0, fn.indexOf("\n      reaskOnClassRefusal:"));
  assert(body.includes("const capHits = crResults[kind as Kind] ?? [];"), "the over-cited fields reach the branch");
  assert(body.includes("if (failing.length === 0 && capHits.length === 0) return null;"),
    "a cap refusal alone still produces feedback — S1 may have found nothing");
  assert(body.includes("over_cited: capOf(r.field)"), "a field refused by both carries both facts, in ONE entry");
  assert(body.includes("over_cited: { count: h.count, cap: CITATION_CAP }"), "and a cap-only field is listed too");
  // ONE entry per field, never two
  assert(body.includes("capHits.filter((h) => !failing.some((r) => r.field === h.field))"), "de-duplicated against S1's");
  assert(body.includes("!capHits.some((h) => h.field === l.field)"), "and against the still-sourced list");
});

Deno.test("CR. the block tells the model how many it cited AND which rows carry the names", () => {
  const pool: SourceRow[] = [
    { id: "S4", kind: "signal", cls: "record", text: "Wasabi AiR brings searchable intelligence" },
    { id: "S8", kind: "signal", cls: "record", text: "Wasabi Fire is the new tier" },
    { id: "S5", kind: "signal", cls: "you", text: "built for backups and AI/ML workloads" },
  ];
  const block = reaskFeedbackBlock({
    lines: [{
      field: "unique_attributes[1]",
      text: "AI-focused storage like Wasabi Fire and Wasabi AiR to support AI/ML workloads",
      sourcing_citations: ["S4"], over_cited: { count: 4, cap: CITATION_CAP },
    }],
    pool, companyName: "Wasabi Technologies",
  });
  assert(block.includes("too many citations: 4 cited, at most 3 allowed"), "the count and the cap");
  assert(block.includes("keep the rows named above and drop the rest"),
    "and WHICH to keep — a line told only 'too many' cannot tell which citation is load-bearing");
  assert(block.includes('"Wasabi Fire" -> [S8]') && block.includes('"AI/ML" -> [S5]'),
    "the name rows are the answer to 'which three'");
});

Deno.test("CR. a line within the cap says nothing about citations", () => {
  const block = reaskFeedbackBlock({
    lines: [{ text: "flat-rate pricing with no egress fees", sourcing_citations: ["S1"] }],
    pool: [], companyName: "Wasabi Technologies",
  });
  assert(!block.includes("too many citations"), "no cap line where there is no cap fault");
});

Deno.test("CR. the guard is named, and the refusal is recorded with the cap it broke", async () => {
  const pk = await read("./publicReadPerKind.ts");
  assert(pk.includes('| "citation_cap_exceeded"'), "the guard has its own name in the union");
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("citation_cap: { cap: CITATION_CAP, over: crResults[kind as Kind] ?? [] },"),
    "the audit row carries which fields and the cap");
  assert(src.includes("citation_cap: { cap: CITATION_CAP, over: crResults },"), "and the response reports them");
});
