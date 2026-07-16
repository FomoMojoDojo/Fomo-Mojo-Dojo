// Tripwire — OOD-1 register law, writer-stamp invariant.
//
// Every code path that INSERTs into odi_market_definitions must birth-stamp
// market_register explicitly. The column is NOT NULL with NO default and an
// immutability trigger, so a forgotten stamp is a guaranteed runtime crash in
// production-shaped data (exactly how the Edgewood declared ingest died on
// 2026-07-16). This test makes that failure a BUILD failure instead.
//
// Mechanism: source scan (grep-shape). Find every
// `.from("odi_market_definitions").insert(/.upsert(` call in supabase/ and
// src/, brace-balance the call argument, and assert it contains an explicit
// `market_register:` key.
//
// KNOWN_UNSTAMPED pins the legacy writers that predate OOD-1 and have NOT yet
// received their per-writer register ruling (operator decision, queued). The
// pin is exact-count-per-file: a NEW unstamped writer fails the build, and
// stamping (or removing) a legacy site also fails until its pin is deleted —
// the allowlist can only shrink deliberately.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["supabase/functions", "src"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build"]);

// Legacy pre-OOD-1 writers awaiting per-writer register rulings → file: count.
const KNOWN_UNSTAMPED: Record<string, number> = {
  "supabase/functions/local-jobmap-synthesis/index.ts": 1,
  "supabase/functions/research-company/index.ts": 1,
  "supabase/functions/_shared/marketHypothesisSynthesis.ts": 1,
  "src/components/admin/CompanyFilesPanel.tsx": 1,
  "src/views/JobSteps/index.tsx": 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

// From the opening paren of the write call, return the balanced argument text.
function callArg(source: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return source.slice(openParen + 1); // unbalanced — scan to EOF, still checked
}

type Site = { file: string; index: number; stamped: boolean };

function scan(): Site[] {
  const pattern = /\.from\(\s*["']odi_market_definitions["']\s*\)\s*\.\s*(insert|upsert)\s*\(/g;
  const sites: Site[] = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(pattern)) {
        const openParen = m.index! + m[0].length - 1;
        const arg = callArg(text, openParen);
        sites.push({ file, index: m.index!, stamped: /market_register\s*:/.test(arg) });
      }
    }
  }
  return sites;
}

describe("register law tripwire — every def writer birth-stamps market_register", () => {
  const sites = scan();

  it("finds the writer population (guards against a silently broken scan)", () => {
    // 7 writer sites exist today (2 stamped + 5 pinned legacy). If this drops
    // to 0 the scan itself broke — that must fail, not silently pass.
    expect(sites.length).toBeGreaterThanOrEqual(7);
  });

  it("has NO unstamped writer outside the pinned legacy set", () => {
    const unstamped = sites.filter((s) => !s.stamped);
    const byFile = new Map<string, number>();
    for (const s of unstamped) byFile.set(s.file, (byFile.get(s.file) ?? 0) + 1);
    const unexpected = [...byFile.entries()].filter(([file, n]) => KNOWN_UNSTAMPED[file] !== n);
    expect(
      unexpected,
      `Unstamped odi_market_definitions insert outside the legacy pin (or a pin drifted). ` +
        `Every new writer MUST birth-stamp market_register explicitly (OOD-1). Offenders: ` +
        JSON.stringify(unexpected),
    ).toEqual([]);
  });

  it("legacy pins match exactly (allowlist only shrinks deliberately)", () => {
    const unstamped = sites.filter((s) => !s.stamped);
    for (const [file, n] of Object.entries(KNOWN_UNSTAMPED)) {
      const actual = unstamped.filter((s) => s.file === file).length;
      expect(actual, `${file}: pinned ${n} unstamped site(s), found ${actual} — update the pin deliberately`).toBe(n);
    }
  });

  it("declared ingest and OOD-2 discovery are affirmatively stamped", () => {
    for (const file of [
      "supabase/functions/_shared/declaredMarketIngest.ts",
      "supabase/functions/_shared/marketPortfolioDiscovery.ts",
    ]) {
      const own = sites.filter((s) => s.file === file);
      expect(own.length, `${file}: expected at least one insert site`).toBeGreaterThanOrEqual(1);
      expect(own.every((s) => s.stamped), `${file}: every insert must stamp market_register`).toBe(true);
    }
  });
});
