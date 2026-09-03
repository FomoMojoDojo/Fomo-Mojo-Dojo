// Flow-restructure view guards (operator directions D1 + D2, 2026-09-02):
//  D1 — a SIESTA beat's root carries the break class (fr-siesta); a non-siesta beat does NOT.
//  D2 — with FIRST_READ_SHOW_NAV_CHROME off, NO Back / forward-link / Reference / Keys nodes render on
//       any beat, the progress ticks STAY, and ←/→/Home/End keyboard nav still MOVES.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { EMPTY_FIRST_READ } from "./types";

vi.mock("react-router-dom", () => ({ useParams: () => ({ companyId: "co-1" }) }));
vi.mock("./useFirstReadPreviewData", () => ({
  useFirstReadPreviewData: () => ({
    data: { ...EMPTY_FIRST_READ, company: { name: "Geniant", website: "https://geniant.com" } },
    loading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/useFirstReadOpenQuestions", () => ({ useFirstReadOpenQuestions: () => ({ questions: [] }) }));

import FirstReadPreviewView, { BEATS } from "./FirstReadPreviewView";

beforeAll(() => { window.scrollTo = vi.fn() as unknown as typeof window.scrollTo; });

const right = (n: number) => { for (let i = 0; i < n; i++) fireEvent.keyDown(window, { key: "ArrowRight" }); };
const idxOf = (key: string) => BEATS.findIndex((b) => b.key === key);

describe("D1 — siesta break class", () => {
  it("a siesta beat root carries fr-siesta; a non-siesta beat does not", () => {
    const { container } = render(<FirstReadPreviewView />);
    const root = () => container.querySelector(".first-read") as HTMLElement;
    // index 0 = arc (not a siesta)
    expect(root().classList.contains("fr-siesta")).toBe(false);
    // advance to siesta1
    right(idxOf("siesta1"));
    expect(root().classList.contains("fr-siesta")).toBe(true);
    // advance to promise (not a siesta)
    right(idxOf("promise") - idxOf("siesta1"));
    expect(root().classList.contains("fr-siesta")).toBe(false);
  });
});

describe("D2 — nav chrome hidden behind the flag (off), keyboard nav still works", () => {
  it("no Back / forward-link / Reference / Keys nodes on a content beat; progress ticks stay", () => {
    const { container, queryByText } = render(<FirstReadPreviewView />);
    right(idxOf("record")); // an ordinary content beat
    expect(queryByText("Back")).toBeNull();
    expect(queryByText(/Reference/i)).toBeNull();
    expect(queryByText(/Keys:/)).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    // the progress ticks are NOT chrome — they stay
    expect(container.querySelectorAll(".fr-progress-tick").length).toBe(BEATS.length);
  });

  it("←/→/Home/End keyboard nav still moves between beats", () => {
    const { container } = render(<FirstReadPreviewView />);
    const shellText = () => (container.querySelector(".fr-act-enter")?.textContent ?? "");
    right(idxOf("record"));
    const atRecord = shellText();
    expect(atRecord).toContain("What the world sees and says.");
    fireEvent.keyDown(window, { key: "ArrowRight" }); // → yousay
    expect(shellText()).not.toBe(atRecord);
    fireEvent.keyDown(window, { key: "ArrowLeft" }); // ← back to record
    expect(shellText()).toContain("What the world sees and says.");
    fireEvent.keyDown(window, { key: "End" }); // → the closer
    expect(shellText()).toContain("Here's what happens next.");
    fireEvent.keyDown(window, { key: "Home" }); // → arc
    expect(container.querySelector(".first-read")).not.toBeNull();
  });
});
