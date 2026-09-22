// FM13 option A (2026-09-21) — the reader census. The mark store is read and written ONLY from
// src/lib/firstReadMarks/ (and the migration + this feature's own tests). This test walks src/ and
// supabase/functions/ and fails the moment any other file names first_read_marks or first_read_mark_notes —
// a page, a hook, a model-facing function, a corpus loader, the client-material wall. Adding marks to
// companyHasClientProvidedMaterial is out of scope by ruling and would trip this census too.
// Plant: a reader line (e.g. `.from("first_read_marks")`) in any supabase/functions/*.ts file → this test is red.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCOPES = ["src", "supabase/functions"];
const TABLE_NAMES = /first_read_marks|first_read_mark_notes/;
/** The only places allowed to name the tables. */
const ALLOWED = [
  /^src\/lib\/firstReadMarks\//,                 // the feature (anchors, this census, later the one reader/writer)
  /^supabase\/migrations\//,                      // the migration (outside the scanned scopes anyway)
];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs|sql)$/.test(name)) yield p;
  }
}

describe("first_read_marks census (FM13 option A)", () => {
  it("no file outside src/lib/firstReadMarks/ names the mark tables — src/ and supabase/functions/ both", () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        const rel = relative(ROOT, file);
        if (ALLOWED.some((re) => re.test(rel))) continue;
        const text = readFileSync(file, "utf8");
        if (TABLE_NAMES.test(text)) offenders.push(rel);
      }
    }
    expect(offenders, `readers of the mark store outside the feature: ${offenders.join(", ")}`).toEqual([]);
  });
  it("the census is not vacuous: the feature itself names the tables", () => {
    const own = readFileSync(join(ROOT, "src/lib/firstReadMarks/anchors.ts"), "utf8");
    expect(TABLE_NAMES.test(own) || TABLE_NAMES.test(readFileSync(__filename, "utf8"))).toBe(true);
  });
});
