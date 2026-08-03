// FR-REOPEN-3 — the Reopen control reflects DB state and the RPC's refusal; it never
// re-implements the guards. Falsification: the status gate, the disabled-with-reason,
// the empty-reason block, and the verbatim-refusal surfacing each have a test that fails
// if that behavior is wrong.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  session: null as null | { id: string; status: string },
  open: [] as Array<{ session_id: string }>,
  reopen: vi.fn(async (_s: string, _r: string) => {}),
}));

vi.mock("@/hooks/useReopenFirstRead", () => ({
  useReopenFirstRead: () => ({ session: h.session, isLoading: false, reopen: h.reopen }),
}));
vi.mock("@/hooks/useClaimContests", () => ({
  useClaimContests: () => ({ open: h.open, resolved: [], isLoading: false, isError: false, resolve: vi.fn() }),
}));

import ReopenFirstReadControl, { REOPEN_LABEL, REOPEN_BODY, REOPEN_TITLE } from "./ReopenFirstReadControl";

beforeEach(() => {
  h.session = null;
  h.open = [];
  h.reopen = vi.fn(async () => {});
});

describe("FR-REOPEN-3 — ReopenFirstReadControl", () => {
  it("is ABSENT on an open session, PRESENT on a proposal_issued session", () => {
    h.session = { id: "s1", status: "open" };
    const r1 = render(<ReopenFirstReadControl companyId="co" />);
    expect(r1.queryByText(REOPEN_LABEL)).toBeNull();
    r1.unmount();

    h.session = { id: "s1", status: "proposal_issued" };
    const r2 = render(<ReopenFirstReadControl companyId="co" />);
    expect(r2.getByText(REOPEN_LABEL)).toBeTruthy();
    expect((r2.getByText(REOPEN_LABEL) as HTMLButtonElement).disabled).toBe(false);
  });

  it("is DISABLED with the singular/plural reason while THIS session's contests are unresolved", () => {
    h.session = { id: "s1", status: "proposal_issued" };

    h.open = [{ session_id: "s1" }];
    const r1 = render(<ReopenFirstReadControl companyId="co" />);
    expect((r1.getByText(REOPEN_LABEL) as HTMLButtonElement).disabled).toBe(true);
    expect(r1.getByText("1 contested finding is still awaiting your judgment.")).toBeTruthy();
    r1.unmount();

    h.open = [{ session_id: "s1" }, { session_id: "s1" }];
    const r2 = render(<ReopenFirstReadControl companyId="co" />);
    expect((r2.getByText(REOPEN_LABEL) as HTMLButtonElement).disabled).toBe(true);
    expect(r2.getByText("2 contested findings are still awaiting your judgment.")).toBeTruthy();
    r2.unmount();

    // Per-session: a contest on a DIFFERENT session must NOT block this one.
    h.open = [{ session_id: "other-session" }];
    const r3 = render(<ReopenFirstReadControl companyId="co" />);
    expect((r3.getByText(REOPEN_LABEL) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks submit until a non-empty reason is entered (consequences shown first)", () => {
    h.session = { id: "s1", status: "proposal_issued" };
    const { getByText, getByLabelText } = render(<ReopenFirstReadControl companyId="co" />);
    fireEvent.click(getByText(REOPEN_LABEL));
    // Consequences-before-act
    expect(getByText(REOPEN_TITLE)).toBeTruthy();
    expect(getByText(REOPEN_BODY)).toBeTruthy();
    // Submit disabled with empty reason
    const submit = getByText("Reopen", { selector: "button" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // Enter a reason → enabled
    fireEvent.change(getByLabelText("Why are you reopening?"), { target: { value: "moved to referrers" } });
    expect((getByText("Reopen", { selector: "button" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("surfaces the RPC's refusal VERBATIM, not a generic error", async () => {
    h.session = { id: "s1", status: "proposal_issued" };
    const REFUSAL = "This session can't reopen yet — 1 contested finding is still awaiting your judgment. Resolve them on Extracts first.";
    h.reopen = vi.fn(async () => { throw new Error(REFUSAL); });
    const { getByText, getByLabelText, findByRole } = render(<ReopenFirstReadControl companyId="co" />);
    fireEvent.click(getByText(REOPEN_LABEL));
    fireEvent.change(getByLabelText("Why are you reopening?"), { target: { value: "try anyway" } });
    fireEvent.click(getByText("Reopen", { selector: "button" }));
    const alert = await findByRole("alert");
    expect(alert.textContent).toBe(REFUSAL);
  });

  it("on submit calls reopen with the session id and trimmed reason", async () => {
    h.session = { id: "s1", status: "proposal_issued" };
    const { getByText, getByLabelText } = render(<ReopenFirstReadControl companyId="co" />);
    fireEvent.click(getByText(REOPEN_LABEL));
    fireEvent.change(getByLabelText("Why are you reopening?"), { target: { value: "  focus shifted  " } });
    fireEvent.click(getByText("Reopen", { selector: "button" }));
    await waitFor(() => expect(h.reopen).toHaveBeenCalledWith("s1", "focus shifted"));
  });
});
