// Stage B — vacuous-proofs for the public 5-rung Playing-to-Win cascade routing. The module lives under
// supabase/functions/_shared (edge-mounted, pure); this test lives under src/** so the vitest suite
// (include: src/**) runs it. Each proof MUST fail if its guard is reverted.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveCascadeSpineAndGaps,
  cascadeGapQuestion,
  RUNG_PLAIN_NAME,
  type StrategyPayload,
  type CascadeCoherence,
} from "../../../supabase/functions/_shared/cascadeRouting.ts";

// A fully-grounded, fully-coherent 5-rung payload (ref-tokened, as the generator emits it).
const FULL: StrategyPayload = {
  winning_aspiration: "the go-to neighborhood roaster",
  where_to_play: "cafe partnerships + local DTC",
  how_to_win: "roaster-origin quality and provenance",
  must_have_capabilities: [
    { text: "in-house small-batch roasting", citations: ["F1"] },
    { text: "wholesale cafe relationships", citations: ["S2"] },
  ],
  management_systems: [],
};
const COHERENT: CascadeCoherence = {
  how_to_win: { coherent: true, reason: "quality serves the roaster aspiration" },
  capabilities: [
    { text: "in-house small-batch roasting", coherent: true, reason: "serves quality edge" },
    { text: "wholesale cafe relationships", coherent: true, reason: "serves where-to-play" },
  ],
};

describe("proof 1 — PAYLOAD SHAPE: a grounded coherent cascade renders the full spine + one management gap", () => {
  it("keeps rungs 1–4 in the spine, routes the empty management rung to a gap question", () => {
    const { spine, items } = deriveCascadeSpineAndGaps(FULL, COHERENT);
    expect(spine.winning_aspiration).toBe(FULL.winning_aspiration);
    expect(spine.where_to_play).toBe(FULL.where_to_play);
    expect(spine.how_to_win).toBe(FULL.how_to_win);
    expect((spine.must_have_capabilities as unknown[]).length).toBe(2);
    // management_systems is empty → exactly one GAP item for that rung, no others.
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "gap", rung: "management_systems" });
    expect(items[0].question_text).toBe(cascadeGapQuestion(RUNG_PLAIN_NAME.management_systems));
  });
});

describe("proof 2 — COHERENCE: a grounded-but-incoherent how_to_win is EXCLUDED from the spine + emits a tension", () => {
  it("incoherent how_to_win → blanked in spine, one tension item carrying the judge reason", () => {
    const incoherent: CascadeCoherence = {
      ...COHERENT,
      how_to_win: { coherent: false, reason: "a low-price edge does not serve a premium-provenance aspiration" },
    };
    const { spine, items } = deriveCascadeSpineAndGaps(FULL, incoherent);
    expect(spine.how_to_win).toBe(""); // excluded from the rendered spine
    const tension = items.find((i) => i.kind === "tension" && i.rung === "how_to_win");
    expect(tension, "how_to_win tension emitted").toBeTruthy();
    expect(tension!.reason).toContain("does not serve");
    expect(tension!.question_text).toContain("How to win reads as");
  });

  it("FALSIFICATION: the SAME payload judged coherent keeps how_to_win and emits NO how_to_win tension", () => {
    const { spine, items } = deriveCascadeSpineAndGaps(FULL, COHERENT);
    expect(spine.how_to_win).toBe(FULL.how_to_win);
    expect(items.find((i) => i.kind === "tension" && i.rung === "how_to_win")).toBeFalsy();
  });

  it("an incoherent CAPABILITY is dropped from the spine + emits its own tension; coherent ones stay", () => {
    const capIncoherent: CascadeCoherence = {
      how_to_win: { coherent: true, reason: "ok" },
      capabilities: [
        { text: "in-house small-batch roasting", coherent: true, reason: "serves edge" },
        { text: "wholesale cafe relationships", coherent: false, reason: "does not serve a DTC-quality edge" },
      ],
    };
    const { spine, items } = deriveCascadeSpineAndGaps(FULL, capIncoherent);
    const kept = (spine.must_have_capabilities as Array<{ text: string }>).map((c) => c.text);
    expect(kept).toEqual(["in-house small-batch roasting"]);
    const capTension = items.find((i) => i.kind === "tension" && i.rung === "must_have_capabilities");
    expect(capTension, "capability tension emitted").toBeTruthy();
  });
});

describe("proof 3 — GAP: an ungrounded rung (empty on arrival) routes to a gap question, never fabricated", () => {
  it("empty where_to_play + empty capabilities → gap items, and the spine leaves them empty", () => {
    const partial: StrategyPayload = {
      winning_aspiration: "the go-to roaster",
      where_to_play: "",
      how_to_win: "provenance",
      must_have_capabilities: [],
      management_systems: [],
    };
    const { spine, items } = deriveCascadeSpineAndGaps(partial, { how_to_win: { coherent: true } });
    const gapRungs = items.filter((i) => i.kind === "gap").map((i) => i.rung).sort();
    expect(gapRungs).toEqual(["management_systems", "must_have_capabilities", "where_to_play"]);
    expect(spine.where_to_play).toBe("");
    expect((spine.must_have_capabilities as unknown[]).length).toBe(0);
    // A gap NEVER invents content — the question is the only artifact.
    for (const g of items.filter((i) => i.kind === "gap")) expect(g.question_text).toContain("doesn't show");
  });
});

describe("proof 4 — IDEMPOTENCE (determinism): same input → identical, unique question_identities", () => {
  it("re-deriving yields byte-identical items; every question_identity is unique (safe supersede+insert)", () => {
    const a = deriveCascadeSpineAndGaps(FULL, COHERENT);
    const b = deriveCascadeSpineAndGaps(FULL, COHERENT);
    expect(JSON.stringify(a.items)).toBe(JSON.stringify(b.items));
    const ids = a.items.map((i) => i.question_identity);
    expect(new Set(ids).size).toBe(ids.length); // unique within a run → no (company,run,identity) collision
  });
});

describe("proof 6 — KINDS SELECTOR (source-level): a scoped run touches ONLY the listed kinds", () => {
  // PLANTED DIFFERENCE (what makes this designed-to-fail): the pre-selector code iterated the full
  // constant — `for (const kind of KINDS)` — at every generate/stage/write/promote site, and called
  // writeCascadeGaps unconditionally. Reverting the selector reintroduces those exact tokens, and
  // each assertion below fails on them. The selector replaced every iteration with `activeKinds`.
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-public-read/index.ts"),
    "utf8",
  );
  it("(a) every kind loop iterates activeKinds — zero `of KINDS` loops remain (revert = fail)", () => {
    expect(src.includes("for (const kind of KINDS)")).toBe(false);
    expect(src.includes("KINDS.map(")).toBe(false);
    expect(src.includes("KINDS.flatMap(")).toBe(false);
    // generate/stage/write/promote all iterate the scoped list: ≥4 loop sites + judge/resolve uses.
    expect(src.split("activeKinds").length - 1).toBeGreaterThanOrEqual(8);
    // the judge READ list is built from activeKinds, so an unlisted kind is never judged either.
    expect(src).toContain("activeKinds.map((k) => `${k}: ${JSON.stringify(payloads[k])}`)");
  });
  it("(b) an out-of-set kind is rejected loudly (400), never silently dropped", () => {
    expect(src).toContain("kinds must be a subset of");
    expect(src).toContain("bad_kinds: bad");
  });
  it("(c) omitted/empty kinds defaults to the ORIGINAL THREE (non-breaking); offering is opt-in", () => {
    // The default binding is DEFAULT_KINDS (the original three) — NOT the full KINDS constant, which now
    // also includes 'offering'. So an unscoped run (kinds omitted/[]) generates exactly the original
    // three and never 'offering'; only an explicit kinds:["offering"] narrows to it. This is what keeps
    // every existing caller byte-identical while offering ships opt-in.
    expect(src).toContain("let activeKinds: readonly Kind[] = DEFAULT_KINDS;");
    expect(src).toContain('const DEFAULT_KINDS = ["positioning", "strategy", "promise"] as const;');
    expect(src).toContain('const KINDS = ["positioning", "strategy", "promise", "offering"] as const;');
    expect(src).toContain("if (rawKinds.length > 0) activeKinds");
  });
  it("(d) cascade_gap routing rides the strategy kind — never superseded by a non-strategy run", () => {
    expect(src).toContain('const strategyActive = activeKinds.includes("strategy")');
    expect(src).toContain("strategyActive\n      ? await writeCascadeGaps");
  });
});

describe("proof 5 — FORBIDDEN INPUTS (source-level): the generator queries no forbidden table", () => {
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-public-read/index.ts"),
    "utf8",
  );
  // "Queries none of the forbidden tables" = issues no .from("<table>") against them. The table NAMES
  // legitimately appear in explanatory comments (the removal note + the FORBIDDEN-INPUTS doc header);
  // what must be absent is a QUERY. odi_market_definitions is fully removed (no query at all); the only
  // strategy_cascades query is the id-only legacy-audit pointer (never a cascade-content column).
  it("odi_market_definitions is NEVER queried (gather + probe reads removed)", () => {
    expect(src.includes('from("odi_market_definitions")')).toBe(false);
  });
  it("no strategy_cascades CONTENT column is ever selected — its only query is the id-only legacy pointer", () => {
    // no cascade-content columns anywhere in the generator
    for (const contentCol of ["capabilities_json", "management_systems_json", "assumptions_json"]) {
      expect(src.includes(contentCol), `${contentCol} must never be read`).toBe(false);
    }
    // the sole strategy_cascades query selects only id (the supersedes_legacy_row audit pointer)
    const casReads = [...src.matchAll(/from\("strategy_cascades"\)\.select\("([^"]*)"\)/g)].map((m) => m[1]);
    expect(casReads).toEqual(["id"]);
  });
  it("the gather function issues no query against any forbidden table", () => {
    const gather = src.slice(src.indexOf("async function gatherPublicInputs"), src.indexOf("// The INPUT LEDGER"));
    for (const forbidden of ['from("odi_market_definitions")', 'from("strategy_cascades")', 'from("inputs")', "storeSupplement"]) {
      expect(gather.includes(forbidden), `gather must not query ${forbidden}`).toBe(false);
    }
  });
});
