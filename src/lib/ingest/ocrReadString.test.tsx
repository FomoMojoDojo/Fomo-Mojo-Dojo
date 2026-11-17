// S2 (2026-11-16): S-ING-7 — a document whose scanned pages were read by text recognition says so.
//   - verbatim as signed; rendered only when file_proposals.ocr_pages > 0
//   - INFO styling on the shared badge (neutral grey), never the warning colour the unread lines carry
//   - the workspace Inputs page renders it from the same helper
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OCR_READ_STRING, ocrReadLine } from "./ingestStrings";
import { FileAnalysisBadge } from "@/views/client/workshop/inputsShared";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const BASE = {
  id: "p", company_id: "c", file_id: "f", file_name: "letter.pdf", processing_state: "ready", status: "pending",
  pages_read: 1, pages_total: 1, sections_total: null, sections_failed: null, chars_capped: false,
  items_extracted: null, items_interpreted: null, processing_error_code: null,
} as unknown as FileProposalRow;

describe("S-ING-7", () => {
  it("is verbatim as signed", () => {
    expect(OCR_READ_STRING).toBe("Some pages were scanned images. Their text was read by text recognition and may contain mistakes.");
  });
  it.each([[1, true], [37, true], [0, false], [null, false], [undefined, false], [Number.NaN, false]])("ocr_pages %s → %s", (n, shown) => {
    expect(ocrReadLine(n as number | null | undefined)).toBe(shown ? OCR_READ_STRING : null);
  });
  it("the shared badge renders it in neutral info grey, beside the ready badge", () => {
    const c = render(<FileAnalysisBadge proposal={{ ...BASE, ocr_pages: 1 }} testIdPrefix="t" />).container;
    const line = c.querySelector("[data-testid=t-analysis-ocr]") as HTMLElement;
    expect(line.textContent).toBe(OCR_READ_STRING);
    expect(line.style.color).toBe("rgb(107, 114, 128)");
    expect(c.querySelector("[data-testid=t-analysis-badge]")!.textContent).toBe("Analysis ready");
  });
  it("a read with no recognition renders nothing", () => {
    const c = render(<FileAnalysisBadge proposal={{ ...BASE, ocr_pages: 0 }} testIdPrefix="t" />).container;
    expect(c.querySelector("[data-testid=t-analysis-ocr]")).toBeNull();
  });
  it("the workspace Inputs page renders it from the same helper", () => {
    const src = readFileSync(join(__dirname, "..", "..", "views", "client", "workspace", "InputsPage.tsx"), "utf8");
    expect(src).toContain("ocrReadLine(proposal.ocr_pages)");
    expect(src).toContain('data-testid="inputs-analysis-ocr"');
  });
});
