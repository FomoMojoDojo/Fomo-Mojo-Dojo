// Nav (2026-08-21): the 8-beat First Read entry point lives in the workshop side nav as
// "First read", the last item under the Inputs group. Routes to the existing preview surface for
// the active company; hidden when no company is selected.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));
vi.mock("@/hooks/useSurfaceTeachingMode", () => ({
  useSurfaceTeachingMode: () => ({ enabled: false, toggle: vi.fn() }),
}));
let activeCompany: { id: string; name: string } | null = { id: "co-123", name: "Cafe Barra" };
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany }) }));

import { WorkshopSidebar } from "./WorkshopSidebar";

const noop = () => {};

describe("WorkshopSidebar — First read under Inputs", () => {
  it("renders 'First read' as the last item under Inputs, routing to the preview surface", () => {
    activeCompany = { id: "co-123", name: "Cafe Barra" };
    const { getByText } = render(
      <MemoryRouter>
        <WorkshopSidebar activeTab="inputs" onTabClick={noop} onHome={noop} />
      </MemoryRouter>,
    );
    const inputs = getByText("Inputs");
    const firstRead = getByText("First read");
    expect(firstRead).toBeTruthy();
    // ordered after the Inputs tab (last item under the group)
    expect(inputs.compareDocumentPosition(firstRead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(firstRead);
    expect(navigateSpy).toHaveBeenCalledWith("/preview/client-refine/first-read/co-123");
  });

  it("hides 'First read' when no company is selected", () => {
    activeCompany = null;
    const { queryByText } = render(
      <MemoryRouter>
        <WorkshopSidebar activeTab="inputs" onTabClick={noop} onHome={noop} />
      </MemoryRouter>,
    );
    expect(queryByText("First read")).toBeNull();
  });
});
