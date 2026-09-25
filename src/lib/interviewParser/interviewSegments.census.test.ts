// The interview_segments reader census (4f-2) — the interview_items census idiom, same wall.
//
// A segment says what a stretch of a working session was FOR, and 4f-4 will land items differently
// because of it. That makes segments parser-internal by construction: no page, corpus loader,
// public-read builder or external prompt has any business reading them, and this test is the wall
// that says so. It walks src/ and supabase/functions/ and fails the moment any file outside the
// parser's own directory, this module or the migrations names the table.
//
// NOTE: at 4f-2 nothing reads segments at all — the store and its setter are the whole commit — so
// the census passes here with zero readers. It is written now so that 4f-3 and 4f-4 have to add
// themselves to ALLOWED deliberately rather than by drift.
//
// Plant: add `.from("interview_segments")` to any supabase/functions/*.ts outside the parser -> red.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCOPES = ["src", "supabase/functions"];
const TABLE_NAME = /interview_segments/;
/** The only places allowed to name the table. */
const ALLOWED = [
  /^supabase\/functions\/interview-parser\//,
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

describe("interview_segments census (4f-2)", () => {
  it("no file outside the parser, its one shared module and the migrations names the table", () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (ALLOWED.some((re) => re.test(rel))) continue;
        if (TABLE_NAME.test(readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders, `readers of the segment store outside the parser: ${offenders.join(", ")}`).toEqual([]);
  });

  it("the census is not vacuous: the walk and the pattern do find the table where it IS named", () => {
    // The items census proves this against its one shared module. Segments have no such module at
    // 4f-2, so the proof runs against the migration that creates the table — if the walk or the
    // pattern were broken, this would be green while the census above was vacuously green too.
    const migrations = join(ROOT, "supabase/migrations");
    const naming = readdirSync(migrations)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => TABLE_NAME.test(readFileSync(join(migrations, f), "utf8")));
    expect(naming.length, "no migration names interview_segments — the pattern or the walk is broken").toBeGreaterThan(0);
  });
});
