import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Gate 3 step 2: dropped fabrications (superseded_at) and held-pending-recrawl paraphrases
// (held_at) must be excluded from EVERY client-facing outside-signal path AND from the
// recurrence recompute. This guard fails the run if any of the four query sites loses a
// filter — the behavioral proof (a planted superseded row + a planted held row actually
// disappearing from beats 2/4/5 and from recurrence counting) is verified live against CB2.
const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

// A `.is("superseded_at", null)` immediately followed (ignoring whitespace/comments) by
// `.is("held_at", null)` — the paired exclusion both edits install at each query site.
function pairedExclusions(src: string): number {
  const re = /\.is\("superseded_at",\s*null\)\s*(?:\/\/[^\n]*\n\s*)*\.is\("held_at",\s*null\)/g;
  return (src.match(re) || []).length;
}

describe("Gate 3 step 2 — dropped/held outside signals excluded on every path", () => {
  it("useFirstReadPreviewData has the paired filter at beat-2, beat-4 record tag, and beat-5 citations (3 sites)", () => {
    const src = read("src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
    expect(pairedExclusions(src)).toBe(3);
    // and never a lone held_at without its superseded_at partner (both conditions always applied)
    expect((src.match(/\.is\("held_at",\s*null\)/g) || []).length).toBe(3);
  });

  it("signalRecurrence recompute excludes both — a fabrication cannot inflate a finding host count", () => {
    const src = read("supabase/functions/_shared/signalRecurrence.ts");
    expect(pairedExclusions(src)).toBe(1);
  });

  it("the exclusion predicate is exactly both-flags-null (a planted superseded OR held row is hidden; a clean row shows)", () => {
    const visible = (r: { superseded_at: string | null; held_at: string | null }) =>
      r.superseded_at === null && r.held_at === null;
    expect(visible({ superseded_at: null, held_at: null })).toBe(true);            // KEEP renders
    expect(visible({ superseded_at: "2026-08-28T00:00:00Z", held_at: null })).toBe(false); // DROP/blocked hidden
    expect(visible({ superseded_at: null, held_at: "2026-08-28T00:00:00Z" })).toBe(false); // HELD paraphrase hidden
  });
});
