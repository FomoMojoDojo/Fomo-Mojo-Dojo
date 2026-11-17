// S6 (2026-11-16): S-ING-1b — a deck read in part names slides, not pages.
import { describe, it, expect } from "vitest";
import { PARTIAL_SLIDES_STRING, partialReadLineFor, INGEST_STRINGS } from "./ingestStrings";
import { fileProposalPartialReadText } from "@/views/client/workshop/inputsShared";
import type { FileProposalRow } from "@/hooks/useFileProposals";

describe("S-ING-1b", () => {
  it("is verbatim as signed", () => {
    expect(PARTIAL_SLIDES_STRING).toBe("Only the first {n} of {m} slides were read.");
  });
  it("substitutes both numbers and nothing else", () => {
    expect(partialReadLineFor("slide", 2, 4)).toBe("Only the first 2 of 4 slides were read.");
  });
  it("a page unit, or none (a row from before S6), keeps S-ING-1", () => {
    expect(partialReadLineFor("page", 30, 77)).toBe(INGEST_STRINGS.partialRead.replace("{n}", "30").replace("{m}", "77"));
    expect(partialReadLineFor(null, 30, 77)).toBe("Only the first 30 of 77 pages were read.");
  });
  it("the surfaces' helper picks the noun from the proposal's page_unit", () => {
    const p = { pages_read: 2, pages_total: 4, page_unit: "slide" } as unknown as FileProposalRow;
    expect(fileProposalPartialReadText(p)).toBe("Only the first 2 of 4 slides were read.");
    expect(fileProposalPartialReadText({ ...p, page_unit: "page" })).toBe("Only the first 2 of 4 pages were read.");
    expect(fileProposalPartialReadText({ ...p, pages_read: 4 })).toBeNull();
  });
});
