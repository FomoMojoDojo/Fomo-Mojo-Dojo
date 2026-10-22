// Ruling 14 (2026-10-22) — the level rule, L1–L4, and its coupling; ruling 15 — the positioning alternative.
// Fixtures: fixtures/readLevel/reads-20261022.json — copied text of 8 companies' CURRENT reads (no live read).
//   L1  offering echo (log only): Spectrum value, ua[1–3], promise, how_to_win, cap[0–2]; best_fit / where_to_play not
//   L2  strategy names an offering: Spectrum aspiration + how_to_win refuse, cap[1] logs; where_to_play ("TV service") clean
//   L3  promise product subject: Spectrum's "WiFi Extenders" refuses; SIAA / Riverlane / Edgewood (label after the verb) clean
//   L4  best fit names no need: Spectrum refuses; BlueSkyAI's residue ["growth"] is clean
//   L5  wiring: GUARD 5b after S1 and before the judge; promote re-checks; the withheld set unions level; carries and the
//       strategy feed read it; the level re-ask spends the ONE shared budget
//   C7  coupling: a level-flagged predecessor line is LICENSED by continuity (Spectrum ua[3]), never demanded
//   A1–A3  the alternative gate; G the empty field records a gap and never a guess
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bestFitResidue, L1_COVERAGE, levelHits, levelItemsOfOfferingPayload, levelRefusalDetail, levelWithheldKeys, unionWithheld, type LevelHit, type LevelKind } from "./readLevel.ts";
import { linesOfStoredPayload } from "./citedLines.ts";
import { classifyContinuity } from "./stageContinuity.ts";
import { alternativeGapOf, alternativeRefusals, ALTERNATIVE_GAP_QUESTION_PROPOSED, type CitedRowView } from "./positioningAlternative.ts";

const FIX = JSON.parse(await Deno.readTextFile(new URL("./fixtures/readLevel/reads-20261022.json", import.meta.url))).companies as Record<string, Record<string, Record<string, unknown>>>;
const hitsOf = (co: string, kind: LevelKind): LevelHit[] =>
  levelHits(kind, linesOfStoredPayload(FIX[co][kind] ?? null), levelItemsOfOfferingPayload(FIX[co].offering ?? null), co);
const key = (h: LevelHit) => `${h.field || "promise"}:${h.check}:${h.refuses ? "refuse" : "log"}`;
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("L1 offering echo — Spectrum's 9 lines flag (log only); best fit, where-to-play and the category do not", () => {
  const l1 = (["positioning", "promise", "strategy"] as LevelKind[]).flatMap((k) => hitsOf("Spectrum", k)).filter((h) => h.check === "L1");
  assertEquals(l1.map((h) => h.field || "promise").sort(), ["how_to_win", "must_have_capabilities[0]", "must_have_capabilities[1]", "must_have_capabilities[2]", "promise", "unique_attributes[1]", "unique_attributes[2]", "unique_attributes[3]", "value"]);
  assert(l1.every((h) => !h.refuses), "L1 never refuses (ruling 14)");
  assertEquals(L1_COVERAGE, 0.75);
});
Deno.test("L1 needs EVERY cited row to be an offering row — SIAA's promise and Lumio's value line stay clean", () => {
  assertEquals(hitsOf("SIAA", "promise").filter((h) => h.check === "L1").length, 0);
  assertEquals(hitsOf("Lumio", "positioning").filter((h) => h.check === "L1" && h.field === "value").length, 0);
});
Deno.test("L2 a strategy rung naming an offering item — aspiration and how-to-win refuse, a capability logs, 'TV service' is not a name", () => {
  const s = hitsOf("Spectrum", "strategy").filter((h) => h.check === "L2");
  assertEquals(s.map(key).sort(), ["how_to_win:L2:refuse", "must_have_capabilities[1]:L2:log", "winning_aspiration:L2:refuse"]);
  assert(s.every((h) => h.items.includes("Anytime Upgrade")));
  assert(!s.some((h) => h.field === "where_to_play"), "where_to_play names 'TV services' — a generic label, not a name");
  assertEquals(hitsOf("Corestar Partners", "strategy").filter((h) => h.check === "L2").map(key), ["how_to_win:L2:refuse"]);
  assertEquals(hitsOf("Gotham Sports", "strategy").filter((h) => h.check === "L2").length, 0, "'New York' inside a label is not the label's name");
});
Deno.test("L3 the promise's subject is an offering item — Spectrum refuses; a label after the main verb is clean", () => {
  assertEquals(hitsOf("Spectrum", "promise").filter((h) => h.check === "L3").map(key), ["promise:L3:refuse"]);
  for (const co of ["SIAA", "Riverlane", "Edgewood", "Gotham Sports"]) assertEquals(hitsOf(co, "promise").filter((h) => h.check === "L3").length, 0, co);
});
Deno.test("L4 best fit names no need — Spectrum refuses (residue empty); BlueSkyAI keeps 'growth'", () => {
  assertEquals(hitsOf("Spectrum", "positioning").filter((h) => h.check === "L4").map(key), ["best_fit:L4:refuse"]);
  const blue = FIX.BlueSkyAI.positioning.best_fit_customers as string;
  assertEquals(bestFitResidue(blue, levelItemsOfOfferingPayload(FIX.BlueSkyAI.offering)), ["growth"]);
  assertEquals(hitsOf("BlueSkyAI", "positioning").filter((h) => h.check === "L4").length, 0);
});
Deno.test("no offering read ⇒ no terms ⇒ nothing flags (fail open)", () => {
  assertEquals(levelHits("positioning", linesOfStoredPayload(FIX.Spectrum.positioning), [], "Spectrum"), []);
});
Deno.test("the refusal detail names L2–L4 only", () => {
  const d = levelRefusalDetail((["positioning", "promise", "strategy"] as LevelKind[]).flatMap((k) => hitsOf("Spectrum", k)))!;
  assert(d.includes("[L4]") && d.includes("[L3]") && d.includes("[L2]") && !d.includes("[L1]"), d);
});

Deno.test("C7 coupling — a level-flagged predecessor line is LICENSED by continuity, never demanded (Spectrum ua[3])", () => {
  const current = linesOfStoredPayload(FIX.Spectrum.positioning);
  const staged = current.filter((l) => l.field !== "unique_attributes[3]");
  const refs = [...new Set(current.flatMap((l) => l.refs))];
  const textByRef = Object.fromEntries(refs.map((r) => [r, current.filter((l) => l.refs.includes(r)).map((l) => l.text).join(" ")]));
  const classByRef = Object.fromEntries(refs.map((r) => [r, "you"]));
  const level = levelWithheldKeys(hitsOf("Spectrum", "positioning"));
  const split = classifyContinuity({ currentLines: current, stagedLines: staged, newLedgerIds: new Set(refs), textByRef, classByRef, sourcingIds: new Set(refs), withheld: unionWithheld(new Set(), level) });
  assert(!split.dropped.some((d) => /U\.S\.-based phone support/.test(String((d as { statement?: string }).statement ?? ""))), `ua[3] demanded: ${JSON.stringify(split.dropped)}`);
  assert(split.licensed.some((l) => /U\.S\.-based phone support/.test(JSON.stringify(l))), "ua[3] is licensed");
});

// Ruling 27: a strategy read stores each rung twice — at the top level and under cascade_source. The level hits name the
// top-level path, so the mirror copy stayed demanded: Spectrum's staged strategy dropped "Offer Anytime Upgrade" (L1+L2)
// and continuity refused it through cascade_source.must_have_capabilities[1] (integrity 13803).
const MIRROR = JSON.parse(await Deno.readTextFile(new URL("./fixtures/readLevel/spectrum-strategy-mirror-20261022.json", import.meta.url))) as Record<string, Record<string, unknown>>;
Deno.test("C8 mirror — a level-flagged line's cascade_source mirror is withheld too, so continuity licenses the drop (Spectrum 13803)", () => {
  const current = linesOfStoredPayload(MIRROR.current_strategy);
  const staged = linesOfStoredPayload(MIRROR.attempt2_strategy);
  const hits = levelHits("strategy", current, levelItemsOfOfferingPayload(FIX.Spectrum.offering), "Spectrum");
  const level = levelWithheldKeys(hits, current);
  const upgrade = "Offer Anytime Upgrade, allowing customers to upgrade their phones whenever they want.";
  assert(current.some((l) => l.field === "cascade_source.must_have_capabilities[1]" && l.text === upgrade), "the fixture carries the mirror");
  assert(level.has(`cascade_source.must_have_capabilities[1]\u0000${upgrade}`), "the mirror key is withheld");
  assert(level.has(`must_have_capabilities[1]\u0000${upgrade}`), "the top-level key is withheld");
  const refs = [...new Set(current.flatMap((l) => l.refs))];
  const textByRef = Object.fromEntries(refs.map((r) => [r, current.filter((l) => l.refs.includes(r)).map((l) => l.text).join(" ")]));
  const classByRef = Object.fromEntries(refs.map((r) => [r, "you"]));
  const split = classifyContinuity({ currentLines: current, stagedLines: staged, newLedgerIds: new Set(refs), textByRef, classByRef, sourcingIds: new Set(refs), withheld: unionWithheld(new Set(), level) });
  assert(!split.dropped.some((d) => JSON.stringify(d).includes("Offer Anytime Upgrade")), `the mirror is demanded: ${JSON.stringify(split.dropped)}`);
  // a mirror is matched by field suffix AND text: an unflagged line is never withheld through a suffix
  assert(!level.has(`cascade_source.must_have_capabilities[2]\u0000Maintain 24/7/365 100% U.S.-based phone support for all customers.`) ||
    hits.some((h) => h.field === "must_have_capabilities[2]"), "only flagged lines' mirrors are withheld");
});

Deno.test("L5 wiring — GUARD 5b after S1, before the judge; one shared re-ask budget; promote re-checks", async () => {
  const pk = await read("./publicReadPerKind.ts");
  const s1 = pk.indexOf("const s1 = deps.s1Refusal?.(kind, payload)"), lv = pk.indexOf("const lvl = deps.levelRefusal?.(kind, payload)"), jd = pk.indexOf("verdict = await deps.judge(kind, payload);");
  assert(s1 > 0 && lv > s1 && jd > lv, "S1 → level → judge");
  assert(pk.includes('if (g.levelDetail !== undefined && !reasked && deps.reaskOnSourcingRefusal) {'), "the level re-ask is gated on the ONE flag");
  assert(pk.includes('deps.reaskOnSourcingRefusal(kind, g.payload, g.levelDetail, "level")'), "through the one re-ask dep, never a second budget");
  const pr = await read("./publicReadPromote.ts");
  const ps1 = pr.indexOf("const s1 = await promoteS1Refusal("), plv = pr.indexOf("const lvl = await promoteLevelRefusal("), flip = pr.indexOf('update({ is_current: true })');
  assert(ps1 > 0 && plv > ps1 && flip > plv, "promote: S1 → level → flip");
  const g = await read("../generate-public-read/index.ts");
  assert(g.includes("withheld: unionWithheld(g.withheld, levelWithheldKeys(level, linesOfStoredPayload(row?.payload ?? null)))"), "the withheld set unions the level keys, mirrors included (ruling 27)");
  assert(g.includes("const current = (await currentLinesFor(kind)).filter((l) => !carryWithheld.has(predecessorLineKey(l)));"), "carries skip withheld lines");
  assert(g.includes('const extra = kind === "strategy" ? positioningContextOf() : "";'), "the strategy feed is the level-filtered one");
  assert(/levelRefusal: \(kind, _payload\) => \{[\s\S]*?levelHits\(kind as LevelKind, lines, levelItems, companyName\)/.test(g), "the stage gate reads the stamp against the current offering");
  assert(g.includes("${LEVEL_RULE}") && g.includes("(g) LEVEL (reported, does NOT affect accept)"), "the prompt rule and the judge clause");
});

// ── ruling 15 ──
const ROWS: Record<string, CitedRowView> = {
  S1: { cls: "record", finding: false, pageWords: "Customers comparing Spectrum with T-Mobile Home Internet cite price." },
  S2: { cls: "record", finding: false, pageWords: "Spectrum raised prices again this year." },
  F1: { cls: "our_read", finding: true, pageWords: "We read Verizon Fios as the main alternative." },
  O1: { cls: "you", finding: false, pageWords: "Unlike satellite providers, Spectrum offers no data caps." },
};
const view = (r: string) => ROWS[r] ?? null;
const pos = (alternatives: unknown[]) => ({ alternatives });
Deno.test("A1 an alternative that cites nothing refuses", () => {
  assertEquals(alternativeRefusals(pos([{ name: "T-Mobile Home Internet", text: "x", citations: [] }]), view).map((r) => r.rule), ["A1"]);
});
Deno.test("A2 an alternative whose name is not in its cited rows' page words refuses", () => {
  assertEquals(alternativeRefusals(pos([{ name: "Starlink", text: "x", citations: ["S2"] }]), view).map((r) => r.rule), ["A2"]);
});
Deno.test("A3 an alternative named only by our own read refuses — the model filling an empty field from our analysis", () => {
  assertEquals(alternativeRefusals(pos([{ name: "Verizon Fios", text: "x", citations: ["F1"] }]), view).map((r) => r.rule), ["A3"]);
});
Deno.test("A ok: an alternative a record or company row names, cited, passes", () => {
  assertEquals(alternativeRefusals(pos([{ name: "T-Mobile Home Internet", text: "compared on price", citations: ["S1"] }, { name: "satellite providers", text: "no data caps", citations: ["O1"] }]), view), []);
});
Deno.test("G an empty field records an alternative gap (a question, never a guess); a named one records none", () => {
  const gap = alternativeGapOf(pos([]))!;
  assertEquals(gap.question_identity, "alternative_gap:positioning");
  assertEquals(gap.question_proposed, ALTERNATIVE_GAP_QUESTION_PROPOSED);
  assertEquals(alternativeGapOf(pos([{ name: "T-Mobile Home Internet", text: "x", citations: ["S1"] }])), null);
  assertEquals(alternativeGapOf(FIX.Spectrum.positioning)?.reason, "no cited row names an alternative", "every current read has none — the field is new");
});
