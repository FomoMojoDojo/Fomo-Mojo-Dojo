// ── Q3 (ruling, 2026-11-06): every gated SELECT must carry operator_edited_at ────────────────────
//
// THE FAIL-OPEN THIS CLOSES. The external gates read the flag off the row they are handed:
//   gateStrategyArtifactForExternal / …ForExternal(artifacts)  ← row.operator_edited_at
//   isExternalAdmissibleNeed(row)                              ← row.operator_edited_at
// PostgREST returns ONLY the columns a caller selects. A caller that forgets the column hands the
// gate `undefined`, isOperatorEdited reads that as "not edited", and the gate ADMITS an
// operator-authored row — silently, with no error anywhere. TypeScript cannot catch it either: the
// field is optional on the generic constraint, so a row type without it still satisfies the gate's
// signature.
//
// The gates whose flag arrives as an explicit ARGUMENT (gateSubjectForExternal / …ForLocal,
// gateCascadeSubjectForLocal) are already protected by the compiler — the parameter is required, so
// a caller that forgets it does not build. This test covers the ROW-SHAPED ones, which the compiler
// cannot protect.
//
// NON-VACUOUS: the last test proves the scan actually finds selects, so a broken matcher cannot pass
// by examining nothing.
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** Every function that hands a positioning_canvases / strategy_cascades / odi_needs row to a
 *  row-shaped external gate, with the gate it uses. */
const CONSUMERS = [
  "supabase/functions/propose-positioning-changes/index.ts",
  "supabase/functions/propose-opportunity-changes/index.ts",
  "supabase/functions/propose-route-changes/index.ts",
  "supabase/functions/propose-cascade-changes/index.ts",
  "supabase/functions/refresh-positioning/index.ts",
  "supabase/functions/evaluate-positioning-alignment/index.ts",
  "supabase/functions/evaluate-route-alignment/index.ts",
  "supabase/functions/evaluate-opportunity-alignment/index.ts",
  "supabase/functions/assess-surface-drift/index.ts",
  "supabase/functions/research-company/index.ts",
] as const;

/** The tables whose rows the external gates inspect. */
const GATED_TABLES = ["positioning_canvases", "strategy_cascades", "routes", "odi_needs"] as const;

/** Pull every `.select("…")` that follows a `.from("<table>")` within a few lines. */
function gatedSelects(src: string): Array<{ table: string; select: string; line: number }> {
  const out: Array<{ table: string; select: string; line: number }> = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /\.from\("(\w+)"\)/.exec(lines[i]);
    if (!m || !(GATED_TABLES as readonly string[]).includes(m[1])) continue;
    // the select may sit on this line or the next few (prettier wraps long column lists)
    const window = lines.slice(i, i + 4).join("\n");
    const sel = /\.select\(\s*\n?\s*"([^"]*)"/.exec(window);
    if (sel) out.push({ table: m[1], select: sel[1], line: i + 1 });
  }
  return out;
}

describe("Q3 — a gated SELECT that omits operator_edited_at would fail open", () => {
  let scanned = 0;

  for (const file of CONSUMERS) {
    it(`${file}: every provenance-carrying select also selects operator_edited_at`, () => {
      const src = read(file);
      const selects = gatedSelects(src);
      for (const s of selects) {
        scanned++;
        // Only the selects that feed a gate carry provenance_type / artifact_role. A select that
        // reads neither is not a gate input (e.g. `select("id")` for an existence check), so it is
        // not required to carry the flag — requiring it everywhere would be noise, not safety.
        const feedsAGate = s.select.includes("provenance_type") || s.select.includes("artifact_role");
        if (!feedsAGate) continue;
        expect(
          s.select,
          `${file}:${s.line} selects from ${s.table} with provenance but WITHOUT operator_edited_at — `
            + `the gate would read undefined and admit an operator-edited row`,
        ).toContain("operator_edited_at");
      }
    });
  }

  it("the scan actually found gated selects — the matcher is not vacuous", () => {
    let total = 0;
    let withProvenance = 0;
    for (const file of CONSUMERS) {
      const selects = gatedSelects(read(file));
      total += selects.length;
      withProvenance += selects.filter(
        (s) => s.select.includes("provenance_type") || s.select.includes("artifact_role"),
      ).length;
    }
    expect(total).toBeGreaterThan(10);
    expect(withProvenance).toBeGreaterThan(10);
    expect(scanned).toBeGreaterThan(0);
  });
});

describe("Q3 — the need-row collectors select the flag the row-shaped predicate reads", () => {
  // isExternalAdmissibleNeed(row) reads row.operator_edited_at, so these three selects are the
  // ones that decide whether the Gate 0 need filter can see operator authorship at all.
  const COLLECTORS = [
    "supabase/functions/propose-positioning-changes/index.ts",
    "supabase/functions/propose-cascade-changes/index.ts",
  ] as const;
  for (const file of COLLECTORS) {
    it(`${file}: the odi_needs collector selects operator_edited_at`, () => {
      const src = read(file);
      expect(src).toMatch(/const externalNeeds = [^\n]*\.filter\(isExternalAdmissibleNeed\)/);
      const needSelect = gatedSelects(src).find((s) => s.table === "odi_needs");
      expect(needSelect, `${file}: no odi_needs select found`).toBeDefined();
      expect(needSelect!.select).toContain("operator_edited_at");
    });
  }

  it("council-review feeds the predicate from select('*'), so the flag arrives whole", () => {
    const src = read("supabase/functions/council-review/index.ts");
    expect(src).toMatch(/const externalNeeds = odiNeeds\.filter\(isExternalAdmissibleNeed\)/);
    // Its rows come from fetchRowsOptional, which selects every column.
    expect(src).toMatch(/\.select\("\*"\)/);
  });
});
