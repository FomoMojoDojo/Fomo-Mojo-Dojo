// GATE B falsification — TheCheckAct's say-vs-see exhibit. The exhibit renders its three
// signed group-empty lines + heading when the delta items are empty. After migration it is
// gated on the delta read's honest `deltaState`: a FAILED delta read renders the signed
// error via <ActData>, and NONE of the four signed strings appear; a SUCCESSFUL zero-delta
// read still renders the three group empties + heading, byte-identical to before.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const cap = vi.hoisted(() => ({ ret: null as Record<string, unknown> | null }));
vi.mock("@/hooks/useFirstReadCapture", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useFirstReadCapture: () => cap.ret };
});

import TheCheckAct from "./TheCheckAct";
import { ACT_DATA_ERROR } from "../ActData";
import { SAY_VS_SEE_GROUPS } from "@/lib/firstRead/sayVsSee";

// The 4 signed strings reachable via the exhibit on a swallowed delta error, by name.
const ECHOED_EMPTY = SAY_VS_SEE_GROUPS.find((g) => g.key === "echoed")!.empty;
const DIVERGENT_EMPTY = SAY_VS_SEE_GROUPS.find((g) => g.key === "divergent")!.empty;
const PUB_SILENT_EMPTY = SAY_VS_SEE_GROUPS.find((g) => g.key === "publicly_silent")!.empty;
const PUB_SILENT_HEADING = SAY_VS_SEE_GROUPS.find((g) => g.key === "publicly_silent")!.heading;

const baseCapture = (deltaState: unknown) => ({
  items: [],
  tally: { confirmed: 0, corrected: 0, rejected: 0, not_important: 0 },
  loading: false,
  frozen: false,
  sessionStatus: null,
  setVerdict: async () => null,
  refetchResponses: async () => {},
  deltaState,
});

afterEach(() => { cap.ret = null; });

describe("TheCheckAct exhibit — Gate B failure handling", () => {
  it("(a) delta read ERROR → signed error; NONE of the 4 signed strings render", () => {
    cap.ret = baseCapture({ status: "error", error: "PostgREST 500" });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    // string by string, not in aggregate
    expect(container.textContent).not.toContain(ECHOED_EMPTY);
    expect(container.textContent).not.toContain(DIVERGENT_EMPTY);
    expect(container.textContent).not.toContain(PUB_SILENT_EMPTY); // "Everything you've told us turned up somewhere in what we've read."
    expect(container.textContent).not.toContain(PUB_SILENT_HEADING);
  });

  it("(c) delta read READY with zero deltas → the three group empties + heading render (byte-identical)", () => {
    cap.ret = baseCapture({ status: "ready", data: [] });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(ECHOED_EMPTY);
    expect(container.textContent).toContain(DIVERGENT_EMPTY);
    expect(container.textContent).toContain(PUB_SILENT_EMPTY);
    expect(container.textContent).toContain(PUB_SILENT_HEADING);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("(b) delta read LOADING → neither the signed strings nor the error render yet", () => {
    cap.ret = baseCapture({ status: "loading" });
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(PUB_SILENT_EMPTY);
  });
});
