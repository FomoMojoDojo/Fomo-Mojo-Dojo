// OC-3b — error honesty: a FAILED contests query renders an honest inline error, NEVER a
// silent null (the created_at-embed masquerade). Empty stays a null-render.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { CONTEST_COPY } from "@/lib/firstRead/contestCopy";

const state = {
  open: [] as unknown[],
  resolved: [] as unknown[],
  isError: false,
};
vi.mock("@/hooks/useClaimContests", () => ({
  useClaimContests: () => ({ ...state, isLoading: false, resolve: vi.fn() }),
}));

import { ContestedFindings } from "./ContestedFindings";

describe("OC-3b — ContestedFindings error honesty", () => {
  it("renders the honest error line when the query FAILED (not a silent vanish)", () => {
    state.open = [];
    state.resolved = [];
    state.isError = true;
    const { getByText } = render(<ContestedFindings companyId="co" />);
    expect(getByText(CONTEST_COPY.loadError)).toBeTruthy();
    // the signed draft text verbatim
    expect(CONTEST_COPY.loadError).toBe("Couldn't load contested findings — reload or check access.");
  });

  it("FALSIFICATION: empty (no error) renders NOTHING — error and empty are distinct states", () => {
    state.open = [];
    state.resolved = [];
    state.isError = false;
    const { container, queryByText } = render(<ContestedFindings companyId="co" />);
    expect(queryByText(CONTEST_COPY.loadError)).toBeNull();
    expect(container.firstChild).toBeNull(); // honest null-render on genuine empty
  });
});
