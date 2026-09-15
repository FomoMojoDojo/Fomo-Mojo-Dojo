// R1/R2 checklist guard (operator rulings, 2026-09-15) — the job-map generator's
// market-definition contract, one assertion per site. Same idiom as
// retractedExclusion.test.ts: the behavioural proofs (decoy / missing / multi-map, with
// table snapshots) live in supabase/functions/local-jobmap-synthesis/marketGate.test.ts
// (deno test); this file fails the vitest run if a query site loses its shape.
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const GENERATOR = ["supabase/functions/local-jobmap-synthesis/index.ts", "supabase/functions/local-jobmap-synthesis/handler.ts"]
  .filter((p) => fs.existsSync(path.join(ROOT, p)))
  .map(read)
  .join("\n");

describe("R1 — the job-map generator never writes odi_market_definitions", () => {
  it("has no update/insert/upsert/delete against odi_market_definitions", () => {
    // Any mutation verb within 400 chars after a definitions .from() is a write-back.
    const re = /from\("odi_market_definitions"\)[\s\S]{0,400}?\.(update|insert|upsert|delete)\(/g;
    expect(GENERATOR.match(re) ?? []).toEqual([]);
  });
  it("no longer fires the definition_change reconcile trigger (nothing changed the definition)", () => {
    expect(GENERATOR).not.toMatch(/source:\s*"definition_change"/);
  });
});

describe("R2 — every definition read is keyed, live-only, no latest-row fallback", () => {
  it("resolves definitions through the shared keyed resolver", () => {
    expect(GENERATOR).toMatch(/resolveJourneyDefinitions\(/);
  });
  it("has no unkeyed latest-row read of odi_market_definitions", () => {
    const reads = GENERATOR.match(/from\("odi_market_definitions"\)[\s\S]{0,300}?(maybeSingle|single|limit)\(/g) ?? [];
    for (const r of reads) {
      expect(r).toMatch(/\.eq\("journey_key"/);
      expect(r).toMatch(/\.is\("retracted_at",\s*null\)/);
      expect(r).not.toMatch(/\.order\("(created_at|updated_at)"/);
    }
  });
  it("shared resolver: keyed, live-only, refuses with no_market_definition, no fallback", () => {
    const src = read("supabase/functions/_shared/marketDefinitionByKey.ts");
    expect(src).toMatch(/\.eq\("journey_key",/);
    expect(src).toMatch(/\.is\("retracted_at",\s*null\)/);
    expect(src).toMatch(/NO_MARKET_DEFINITION = "no_market_definition"/);
    expect(src).not.toMatch(/\.order\("(created_at|updated_at)"/);
  });
});

describe("R3 — the per-set synthesizers read the set's own definition, live-only, no fallback", () => {
  for (const file of ["supabase/functions/_shared/opportunitySynthesis.ts", "supabase/functions/_shared/stepConditionsSynthesis.ts"]) {
    it(`${file}: reads through readLiveDefinitionByKey and has no direct definition read`, () => {
      const src = read(file);
      expect(src).toMatch(/readLiveDefinitionByKey\(args\.supabase, args\.companyId, args\.journeyKey\)/);
      expect(src).toMatch(/skipped: NO_MARKET_DEFINITION/);
      expect(src.match(/from\("odi_market_definitions"\)/g) ?? []).toEqual([]);
    });
  }
  for (const file of ["supabase/functions/generate-step-opportunities/index.ts", "supabase/functions/generate-step-conditions/index.ts"]) {
    it(`${file}: maps no_market_definition to a 422 with the message`, () => {
      expect(read(file)).toMatch(/result\.skipped === "no_market_definition"[^\n]*422/);
    });
  }
});

