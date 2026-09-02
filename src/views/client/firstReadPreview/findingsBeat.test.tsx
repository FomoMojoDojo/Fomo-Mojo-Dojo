// "What stands out" (findings) beat — the empty state is INTEGRITY-DERIVED, never array emptiness
// alone (STEP 2, operator ruling 2026-09-02). Same three-state shape as offering/gap/questions:
// not-yet / looked-and-none / couldn't-check, from first_read_findings integrity (evidencePhase1
// capture, which records seen/captured counts). The load-bearing proof: the SAME empty findings array
// renders THREE DIFFERENT lines by integrity state — so it cannot be reading emptiness. A "7 seen, 0
// captured" run (an E4-style upstream drop) lands as looked_none with the counts on the integrity row.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActFindings } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRFinding } from "./types";

const S = {
  notYet: "No public findings surfaced yet.",
  lookedNone: "We read the outside record and nothing stood out on its own yet.",
  couldnt: "We couldn't read the record for what stands out this time.",
} as const;

const empty = (state: FirstReadPreviewData["findingsIntegrity"]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  findings: [],
  statusConflicts: [],
  findingsIntegrity: state,
});

const renderF = (read: FirstReadPreviewData) => render(<ActFindings read={read} />).container;

describe("Findings beat empty state — integrity, not emptiness", () => {
  it("not-yet (no integrity row) → the not-yet line, no findings list", () => {
    const c = renderF(empty("not_yet"));
    expect(c.textContent).toContain(S.notYet);
    expect(c.querySelectorAll("main > *").length).toBeGreaterThan(0); // the Absent block mounts
  });

  it("looked-and-none (a '7 seen, 0 captured' completed run) → the looked line, no list", () => {
    const c = renderF(empty("looked_none"));
    expect(c.textContent).toContain(S.lookedNone);
    expect(c.textContent).not.toContain(S.notYet);
  });

  it("couldn't-check (integrity failed) → the failed-read line, no list", () => {
    const c = renderF(empty("couldnt_check"));
    expect(c.textContent).toContain(S.couldnt);
  });

  it("INTEGRITY-NOT-EMPTINESS: the same empty array renders three DISTINCT lines by state", () => {
    const t = (s: FirstReadPreviewData["findingsIntegrity"]) => renderF(empty(s)).textContent ?? "";
    const lines = new Set([t("not_yet"), t("looked_none"), t("couldnt_check")]);
    expect(lines.size).toBe(3); // if it read array emptiness, all three would be identical
  });

  it("with findings present, the list renders and no empty line shows", () => {
    const f: FRFinding = { id: "f1", body: "Geniant's roll-up M&A is its primary capability-assembly mechanism.", recurrence: 0, sourceTag: null, quotes: [], stale: false, ageMarker: null, statusDisputed: false };
    const c = renderF({ ...EMPTY_FIRST_READ, findings: [f], findingsIntegrity: "looked_none" });
    expect(c.textContent).toContain(f.body);
    expect(c.textContent).not.toContain(S.lookedNone);
  });
});

// STEP 2 — render honesty. The finding body is OUR reading, not a quote; the meta must not name a
// source that isn't there. DOM-structure assertions where possible; the SOURCE-absence one is a text
// assertion by necessity (there is no element to key on — it is the literal "Source:" label).
describe("Findings render honesty — no glyph on the body, honest meta pre-recurrence", () => {
  const finding = (over: Partial<FRFinding>): FRFinding => ({
    id: "f1", body: "The firm's competitive moat is leadership pedigree from prior exits.",
    recurrence: 0, sourceTag: { label: "read September 2, 2026" }, quotes: [], stale: false, ageMarker: null, statusDisputed: false, ...over,
  });
  const read = (f: FRFinding): FirstReadPreviewData => ({ ...EMPTY_FIRST_READ, findings: [f], findingsIntegrity: "looked_none" });

  it("(2a) the analysis-register finding BODY wears NO hanging-quote glyph", () => {
    const c = renderF(read(finding({})));
    expect(c.querySelectorAll(".fr-quote-mark").length).toBe(0); // no body glyph
    expect(c.textContent).toContain(finding({}).body);
  });

  it("(2a) a provably-verbatim cluster-member RECEIPT keeps its quote marks (receipts ARE quotes)", () => {
    const c = renderF(read(finding({
      quotes: [{ text: "beans roasted in small batches", sourceTag: { label: "roastmag.com · read Sep 2 2026" }, eventDate: null, provablyVerbatim: true }],
    })));
    expect(c.textContent).toContain("“beans roasted in small batches”"); // “…” kept on the receipt
  });

  it("(2b) no corroborating hosts (recurrence 0) → OUR READ (A′ clean), NO 'Source:', NO 'undated' noise", () => {
    const c = renderF(read(finding({ recurrence: 0, ageMarker: "undated" })));
    expect(c.textContent).toContain("Our read · September 2, 2026"); // A′: date alone, no double "read"
    expect(c.textContent).not.toContain("Source:");
    expect(c.textContent).not.toContain("read September 2, 2026"); // the "read " prefix is stripped
    expect(c.textContent).not.toContain("undated"); // our reading has no event date — marker dropped
  });

  it("(2b) corroborated (recurrence > 0) → the header meta line is DROPPED entirely (no date, no Source, no Our-read)", () => {
    const c = renderF(read(finding({ recurrence: 3, quotes: [] })));
    expect(c.textContent).not.toContain("Source:");
    expect(c.textContent).not.toContain("Our read");
    expect(c.textContent).not.toContain("September 2, 2026"); // header meta node gone (receipts carry host+date)
    expect(c.textContent).not.toContain("undated");
    expect(c.textContent).toContain(finding({}).body); // the body still renders
  });

  it("(2b) receipts unchanged: a corroborated finding's verbatim receipt still carries its quote + host/date", () => {
    const c = renderF(read(finding({
      recurrence: 3,
      quotes: [{ text: "revenue doubled year over year", sourceTag: { label: "pitchbook.com · read Sep 2 2026" }, eventDate: null, provablyVerbatim: true }],
    })));
    expect(c.textContent).toContain("“revenue doubled year over year”");
    expect(c.textContent).toContain("pitchbook.com · read Sep 2 2026"); // per-receipt host+date intact
  });
});
