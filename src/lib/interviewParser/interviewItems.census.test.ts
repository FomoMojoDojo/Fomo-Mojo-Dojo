// The interview_items reader census (parser commit 1, rules 2026-09-22.1) — the marks-census idiom.
//
// Rule 4: "public-register and external writers never read items; local generators may." The wall that
// enforces it is THIS TEST. There is no separate export denylist in the repo: the first-read marks
// tables are walled by their census and nothing else, and interview_items is walled the same way. The
// test walks src/ and supabase/functions/ and fails the moment any file outside the parser's own
// directory, the one shared module, or the migrations names the table — a page, a corpus loader, a
// public-read builder, an external prompt.
//
// Plant: add `.from("interview_items")` to any supabase/functions/*.ts outside the parser → red.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCOPES = ["src", "supabase/functions"];
const TABLE_NAME = /interview_items/;
/** The only places allowed to name the table. */
const ALLOWED = [
  /^supabase\/functions\/interview-parser\//,
  /^supabase\/functions\/_shared\/interviewItems\.ts$/,
  /^src\/lib\/interviewParser\//,
  /^supabase\/migrations\//,
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

describe("interview_items census (parser commit 1)", () => {
  it("no file outside the parser, its one shared module and the migrations names the table", () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (ALLOWED.some((re) => re.test(rel))) continue;
        if (TABLE_NAME.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders, `readers of the item store outside the parser: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the census is not vacuous: the one shared module does name the table", () => {
    const own = readFileSync(join(ROOT, "supabase/functions/_shared/interviewItems.ts"), "utf8");
    expect(TABLE_NAME.test(own)).toBe(true);
  });
});
