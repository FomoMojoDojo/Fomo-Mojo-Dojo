// S4 (2026-11-16): the three signed spreadsheet strings, verbatim, and when each renders.
import { describe, it, expect } from "vitest";
import { PARTIAL_SHEETS_STRING, ROWS_CAPPED_STRING, WITHHELD_COLUMNS_STRING, partialReadLineFor, rowsCappedLines, withheldColumnsLine } from "./ingestStrings";

describe("verbatim as signed", () => {
  it("S-ING-1c", () => expect(PARTIAL_SHEETS_STRING).toBe("Only the first {n} of {m} sheets were read."));
  it("S-ING-6", () => expect(ROWS_CAPPED_STRING).toBe('Only the first {n} of {m} rows of sheet "{sheet}" were read.'));
  it("S-ING-8", () => expect(WITHHELD_COLUMNS_STRING).toBe("Columns holding personal details were withheld from the analysis."));
});
describe("rendering", () => {
  it("a workbook's partial read names sheets", () => expect(partialReadLineFor("sheet", 50, 51)).toBe("Only the first 50 of 51 sheets were read."));
  it("one line per capped sheet, with its name", () =>
    expect(rowsCappedLines([{ sheet: "Donors", read: 5000, total: 6200 }, { sheet: "Ok", read: 10, total: 10 }])).toEqual(['Only the first 5000 of 6200 rows of sheet "Donors" were read.']));
  it("nothing capped, nothing said", () => { expect(rowsCappedLines(null)).toEqual([]); expect(rowsCappedLines([])).toEqual([]); });
  it.each([[5, true], [1, true], [0, false], [null, false], [undefined, false]])("columns_withheld %s → %s", (n, shown) =>
    expect(withheldColumnsLine(n as number | null | undefined)).toBe(shown ? WITHHELD_COLUMNS_STRING : null));
});
