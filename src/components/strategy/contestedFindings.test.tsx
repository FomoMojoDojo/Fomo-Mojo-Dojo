// OC-3 — the Contested section renders OPEN contests in the judgment queue (with
// kind-appropriate controls) and RESOLVED ones only in the historical trail.

import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import type { ContestRow } from "@/hooks/useClaimContests";

const openDisputed: ContestRow = {
  id: "open-1", claim_id: "c1", session_id: "s1", claim_statement: "OPEN DISPUTED CLAIM TEXT",
  claim_status: "active", contest_kind: "disputed", rationale: "they say it's wrong",
  resolution: null, resolution_reason: null, resolved_at: null,
  session_date: "2026-07-20", created_at: "2026-07-20",
};
const resolvedDismissed: ContestRow = {
  id: "res-1", claim_id: "c2", session_id: "s1", claim_statement: "RESOLVED DISMISSED CLAIM TEXT",
  claim_status: "active", contest_kind: "disputed", rationale: null,
  resolution: "dismissed", resolution_reason: "operator disagrees", resolved_at: "2026-07-21",
  session_date: "2026-07-20", created_at: "2026-07-20",
};

vi.mock("@/hooks/useClaimContests", async (orig) => {
  const actual = await orig<typeof import("@/hooks/useClaimContests")>();
  return {
    ...actual,
    useClaimContests: () => ({
      open: [openDisputed],
      resolved: [resolvedDismissed],
      isLoading: false,
      resolve: vi.fn(),
    }),
  };
});

import { ContestedFindings } from "./ContestedFindings";

describe("OC-3 — ContestedFindings render (open-only queue)", () => {
  it("open contest shows in the queue with kind-appropriate controls; resolved does NOT", () => {
    const { container, getByText, queryByText } = render(<ContestedFindings companyId="co" />);

    // Section title carries the OPEN count (1), not open+resolved.
    expect(getByText(/Contested — awaiting your judgment \(1\)/)).toBeTruthy();

    // The open disputed claim is in the queue, with Strike + Dismiss (never Set-aside).
    expect(getByText("OPEN DISPUTED CLAIM TEXT")).toBeTruthy();
    expect(getByText("Strike the finding")).toBeTruthy();
    expect(getByText("Dismiss the contest")).toBeTruthy();
    expect(queryByText("Set the finding aside")).toBeNull();

    // FALSIFICATION (plant a resolved contest, prove absence from the OPEN queue):
    // the resolved claim renders only in the Resolved trail — it has NO resolve controls.
    const resolvedText = getByText("RESOLVED DISMISSED CLAIM TEXT");
    expect(resolvedText).toBeTruthy();
    // It appears under the "Resolved" trail, tagged "Dismissed", with no action buttons of its own.
    expect(getByText("Resolved")).toBeTruthy();
    // There is exactly ONE "Strike the finding" button (the open one), proving the resolved
    // contest didn't render a second control set.
    expect(within(container).getAllByText("Strike the finding").length).toBe(1);
  });
});
