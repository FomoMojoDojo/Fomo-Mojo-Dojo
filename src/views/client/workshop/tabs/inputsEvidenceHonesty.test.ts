// Operator-surface honesty (2026-09-17) — three rails on the workshop / Inputs tab:
//  (1) header: on a persisted evidence_presence "none" the ScoreContextBar slot renders nothing (band alone);
//  (2) lineage line: a SRCH-1 search outage renders the signed string, never "failed";
//  (3) spine control: keys on the evidence_presence record (present → enabled, none → disabled, null → as before).
// Each rail is pure and imported from the module the surface uses; the bypass case is the pre-fix rule.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestRunIsSearchUnavailable, spineEvidenceGate } from "./InputsTab";
import { FR_HALT, SEARCH_UNAVAILABLE_LEDGER_MATCH, fullRefreshFailedState } from "@/hooks/useFullRefresh";
import { WORKSPACE_STRINGS, searchUnavailableLine } from "@/views/client/workspace/workspaceNav";

const SIGNED = "Search couldn't be reached — nothing was checked · {date}";
const OUTAGE = "Search backend unavailable — no engine returned results for any of 6 queries (brave: too many requests; duckduckgo: CAPTCHA). No public evidence could be checked; this is not a finding about the company.";

describe("(1) workshop header on none: band alone", () => {
  const s = readFileSync("src/views/client/ClientRefinePreviewWorkshopView.tsx", "utf8");
  it("the slot renders null on none; the band keeps its own element", () => {
    expect(s).toMatch(/evidencePresence === "none" \? null : readiness \? \(\s*<ScoreContextBar/);
    expect(s).toContain('data-testid="workshop-field-condition"');
    expect(s).not.toContain("workshop-no-evidence-note");
    expect(s).not.toContain("Not enough public signal to score yet.");
  });
});

describe("(2) lineage line: a search outage is the signed string, not a failure", () => {
  it("the string is byte-identical to the signed one", () => {
    expect(WORKSPACE_STRINGS.searchUnavailableState).toBe(SIGNED);
    expect(searchUnavailableLine("2026-09-17T16:33:15.195Z")).toBe("Search couldn't be reached — nothing was checked · Sep 17, 2026");
    expect(searchUnavailableLine(null)).toBe("Search couldn't be reached — nothing was checked");
  });
  it("ledger: a failed baseline row carrying the SRCH-1 refusal → stage search_unavailable with the signed line; a genuine failure keeps FR_HALT", () => {
    const outage = fullRefreshFailedState({ error_text: OUTAGE, finished_at: "2026-09-17T16:33:15.195Z" });
    expect(outage).toEqual({ stage: "search_unavailable", message: "Search couldn't be reached — nothing was checked · Sep 17, 2026", running: false });
    expect(outage.stage.endsWith("failed")).toBe(false); // renders in the calm register, not the failure colour
    expect(fullRefreshFailedState({ error_text: "TypeError: fetch failed", finished_at: null })).toEqual({ stage: "baseline_failed", message: FR_HALT, running: false });
    expect(fullRefreshFailedState({ error_text: null })).toMatchObject({ stage: "baseline_failed", message: FR_HALT });
    expect(SEARCH_UNAVAILABLE_LEDGER_MATCH.test(OUTAGE)).toBe(true);
  });
  it("latest run: result_json.status = search_unavailable flips the persistent line; thin / ok / absent do not", () => {
    expect(latestRunIsSearchUnavailable({ result_json: { status: "search_unavailable" } })).toBe(true);
    expect(latestRunIsSearchUnavailable({ result_json: { status: "insufficient_public_evidence", data_quality_flag: { type: "thin" } } })).toBe(false);
    expect(latestRunIsSearchUnavailable({ result_json: { status: "ok" } })).toBe(false);
    expect(latestRunIsSearchUnavailable(null)).toBe(false);
  });
  it("BYPASS: the pre-fix rule (status failed ⇒ FR_HALT) would call the outage a failure", () => {
    const preFix = (b: { status: string }) => (b.status === "failed" ? FR_HALT : null);
    expect(preFix({ status: "failed" })).toBe(FR_HALT); // the defect the rail closes
  });
});

describe("(3) spine control keys on evidence, not on a run row", () => {
  it("none → disabled even with a run row; present → enabled; null → the pre-record rule", () => {
    expect(spineEvidenceGate("none", true)).toBe(false);
    expect(spineEvidenceGate("present", false)).toBe(true);
    expect(spineEvidenceGate("present", true)).toBe(true);
    expect(spineEvidenceGate(null, true)).toBe(true);
    expect(spineEvidenceGate(null, false)).toBe(false);
  });
  it("wired: canBirthSpine uses the gate; the blocked reason is the existing line", () => {
    const s = readFileSync("src/views/client/workshop/tabs/InputsTab.tsx", "utf8");
    expect(s).toContain("const spineEvidence = spineEvidenceGate(evidencePresence, hasBaselineRun);");
    expect(s).toMatch(/const canBirthSpine = spineKnown && companyHasSpine === false && spineEvidence && hasWebsiteForBaseline/);
    expect(s).toContain('"Run outside signals first — the spine is built from that evidence."');
  });
  it("BYPASS: the pre-fix predicate (run row exists) enables the control on a none record", () => {
    const preFix = (hasBaselineRun: boolean) => hasBaselineRun;
    expect(preFix(true)).toBe(true); // Mithun: search_unavailable run row, evidence none — enabled = the defect
  });
});
