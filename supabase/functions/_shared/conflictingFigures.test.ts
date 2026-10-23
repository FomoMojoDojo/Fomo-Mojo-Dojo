// Operator ruling 42 (2026-10-22) — conflicting figures are never blended. Fixture: two rows, one stating 41 states and
// one stating 45 (Spectrum's own site and its post-merger footprint, integrity 14047/14048).
//   CF-1  the prompt carries the rule line, inside GEN_POSITIONING and GEN_STRATEGY (source pin)   — plant P42 → RED
//   CF-2  S1 still refuses the blend "41–45"; one value with its own row, or each with its own row, passes (behaviour)
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { s1Unsourced } from "./classFactCheck.ts";

const ROW_41 = "Spectrum serves over 57 million customers in 41 states";
const ROW_45 = "Post-merger, Spectrum operates across 45 states, passing more than 70 million homes and businesses";

Deno.test("CF-1 the conflicting-figures rule is in the positioning and strategy prompts (P42)", async () => {
  const g = await Deno.readTextFile(new URL("../generate-public-read/index.ts", import.meta.url));
  assert(g.includes("const CONFLICTING_FIGURES_RULE = `CONFLICTING FIGURES. When the rows you cite state DIFFERENT values for the same measure — two counts of states, customers, locations or years — state ONE value and cite the row that states it, or state EACH value with its own row and say which row says which. Never write a range, an average or a blend of them: not '41–45 states', not 'over 40 states', not '41 to 45 states'. A value no single row states is not sourced.`;"), "the signed rule text");
  const pos = g.slice(g.indexOf("const GEN_POSITIONING = `"), g.indexOf("const GEN_STRATEGY = `"));
  const str = g.slice(g.indexOf("const GEN_STRATEGY = `"), g.indexOf("const GEN_PROMISE = `"));
  assert(pos.includes("${CONFLICTING_FIGURES_RULE}\nReturn ONLY JSON:"), "in GEN_POSITIONING");
  assert(str.includes("${CONFLICTING_FIGURES_RULE}\nReturn ONLY JSON:"), "in GEN_STRATEGY");
});

Deno.test("CF-2 S1 refuses the blend over rows stating 41 and 45; a single value, or each with its row, passes", () => {
  const s1 = (text: string, rows: string[]) => s1Unsourced({ field: "where_to_play", cls: "you", text, citedSourceTexts: rows, companyName: "Spectrum" }).unsourced.map((u) => u.token);
  assertEquals(s1("Homes and businesses in 41–45 states", [ROW_41, ROW_45]), ["41–45"]);
  assertEquals(s1("Homes and businesses in 41 states", [ROW_41]), []);
  assertEquals(s1("Homes and businesses in 41 states, and in 45 states after the merger", [ROW_41, ROW_45]), []);
});
