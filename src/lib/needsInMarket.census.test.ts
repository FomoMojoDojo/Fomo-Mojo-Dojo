// The needs-by-market reader census (M-2, 2026-11-18) — the interview-segments census idiom.
//
// A need can belong to several markets as ONE record (need_markets), so a reader that asks "the needs of
// market X" must read needs_in_market, which has one row per need per live link. A read of odi_needs
// filtered or grouped by its own journey_key sees only the need's HOME market and silently misses every
// further market a need is linked to.
//
// This test walks src/ and supabase/functions/ and finds every `.from("odi_needs")` chain that SELECTs and
// names journey_key. The REMAINING list below is the readers not yet moved: it may only SHRINK. A new
// reader fails here (read needs_in_market instead); a moved reader fails here too until it is taken off
// the list, so the census always says exactly who is left. odi_needs.journey_key is dropped (M-7) when the
// list is empty.
//
// Plant: change useOdiNeeds' keyed read back to .from("odi_needs") -> red.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SCOPES = ["src", "supabase/functions"];
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/** Direct by-journey readers of odi_needs not yet on needs_in_market, with their read count. */
const REMAINING: Record<string, number> = {
  "src/components/admin/CompanyFilesPanel.tsx": 1,
  "src/hooks/usePrimaryEvidenceSignal.ts": 1,
  "src/lib/lensResolution.ts": 1,
  "src/lib/mojoScore/strikePreview.ts": 1,
  "src/views/client/ClientRefinePreviewWorkshopView.tsx": 1,
  "src/views/client/workshop/tabs/SocialSignalsPanel.tsx": 1,
  "supabase/functions/_shared/evidencePhase1.ts": 1,
  "supabase/functions/_shared/externalNeeds.ts": 1,
  "supabase/functions/_shared/jobMapRegeneration.ts": 1,
  "supabase/functions/_shared/opportunitySynthesis.ts": 2,
  "supabase/functions/_shared/researchSynthesisWrite.ts": 1,
  // SP-478 (2026-11-25): snapshotMojoScore came OFF this list — it reads needs_in_market now, through the
  // score's one input rule (scoreInputSet), the same view the browser's live score reads.
  "supabase/functions/backfill-canonical-statements/index.ts": 1,
  "supabase/functions/evaluate-opportunity-alignment/index.ts": 1,
  "supabase/functions/local-alignment/index.ts": 1,
  "supabase/functions/propose-opportunity-changes/index.ts": 1,
};

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) yield p;
  }
}

/** Each `.from("odi_needs")` chain (to the statement's end) that selects and names journey_key. */
export function byJourneyReads(text: string): number {
  const re = /\.from\(\s*["'`]odi_needs["'`]\s*\)/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    const chain = text.slice(m.index, m.index + 900).split(/;\s*\n|\n\s*\n/)[0];
    if (/\.select\(/.test(chain) && /journey_key/.test(chain)) n++;
  }
  return n;
}

describe("needs_in_market census (M-2)", () => {
  it("the direct by-journey readers of odi_needs are exactly the REMAINING list", () => {
    const found: Record<string, number> = {};
    for (const scope of SCOPES) {
      for (const file of walk(join(ROOT, scope))) {
        const n = byJourneyReads(readFileSync(file, "utf8"));
        if (n) found[relative(ROOT, file).split("\\").join("/")] = n;
      }
    }
    expect(found).toEqual(REMAINING);
  });

  it("useOdiNeeds — the client workspace pages' needs — reads needs_in_market, twice, and odi_needs by journey never", () => {
    const src = readFileSync(join(ROOT, "src/hooks/useOdiNeeds.ts"), "utf8");
    expect(byJourneyReads(src)).toBe(0);
    expect(src.match(/\.from\("needs_in_market"\)/g)?.length).toBe(2);
  });

  it("the census is not vacuous: the pattern finds a by-journey read where one is written", () => {
    expect(byJourneyReads(`await sb.from("odi_needs").select("*").eq("company_id", c).eq("journey_key", k);\n`)).toBe(1);
    expect(byJourneyReads(`await sb.from("odi_needs").update({ importance: 3 }).eq("id", i);\n`)).toBe(0);
  });
});
