// PUBLIC-ONLY interim (2026-08-20) — an empty say-anchored group is a NOT-COMPUTED
// state (its items are provenance-hidden until the Gate-B recompute), so the
// honest-absence lines — "Everything you've told us turned up somewhere…" and the
// two "Nothing we've read so far…" lines — must NOT render. Render-tree assertion
// (not a file grep), falsification-validated: the planted scenario is a rail whose
// say-groups are empty BECAUSE of exclusion.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import SayVsSeeExhibit from "./SayVsSeeExhibit";
import type { CheckItem } from "@/hooks/useFirstReadCapture";

const TURNED_UP = "Everything you've told us turned up somewhere in what we've read.";
const REPEATS_BACK = "Nothing we've read so far repeats back what you've told us.";
const CONTRADICTS = "Nothing we've read so far contradicts what you've told us.";

const deltaItem = (identity: string, deltaType: string): CheckItem =>
  ({
    identity,
    kind: "delta",
    statement: `stmt-${identity}`,
    delta: { deltaType, publicStatement: "public side", declaredStatement: "say side" },
  } as unknown as CheckItem);

describe("say-vs-see exhibit — empty say-groups render NOTHING until Gate B", () => {
  it("all groups excluded-empty → no absence lines, no group placeholders", () => {
    const { container } = render(<SayVsSeeExhibit items={[]} onSet={vi.fn()} />);
    expect(container.textContent).not.toContain(TURNED_UP); // FALSIFICATION target
    expect(container.textContent).not.toContain(REPEATS_BACK);
    expect(container.textContent).not.toContain(CONTRADICTS);
    expect(container.querySelectorAll(".cvs-saysee-empty").length).toBe(0);
  });

  it("a group WITH items still renders; its empty siblings stay silent", () => {
    const { container } = render(
      <SayVsSeeExhibit items={[deltaItem("i1", "echoed")]} onSet={vi.fn()} />,
    );
    expect(container.textContent).toContain("Where the outside echoes you");
    expect(container.textContent).not.toContain(TURNED_UP);
    expect(container.textContent).not.toContain(CONTRADICTS);
  });
});
