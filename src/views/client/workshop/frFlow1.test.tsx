// FR-FLOW-1b — intake removed entirely; "Open First Read" is the single control and
// mints-if-missing on click. The rail still opens cold (honest-empty for no session).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

// ── supabase mock: the mint-if-missing path ──────────────────────────────────
let existingSession: { id: string } | null = null;
let insertCount = 0;
let lastInsert: Record<string, unknown> | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      // deno-lint-ignore no-explicit-any
      const b: any = {
        select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
        maybeSingle: async () => ({ data: existingSession, error: null }),
        insert: (payload: Record<string, unknown>) => {
          insertCount++; lastInsert = payload;
          return Promise.resolve({ data: null, error: null });
        },
      };
      return b;
    },
  },
}));
// TheCheckAct calls the real hook — stub it so the no-session branch renders cleanly.
vi.mock("@/hooks/useFirstReadCapture", () => ({
  useFirstReadCapture: () => ({
    items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 },
    loading: false, frozen: false, sessionStatus: null, setVerdict: async () => null, refetchResponses: async () => {},
  }),
}));

import TheCheckAct from "@/components/client-view/story/check/TheCheckAct";
import OpenFirstReadControl from "./OpenFirstReadControl";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

beforeEach(() => { existingSession = null; insertCount = 0; lastInsert = null; });

describe("FR-FLOW-1b — rail opens cold (no intake form)", () => {
  it("no session → honest-empty pointer to the workshop; no intake fields", () => {
    const { container, getByText } = render(<TheCheckAct companyId="c1" sessionId="" />);
    expect(getByText(/hasn't been prepared yet/i)).toBeTruthy();
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0);
    const text = container.textContent || "";
    expect(text).not.toContain("Before the meeting");
    expect(text).not.toContain("Prepare First Read"); // the retired control is gone
  });
});

describe("FR-FLOW-1b — Open First Read mints-if-missing (deliberate click)", () => {
  it("no session → mints exactly ONE open session, then navigates", async () => {
    const navigate = vi.fn();
    const { getByText } = render(<OpenFirstReadControl companyId="c1" dark={false} navigate={navigate} />);
    fireEvent.click(getByText("Open First Read →"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/first-read/c1"));
    expect(insertCount).toBe(1); // exactly one
    expect(lastInsert).toMatchObject({ company_id: "c1", status: "open" });
  });

  it("existing open session → NO new mint, just navigates (re-click reuses)", async () => {
    existingSession = { id: "s-existing" };
    const navigate = vi.fn();
    const { getByText } = render(<OpenFirstReadControl companyId="c1" dark={false} navigate={navigate} />);
    fireEvent.click(getByText("Open First Read →"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/first-read/c1"));
    // FALSIFICATION (double-mint detector): a control that minted despite an existing
    // session would push insertCount above 0 — this catches it.
    expect(insertCount).toBe(0);
  });

  it("keeps the plain href target (router-less OC-2b contract)", () => {
    const { getByText } = render(<OpenFirstReadControl companyId="c1" dark={false} />);
    expect((getByText("Open First Read →") as HTMLAnchorElement).getAttribute("href")).toBe("/first-read/c1");
  });
});

describe("FR-FLOW-1b — export cover degrades honestly without presenter", () => {
  const data = (presenter: string | null): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter },
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });
  it("absent presenter → no fabricated value; date still renders", () => {
    const bare = buildFirstReadExportHtml(data(null));
    expect(bare).not.toContain(" · undefined");
    expect(bare).not.toContain(" · null");
    expect(bare).toContain("2026-07-23");
    expect(buildFirstReadExportHtml(data("Jane"))).toContain("Jane"); // present → shown (unchanged path)
  });
});
