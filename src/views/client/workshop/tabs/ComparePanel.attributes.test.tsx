// SP-330 (BRIEF-17): the differentiators row's outside cell reads the judged state. A contradicted
// attribute appears only under S-POS-1, never among the strengths.
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AttributeVerdictCell, attributesAlignment } from "./ComparePanel";
import { WORKSPACE_STRINGS } from "@/views/client/workspace/workspaceNav";

const items = [
  { id: "a", name: "ECHOED", description: "", highlighted: false, evidence_status: "corroborated" as const },
  { id: "b", name: "DISPUTED", description: "", highlighted: false, evidence_status: "contradicted" as const },
  { id: "c", name: "UNCHECKED", description: "", highlighted: false },
];

describe("ComparePanel attribute verdicts (SP-330)", () => {
  it("is no longer the hard-coded 'No outside data' when attributes exist", () => {
    const { container } = render(<AttributeVerdictCell items={items} />);
    expect(container.textContent).not.toContain("No outside data");
  });
  it("lists the contradicted attribute only under S-POS-1", () => {
    render(<AttributeVerdictCell items={items} />);
    const strengths = screen.getAllByTestId("compare-attribute-strength").map((n) => n.textContent ?? "");
    expect(strengths.some((t) => t.includes("DISPUTED"))).toBe(false);
    expect(strengths.some((t) => t.includes("ECHOED"))).toBe(true);
    const disagree = screen.getByTestId("compare-attribute-disagree");
    expect(within(disagree).getByText(WORKSPACE_STRINGS.positioningOutsideDisagree)).toBeTruthy();
    expect(disagree.textContent).toContain("DISPUTED");
  });
  it("a contradicted attribute makes the row a gap; all echoed is aligned; unjudged is no badge", () => {
    expect(attributesAlignment(items)).toBe("gap");
    expect(attributesAlignment([items[0]])).toBe("aligned");
    expect(attributesAlignment([items[2]])).toBeUndefined();
  });
});
