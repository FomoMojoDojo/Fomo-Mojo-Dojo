// The odi_needs journey_key reader census (4f-6, ruling F9) — the census idiom the parser's own
// walls use: walk the source, name every reader that could do the wrong thing, fail on a new one.
//
// F9 made odi_needs.journey_key NULLABLE: a COMPANY-HELD need (holder='company') has no market and
// therefore no key. The paired CHECK odi_needs_holder_market_key binds the two, so `journey_key IS
// NULL` is an exact test for "not of any market".
//
// The hazard this wall guards is not a crash. Nothing in the estate dereferences journey_key
// unguarded. The hazard is SILENCE: a new reader that selects odi_needs company-wide, without
// scoping by a key, quietly pulls a company-held need onto a market surface — into a job map, an
// opportunity list, a market score, or a model prompt that prints it under a Journey it does not
// have. That is invisible until someone notices a need in the wrong place.
//
// THE RULE. A read of odi_needs that carries journey_key — naming it, or taking it via select("*")
// — must do ONE of:
//   • scope to a key       .eq("journey_key", <x>)                    — a NULL row cannot match
//   • exclude it           .not("journey_key", "is", null)
//   • read a single row    .eq("id", <x>)                             — cannot sweep a surface; the
//     caller is then responsible for refusing a company-held need, as evaluate-opportunity-alignment
//     and propose-opportunity-changes do.
// A read that selects journey_key company-wide with none of those is the offence.
//
// Plant: delete `.not("journey_key", "is", null)` from useOdiNeeds' no-key branch -> red.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SCOPES = ["src", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/** Files exempt from the wall, each with the reason. Adding one is a deliberate act. */
const ALLOWED: Array<[RegExp, string]> = [
  [/^supabase\/migrations\//, "migrations define the column, they do not render it"],
  [/^src\/lib\/odiNeeds\//, "this census module"],
  [/\.test\.(ts|tsx)$/, "tests plant company-held needs on purpose"],
  [/^src\/integrations\/supabase\/types\.ts$/, "generated types"],
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) yield p;
  }
}

/** Reads of odi_needs that carry journey_key with no guard at all. */
export function unguardedOdiNeedsReads(src: string): string[] {
  const out: string[] = [];
  const re = /\.from\(\s*["']odi_needs["']\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const chain = src.slice(m.index, m.index + 900).split(/;\s*\n|\n\s*\n/)[0];
    if (!/\bselect\(/.test(chain)) continue; // a write chain, not a read
    // .insert({...}).select("id") is a WRITE that returns the new row, not a read of the table.
    const firstSelect = chain.search(/\bselect\(/);
    const firstWrite = chain.search(/\b(insert|update|upsert|delete)\(/);
    if (firstWrite !== -1 && firstWrite < firstSelect) continue;
    // A select("*") carries journey_key implicitly — the plant that removed useOdiNeeds' filter
    // slipped past an earlier version of this test for exactly that reason. A star select is the
    // MOST dangerous shape, not the least: it hands the column to every consumer downstream.
    const starSelect = /\bselect\(\s*["'`]\s*\*/.test(chain);
    if (!starSelect && !/journey_key/.test(chain)) continue; // does not carry the column
    const scopedByKey = /\.eq\(\s*["']journey_key["']/.test(chain);
    const excluded = /\.not\(\s*["']journey_key["']\s*,\s*["']is["']\s*,\s*null\s*\)/.test(chain);
    const singleRow = /\.eq\(\s*["']id["']/.test(chain);
    if (!scopedByKey && !excluded && !singleRow) {
      out.push(chain.split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return out;
}

describe("odi_needs journey_key census (4f-6)", () => {
  it("every reader carrying journey_key scopes by a key, excludes the empty market, or reads one row", () => {
    const offenders: string[] = [];
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        const rel = relative(ROOT, file).split("\\").join("/");
        if (ALLOWED.some(([re]) => re.test(rel))) continue;
        for (const bad of unguardedOdiNeedsReads(readFileSync(file, "utf8"))) {
          offenders.push(`${rel} :: ${bad}`);
        }
      }
    }
    expect(
      offenders,
      `unguarded odi_needs reads — a company-held need (journey_key NULL) would reach a market surface:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the walk reaches the readers it is meant to police", () => {
    let seen = 0;
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        if (/\.from\(\s*["']odi_needs["']\s*\)/.test(readFileSync(file, "utf8"))) seen++;
      }
    }
    expect(seen, "no odi_needs reader found — the pattern or the walk is broken").toBeGreaterThan(5);
  });

  it("the detector itself: an unguarded read is caught, each guard clears it", () => {
    const bare = `supabase.from("odi_needs").select("id, journey_key").eq("company_id", c)`;
    expect(unguardedOdiNeedsReads(bare)).toHaveLength(1);
    expect(unguardedOdiNeedsReads(`${bare}.not("journey_key", "is", null)`)).toEqual([]);
    expect(unguardedOdiNeedsReads(`supabase.from("odi_needs").select("id, journey_key").eq("journey_key", k)`)).toEqual([]);
    expect(unguardedOdiNeedsReads(`supabase.from("odi_needs").select("id, journey_key").eq("id", n)`)).toEqual([]);
    // a read that never carries the column is not this wall's business
    expect(unguardedOdiNeedsReads(`supabase.from("odi_needs").select("id, desired_outcome").eq("company_id", c)`)).toEqual([]);
    // select("*") carries journey_key implicitly and IS this wall's business — the useOdiNeeds shape
    expect(unguardedOdiNeedsReads(`supabase.from("odi_needs").select("*").eq("company_id", c).neq("status", "retracted")`)).toHaveLength(1);
    expect(unguardedOdiNeedsReads(`supabase.from("odi_needs").select("*").eq("company_id", c).not("journey_key", "is", null)`)).toEqual([]);
  });
});
