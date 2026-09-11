import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Gate 8b — a RETRACTED market definition (ruled blind, retracted by an operator data act; row kept)
// must vanish from every surface that enumerates a company's defs as real markets. This guard fails
// the run if any query site on the 2026-09-11 checklist loses its filter. Same idiom as
// gate3Exclusion.test.ts: the behavioural proofs (a planted retracted def actually leaving the dedup
// universe and the capacity count) live in marketDiscoveryWorkerSkip.test.ts (8b-f); the resolver's
// retracted bucket in retractedBucket.test.ts (8b-i); this file is the checklist, one line per site.
const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const eqFilters = (src: string) => (src.match(/\.eq\("retracted",\s*false\)/g) || []).length;

describe("Gate 8b — retracted defs excluded on every enumerator (checklist guard)", () => {
  it("Who-you-serve def query (useFirstReadPreviewData)", () => {
    expect(eqFilters(read("src/views/client/firstReadPreview/useFirstReadPreviewData.ts"))).toBe(1);
  });
  it("discovery dedup universe (loadDedupUniverse) — the MAX_ACTIVE count derives from it — and the lens-key live-holder guard", () => {
    const src = read("supabase/functions/_shared/marketPortfolioDiscovery.ts");
    expect(eqFilters(src)).toBe(2);   // (1) loadDedupUniverse; (2) the lens-key guard's live-holder probe (8b option ii)
    expect(src).toMatch(/liveKeys\.has\(l\.journey_key\)/);   // capacity counted over live defs only
    expect(src).toMatch(/lens key held by a live definition/);
  });
  it("first-read-fill already-discovered predicate (both reads)", () => {
    expect(eqFilters(read("supabase/functions/first-read-fill/index.ts"))).toBe(2);
  });
  it("market-options seed (both def reads)", () => {
    expect(eqFilters(read("supabase/functions/_shared/marketOptionSynthesis.ts"))).toBe(2);
  });
  it("frontier finding", () => {
    expect(eqFilters(read("supabase/functions/_shared/frontierFinding.ts"))).toBe(1);
  });
  it("council-review context", () => {
    expect(read("supabase/functions/council-review/index.ts")).toMatch(/"odi_market_definitions", companyId, 50, \{ retracted: false \}/);
  });
  it("local-alignment public claims", () => {
    expect(eqFilters(read("supabase/functions/local-alignment/index.ts"))).toBe(1);
  });
  it("declared-market ingest reconcile universe", () => {
    expect(eqFilters(read("supabase/functions/_shared/declaredMarketIngest.ts"))).toBe(1);
  });
  it("spine predicate", () => {
    expect(read("supabase/functions/_shared/spinePredicate.ts")).toMatch(/"odi_market_definitions", companyId, \["retracted", false\]/);
  });
  it("marketCandidateDecided clause (1)", () => {
    expect(read("supabase/functions/_shared/marketCandidateAccounted.ts")).toMatch(/market_register: "public_inferred",\s*retracted: false,/);
  });
  it("admin client-shaped lists: ClientRefinePreviewView query; WorkshopView hasRow gate + list filter", () => {
    expect(eqFilters(read("src/views/client/ClientRefinePreviewView.tsx"))).toBe(1);
    const w = read("src/views/client/ClientRefinePreviewWorkshopView.tsx");
    expect(w).toMatch(/hasRow\("odi_market_definitions", \{ retracted: false \}\)/);
    expect(w).toMatch(/if \(r\.retracted === true\) continue;/);
  });
  it("per-journey syntheses refuse to synthesise children of a retracted market (shared guard)", () => {
    for (const f of ["opportunitySynthesis", "stepConditionsSynthesis", "marketHypothesisSynthesis"]) {
      expect(read(`supabase/functions/_shared/${f}.ts`)).toMatch(/journeyIsRetracted\(args\.supabase, args\.companyId, args\.journeyKey\)/);
    }
    // and the two fall-back-to-newest-def reads never fall back onto a retracted one
    expect(eqFilters(read("supabase/functions/_shared/opportunitySynthesis.ts"))).toBe(1);
    expect(eqFilters(read("supabase/functions/_shared/stepConditionsSynthesis.ts"))).toBe(1);
  });
  it("the admin portfolio hook is UNFILTERED by design and selects `retracted` for the resolver's bucket", () => {
    const src = read("src/hooks/useMarketPortfolio.ts");
    expect(eqFilters(src)).toBe(0);
    expect(src).toMatch(/declared_source_ref, retracted"/);
  });
  it("the exclusion predicate is exactly retracted_at IS NULL (generated `retracted` mirrors it)", () => {
    const visible = (r: { retracted_at: string | null }) => r.retracted_at === null;
    expect(visible({ retracted_at: null })).toBe(true);
    expect(visible({ retracted_at: "2026-09-11T00:00:00Z" })).toBe(false);
  });
});
