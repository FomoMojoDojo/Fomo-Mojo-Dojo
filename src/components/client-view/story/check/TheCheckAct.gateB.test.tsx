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
// ROLLUP Gate 2: TheCheckAct now reads auth + featured pointers. Non-admin, no featured → the
// themes render in their Gate-1 shape (no featured card, no picker, no internal prompt).
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useFeaturedItems", () => ({
  useFeaturedItems: () => ({ featured: {}, feature: async () => null, unfeature: async () => null, ratify: async () => null, ensureDefaults: async () => {}, loading: false, error: null, refetch: async () => {} }),
}));

import TheCheckAct from "./TheCheckAct";
import { ACT_DATA_ERROR } from "../ActData";
import { SAY_VS_SEE_GROUPS } from "@/lib/firstRead/sayVsSee";
import {
  OUTSIDE_RAISED_HEADING, OUTSIDE_RAISED_FRAMING, OUTSIDE_RAISED_LABEL,
  OUTSIDE_RAISED_COVERAGE, OUTSIDE_RAISED_PROMPT, OUTSIDE_RAISED_EMPTY,
} from "./OutsideRaisedSection";
import { AS_CAPTURED_LABEL } from "@/components/evidence/SignalQuote";

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

// Option B — the observed-anchored section renders inside the SAME <ActData> ready branch.
const iSilentItem = () => ({
  kind: "delta" as const, ref: "d-is", identity: "is-1",
  text: "City froze placements after 2019 staff misconduct and child abuse allegations.",
  verdict: null, correctionText: null, capturedAt: null,
  delta: {
    deltaType: "internally_silent" as const, say: "",
    see: "City froze placements after 2019 staff misconduct and child abuse allegations.",
    quote: null, quoteSourceText: null, eventDate: null,
  },
});
const withItems = (deltaState: unknown, items: unknown[]) => ({ ...baseCapture(deltaState), items });

describe("TheCheckAct — Option B internally_silent section", () => {
  it("items present (ready) → heading + framing + statement + coverage + prompt; NOT the empty string", () => {
    cap.ret = withItems({ status: "ready", data: [iSilentItem()] }, [iSilentItem()]);
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(OUTSIDE_RAISED_HEADING);
    expect(container.textContent).toContain(OUTSIDE_RAISED_FRAMING);
    expect(container.textContent).toContain(OUTSIDE_RAISED_LABEL);
    expect(container.textContent).toContain("City froze placements after 2019 staff misconduct");
    expect(container.textContent).toContain(OUTSIDE_RAISED_COVERAGE);
    expect(container.textContent).toContain(OUTSIDE_RAISED_PROMPT);
    expect(container.textContent).not.toContain(OUTSIDE_RAISED_EMPTY);
  });

  it("ready with zero internally_silent items → heading + the honest-empty string", () => {
    cap.ret = withItems({ status: "ready", data: [] }, []);
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(OUTSIDE_RAISED_HEADING);
    expect(container.textContent).toContain(OUTSIDE_RAISED_EMPTY);
    expect(container.textContent).not.toContain(OUTSIDE_RAISED_FRAMING);
  });

  it("delta read ERROR → the section DETAIL (empty/framing) does NOT render; the signed error does", () => {
    cap.ret = withItems({ status: "error", error: "PostgREST 500" }, [iSilentItem()]);
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    // The load-bearing invariant: no false honest-empty copy on a failed read.
    expect(container.textContent).not.toContain(OUTSIDE_RAISED_EMPTY);
    expect(container.textContent).not.toContain(OUTSIDE_RAISED_FRAMING);
    // ROLLUP (Gate 1): the THEME headline (byte-identical to OUTSIDE_RAISED_HEADING) is the
    // always-on overview label; the section's own heading is suppressed (showHeading=false), and
    // only the gated DETAIL is replaced by the signed error. So the heading text is expected here.
    expect(container.textContent).toContain(OUTSIDE_RAISED_HEADING);
  });

  it("dated item renders the Reported line (byte-exact, U+00B7); an undated item renders no line", () => {
    const dated = {
      ...iSilentItem(), identity: "is-dated",
      delta: { ...iSilentItem().delta, reportedEventDate: "2025-07-18", reportedPrecision: "day" as const, capturedAt: "2026-07-24T00:00:00+00" },
    };
    cap.ret = withItems({ status: "ready", data: [dated] }, [dated]);
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain("Reported Jul 2025 · read by us Jul 2026");
  });

  it("SOURCE HOST: dated item shows host+date; undated shows bare host; no source_url dated = a986cda string; anchor-free", () => {
    // dated + host → "{host} · Reported … · read by us …"
    const hostDated = {
      ...iSilentItem(), identity: "is-host-dated",
      delta: { ...iSilentItem().delta, reportedEventDate: "2025-07-18", reportedPrecision: "day" as const, capturedAt: "2026-07-24T00:00:00+00", sourceUrl: "https://www.glassdoor.com/Reviews/x-E145192.htm" },
    };
    cap.ret = withItems({ status: "ready", data: [hostDated] }, [hostDated]);
    const r1 = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(r1.container.querySelector(".cvs-outside-raised-reported")!.textContent).toBe("glassdoor.com · Reported Jul 2025 · read by us Jul 2026");
    expect(r1.container.querySelector(".cvs-outside-raised a")).toBeNull(); // anchor-free
    r1.unmount();

    // undated + host → the bare domain (the 11 Edgewood undated-with-host items)
    const hostOnly = {
      ...iSilentItem(), identity: "is-host-only",
      delta: { ...iSilentItem().delta, sourceUrl: "https://www.yelp.com/biz/edgewood-san-francisco-2" },
    };
    cap.ret = withItems({ status: "ready", data: [hostOnly] }, [hostOnly]);
    const r2 = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(r2.container.querySelector(".cvs-outside-raised-reported")!.textContent).toBe("yelp.com");
    expect(r2.container.textContent).not.toContain("Reported ");
    r2.unmount();

    // dated but NO source_url → the a986cda string, byte-unchanged (degrade)
    const dateNoHost = {
      ...iSilentItem(), identity: "is-date-nohost",
      delta: { ...iSilentItem().delta, reportedEventDate: "2025-07-18", reportedPrecision: "day" as const, capturedAt: "2026-07-24T00:00:00+00" },
    };
    cap.ret = withItems({ status: "ready", data: [dateNoHost] }, [dateNoHost]);
    const r3 = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(r3.container.querySelector(".cvs-outside-raised-reported")!.textContent).toBe("Reported Jul 2025 · read by us Jul 2026");
  });

  it("undated item: the Reported line is provably ABSENT from the rendered tree", () => {
    cap.ret = withItems({ status: "ready", data: [iSilentItem()] }, [iSilentItem()]); // no reported fields
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(OUTSIDE_RAISED_HEADING); // section IS shown
    expect(container.querySelector(".cvs-outside-raised-reported")).toBeNull(); // but no Reported line node
    expect(container.textContent).not.toContain("Reported "); // nor its text
  });

  it("receipt renders where a quote resolves (Edgewood's live items carry none — this proves the wiring)", () => {
    const withQuote = { ...iSilentItem(), delta: { ...iSilentItem().delta, quote: "SF provided a $350K emergency grant." } };
    cap.ret = withItems({ status: "ready", data: [withQuote] }, [withQuote]);
    const { container } = render(<TheCheckAct companyId="co-1" sessionId="s-1" />);
    expect(container.textContent).toContain(AS_CAPTURED_LABEL); // "As captured"
    expect(container.textContent).toContain("SF provided a $350K emergency grant.");
  });
});
