// SP-329 (BRIEF-17): a contradicted attribute never renders under "What holds it up" on the
// workspace page. Both branches: the strength renders, the contradicted one does not.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co", name: "Test Co" } }) }));
vi.mock("@/hooks/usePositioningCanvas", () => ({
  usePositioningCanvas: () => ({
    loading: false,
    item: {
      market_category: "Test category",
      best_fit_customers: "",
      competitive_alternatives: [],
      current_tagline: "", proposed_tagline: "",
      unique_attributes: [
        { id: "s", name: "STRENGTH-ATTR", description: "", highlighted: false, evidence_status: "corroborated" },
        { id: "x", name: "CONTRADICTED-ATTR", description: "", highlighted: false, evidence_status: "contradicted" },
      ],
    },
  }),
}));

import PositioningPage from "./PositioningPage";

describe("workspace positioning never lists a contradicted attribute (SP-329)", () => {
  it("renders the strength and not the contradicted attribute", () => {
    const { container } = render(<MemoryRouter><PositioningPage /></MemoryRouter>);
    expect(container.textContent).toContain("STRENGTH-ATTR");
    expect(container.textContent).not.toContain("CONTRADICTED-ATTR");
  });
});
