// S0 (2026-11-16): a failed analysis of a file that could not be read renders its signed reason —
// beside "Analysis failed", on every surface that renders FileAnalysisBadge (the Inputs tab, Admin Files)
// and on the workspace Inputs page. Every other failure code still renders no reason (SP-212).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FileAnalysisBadge } from "./inputsShared";
import { UNREADABLE_STRINGS } from "@/lib/ingest/ingestStrings";
import type { FileProposalRow } from "@/hooks/useFileProposals";

const BASE = {
  id: "p", company_id: "c", file_id: "f", file_name: "x.xlsx", source_type: "uploaded_file", summary: "Could not start analysis",
  evidence: [], signal_type: "document", framework_results: [], suggested_areas: [], candidate_positioning_updates: [],
  candidate_job_steps: [], candidate_needs: [], candidate_outcomes: [], possible_gaps: [], possible_routes: [],
  experiments_to_run: [], contradictions: [], confidence: "low", confidence_reason: "", analysis_version: 1,
  extraction_chars: null, extraction_images: null, extraction_pages: null, pages_read: null, pages_total: null,
  chars_total: null, chars_capped: null, sections_total: null, sections_ready: null, sections_failed: null,
  items_extracted: null, items_interpreted: null, questions_to_verify: [], status: "pending", processing_state: "failed",
  processing_error: null, processing_error_code: "unreadable_format", processing_started_at: null,
  processing_completed_at: "2026-11-16T18:00:00Z", applied_areas: [], created_at: "2026-11-16T18:00:00Z", reviewed_at: null,
} as unknown as FileProposalRow;
const mount = (p: Partial<FileProposalRow>) => render(<FileAnalysisBadge proposal={{ ...BASE, ...p }} testIdPrefix="t" />).container;

describe("FileAnalysisBadge renders the unreadable reason from the code", () => {
  it.each(Object.entries(UNREADABLE_STRINGS))("failed / %s → the signed reason beside \"Analysis failed\"", (code, text) => {
    const c = mount({ processing_error_code: code });
    expect(c.querySelector("[data-testid=t-analysis-badge]")!.textContent).toBe("Analysis failed");
    expect(c.querySelector("[data-testid=t-analysis-reason]")!.textContent).toBe(text);
  });
  it.each(["voice_not_classified", "no_text_extracted", "enqueue_attempts_exhausted"])("failed / %s → no reason (SP-212)", (code) => {
    expect(mount({ processing_error_code: code }).querySelector("[data-testid=t-analysis-reason]")).toBeNull();
  });
  it("a ready row with a stale code renders no reason", () => {
    expect(mount({ processing_state: "ready" }).querySelector("[data-testid=t-analysis-reason]")).toBeNull();
  });
});

describe("the workspace Inputs page renders the same reason from the same helper", () => {
  it("InputsPage calls unreadableReason on a failed proposal's code", () => {
    const src = readFileSync(join(__dirname, "..", "workspace", "InputsPage.tsx"), "utf8");
    expect(src).toContain(`proposal.processing_state === "failed" && unreadableReason(proposal.processing_error_code)`);
    expect(src).toContain('data-testid="inputs-analysis-reason"');
  });
});
