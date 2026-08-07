// SELF-CONSISTENCY — the curated single-instance exhibit: render, register labels,
// source-host attribution, falsification-validated absence, and export-follows-screen.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock the read so the component test is deterministic (no DB). The falsification pair:
// render=null → the section does NOT exist; render=payload → it appears.
const cap = vi.hoisted(() => ({ ret: { render: null as unknown, loading: false } }));
vi.mock("@/hooks/useCuratedTensions", () => ({ useCuratedTensions: () => cap.ret }));

import CuratedTensionSection from "./CuratedTensionSection";
import {
  CURATED_TENSION_HEADING, CURATED_TENSION_FRAMING, CURATED_TENSION_PROMISE_LABEL,
  CURATED_TENSION_DIFFICULTY_LABEL, CURATED_TENSION_CURATION_LINE, type CuratedTensionRender,
} from "@/lib/firstRead/curatedTension";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

const PROMISE = "Edgewood provides a cohesive pathway of care that includes crisis stabilization, residential treatment, intensive community-based support, and school-linked services without gaps or discontinuities.";
const DIFFICULTY = "There are substantial operational challenges inherent to delivering 24/7 crisis and intensive behavioral health services to youth populations.";

const payload = (over: Partial<CuratedTensionRender> = {}): CuratedTensionRender => ({
  promiseText: PROMISE,
  difficultyText: DIFFICULTY,
  difficultySourceUrl: "https://edgewood.org/",
  difficultyEventDate: null, // Edgewood's difficulty signal is undated → host-only line
  difficultyCapturedAt: "2026-06-06T00:00:00+00",
  ...over,
});

describe("CuratedTensionSection — render, registers, attribution", () => {
  it("renders both register-labeled sides, framing, curation line, and the signed strings byte-exact", () => {
    cap.ret = { render: payload(), loading: false };
    const { container } = render(<CuratedTensionSection companyId="co" />);
    const txt = container.textContent ?? "";
    expect(txt).toContain(CURATED_TENSION_HEADING);
    expect(txt).toContain(CURATED_TENSION_FRAMING);
    expect(txt).toContain(CURATED_TENSION_CURATION_LINE);
    const labels = Array.from(container.querySelectorAll(".cvs-curated-tension-label")).map((e) => e.textContent);
    expect(labels).toEqual([CURATED_TENSION_PROMISE_LABEL, CURATED_TENSION_DIFFICULTY_LABEL]); // declared vs public, labeled & ordered
    expect(txt).toContain(PROMISE);
    expect(txt).toContain(DIFFICULTY);
  });

  it("difficulty side carries HOST-ONLY attribution (undated signal), plain text, no link, no verdict buttons", () => {
    cap.ret = { render: payload(), loading: false };
    const { container } = render(<CuratedTensionSection companyId="co" />);
    expect(container.querySelector(".cvs-curated-tension-attribution")!.textContent).toBe("edgewood.org");
    expect(container.querySelector("a")).toBeNull(); // anchor-free
    expect(container.querySelector("button")).toBeNull(); // a curation, not a verdict
  });

  it("host + date attribution composes through the single-home formatter", () => {
    cap.ret = { render: payload({ difficultyEventDate: "2025-07-18" }), loading: false };
    const { container } = render(<CuratedTensionSection companyId="co" />);
    expect(container.querySelector(".cvs-curated-tension-attribution")!.textContent)
      .toBe("edgewood.org · Reported Jul 2025 · read by us Jun 2026");
  });

  it("FALSIFICATION: no live curated row → the section does NOT render at all", () => {
    cap.ret = { render: null, loading: false };
    const { container } = render(<CuratedTensionSection companyId="co" />);
    expect(container.querySelector(".cvs-curated-tension")).toBeNull();
    expect(container.textContent).not.toContain(CURATED_TENSION_HEADING);
  });
});

describe("export follows the screen (same constants + formatter)", () => {
  const data = (curatedTension: CuratedTensionRender | null): FirstReadExportData => ({
    company: { name: "Edgewood" }, session: { id: "s", date: "2026-08-07", presenter: null },
    statedProblem: null, standard: null, mirror: { score: null, bet: null, findings: [] }, perception: [],
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    curatedTension, gap: [], proposal: null, exportedAt: "2026-08-07T00:00:00Z",
  });

  it("renders the curated exhibit with signed strings + host-only attribution; anchor-free", () => {
    const html = buildFirstReadExportHtml(data(payload()));
    expect(html).toContain(CURATED_TENSION_HEADING);
    expect(html).toContain(CURATED_TENSION_FRAMING);
    expect(html).toContain(CURATED_TENSION_CURATION_LINE);
    expect(html).toContain(CURATED_TENSION_PROMISE_LABEL);
    expect(html).toContain(CURATED_TENSION_DIFFICULTY_LABEL);
    expect(html).toContain(`<p class="ct-attribution">edgewood.org</p>`);
    expect(html).toContain('class="ct-exhibit"');
  });

  it("absent curation → no ct-exhibit element in the leave-behind", () => {
    const html = buildFirstReadExportHtml(data(null));
    // the class appears once in the <style> block; assert the ELEMENT is absent, not the substring
    expect(html).not.toContain('<section class="ct-exhibit">');
    expect(html).not.toContain(CURATED_TENSION_HEADING);
    expect(html).not.toContain(CURATED_TENSION_CURATION_LINE);
  });
});
