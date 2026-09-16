// Gate 3 (signed 2026-09-16) — the interview origin frame. Both chips exact; no value band and no
// person name on a market row; every other provenance untouched (the component renders nothing).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import { InterviewOriginChip, formatInterviewDate, interviewOrigin, marketChipLabel, needShowsBand } from "./InterviewOrigin";

const base = { id: "n", company_id: "co", tier: "need", desired_outcome: "Minimize x", journey_key: "customer", step_number: 1, step_label: "s", importance: 0, satisfaction: 0, opportunity_score: 0, service_state: "served", source_path: "interview", frameworks_used: [], created_at: "2026-09-16T00:00:00Z" } as OdiNeedRow;
const rec = { id: "r", speaker_role: "client_stakeholder", person_name: "Jordan Rivera", interviewed_at: "2026-09-16T17:00:00Z", verbatim: "We lose families in the first week.", retracted_at: null };

describe("chips (the two signed strings)", () => {
  it("client_attested → You told us · {person_name} · {Mon D}", () => {
    const o = interviewOrigin({ ...base, provenance_type: "client_attested", interview_records: rec }, "Checkpoint Map: Families")!;
    expect(o.chip).toBe("You told us · Jordan Rivera · Sep 16");
    expect(o.attribution).toBe("Jordan Rivera");
    expect(o.verbatim).toBe(rec.verbatim);
  });
  it("market_interviewed → {Market label} told us · {Mon D}; the person's name is nowhere", () => {
    const o = interviewOrigin({ ...base, provenance_type: "market_interviewed", interview_records: { ...rec, speaker_role: "market_participant", person_name: "Sam Donor" } }, "Funders looking to support youth")!;
    expect(o.chip).toBe("Funders looking to support youth told us · Sep 16");
    expect(o.attribution).toBe("Funders looking to support youth");
    expect(JSON.stringify(o)).not.toContain("Sam Donor");
  });
  it("the date is short month + day in UTC (an interview date never shifts by timezone)", () => {
    expect(formatInterviewDate("2026-09-16T00:00:00Z")).toBe("Sep 16");
    expect(formatInterviewDate("2026-12-01T23:59:59Z")).toBe("Dec 1");
    expect(formatInterviewDate("garbage")).toBe("");
  });
});

describe("value band", () => {
  it("an interview-sourced row (stakeholder OR market) never shows a band; every other provenance does", () => {
    expect(needShowsBand({ provenance_type: "market_interviewed" })).toBe(false);
    expect(needShowsBand({ provenance_type: "client_attested" })).toBe(false);
    for (const p of ["internal_declared", "public_research", "manual", "framework_adjudicated", null, undefined]) expect(needShowsBand({ provenance_type: p })).toBe(true);
  });
});

describe("rendering", () => {
  it("stakeholder: chip + quotation attributed to the person; data-fr-origin set", () => {
    const { container } = render(<InterviewOriginChip need={{ ...base, provenance_type: "client_attested", interview_records: rec }} marketLabel="Families" />);
    const d = container.querySelector("[data-testid=need-origin]")!;
    expect(d.getAttribute("data-fr-origin")).toBe("client_attested");
    expect(container.querySelector("[data-testid=need-origin-chip]")!.textContent).toBe("You told us · Jordan Rivera · Sep 16");
    expect(container.querySelector("[data-testid=need-origin-quote] p")!.textContent).toBe(rec.verbatim);
    expect(container.querySelector("[data-testid=need-origin-quote] cite")!.textContent).toBe("Jordan Rivera");
  });
  it("market: chip + quotation attributed to the market label; no person name in the DOM", () => {
    const { container } = render(<InterviewOriginChip need={{ ...base, provenance_type: "market_interviewed", interview_records: { ...rec, speaker_role: "market_participant", person_name: "Sam Donor" } }} marketLabel="Funders" />);
    expect(container.querySelector("[data-testid=need-origin]")!.getAttribute("data-fr-origin")).toBe("market_interviewed");
    expect(container.querySelector("[data-testid=need-origin-chip]")!.textContent).toBe("Funders told us · Sep 16");
    expect(container.querySelector("[data-testid=need-origin-quote] cite")!.textContent).toBe("Funders");
    expect(container.innerHTML).not.toContain("Sam Donor");
  });
  it("every other provenance renders NOTHING (byte-identical surfaces)", () => {
    for (const p of ["internal_declared", "public_research", "manual", "framework_adjudicated", null, undefined]) {
      const { container } = render(<InterviewOriginChip need={{ ...base, provenance_type: p }} marketLabel="Families" />);
      expect(container.innerHTML).toBe("");
    }
  });
});

describe("market chip label (gate 3 delta, ruling 3)", () => {
  it("resolves market_lens.title for the row's key, else the key — never a step title", () => {
    const lens = new Map([["mkt-funders", "Funders looking to support youth"], ["customer", "Lens title for customer"]]);
    expect(marketChipLabel("mkt-funders", lens)).toBe("Funders looking to support youth");
    expect(marketChipLabel("pmk-no-lens", lens)).toBe("pmk-no-lens");
    expect(marketChipLabel("mkt-funders", null)).toBe("mkt-funders");
    expect(marketChipLabel("", lens)).toBe("");
  });
});

