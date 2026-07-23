// FR-EXPORT-SETASIDE — the leave-behind must render a set-aside (not_important)
// verdict EXACTLY as the screen: the tally's fourth segment and the per-finding
// annotation. Golden harness over identical inputs: the screen components and the
// export serializer are driven from the same fixture and must byte-agree. A planted
// difference is shown to be detected, and the retired three-segment tally shape is
// asserted absent.

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import CheckTally from "@/components/client-view/story/check/CheckTally";
import CheckItemRow from "@/components/client-view/story/check/CheckItemRow";
import { checkItemDate } from "@/lib/firstRead/checkItemView";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";
import type { CheckItem, CaptureTally } from "@/hooks/useFirstReadCapture";

// strip HTML tags → text content, via jsdom
function textOf(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || "").replace(/\s+/g, " ").trim();
}
function extract(html: string, cls: string): string {
  const m = html.match(new RegExp(`<p class="${cls}[^"]*">([\\s\\S]*?)</p>`));
  return m ? textOf(m[0]) : "";
}

const SET_ASIDE_ITEM: CheckItem = {
  kind: "finding", ref: "r1", text: "Their footprint covers most US states",
  identity: "id-1", verdict: "not_important", correctionText: null,
  capturedAt: "2026-07-23T10:00:00Z",
};
const TALLY: CaptureTally = { confirmed: 2, corrected: 0, rejected: 1, not_important: 1 };

function exportData(tally: CaptureTally, items: CheckItem[]): FirstReadExportData {
  return {
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter: null },
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items, tally },
    gap: [],
    proposal: null,
    exportedAt: "2026-07-23T00:00:00Z",
  };
}

describe("FR-EXPORT-SETASIDE — screen and leave-behind agree on set-aside", () => {
  it("TALLY: screen and export produce the identical four-segment line", () => {
    const screen = textOf(render(<CheckTally tally={TALLY} />).container.innerHTML);
    const exportTally = extract(buildFirstReadExportHtml(exportData(TALLY, [SET_ASIDE_ITEM])), "tally");

    // golden byte-agreement
    expect(exportTally).toBe(screen);
    expect(screen).toBe("2 confirmed · 0 refined · 1 wrong · 1 set aside");
    expect(exportTally).toContain("set aside");

    // FALSIFICATION: the retired three-segment shape is NOT what either produces,
    // and the equality above genuinely distinguishes it.
    const RETIRED = "2 confirmed · 0 refined · 1 wrong";
    expect(exportTally).not.toBe(RETIRED);
    expect(screen).not.toBe(RETIRED);

    // PLANT: a tally where the export undercounts set-asides must be DETECTED by the
    // same comparison (screen sees 1 set aside, export built from a 0 tally does not).
    const plantedExport = extract(
      buildFirstReadExportHtml(exportData({ ...TALLY, not_important: 0 }, [SET_ASIDE_ITEM])),
      "tally",
    );
    expect(plantedExport).not.toBe(screen); // the diff is caught
  });

  it("ANNOTATION: screen and export render the set-aside note identically", () => {
    const screenRow = render(<CheckItemRow item={SET_ASIDE_ITEM} onSet={() => {}} />);
    const screenNote = (screenRow.container.querySelector(".cvs-check-notimportant-note")?.textContent || "")
      .replace(/\s+/g, " ").trim();
    const exportNote = extract(buildFirstReadExportHtml(exportData(TALLY, [SET_ASIDE_ITEM])), "ann notimportant");

    const expected = `Marked true but not important · ${checkItemDate(SET_ASIDE_ITEM.capturedAt)}`;
    expect(screenNote).toBe(expected);
    expect(exportNote).toBe(expected);
    expect(exportNote).toBe(screenNote); // byte-agreement

    // FALSIFICATION: a confirmed item carries NO set-aside note in either surface,
    // so a false match here would be caught.
    const confirmedItem: CheckItem = { ...SET_ASIDE_ITEM, verdict: "confirmed" };
    const exportConfirmed = extract(buildFirstReadExportHtml(exportData(TALLY, [confirmedItem])), "ann notimportant");
    expect(exportConfirmed).toBe(""); // no set-aside note when not set aside
  });

  it("the export no longer emits the retired three-segment tally", () => {
    const html = buildFirstReadExportHtml(exportData(TALLY, [SET_ASIDE_ITEM]));
    // the exact retired literal must be gone; the fourth segment present
    expect(html).not.toContain("wrong</p>"); // old shape ended the tally at "wrong"
    expect(html).toContain("set aside</p>");
  });
});
