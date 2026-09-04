// REVIEW ANCHORS + BASELINE SELECTION (operator rulings 2026-09-04). Pure helpers the --review runner imports.
// (2) anchor: entity_anchors_json values + the website host label, fallback the company name with a trailing
//     fixture suffix stripped ("Cafe Barra 2" → "cafe barra"); a body containing "cafe barra" → present.
// (3) --baseline-run: when given, the baseline is the newest snapshot under THAT run_id only; when absent,
//     current law — newest snapshot whose run_id is not the sentinel and which predates today. RED before
//     the module exists; GREEN after.
import { describe, expect, it } from "vitest";
import { buildAnchors, anchorPresent, selectBaseline } from "../../../supabase/functions/_shared/outsideRecrawlAnchors";

describe("buildAnchors — ruling (2)", () => {
  it("company 'Cafe Barra 2', site cafebarra.com, no entity anchors → 'cafe barra' (suffix stripped) + host label", () => {
    const a = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: [] });
    expect(a).toContain("cafe barra");
    expect(a).toContain("cafebarra");
    expect(a).not.toContain("cafe barra 2");
  });
  it("entity anchors come first and are normalized; empties dropped", () => {
    const a = buildAnchors({ name: "Cafe Barra 2", website: "https://www.cafebarra.com/x", entityAnchors: ["Café Barra", "  ", "Le French Rooster"] });
    expect(a[0]).toBe("café barra".normalize("NFC").toLowerCase());
    expect(a).toContain("le french rooster");
    expect(a).toContain("cafebarra");
  });
});

describe("anchorPresent", () => {
  const anchors = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: [] });
  it("body containing 'cafe barra' → true", () => {
    expect(anchorPresent("Wine + Eggs sells Cafe Barra Machado de Assis Brazil, $22.", anchors, [])).toBe(true);
  });
  it("body without any anchor or quote → false", () => {
    expect(anchorPresent("A page about somebody else entirely.", anchors, [])).toBe(false);
  });
  it("a verbatim dependent quote alone is enough", () => {
    expect(anchorPresent("... teaming up with a local roaster! ...", [], ["teaming up with a local roaster"])).toBe(true);
  });
});

describe("selectBaseline — ruling (3)", () => {
  const SENT = "0000feed-0000-4000-8000-000000000001";
  const rows = [
    { sha: "old", status: "ok", run_id: null, crawled_at: "2026-08-26T05:15:00Z" },
    { sha: "plant", status: "ok", run_id: SENT, crawled_at: "2026-09-04T17:48:00Z" },
    { sha: "today", status: "ok", run_id: "9a3ad379-0000-4000-8000-000000000000", crawled_at: "2026-09-04T17:49:00Z" },
    { sha: "planted-b", status: "ok", run_id: "0000feed-0000-4000-8000-000000000002", crawled_at: "2026-09-04T18:00:00Z" },
  ];
  it("absent → newest non-sentinel row predating today (never bare newest, never the plant)", () => {
    expect(selectBaseline(rows, { sentinel: SENT, today: "2026-09-04" })).toEqual({ sha: "old", status: "ok" });
  });
  it("given → newest row under that run_id only, even if it is a sentinel/plant run and even if today", () => {
    expect(selectBaseline(rows, { sentinel: SENT, today: "2026-09-04", baselineRun: "0000feed-0000-4000-8000-000000000002" })).toEqual({ sha: "planted-b", status: "ok" });
  });
  it("given but no row under that run_id → null (no baseline → 'new'), never a fallback to another run", () => {
    expect(selectBaseline(rows, { sentinel: SENT, today: "2026-09-04", baselineRun: "ffffffff-0000-4000-8000-000000000000" })).toBeNull();
  });
});
