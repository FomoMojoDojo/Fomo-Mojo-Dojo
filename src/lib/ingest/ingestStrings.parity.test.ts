// S-ING-1 parity (2026-11-13). Same contract as the landing and /login strings: verbatim here,
// rendered from here, and no surface carrying its own copy of the wording.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INGEST_STRINGS, isPartialRead, partialReadLine } from "./ingestStrings";

const SRC = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("the partial-read string is verbatim as signed", () => {
  it("S-ING-1", () => expect(INGEST_STRINGS.partialRead).toBe(
    "Only the first {n} of {m} pages were read."));
});

describe("the template substitutes and does nothing else", () => {
  it("renders both numbers, leaving no placeholder behind", () => {
    expect(partialReadLine(30, 77)).toBe("Only the first 30 of 77 pages were read.");
    expect(partialReadLine(30, 77)).not.toContain("{");
  });

  it("does not round, abbreviate or re-order the two numbers", () => {
    expect(partialReadLine(1, 2)).toBe("Only the first 1 of 2 pages were read.");
    expect(partialReadLine(30, 1000)).toBe("Only the first 30 of 1000 pages were read.");
  });
});

describe("what counts as a partial read", () => {
  it("a capped read is partial", () => expect(isPartialRead(30, 77)).toBe(true));

  it("a whole read is NOT partial — equal counts mean the document was read", () => {
    expect(isPartialRead(12, 12)).toBe(false);
    expect(isPartialRead(1, 1)).toBe(false);
  });

  it("a row written before the columns existed says nothing, so it is not called partial", () => {
    // SP-93: no backfill. Their truth was never recorded and claiming either way would be a guess.
    expect(isPartialRead(null, null)).toBe(false);
    expect(isPartialRead(undefined, undefined)).toBe(false);
  });

  it("half a pair is not a fact: one number without the other renders nothing", () => {
    expect(isPartialRead(30, null)).toBe(false);
    expect(isPartialRead(null, 77)).toBe(false);
  });

  it("a nonsense pair is refused rather than rendered as a fraction", () => {
    expect(isPartialRead(80, 77)).toBe(false);   // read beyond the document
    expect(isPartialRead(5, 0)).toBe(false);     // a document with no pages
    expect(isPartialRead(Number.NaN, 77)).toBe(false);
    expect(isPartialRead(Number.POSITIVE_INFINITY, 77)).toBe(false);
  });
});

describe("the surfaces render it from this file", () => {
  const surfaces = [
    "views/client/workspace/InputsPage.tsx",
    "views/client/workshop/tabs/InputsTab.tsx",
    "views/client/ClientRefinePreviewView.tsx",
  ];

  it("each surface that shows a file's analysis state calls the shared helper", () => {
    for (const surface of surfaces) {
      expect(read(surface), surface).toContain("fileProposalPartialReadText");
    }
  });

  it("no surface carries its own copy of the wording", () => {
    for (const surface of [...surfaces, "views/client/workshop/inputsShared.tsx"]) {
      expect(read(surface), surface).not.toContain("pages were read");
    }
  });

  it("the helper lives in exactly one place and is built from this file", () => {
    const shared = read("views/client/workshop/inputsShared.tsx");
    expect(shared).toContain('from "@/lib/ingest/ingestStrings"');
    expect(shared).toContain("export function fileProposalPartialReadText");
  });
});

describe("a non-vacuity check", () => {
  it("the assertions above would fail if the string changed", () => {
    expect(INGEST_STRINGS.partialRead).toContain("{n}");
    expect(INGEST_STRINGS.partialRead).toContain("{m}");
    expect(partialReadLine(2, 3)).not.toBe(INGEST_STRINGS.partialRead);
  });
});
