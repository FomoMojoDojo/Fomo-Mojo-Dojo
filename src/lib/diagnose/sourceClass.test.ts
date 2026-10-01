// DF2 — the source-class rules, on fixtures. No database, no network.
import { describe, expect, it } from "vitest";
import {
  EMPTY_SOURCE_COUNTS,
  addSourceCounts,
  claimSourceCounts,
  hasNoSources,
  interviewItemSourceCounts,
  signalBackedSourceCounts,
  sumSourceCounts,
} from "./sourceClass";

describe("claims — the three stored counts, as stored", () => {
  it("carries each support count into its own class", () => {
    expect(claimSourceCounts({ outside_support_count: 3, organization_support_count: 2, customer_support_count: 1 }))
      .toEqual({ world: 3, team: 2, customers: 1, unclassed: 0 });
  });

  it("A CLAIM AT ALL ZEROS RETURNS ALL ZEROS — never one unclassed", () => {
    // 60 of Edgewood's 116 claims are in exactly this state. "Nobody has backed this" is a
    // different statement from "backed by a source we cannot class"; DF2 keeps them apart.
    const c = claimSourceCounts({ outside_support_count: 0, organization_support_count: 0, customer_support_count: 0 });
    expect(c).toEqual({ world: 0, team: 0, customers: 0, unclassed: 0 });
    expect(hasNoSources(c)).toBe(true);
  });

  it("treats null / undefined / negative / non-finite as 0, never as evidence", () => {
    expect(claimSourceCounts({ outside_support_count: null, organization_support_count: undefined, customer_support_count: -4 }))
      .toEqual(EMPTY_SOURCE_COUNTS);
    expect(claimSourceCounts({ outside_support_count: Number.NaN, organization_support_count: 1, customer_support_count: 0 }))
      .toEqual({ world: 0, team: 1, customers: 0, unclassed: 0 });
  });

  it("customers shows its true count including 0 — a zero is never coerced away", () => {
    const c = claimSourceCounts({ outside_support_count: 5, organization_support_count: 4, customer_support_count: 0 });
    expect(c.customers).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(c, "customers")).toBe(true);
  });
});

describe("interview items — the record's role with the item's side", () => {
  it("client + client_stakeholder → team", () => {
    expect(interviewItemSourceCounts({ speaker_side: "client", speaker_role: "client_stakeholder" }))
      .toEqual({ world: 0, team: 1, customers: 0, unclassed: 0 });
  });

  it("client + working_session → team", () => {
    expect(interviewItemSourceCounts({ speaker_side: "client", speaker_role: "working_session" }))
      .toEqual({ world: 0, team: 1, customers: 0, unclassed: 0 });
  });

  it("client + market_participant → customers", () => {
    expect(interviewItemSourceCounts({ speaker_side: "client", speaker_role: "market_participant" }))
      .toEqual({ world: 0, team: 0, customers: 1, unclassed: 0 });
  });

  it("AN 'ours' ITEM IS EXCLUDED, NOT UNCLASSED — our interviewer is not a source", () => {
    for (const role of ["client_stakeholder", "market_participant", "working_session"]) {
      const c = interviewItemSourceCounts({ speaker_side: "ours", speaker_role: role });
      expect(c).toEqual(EMPTY_SOURCE_COUNTS);
      expect(c.unclassed).toBe(0); // the point: it does not land in unclassed
    }
  });

  it("a side or role outside the CHECK constraints lands in unclassed, never silently counted or dropped", () => {
    expect(interviewItemSourceCounts({ speaker_side: "client", speaker_role: "someone_new" }).unclassed).toBe(1);
    expect(interviewItemSourceCounts({ speaker_side: "partner", speaker_role: "client_stakeholder" }).unclassed).toBe(1);
    expect(interviewItemSourceCounts({ speaker_side: null, speaker_role: null }).unclassed).toBe(1);
  });
});

describe("signal-backed items — findings, needs, anything else", () => {
  it("each backing signal is one UNCLASSED source", () => {
    expect(signalBackedSourceCounts([{ voice_class: "outside_voice_about_client" }, { voice_class: "client_voice" }]))
      .toEqual({ world: 0, team: 0, customers: 0, unclassed: 2 });
  });

  it("voice_class NEVER classes — client_voice does not become team, outside does not become world", () => {
    const c = signalBackedSourceCounts([
      { voice_class: "client_voice" },
      { voice_class: "outside_voice_about_client" },
      { voice_class: "market_context" },
      { voice_class: "competitor_voice" },
    ]);
    expect(c).toEqual({ world: 0, team: 0, customers: 0, unclassed: 4 });
  });

  it("'analysis' IS EXCLUDED ENTIRELY — model-written prose is not a source", () => {
    expect(signalBackedSourceCounts([{ voice_class: "analysis" }])).toEqual(EMPTY_SOURCE_COUNTS);
  });

  it("AN ANALYSIS-ONLY FINDING HAS NO SOURCES AT ALL — not an unclassed one", () => {
    const c = signalBackedSourceCounts([{ voice_class: "analysis" }, { voice_class: "analysis" }]);
    expect(c).toEqual(EMPTY_SOURCE_COUNTS);
    expect(hasNoSources(c)).toBe(true);
  });

  it("mixes: analysis dropped, the rest unclassed", () => {
    expect(signalBackedSourceCounts([
      { voice_class: "analysis" }, { voice_class: null }, { voice_class: "client_voice" }, { voice_class: "analysis" },
    ])).toEqual({ world: 0, team: 0, customers: 0, unclassed: 2 });
  });

  it("a null voice_class is a real source and counts as unclassed (660 such rows fleet-wide)", () => {
    expect(signalBackedSourceCounts([{ voice_class: null }, { voice_class: undefined }]).unclassed).toBe(2);
  });

  it("no backing signals at all → all zeros", () => {
    expect(signalBackedSourceCounts([])).toEqual(EMPTY_SOURCE_COUNTS);
  });
});

describe("summing", () => {
  it("adds class by class and keeps unclassed separate", () => {
    const a = { world: 1, team: 2, customers: 0, unclassed: 3 };
    const b = { world: 4, team: 0, customers: 5, unclassed: 1 };
    expect(addSourceCounts(a, b)).toEqual({ world: 5, team: 2, customers: 5, unclassed: 4 });
  });

  it("sums a mixed set the way a Diagnose page would roll one up", () => {
    const rolled = sumSourceCounts([
      claimSourceCounts({ outside_support_count: 2, organization_support_count: 1, customer_support_count: 0 }),
      interviewItemSourceCounts({ speaker_side: "client", speaker_role: "market_participant" }),
      interviewItemSourceCounts({ speaker_side: "ours", speaker_role: "client_stakeholder" }),  // excluded
      signalBackedSourceCounts([{ voice_class: "analysis" }, { voice_class: "client_voice" }]), // 1 unclassed
    ]);
    expect(rolled).toEqual({ world: 2, team: 1, customers: 1, unclassed: 1 });
  });

  it("an empty set is all zeros", () => {
    expect(sumSourceCounts([])).toEqual(EMPTY_SOURCE_COUNTS);
  });
});
