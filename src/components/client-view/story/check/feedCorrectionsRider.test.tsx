// OC-3b — the feed button's contest-born rider appears ONLY when contests were born,
// independent of the corrections axis (Edgewood: 0 corrections, 3 contests).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import FeedCorrectionsButton from "./FeedCorrectionsButton";

beforeEach(() => invoke.mockReset());

describe("OC-3b — feed result-line contest rider", () => {
  it("shows the pushback rider when contests_born > 0 (even with zero corrections)", async () => {
    invoke.mockResolvedValue({ data: { ok: true, corrections_fed: 0, contests_born: 3 }, error: null });
    const { getByText, findByText } = render(<FeedCorrectionsButton sessionId="s1" />);
    fireEvent.click(getByText("Feed corrections to the strategic reading"));
    // corrections axis reports empty…
    await findByText("No corrections to feed — the client confirmed or rejected every item.");
    // …and the contest rider is shown, pluralized, verbatim.
    expect(getByText("3 client pushbacks recorded — decide each under Contested below.")).toBeTruthy();
  });

  it("singularizes for one pushback", async () => {
    invoke.mockResolvedValue({ data: { ok: true, corrections_fed: 0, contests_born: 1 }, error: null });
    const { getByText, findByText } = render(<FeedCorrectionsButton sessionId="s1" />);
    fireEvent.click(getByText("Feed corrections to the strategic reading"));
    await findByText("1 client pushback recorded — decide each under Contested below.");
    expect(true).toBe(true);
  });

  it("FALSIFICATION: no rider when contests_born is 0", async () => {
    invoke.mockResolvedValue({ data: { ok: true, corrections_fed: 0, contests_born: 0 }, error: null });
    const { getByText, findByText, queryByText } = render(<FeedCorrectionsButton sessionId="s1" />);
    fireEvent.click(getByText("Feed corrections to the strategic reading"));
    await findByText("No corrections to feed — the client confirmed or rejected every item.");
    expect(queryByText(/client pushback/)).toBeNull();
  });
});
