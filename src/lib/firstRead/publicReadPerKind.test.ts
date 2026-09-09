// PER-KIND ISOLATION (2026-09-09) — generate-public-read used to generate, guard and judge the four
// public-read kinds as ONE run: any whole-run reject returned before writing anything, so one bad
// kind took all four down, wrote no row and logged nothing. That is what made the Riverlane failure
// (company 49435388…, four kinds failed inside 10ms with zero rows and zero logs) undiagnosable.
//
// These tests pin the two properties that fix it:
//   1. ISOLATION — a reject on ONE kind rejects only that kind; the other three still run and write.
//   2. VISIBILITY — every reject emits one log line and one integrity row naming the guard.
//
// The model is mocked; the GUARDS ARE THE REAL ONES (imported from publicReadGuards.ts, the same
// module the edge function imports), so a guard that stopped firing would fail these tests.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detailOf,
  rejectLogLine,
  runKindsIsolated,
  type PerKindDeps,
  type PerKindOutcome,
} from "../../../supabase/functions/_shared/publicReadPerKind.ts";
import { collectCitationRefs } from "../../../supabase/functions/_shared/publicReadGuards.ts";

const KINDS = ["positioning", "strategy", "promise", "offering"] as const;
type Kind = (typeof KINDS)[number];

const S1 = "11111111-1111-4111-8111-111111111111";
const O1 = "22222222-2222-4222-8222-222222222222";
const uuidByRef = new Map<string, string>([["S1", S1], ["O1", O1]]);
const validRefs = new Set(uuidByRef.keys());
const provenances: Record<string, string> = { [S1]: "public_observed", [O1]: "public_observed" };
const liveness: Record<string, string> = { [S1]: "live", [O1]: "live" };

/** A clean, guard-passing payload for each kind. `badRef` plants a citation OUTSIDE the ledger. */
function payloadFor(kind: Kind, badRef?: string): Record<string, unknown> {
  const cite = badRef ? [badRef] : ["S1"];
  if (kind === "positioning") {
    return {
      market_category: "neighborhood cafe and roaster", market_category_citations: cite,
      value_for_customer: "coffee roasted in small batches", value_citations: ["S1"],
      best_fit_customers: "people nearby who drink coffee daily", best_fit_citations: ["O1"],
      unique_attributes: [{ text: "roasts on site", citations: ["S1"] }],
    };
  }
  if (kind === "strategy") {
    return {
      winning_aspiration: "the coffee people walk past two others for", winning_aspiration_citations: cite,
      where_to_play: "a few blocks around the shop", where_to_play_citations: ["S1"],
      how_to_win: "roast on site and sell the same week", how_to_win_citations: ["O1"],
      must_have_capabilities: [{ text: "an on-site roaster", citations: ["S1"] }],
      management_systems: [],
    };
  }
  if (kind === "promise") {
    return {
      promise: "coffee roasted this week, poured by the people who roasted it", promise_citations: cite,
      supporting_points: [{ text: "roasting happens in the shop", citations: ["O1"] }],
    };
  }
  return {
    items: [
      { label: "Filter coffee", statement: "brewed by the cup at the bar", refs: cite, kind_hint: "product" },
      { label: "Wholesale beans", statement: "bags sold to nearby kitchens", refs: ["O1"], kind_hint: "service" },
    ],
    open_questions: [{ text: "is the Sunday market stall still running", refs: ["S1"], reason: "currency" }],
  };
}

const CLEAN_VERDICT: Record<string, unknown> = {
  grounding_ok: true, sanity_ok: true, consistency_ok: true, accept: true, reason: "grounded",
  cascade_coherence: { how_to_win: { coherent: true, reason: "serves the arena" }, capabilities: [] },
  offering: { enumerable_ok: true, entity_attribution_ok: true, doubts_placed_ok: true, banned_vocab_ok: true, reason: "ok" },
};

type Harness = {
  outcomes: PerKindOutcome[];
  integrity: Array<{ kind: string; status: string; guard?: string; detail?: string }>;
  logs: string[];
  committed: string[];
};

/** Run the four kinds with a mocked model. `plant` puts an out-of-ledger citation on ONE kind. */
async function runHarness(plant: { kind: Kind; ref: string } | null): Promise<Harness> {
  const integrity: Harness["integrity"] = [];
  const logs: string[] = [];
  const committed: string[] = [];
  const deps: PerKindDeps = {
    citedRefs: collectCitationRefs,
    validRefs, uuidByRef, provenances, liveness,
    generate: (kind) => Promise.resolve(payloadFor(kind as Kind, plant && plant.kind === kind ? plant.ref : undefined)),
    judge: () => Promise.resolve({ ...CLEAN_VERDICT }),
    accepts: (kind, verdict) =>
      verdict.grounding_ok === true && verdict.sanity_ok === true && verdict.consistency_ok === true
      && verdict.accept === true
      && (kind === "offering" ? (verdict.offering as Record<string, unknown>)?.enumerable_ok === true : true),
    commit: (kind) => { committed.push(kind); return Promise.resolve(); },
    recordIntegrity: (kind, row) => { integrity.push({ kind, ...row }); return Promise.resolve(); },
    onReject: (kind, guard, detail) => { logs.push(rejectLogLine("company-under-test", kind, guard, detail)); },
  };
  const outcomes = await runKindsIsolated(KINDS, deps);
  return { outcomes, integrity, logs, committed };
}

describe("per-kind isolation — a planted citation-outside-ledger reject on kind=promise", () => {
  it("rejects ONLY promise and writes the other three", async () => {
    const h = await runHarness({ kind: "promise", ref: "I7" });

    const byKind = Object.fromEntries(h.outcomes.map((o) => [o.kind, o]));
    expect(byKind.promise.status).toBe("rejected");
    expect(byKind.promise.guard).toBe("citation_outside_ledger");
    expect(byKind.promise.detail).toContain("I7");
    for (const k of ["positioning", "strategy", "offering"]) {
      expect(byKind[k].status).toBe("written");
      expect(byKind[k].guard).toBeNull();
    }
    // The three good kinds were actually committed; the rejected one was not.
    expect(h.committed.sort()).toEqual(["offering", "positioning", "strategy"]);
  });

  it("writes exactly one rejected integrity row for promise and three completed", async () => {
    const h = await runHarness({ kind: "promise", ref: "I7" });

    expect(h.integrity).toHaveLength(4);
    const rejected = h.integrity.filter((r) => r.status === "rejected");
    const completed = h.integrity.filter((r) => r.status === "completed");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].kind).toBe("promise");
    expect(rejected[0].guard).toBe("citation_outside_ledger");
    expect(completed.map((r) => r.kind).sort()).toEqual(["offering", "positioning", "strategy"]);
  });

  it("emits exactly one reject log line, naming company, kind, guard and detail", async () => {
    const h = await runHarness({ kind: "promise", ref: "I7" });

    expect(h.logs).toHaveLength(1);
    expect(h.logs[0]).toBe(
      "[generate-public-read] reject company=company-under-test kind=promise guard=citation_outside_ledger detail=bad_ids=I7",
    );
  });

  it("a later kind still runs after an earlier kind rejects (order independence)", async () => {
    // positioning is FIRST in KINDS — rejecting it must not stop the three that follow.
    const h = await runHarness({ kind: "positioning", ref: "I7" });
    const byKind = Object.fromEntries(h.outcomes.map((o) => [o.kind, o]));
    expect(byKind.positioning.status).toBe("rejected");
    expect(h.committed.sort()).toEqual(["offering", "promise", "strategy"]);
  });
});

describe("CAN-FAIL PROOF — remove the plant and the same harness passes 4/4", () => {
  // This is the falsification control for the tests above: it proves those assertions are driven by
  // the PLANTED bad citation and the real guard firing on it, not by a harness that rejects promise
  // (or anything else) unconditionally. If the citation guard stopped firing, the tests above would
  // see this 4/4 result and fail.
  it("no plant → four written, zero rejected, zero integrity rejects, zero log lines", async () => {
    const h = await runHarness(null);

    expect(h.outcomes).toHaveLength(4);
    expect(h.outcomes.every((o) => o.status === "written")).toBe(true);
    expect(h.outcomes.filter((o) => o.status === "rejected")).toHaveLength(0);
    expect(h.integrity.filter((r) => r.status === "rejected")).toHaveLength(0);
    expect(h.integrity.filter((r) => r.status === "completed")).toHaveLength(4);
    expect(h.logs).toHaveLength(0);
    expect(h.committed.sort()).toEqual(["offering", "positioning", "promise", "strategy"]);
  });

  it("the ONLY difference between the two runs is the planted ref", async () => {
    const planted = await runHarness({ kind: "promise", ref: "I7" });
    const clean = await runHarness(null);
    // Same kinds, same order, same count — one status differs, and only for promise.
    expect(planted.outcomes.map((o) => o.kind)).toEqual(clean.outcomes.map((o) => o.kind));
    const diff = planted.outcomes.filter((o, i) => o.status !== clean.outcomes[i].status);
    expect(diff.map((o) => o.kind)).toEqual(["promise"]);
  });
});

describe("every other guard also isolates to its own kind", () => {
  it("framing vocabulary rejects only the kind whose prose carries the word", async () => {
    const integrity: Harness["integrity"] = [];
    const outcomes = await runKindsIsolated(KINDS, {
      citedRefs: collectCitationRefs, validRefs, uuidByRef, provenances, liveness,
      generate: (kind) => Promise.resolve(
        kind === "strategy"
          // "confirmed" is in FORBIDDEN_FRAMING_WORDS — a posit is a hypothesis, never a verdict.
          ? { ...payloadFor("strategy"), how_to_win: "a confirmed edge over the others" }
          : payloadFor(kind as Kind),
      ),
      judge: () => Promise.resolve({ ...CLEAN_VERDICT }),
      accepts: () => true,
      commit: () => Promise.resolve(),
      recordIntegrity: (kind, row) => { integrity.push({ kind, ...row }); return Promise.resolve(); },
    });
    const byKind = Object.fromEntries(outcomes.map((o) => [o.kind, o]));
    expect(byKind.strategy.status).toBe("rejected");
    expect(byKind.strategy.guard).toBe("framing_vocab");
    expect(outcomes.filter((o) => o.status === "written").map((o) => o.kind).sort())
      .toEqual(["offering", "positioning", "promise"]);
  });

  it("a judge reject on one kind leaves the others written", async () => {
    const outcomes = await runKindsIsolated(KINDS, {
      citedRefs: collectCitationRefs, validRefs, uuidByRef, provenances, liveness,
      generate: (kind) => Promise.resolve(payloadFor(kind as Kind)),
      judge: (kind) => Promise.resolve(
        kind === "offering" ? { ...CLEAN_VERDICT, grounding_ok: false, reason: "item not in the record" } : { ...CLEAN_VERDICT },
      ),
      accepts: (_kind, verdict) => verdict.grounding_ok === true,
      commit: () => Promise.resolve(),
    });
    const byKind = Object.fromEntries(outcomes.map((o) => [o.kind, o]));
    expect(byKind.offering.status).toBe("rejected");
    expect(byKind.offering.guard).toBe("judge");
    expect(byKind.offering.detail).toBe("item not in the record");
    expect(outcomes.filter((o) => o.status === "written")).toHaveLength(3);
  });

  it("a generation throw on one kind is isolated, not fatal to the run", async () => {
    const outcomes = await runKindsIsolated(KINDS, {
      citedRefs: collectCitationRefs, validRefs, uuidByRef, provenances, liveness,
      generate: (kind) => kind === "strategy"
        ? Promise.reject(new Error("openai gpt-4.1-mini 429: rate limited"))
        : Promise.resolve(payloadFor(kind as Kind)),
      judge: () => Promise.resolve({ ...CLEAN_VERDICT }),
      accepts: () => true,
      commit: () => Promise.resolve(),
    });
    const byKind = Object.fromEntries(outcomes.map((o) => [o.kind, o]));
    expect(byKind.strategy.status).toBe("rejected");
    expect(byKind.strategy.guard).toBe("generation_error");
    expect(byKind.strategy.detail).toContain("429");
    expect(outcomes.filter((o) => o.status === "written")).toHaveLength(3);
  });
});

describe("reject visibility contract", () => {
  it("detailOf caps the detail at 200 characters", () => {
    expect(detailOf("x".repeat(500))).toHaveLength(200);
    expect(detailOf({ a: 1 })).toBe('{"a":1}');
  });

  it("source-level: the function's own citedRefs uses the same key regex as collectCitationRefs", () => {
    // The edge function injects its OWN citedRefs; these tests inject collectCitationRefs. Pin the
    // equivalence so the guard under test is the guard that ships.
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/generate-public-read/index.ts"), "utf8");
    const m = src.match(/function citedRefs\([\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("/citation|cite|refs?$|ids$/i");
  });

  it("source-level: no whole-run reject remains — every reject path is per kind", () => {
    const src = readFileSync(resolve(process.cwd(), "supabase/functions/generate-public-read/index.ts"), "utf8");
    // The old shape returned `rejected: "<guard>"` for the WHOLE run before any write.
    for (const guard of ["citation_outside_ledger", "offering_structure", "framing_vocab", "citation_not_live_public"]) {
      expect(src.includes(`rejected: "${guard}"`)).toBe(false);
    }
    expect(src).toContain("runKindsIsolated");
  });
});
