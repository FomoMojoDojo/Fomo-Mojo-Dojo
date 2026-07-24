// OC-2d — the Extracts feed control renders the (signed) FeedCorrectionsButton ONLY when
// a First Read session with verdicts exists; honest absence otherwise.

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

const feedSessionId = { current: null as string | null };
vi.mock("@/hooks/useFirstReadFeedSession", () => ({
  useFirstReadFeedSession: () => feedSessionId.current,
}));

import { ExtractsFeedControl } from "./ExtractsFeedControl";

describe("OC-2d — ExtractsFeedControl (mounts the signed button when a session exists)", () => {
  it("renders FeedCorrectionsButton with its signed label when a session id is present", () => {
    feedSessionId.current = "sess-123";
    const { getByText } = render(<ExtractsFeedControl companyId="co" />);
    // The button's operator-signed label (FR-D2), rendered unchanged — no fork.
    expect(getByText("Feed corrections to the strategic reading")).toBeTruthy();
  });

  it("FALSIFICATION: renders NOTHING when there is no session (honest absence)", () => {
    feedSessionId.current = null;
    const { container, queryByText } = render(<ExtractsFeedControl companyId="co" />);
    expect(queryByText("Feed corrections to the strategic reading")).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
