// OC-2c — Check/Proposal mechanical fixes. Each block is falsification-validated:
// a planted break is shown to fail the same assertion.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { isVerdictNoop, type CheckItem } from "@/hooks/useFirstReadCapture";
import { deriveContests, type FeedResponse, type ObservedClaim } from "../../../../../supabase/functions/_shared/contestFeed";
import CheckTally from "./CheckTally";
import FirstReadNav from "@/views/FirstReadView/FirstReadNav";

// ── GOAL 1 — verdict-change mechanics (the write-side decision) ───────────────
describe("OC-2c GOAL 1 — verdict change before issuance", () => {
  const stored = (verdict: CheckItem["verdict"], correctionText: string | null = null) => ({ verdict, correctionText });

  it("A→B is a real write (replace in place), not skipped", () => {
    // different verdict → NOT a no-op → the caller performs the in-place upsert
    expect(isVerdictNoop(stored("rejected"), "confirmed")).toBe(false);
    expect(isVerdictNoop(stored("confirmed"), "not_important")).toBe(false);
    expect(isVerdictNoop(stored(null), "confirmed")).toBe(false); // first verdict is always a write
  });

  it("same-verdict re-tap is a no-op (no row churn)", () => {
    expect(isVerdictNoop(stored("confirmed"), "confirmed")).toBe(true);
    expect(isVerdictNoop(stored("not_important"), "not_important")).toBe(true);
    // 'corrected' with identical text is a no-op; changed text is a real write
    expect(isVerdictNoop(stored("corrected", "same"), "corrected", "same")).toBe(true);
    expect(isVerdictNoop(stored("corrected", "same"), "corrected", "different")).toBe(false);

    // FALSIFICATION: if the no-op predicate ignored the verdict it would (wrongly)
    // treat a genuine change as a no-op — this asserts it does not.
    expect(isVerdictNoop(stored("rejected"), "confirmed")).not.toBe(true);
  });
});

// ── GOAL 1 — post-issuance: UI honestly shows locked (frozen) ────────────────
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
const FROZEN_ITEM: CheckItem = {
  kind: "finding", ref: "r1", text: "A finding under review",
  identity: "id-1", verdict: "rejected", correctionText: null, capturedAt: "2026-07-23T00:00:00Z",
};
let hookState: Record<string, unknown> = {};
vi.mock("@/hooks/useFirstReadCapture", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useFirstReadCapture")>();
  return { ...actual, useFirstReadCapture: () => hookState };
});
import TheCheckAct from "./TheCheckAct";

describe("OC-2c GOAL 1 — post-issuance UI shows locked, not silent", () => {
  it("frozen session → locked banner + every verdict button disabled", () => {
    hookState = {
      items: [FROZEN_ITEM],
      tally: { confirmed: 0, corrected: 0, rejected: 1, not_important: 0 },
      loading: false, frozen: true, sessionStatus: "proposal_issued",
      setVerdict: async () => null, refetchResponses: async () => {},
    };
    const { container, getByText } = render(
      <TheCheckAct companyId="c1" sessionId="s1" onSessionCreated={() => {}} />,
    );
    // honest, not silent: the locked banner is present
    expect(getByText(/This session is locked/i)).toBeTruthy();
    // and the verdict buttons cannot be tapped
    const verdictButtons = Array.from(container.querySelectorAll("button"))
      .filter((b) => /Confirm|Correct|Reject|not important/i.test(b.textContent || ""));
    expect(verdictButtons.length).toBeGreaterThanOrEqual(4);
    for (const b of verdictButtons) expect((b as HTMLButtonElement).disabled).toBe(true);

    // FALSIFICATION: an unfrozen session leaves them enabled — proving the disable
    // is driven by frozen, not hard-coded.
    hookState = { ...hookState, frozen: false };
    const { container: open } = render(
      <TheCheckAct companyId="c1" sessionId="s1" onSessionCreated={() => {}} />,
    );
    const openButtons = Array.from(open.querySelectorAll("button"))
      .filter((b) => /Confirm|Reject/i.test(b.textContent || ""));
    expect(openButtons.some((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
  });
});

// ── GOAL 1 feed implication — the feed derives from the CURRENT verdict ───────
describe("OC-2c GOAL 1 — feed births from current verdict only", () => {
  const CLAIM: ObservedClaim = { id: "claim-1", identity: "id-1" };
  it("a reject changed to confirm (one row, verdict now confirmed) births NO contest", () => {
    // The verdict lives in ONE row; a change replaces it, so at feed time the row
    // reads 'confirmed'. deriveContests must ignore it.
    const changed: FeedResponse[] = [{ id: "resp-1", verdict: "confirmed", item_identity: "id-1" }];
    const plan = deriveContests({
      responses: changed,
      publicByIdentity: new Map([[CLAIM.identity, CLAIM]]),
      existingClaimIds: [],
    });
    expect(plan.births).toHaveLength(0);
    expect(plan.considered).toBe(0);

    // FALSIFICATION: had the verdict stayed 'rejected', the SAME finding would birth.
    const stillReject: FeedResponse[] = [{ id: "resp-1", verdict: "rejected", item_identity: "id-1" }];
    const p2 = deriveContests({
      responses: stillReject,
      publicByIdentity: new Map([[CLAIM.identity, CLAIM]]),
      existingClaimIds: [],
    });
    expect(p2.births).toHaveLength(1);
  });
});

// ── GOAL 2 — tally includes the fourth segment ───────────────────────────────
describe("OC-2c GOAL 2 — tally honesty", () => {
  it("renders a fourth 'set aside' segment carrying the not_important count", () => {
    const { container } = render(
      <CheckTally tally={{ confirmed: 2, corrected: 0, rejected: 1, not_important: 1 }} />,
    );
    const text = container.textContent || "";
    expect(text).toContain("set aside");
    // the exact operator-facing shape
    expect(text.replace(/\s+/g, " ").trim()).toBe("2 confirmed · 0 refined · 1 wrong · 1 set aside");

    // FALSIFICATION: the not_important count must actually flow into the segment.
    const { container: c2 } = render(
      <CheckTally tally={{ confirmed: 0, corrected: 0, rejected: 0, not_important: 3 }} />,
    );
    expect((c2.textContent || "")).toContain("3 set aside");
  });
});

// ── GOAL 3 — dead Next hidden on the last act ────────────────────────────────
describe("OC-2c GOAL 3 — last-act Next is absent from the rendered tree", () => {
  const hasNext = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Next"));
  const hasBack = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("button")).some((b) => (b.textContent || "").includes("Back"));

  it("last act: Next absent, Back present", () => {
    const { container } = render(<FirstReadNav step={4} total={5} onBack={() => {}} onNext={() => {}} />);
    expect(hasNext(container)).toBe(false); // no dead control
    expect(hasBack(container)).toBe(true);
  });

  it("non-last act: Next present (falsification — proves the absence above is act-driven)", () => {
    const { container } = render(<FirstReadNav step={2} total={5} onBack={() => {}} onNext={() => {}} />);
    expect(hasNext(container)).toBe(true);
    expect(hasBack(container)).toBe(true);
  });
});
