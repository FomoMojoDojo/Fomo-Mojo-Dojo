// QUOTE WARRANT on the gap beat (operator ruling 2026-09-14, confirmed option A): a record side renders inside
// quotation marks ONLY when a passed excerpt_verifications record at guard_version 1 against the mint-time
// page or the sidecar backs it. Blanked, no_basis and no-record rows render as attributed text, unquoted,
// content intact; the old substring test (excerpt ⊂ claim_text) confers nothing on its own; nothing
// appears or disappears — only the quotation marks change.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActGap } from "./acts";
import { groupGapStatements } from "./mapping";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair } from "./types";
import { warrantKey, warrantKeySet, warrantsQuotation } from "@/lib/firstRead/quoteWarrant";

const base = (o: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({ ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, ...o });
const withPairs = (pairs: FRGapPair[]): Partial<FirstReadPreviewData> => ({ gapStatements: groupGapStatements(pairs), gapCounts: { confirmed: pairs.length, contradicted: 0, unechoed: 0, reverifying: 0 } as never });
const RECORD = "Families wait three weeks for a first appointment.";
const pair = (id: string, recordVerified: boolean | undefined, record = RECORD): FRGapPair =>
  ({ id, statementId: `s-${id}`, verdict: "confirmed", declared: "We see families within a week.", record, sourceTag: { label: "indeed.com · read Aug 1" }, eventDate: null, evidenceRank: 3, statusDisputed: false, ...(recordVerified === undefined ? {} : { recordVerified }) } as FRGapPair);
const recordEl = (container: HTMLElement) => container.querySelector("[data-fr-record-verified]") as HTMLElement;

describe("gap beat — a quotation requires a verification record", () => {
  it("a. a record with a passed mint-time/sidecar verification renders QUOTED", () => {
    const { container } = render(<ActGap read={base(withPairs([pair("a", true)]))} />);
    const el = recordEl(container);
    expect(el.getAttribute("data-fr-record-verified")).toBe("true");
    expect(el.textContent).toBe(`“${RECORD}”`);
  });
  it("b. blanked / no_basis / no-record rows render UNQUOTED with the content intact", () => {
    for (const rv of [false, undefined]) {
      const { container } = render(<ActGap read={base(withPairs([pair("b", rv)]))} />);
      const el = recordEl(container);
      expect(el.getAttribute("data-fr-record-verified")).toBe("false");
      expect(el.textContent).toBe(RECORD);
      expect(el.textContent).not.toMatch(/[“”]/);
    }
    // the verdicts themselves never warrant
    expect(warrantsQuotation({ verdict: "blanked", basis_kind: "sidecar", guard_version: 1 })).toBe(false);
    expect(warrantsQuotation({ verdict: "no_basis", basis_kind: "none", guard_version: 1 })).toBe(false);
    expect(warrantsQuotation({ verdict: "passed", basis_kind: "page_snapshot", guard_version: 1 })).toBe(false);
  });
  it("c. the trivial substring case (excerpt == claim_text) confers nothing: no record ⇒ unquoted", async () => {
    // A by-construction row: excerpt identical to claim_text. Without a warrant record the loader leaves
    // recordVerified false; with a refetch-only pass it stays false; only a mint-time/sidecar pass flips it.
    const key = await warrantKey("https://indeed.com/reviews", RECORD);
    const identity = key.split("|#|")[1];
    expect(warrantKeySet([{ source_url: "https://indeed.com/reviews", excerpt_identity: identity, verdict: "passed", basis_kind: "refetch", guard_version: 1 }]).has(key)).toBe(false);
    expect(warrantKeySet([{ source_url: "https://indeed.com/reviews", excerpt_identity: identity, verdict: "passed", basis_kind: "quote_source_text", guard_version: 1 }]).has(key)).toBe(true);
    const { container } = render(<ActGap read={base(withPairs([pair("c", undefined)]))} />);
    expect(recordEl(container).textContent).toBe(RECORD);
  });
  it("d. content parity: verified vs unverified differ ONLY by our quotation marks; stored text is never altered", () => {
    const v = render(<ActGap read={base(withPairs([pair("v", true)]))} />).container;
    const u = render(<ActGap read={base(withPairs([pair("u", false)]))} />).container;
    const strip = (t: string) => t.replace(/[“”]/g, "");
    expect(strip(v.textContent ?? "")).toBe(strip(u.textContent ?? ""));
    expect(v.querySelectorAll("[data-fr-record-verified]").length).toBe(u.querySelectorAll("[data-fr-record-verified]").length);
    const stored = `Mixed reviews: 'great colleagues' vs. 'left due to safety concerns'; 'underfunded.'`;
    const e = render(<ActGap read={base(withPairs([pair("e", false, stored)]))} />).container;
    expect(recordEl(e).textContent).toBe(stored); // the analyst's own inner punctuation is content — rendered exactly as stored, unquoted
  });
});
