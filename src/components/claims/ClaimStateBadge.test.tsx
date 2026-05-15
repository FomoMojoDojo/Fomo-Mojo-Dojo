import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import ClaimStateBadge from "./ClaimStateBadge";

// Mock Supabase — the inspect fetch fires when the popover opens.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              outside_support_count: 2,
              organization_support_count: 1,
              customer_support_count: 3,
              updated_at: "2026-05-14T00:00:00Z",
            },
            error: null,
          }),
        }),
      }),
    }),
  },
}));

// Radix Popover portals render into document.body — available in jsdom.

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("ClaimStateBadge — rendering", () => {
  it("renders 'Outside view' label for outside_view state", () => {
    render(<ClaimStateBadge state="outside_view" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveTextContent("Outside view");
  });

  it("renders 'Diagnose' label for diagnose state", () => {
    render(<ClaimStateBadge state="diagnose" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveTextContent("Diagnose");
  });

  it("renders 'Focus' label for focus state", () => {
    render(<ClaimStateBadge state="focus" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveTextContent("Focus");
  });

  it("renders 'Flow' label for flow state", () => {
    render(<ClaimStateBadge state="flow" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveTextContent("Flow");
  });

  it("sm size: default badge renders without crashing", () => {
    const { container } = render(<ClaimStateBadge state="focus" size="sm" />);
    expect(container.firstChild).toBeTruthy();
  });

  it("md size: badge renders without crashing", () => {
    const { container } = render(<ClaimStateBadge state="focus" size="md" />);
    expect(container.firstChild).toBeTruthy();
  });

  it("inline variant renders a <span>, not a <button>", () => {
    render(<ClaimStateBadge state="diagnose" variant="inline" />);
    const badge = screen.getByTestId("claim-state-badge");
    expect(badge.tagName.toLowerCase()).toBe("span");
  });

  it("badge variant renders a <button>", () => {
    render(<ClaimStateBadge state="focus" variant="badge" />);
    const badge = screen.getByTestId("claim-state-badge");
    expect(badge.tagName.toLowerCase()).toBe("button");
  });

  it("outside_view badge applies italic style", () => {
    render(<ClaimStateBadge state="outside_view" />);
    const badge = screen.getByTestId("claim-state-badge");
    expect(badge).toHaveStyle({ fontStyle: "italic" });
  });

  it("flow badge applies higher font weight than outside_view", () => {
    const { rerender } = render(<ClaimStateBadge state="outside_view" />);
    const outsideBadge = screen.getByTestId("claim-state-badge");
    const outsideWeight = Number(window.getComputedStyle(outsideBadge).fontWeight || outsideBadge.style.fontWeight);

    rerender(<ClaimStateBadge state="flow" />);
    const flowBadge = screen.getByTestId("claim-state-badge");
    const flowWeight = Number(window.getComputedStyle(flowBadge).fontWeight || flowBadge.style.fontWeight);

    expect(flowWeight).toBeGreaterThan(outsideWeight);
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe("ClaimStateBadge — accessibility", () => {
  it("outside_view aria-label matches orient sentence", () => {
    render(<ClaimStateBadge state="outside_view" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveAttribute(
      "aria-label",
      "Inferred from public signals — not yet grounded internally.",
    );
  });

  it("diagnose aria-label matches orient sentence", () => {
    render(<ClaimStateBadge state="diagnose" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveAttribute(
      "aria-label",
      "Grounded through internal evidence — not yet customer-validated.",
    );
  });

  it("focus aria-label matches orient sentence", () => {
    render(<ClaimStateBadge state="focus" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveAttribute(
      "aria-label",
      "Customer-validated through primary research.",
    );
  });

  it("flow aria-label matches orient sentence", () => {
    render(<ClaimStateBadge state="flow" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveAttribute(
      "aria-label",
      "Committed and acting, with monitoring in place.",
    );
  });

  it("inline variant also has correct aria-label", () => {
    render(<ClaimStateBadge state="flow" variant="inline" />);
    expect(screen.getByTestId("claim-state-badge")).toHaveAttribute(
      "aria-label",
      "Committed and acting, with monitoring in place.",
    );
  });
});

// ── Orient tooltip ─────────────────────────────────────────────────────────────

describe("ClaimStateBadge — orient tooltip", () => {
  it("shows orient sentence on mouse enter", async () => {
    render(<ClaimStateBadge state="diagnose" />);
    const badge = screen.getByTestId("claim-state-badge");

    fireEvent.mouseEnter(badge);
    expect(
      screen.getByRole("tooltip"),
    ).toHaveTextContent("Grounded through internal evidence — not yet customer-validated.");
  });

  it("hides orient tooltip on mouse leave", async () => {
    render(<ClaimStateBadge state="focus" />);
    const badge = screen.getByTestId("claim-state-badge");

    fireEvent.mouseEnter(badge);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("orient tooltip text matches the correct state", () => {
    render(<ClaimStateBadge state="flow" />);
    const badge = screen.getByTestId("claim-state-badge");

    fireEvent.mouseEnter(badge);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Committed and acting, with monitoring in place.",
    );
  });
});

// ── Inspect popover ───────────────────────────────────────────────────────────

describe("ClaimStateBadge — inspect popover", () => {
  it("does not open popover when claimId is not provided", async () => {
    render(<ClaimStateBadge state="focus" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });
    expect(screen.queryByTestId("inspect-panel")).not.toBeInTheDocument();
  });

  it("opens inspect panel when claimId is provided and badge is clicked", async () => {
    render(<ClaimStateBadge state="focus" claimId="claim-abc-123" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });
    await waitFor(() =>
      expect(screen.getByTestId("inspect-panel")).toBeInTheDocument(),
    );
  });

  it("inspect panel shows fetched evidence signal counts", async () => {
    render(<ClaimStateBadge state="focus" claimId="claim-abc-123" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });

    await waitFor(() => screen.getByTestId("inspect-panel"));
    // Mocked data: outside=2, org=1, customer=3
    expect(screen.getByTestId("inspect-panel")).toHaveTextContent("Outside signals");
    expect(screen.getByTestId("inspect-panel")).toHaveTextContent("Organization signals");
    expect(screen.getByTestId("inspect-panel")).toHaveTextContent("Customer signals");
  });

  it("inspect panel shows next-state requirement for non-flow states", async () => {
    render(<ClaimStateBadge state="diagnose" claimId="claim-abc-123" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });

    await waitFor(() => screen.getByTestId("inspect-panel"));
    expect(screen.getByTestId("inspect-panel")).toHaveTextContent(
      "To advance to Focus",
    );
  });

  it("inspect panel has no next-state requirement for flow state", async () => {
    render(<ClaimStateBadge state="flow" claimId="claim-abc-123" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });

    await waitFor(() => screen.getByTestId("inspect-panel"));
    expect(screen.getByTestId("inspect-panel")).not.toHaveTextContent(
      "To advance to",
    );
  });

  it("inspect panel shows placeholder claim detail link", async () => {
    render(<ClaimStateBadge state="focus" claimId="claim-abc-123" />);
    await act(async () => { fireEvent.click(screen.getByTestId("claim-state-badge")); });

    await waitFor(() => screen.getByTestId("inspect-panel"));
    expect(screen.getByTestId("inspect-panel")).toHaveTextContent(
      "View claim detail →",
    );
  });
});
