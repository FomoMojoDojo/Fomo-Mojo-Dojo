// FR-FLOW-1 — intake moved to the workshop; the rail opens cold (no intake form).

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

// ── supabase mock: capture the session insert PrepareFirstReadControl performs ──
let insertPayload: Record<string, unknown> | null = null;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        insertPayload = payload;
        return { select: () => ({ single: async () => ({ data: { id: "new-session" }, error: null }) }) };
      },
    }),
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
import PrepareFirstReadControl from "./PrepareFirstReadControl";
import { buildFirstReadExportHtml, type FirstReadExportData } from "@/lib/firstRead/exportHtml";

describe("FR-FLOW-1 GOAL 2 — the rail's Check renders NO intake form cold", () => {
  it("no session → honest-empty pointer to the workshop; the intake form is absent", () => {
    const { container, getByText } = render(<TheCheckAct companyId="c1" sessionId="" />);
    // honest-empty present
    expect(getByText(/hasn't been prepared yet/i)).toBeTruthy();
    // the intake form is GONE from the rail (rendered-tree absence)
    const text = container.textContent || "";
    expect(text).not.toContain("Before the meeting");
    expect(text).not.toContain("Start the read");
    expect(container.querySelectorAll("input, textarea")).toHaveLength(0); // no form fields
  });
});

describe("FR-FLOW-1 GOAL 1 — the workshop step writes the session fields (open)", () => {
  it("Prepare → Start inserts an OPEN session with the parsed intake fields", async () => {
    insertPayload = null;
    const { getByText, getByLabelText } = render(<PrepareFirstReadControl companyId="c1" dark={false} />);
    fireEvent.click(getByText("Prepare First Read →")); // open the form
    fireEvent.change(getByLabelText("Presenter"), { target: { value: "Jane Presenter" } });
    fireEvent.change(getByLabelText("Domains (comma-separated)"), { target: { value: "acme.com, acme.io" } });
    fireEvent.change(getByLabelText("Room roles (one per line: Name — Role)"), { target: { value: "Bob — CEO" } });
    fireEvent.click(getByText("Start the read"));

    await waitFor(() => expect(insertPayload).not.toBeNull());
    expect(insertPayload).toMatchObject({
      company_id: "c1",
      status: "open", // creatable ahead of the meeting
      presenter: "Jane Presenter",
      domains: ["acme.com", "acme.io"],
      room_roles: [{ name: "Bob", role: "CEO" }],
    });
    // FALSIFICATION: empty fields become NULL, never a fabricated value
    expect(insertPayload!.legal_name).toBeNull();
    expect(insertPayload!.landmines).toBeNull();
  });
});

describe("FR-FLOW-1 GOAL 2 — export cover degrades honestly on empty intake", () => {
  const data = (presenter: string | null): FirstReadExportData => ({
    company: { name: "Acme" },
    session: { id: "s1", date: "2026-07-23", presenter },
    standard: null,
    mirror: { score: null, bet: null, findings: [] },
    check: { items: [], tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 } },
    gap: [], proposal: null, exportedAt: "2026-07-23T00:00:00Z",
  });

  it("presenter present → cover shows it; absent → no fabricated value", () => {
    expect(buildFirstReadExportHtml(data("Jane Presenter"))).toContain("Jane Presenter");
    const bare = buildFirstReadExportHtml(data(null));
    expect(bare).not.toContain("Jane Presenter");
    expect(bare).not.toContain(" · undefined");
    expect(bare).not.toContain(" · null"); // dateless/nameless degrade — never a placeholder
    expect(bare).toContain("2026-07-23"); // the date still renders
  });
});
