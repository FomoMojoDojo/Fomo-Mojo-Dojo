// ADMIN INVENTORY (Gate 1, 2026-09-10) — the two things this page must not get wrong.
//
// 1. THE SCORE IS NOT THE CACHE. `companies.mojo_score` is stale for 13 of 20 companies: the
//    outside-score writer inserts a `mojo_scores` row and never updates the column. Brand AI reads 0
//    in the cache against 20 in the table.
// 2. FILL STATUS IS ARTIFACTS FIRST. Twelve of twenty companies have four current reads and a score
//    while their ledger terminals read false, because they predate the chain. A ledger-first status
//    would report a healthy fleet as broken.
import { describe, expect, it } from "vitest";
import { buildInventory, fillStatusLabel, type FillStages } from "./companiesInventory";

const T = (iso: string) => new Date(iso).toISOString();
const CO = (id: string, over: Record<string, unknown> = {}) => ({ id, name: id, website: `https://${id}.example`, frozen: false, ...over });
const READS = (id: string, kinds: string[]) => kinds.map((kind) => ({ company_id: id, kind, is_current: true }));

const EMPTY = {
  companies: [], mojoScores: [], integrity: [], ownWords: [], deltas: [],
  reads: [], recurrence: [], baselines: [], ledger: [],
};

describe("score comes from mojo_scores, never the companies cache", () => {
  it("a planted cache of 0 with a newest row of 20 renders 20", () => {
    // Brand AI's real shape on 2026-09-09.
    const [row] = buildInventory({
      ...EMPTY,
      companies: [CO("brandai", { mojo_score: 0 })],
      mojoScores: [
        { company_id: "brandai", total_score: 20, methodology_version: "outside-v1.1.0", computed_at: T("2026-09-09T22:41:57Z") },
        { company_id: "brandai", total_score: 5, methodology_version: "outside-v1.1.0", computed_at: T("2026-09-01T00:00:00Z") },
      ],
    });
    expect(row.score?.value).toBe(20);
    expect(row.score?.methodology).toBe("outside-v1.1.0");
  });

  it("current methodology = the methodology of the NEWEST row, not a mixed pick", () => {
    const [row] = buildInventory({
      ...EMPTY,
      companies: [CO("mix")],
      mojoScores: [
        { company_id: "mix", total_score: 35, methodology_version: "v1.1.0", computed_at: T("2026-07-10T05:56:00Z") },
        { company_id: "mix", total_score: 21, methodology_version: "outside-v1.1.0", computed_at: T("2026-09-05T01:41:00Z") },
      ],
    });
    expect(row.score).toEqual({ value: 21, methodology: "outside-v1.1.0", computedAt: T("2026-09-05T01:41:00Z") });
  });

  it("no score row → null, which the cell renders as an em dash (never 0)", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("none")] });
    expect(row.score).toBeNull();
  });
});

describe("Gate 2 / Gate 3 placeholders are honest empties", () => {
  it("delta and both costs are null, never 0", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("x")] });
    expect(row.delta).toBeNull();
    expect(row.lastRunCost).toBeNull();
    expect(row.totalCost).toBeNull();
  });
});

describe("last update = newest integrity_runs.ran_at", () => {
  it("takes the newest row and ignores older ones", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("c")],
      integrity: [
        { company_id: "c", component: "a", status: "completed", ran_at: T("2026-09-01T00:00:00Z") },
        { company_id: "c", component: "b", status: "completed", ran_at: T("2026-09-09T23:04:00Z") },
      ],
    });
    expect(row.lastUpdate).toBe(T("2026-09-09T23:04:00Z"));
  });

  it("no integrity rows → null, which the cell renders as 'never'", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("c")] });
    expect(row.lastUpdate).toBeNull();
  });
});

describe("fill status — ARTIFACTS FIRST", () => {
  /** A pre-chain company: complete artifacts, and NO ledger rows at all. 12 of 20 look like this. */
  const preChain = () => buildInventory({
    ...EMPTY,
    companies: [CO("prechain")],
    baselines: [{ company_id: "prechain" }],
    ownWords: [{ company_id: "prechain", created_at: T("2026-08-21T22:16:24Z") }],
    deltas: [{ company_id: "prechain", computed_at: T("2026-08-21T22:45:14Z") }],
    reads: READS("prechain", ["positioning", "strategy", "promise", "offering"]),
    mojoScores: [{ company_id: "prechain", total_score: 19, methodology_version: "outside-v1.1.0", computed_at: T("2026-08-22T00:14:00Z") }],
    // ledger: [] — deliberately empty. No fr_own_words row, no recurrence_step row.
  })[0];

  it("a pre-chain company with four reads + a score renders COMPLETE", () => {
    const row = preChain();
    expect(row.fillStatus).toBe("complete");
    expect(row.stages.ledger.ownWordsTerminal).toBeNull();   // no ledger row at all…
    expect(row.stages.ledger.recurrenceTerminal).toBeNull(); // …and it still reads complete
  });

  it("VACUOUS PROOF — a ledger-FIRST status would call that same company broken", () => {
    // This is the mistake the cell must not make. If fillStatusLabel consulted ledger terminals
    // before artifacts, the pre-chain company above would fail on an absent row rather than pass on
    // present artifacts — and 12 of 20 companies would read as broken.
    const row = preChain();
    const ledgerFirst = (s: FillStages) =>
      s.ledger.ownWordsTerminal === null ? "own-words pending"
        : s.ledger.recurrenceTerminal === null ? "recurrence pending"
        : "complete";
    expect(ledgerFirst(row.stages)).toBe("own-words pending"); // the wrong answer…
    expect(row.fillStatus).toBe("complete");                    // …and the right one
  });

  it("no baseline wins over everything", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("nb")] });
    expect(row.fillStatus).toBe("no baseline");
  });

  it("own-words pending when a baseline exists but no claims do", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("ow")], baselines: [{ company_id: "ow" }] });
    expect(row.fillStatus).toBe("own-words pending");
  });

  it("deltas stale — claims NEWER than the deltas (Riverlane's real shape)", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("riv")], baselines: [{ company_id: "riv" }],
      ownWords: [{ company_id: "riv", created_at: T("2026-09-09T20:55:06Z") }],
      deltas: [{ company_id: "riv", computed_at: T("2026-09-09T17:25:56Z") }],
      reads: READS("riv", ["positioning", "strategy", "promise", "offering"]),
    });
    expect(row.fillStatus).toBe("deltas stale");
    expect(row.stages.deltasReason).toBe("claims_newer");
  });

  it("deltas stale — claims with NO deltas (the 2a case)", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("nd")], baselines: [{ company_id: "nd" }],
      ownWords: [{ company_id: "nd", created_at: T("2026-09-10T09:00:00Z") }],
    });
    expect(row.fillStatus).toBe("deltas stale");
    expect(row.stages.deltasReason).toBe("no_deltas_with_claims");
  });

  it("a rejected offering renders '3 of 4 reads · offering rejected' with the guard in the expander", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("rej")], baselines: [{ company_id: "rej" }],
      ownWords: [{ company_id: "rej", created_at: T("2026-09-09T21:43:28Z") }],
      deltas: [{ company_id: "rej", computed_at: T("2026-09-09T21:43:29Z") }],
      reads: READS("rej", ["positioning", "strategy", "promise"]),
      integrity: [{
        company_id: "rej", component: "first_read_public_read_offering", status: "rejected",
        ran_at: T("2026-09-09T22:42:26Z"),
        error: 'guard=offering_structure detail=[{"code":"item_bad_kind_hint"}]',
      }],
    });
    expect(row.fillStatus).toBe("3 of 4 reads · offering rejected");
    const offering = row.stages.reads.find((r) => r.kind === "offering")!;
    expect(offering.rejected).toBe(true);
    expect(offering.guard).toBe("offering_structure");
  });

  it("a MISSING read is not a rejected read — no guard, no suffix", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("miss")], baselines: [{ company_id: "miss" }],
      ownWords: [{ company_id: "miss", created_at: T("2026-08-01T00:00:00Z") }],
      deltas: [{ company_id: "miss", computed_at: T("2026-08-02T00:00:00Z") }],
      reads: READS("miss", ["positioning", "strategy", "promise"]),
    });
    expect(row.fillStatus).toBe("3 of 4 reads");
    expect(row.stages.reads.find((r) => r.kind === "offering")!.rejected).toBe(false);
  });

  it("the ledger line is carried for the expander, but never decides the cell", () => {
    const [row] = buildInventory({
      ...EMPTY, companies: [CO("led")], baselines: [{ company_id: "led" }],
      ownWords: [{ company_id: "led", created_at: T("2026-09-09T21:43:28Z") }],
      deltas: [{ company_id: "led", computed_at: T("2026-09-09T21:43:29Z") }],
      reads: READS("led", ["positioning", "strategy", "promise", "offering"]),
      ledger: [
        { company_id: "led", run_kind: "fr_own_words", status: "failed", started_at: T("2026-09-09T17:25:55Z") },
        { company_id: "led", run_kind: "recurrence_step", status: "completed", started_at: T("2026-09-09T17:26:06Z") },
      ],
    });
    expect(row.stages.ledger.ownWordsTerminal).toBe("failed"); // a FAILED terminal…
    expect(row.fillStatus).toBe("complete");                    // …and the artifacts still say complete
  });
});

describe("frozen comes from the DB column", () => {
  it("frozen true is carried onto the row", () => {
    const [row] = buildInventory({ ...EMPTY, companies: [CO("cb1", { frozen: true })] });
    expect(row.frozen).toBe(true);
  });
  it("absent/null frozen is live, never undefined", () => {
    const [a] = buildInventory({ ...EMPTY, companies: [CO("a", { frozen: null })] });
    expect(a.frozen).toBe(false);
  });
});

describe("fillStatusLabel wording set", () => {
  const base: FillStages = {
    baselineRuns: 1, ownWordsClaims: 1, deltas: 1, deltasStale: false, deltasReason: "deltas_current",
    reads: [], readsCurrent: 4, recurrenceRows: 0, scoreRows: 0,
    ledger: { ownWordsTerminal: null, recurrenceTerminal: null },
  };
  it("renders exactly the signed strings", () => {
    expect(fillStatusLabel(base)).toBe("complete");
    expect(fillStatusLabel({ ...base, baselineRuns: 0 })).toBe("no baseline");
    expect(fillStatusLabel({ ...base, ownWordsClaims: 0 })).toBe("own-words pending");
    expect(fillStatusLabel({ ...base, deltasStale: true })).toBe("deltas stale");
    expect(fillStatusLabel({ ...base, readsCurrent: 2 })).toBe("2 of 4 reads");
  });
});
