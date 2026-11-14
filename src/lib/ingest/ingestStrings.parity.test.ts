// S-ING-1 parity (2026-11-13). Same contract as the landing and /login strings: verbatim here,
// rendered from here, and no surface carrying its own copy of the wording.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INGEST_STRINGS, isBudgetSelected, isPartialRead, partialReadLine,
  sectionsFailedLine, sectionsProgressLine, showsSectionCounts,
} from "./ingestStrings";

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

// ── S-ING-2 / S-ING-3 / S-ING-4 / S-ING-5 (SP-244, SP-261) ──────────────────────────────────────

describe("the chunked-read strings are verbatim as signed", () => {
  it("S-ING-2", () => expect(INGEST_STRINGS.sectionsProgress).toBe(
    "{n} of {m} sections analyzed"));
  it("S-ING-3", () => expect(INGEST_STRINGS.sectionsFailed).toBe(
    "Analysis ready. {k} of {m} sections could not be read."));
  it("S-ING-4", () => expect(INGEST_STRINGS.charsCapped).toBe(
    "Only the first part of this document was read."));
  it("S-ING-5", () => expect(INGEST_STRINGS.budgetSelected).toBe(
    "Long document. The analysis draws on the key passages from every section."));

  it("S-ING-4 and S-ING-5 carry no placeholders — they take no numbers", () => {
    expect(INGEST_STRINGS.charsCapped).not.toContain("{");
    expect(INGEST_STRINGS.budgetSelected).not.toContain("{");
  });

  it("the American spelling is used throughout, as signed (SP-215)", () => {
    for (const s of Object.values(INGEST_STRINGS)) expect(s).not.toMatch(/analys(ed|ing|es)\b/);
  });
});

describe("the chunked templates substitute and do nothing else", () => {
  it("S-ING-2 renders both numbers", () => {
    expect(sectionsProgressLine(4, 17)).toBe("4 of 17 sections analyzed");
    expect(sectionsProgressLine(0, 2)).not.toContain("{");
  });
  it("S-ING-3 renders k and m, in that order", () => {
    expect(sectionsFailedLine(2, 17)).toBe("Analysis ready. 2 of 17 sections could not be read.");
  });
});

describe("a one-window document shows no section counts at all (SP-244)", () => {
  it("m must exceed 1", () => {
    expect(showsSectionCounts(1)).toBe(false);
    expect(showsSectionCounts(2)).toBe(true);
    expect(showsSectionCounts(17)).toBe(true);
  });
  it("a row that never ran the chunked pipeline says nothing", () => {
    expect(showsSectionCounts(null)).toBe(false);
    expect(showsSectionCounts(undefined)).toBe(false);
    expect(showsSectionCounts(0)).toBe(false);
  });
});

describe("when the ready badge carries the info icon (SP-260)", () => {
  it("interpreted below extracted earns the icon", () => expect(isBudgetSelected(336, 76)).toBe(true));

  it("a document whose extract fitted the budget WHOLE earns nothing", () => {
    // The icon discloses a difference. Where there is none, an icon would be decoration.
    expect(isBudgetSelected(40, 40)).toBe(false);
  });

  it("a row predating the counts says nothing, so no icon", () => {
    expect(isBudgetSelected(null, null)).toBe(false);
    expect(isBudgetSelected(undefined, undefined)).toBe(false);
  });

  it("half a pair is not a fact", () => {
    expect(isBudgetSelected(336, null)).toBe(false);
    expect(isBudgetSelected(null, 76)).toBe(false);
  });

  it("a nonsense pair is refused rather than rendered", () => {
    expect(isBudgetSelected(0, 0)).toBe(false);
    expect(isBudgetSelected(10, 20)).toBe(false);          // interpreted beyond extracted
    expect(isBudgetSelected(Number.NaN, 1)).toBe(false);
  });
});

describe("the surfaces render the chunked strings from this file too", () => {
  const badgeSurfaces = [
    "views/client/workspace/InputsPage.tsx",
    "views/client/workshop/tabs/InputsTab.tsx",
  ];

  it("every surface showing the ready badge renders the info icon from the shared component (SP-262)", () => {
    for (const surface of badgeSurfaces) {
      expect(read(surface), surface).toContain("<FileProposalReadyInfoIcon proposal={proposal} />");
    }
  });

  it("every surface showing the ready badge renders the section strings from the shared helper", () => {
    for (const surface of badgeSurfaces) {
      expect(read(surface), surface).toContain("fileProposalSectionsText");
    }
  });

  it("the completion toast carries S-ING-5 as its description, in order of seriousness", () => {
    const toast = read("views/client/ClientRefinePreviewView.tsx");
    expect(toast).toContain("fileProposalBudgetInfoText");
    // Scoped to the EXPRESSION, not the file: the import list is alphabetical, so comparing
    // whole-file positions compares the imports and passes or fails for no reason.
    const expr = toast.slice(toast.indexOf("const note ="), toast.indexOf("toast.success(\"Analysis complete"));
    expect(expr).toContain("fileProposalPartialReadText");
    // What could not be read comes FIRST in the one description slot.
    expect(expr.indexOf("fileProposalPartialReadText")).toBeLessThan(expr.indexOf("fileProposalBudgetInfoText"));
    expect(expr.indexOf("fileProposalSectionsText")).toBeLessThan(expr.indexOf("fileProposalBudgetInfoText"));
  });

  it("no surface carries its own copy of any of the wordings", () => {
    const all = [...badgeSurfaces, "views/client/ClientRefinePreviewView.tsx", "views/client/workshop/inputsShared.tsx"];
    for (const surface of all) {
      const body = read(surface);
      expect(body, surface).not.toContain("sections analyzed");
      expect(body, surface).not.toContain("could not be read.");
      expect(body, surface).not.toContain("first part of this document");
      expect(body, surface).not.toContain("key passages from every section");
    }
  });

  it("the icon's tooltip and its accessible label are BOTH S-ING-5 (SP-261)", () => {
    const shared = read("views/client/workshop/inputsShared.tsx");
    expect(shared).toContain("export function FileProposalReadyInfoIcon");
    expect(shared).toContain("aria-label={text}");
    expect(shared).toContain("<title>{text}</title>");
  });

  it("the icon is the app's existing icon, not a new asset (SP-262)", () => {
    expect(read("views/client/workshop/inputsShared.tsx")).toContain('import { Info } from "lucide-react"');
  });

  it("the info icon does NOT use the warning palette (SP-262)", () => {
    const shared = read("views/client/workshop/inputsShared.tsx");
    const icon = shared.slice(shared.indexOf("const READY_INFO_ICON"), shared.indexOf("const READY_INFO_ICON") + 300);
    expect(icon).not.toContain("#8a6d3b");  // the partial-read warning colour
    expect(icon).toContain("#6b7280");      // neutral grey
  });
});
