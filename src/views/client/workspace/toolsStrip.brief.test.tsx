// SP-442 (2026-11-19): the Brief tile is in the Tools row for an operator and absent for everyone
// else. The gate is the SAME `operator` value that already hides the Admin disclosure, so one
// mechanism hides both — there is no second rule to keep in step.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WORKSPACE_STRINGS, WORKSPACE_PAGES, WORKSPACE_TOOL_EYEBROWS, arrowNeighbour, groupPages } from "./workspaceNav";

let operator: unknown = null;
vi.mock("@/views/client/firstReadPreview/operatorControls", () => ({ useOperatorControls: () => operator }));

import { ToolsStrip } from "./WorkspaceChart";

const draw = () => render(
  <MemoryRouter>
    <ToolsStrip activeKey={null} variant="slate" adminOpen={false} onToggleAdmin={() => {}} />
  </MemoryRouter>,
);
const tiles = (c: HTMLElement) => [...c.querySelectorAll("[data-fr-tile]")].map((e) => e.getAttribute("data-fr-tile"));

describe("the Tools strip", () => {
  it("a non-operator sees Inputs and Council and NO Brief", () => {
    operator = null;
    const { container } = draw();
    expect(tiles(container)).toEqual(["inputs", "council"]);
    expect(container.textContent).not.toContain(WORKSPACE_STRINGS.briefLabel);
    expect(container.textContent).not.toContain(WORKSPACE_STRINGS.briefKicker);
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
  });

  it("an operator sees the Brief tile with its kicker, and the Admin disclosure beside it — four cells", () => {
    operator = { on: true };
    const { container } = draw();
    expect(tiles(container)).toEqual(["inputs", "council", "brief"]);
    expect(container.textContent).toContain(WORKSPACE_STRINGS.briefLabel);
    expect(container.textContent).toContain(WORKSPACE_STRINGS.briefKicker);
    // The fourth cell is the Admin disclosure, which carries the operator mark and no data-fr-tile.
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(1);
    expect(container.querySelectorAll(".fr-launcher-tool")).toHaveLength(4);
    operator = null;
  });

  it("the registry carries Brief as an operator-only tools page with its kicker", () => {
    const brief = WORKSPACE_PAGES.find((p) => p.key === "brief")!;
    expect(brief.segment).toBe("brief");
    expect(brief.group).toBe("tools");
    expect(brief.operatorOnly).toBe(true);
    expect(WORKSPACE_TOOL_EYEBROWS.brief).toBe(WORKSPACE_STRINGS.briefKicker);
    expect(groupPages("tools").map((p) => p.key)).toEqual(["index", "inputs", "council", "brief"]);
  });

  it("prev/next is unaffected — a tools page has no arrow sibling", () => {
    const brief = WORKSPACE_PAGES.find((p) => p.key === "brief")!;
    expect(arrowNeighbour(brief, "next")).toBeNull();
    expect(arrowNeighbour(brief, "prev")).toBeNull();
    // and the two arrow groups still cycle among themselves only
    for (const g of ["outputs", "base"] as const) {
      const pages = groupPages(g);
      expect(pages.map((p) => arrowNeighbour(p, "next")!.key)).toEqual([...pages.slice(1), pages[0]].map((p) => p.key));
    }
  });
});
