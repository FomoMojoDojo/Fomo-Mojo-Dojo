// GATE B falsification — OutsideMessageBand. After migration, a FAILED or NEVER-RETURNING
// perception read renders the signed error via <ActData>; the signed honest-absence line
// "We haven't found this company described in its own words." is reachable ONLY on a
// successful zero-row read (byte-identical to before). The act builds an AsyncState from
// useOutsidePerception's {claims, loading, error}; the hook's 10s deadline is proven at the
// hook boundary (never-resolving supabase + fake timers → error).
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const h = vi.hoisted(() => ({
  perception: { claims: [] as unknown[], loading: false, error: null as string | null },
}));

vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co-1" } }) }));
vi.mock("@/hooks/useOutsidePerception", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, useOutsidePerception: () => h.perception };
});

import OutsideMessageBand from "./OutsideMessageBand";
import { ACT_DATA_ERROR } from "../ActData";
import { outsideBand } from "@/lib/firstRead/outsideBands";

const MESSAGE_EMPTY = outsideBand("message").empty; // signed: "We haven't found this company described in its own words."
const LOADING = "Reading how the outside describes you";

afterEach(() => { h.perception = { claims: [], loading: false, error: null }; });

describe("OutsideMessageBand — Gate B failure handling", () => {
  it("(a) returning error → signed error string; the signed absence line is ABSENT", () => {
    h.perception = { claims: [], loading: false, error: "PostgREST 500" };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(MESSAGE_EMPTY);
  });

  it("(c) successful zero-row → the signed honest-absence line renders (byte-identical to pre-Gate-B)", () => {
    h.perception = { claims: [], loading: false, error: null };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).toContain(MESSAGE_EMPTY);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
  });

  it("loading → the act's loading line, not error, not empty", () => {
    h.perception = { claims: [], loading: true, error: null };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).toContain(LOADING);
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(MESSAGE_EMPTY);
  });

  it("successful with rows → the perception list renders (not error, not empty)", () => {
    h.perception = {
      claims: [{ id: "c1", statement: "Locals call them the youth crisis experts of the Bay.", topic: null, provenance: "public_observed" }],
      loading: false, error: null,
    };
    const { container } = render(<OutsideMessageBand />);
    expect(container.textContent).toContain("youth crisis experts");
    expect(container.textContent).not.toContain(ACT_DATA_ERROR);
    expect(container.textContent).not.toContain(MESSAGE_EMPTY);
  });
});
