// GATE A falsification — the <ActData> render guard. The point is structural:
// in the ERROR branch the signed error string renders and `children` (the ONLY
// path to data / to any absence copy) is NEVER called. Proven per state.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ActData, ACT_DATA_ERROR } from "./ActData";
import type { AsyncState } from "@/hooks/useAsyncRead";

// A stand-in for an act's data-dependent render — including the kind of absence
// line the design gate flagged. If this ever appears while an error is held, the
// defect is back.
const ABSENCE_LEAK = "Everything you've told us turned up somewhere in what we've read.";

describe("ActData render guard", () => {
  it("error state renders the signed string and does NOT call children", () => {
    const children = vi.fn(() => <p>{ABSENCE_LEAK}</p>);
    const state: AsyncState<string[]> = { status: "error", error: "boom" };
    const { container } = render(<ActData state={state}>{children}</ActData>);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(children).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(ABSENCE_LEAK);
  });

  it("loading state renders the loading node, not children", () => {
    const children = vi.fn(() => <p>{ABSENCE_LEAK}</p>);
    const state: AsyncState<string[]> = { status: "loading" };
    const { container } = render(
      <ActData state={state} loading={<p>Reading…</p>}>{children}</ActData>,
    );
    expect(container.textContent).toContain("Reading…");
    expect(children).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("ready state calls children with the data — the ONLY path to data", () => {
    const state: AsyncState<string[]> = { status: "ready", data: ["x", "y"] };
    const { container } = render(
      <ActData state={state}>{(data) => <p>{data.join(",")}</p>}</ActData>,
    );
    expect(container.textContent).toBe("x,y");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("the signed error string is mounted verbatim (second sentence intact)", () => {
    expect(ACT_DATA_ERROR).toBe(
      "We couldn't load this section. That's a loading problem on our side — not a finding about you.",
    );
  });
});
