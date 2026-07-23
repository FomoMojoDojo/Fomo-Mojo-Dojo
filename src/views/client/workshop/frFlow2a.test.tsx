// FR-FLOW-2a — the workshop intake form contrast fix (was rail-theme light-on-light).

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));
import PrepareFirstReadControl from "./PrepareFirstReadControl";

const RAIL_MUTED = "rgb(170, 170, 170)"; // #aaa — the near-invisible rail-theme ink
const WORKSHOP_INK = "rgb(85, 85, 85)"; //  #555 — readable workshop form ink

describe("FR-FLOW-2a — intake form is readable on the workshop", () => {
  it("form labels use workshop ink (not the rail-muted light-on-light) on the LIGHT intro", () => {
    const { getByText, container } = render(<PrepareFirstReadControl companyId="c1" dark={false} />);
    fireEvent.click(getByText("Prepare First Read →")); // open the form
    const label = container.querySelector(".cvs-fr-prep-label") as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.style.color).toBe(WORKSHOP_INK);
    expect(label.style.color).not.toBe(RAIL_MUTED); // rail-theme absent

    // FALSIFICATION anchor: a #555 label reads on the workshop; #aaa did not.
    expect(WORKSHOP_INK).not.toBe(RAIL_MUTED);
  });

  it("form stays a readable light card even when the intro theme is dark", () => {
    const { getByText, container } = render(<PrepareFirstReadControl companyId="c1" dark={true} />);
    fireEvent.click(getByText("Prepare First Read →"));
    const form = container.querySelector(".cvs-fr-prep-form") as HTMLElement;
    expect(form.style.background).toBe("rgb(255, 255, 255)"); // white card, not the dark canvas
    const label = container.querySelector(".cvs-fr-prep-label") as HTMLElement;
    expect(label.style.color).toBe(WORKSHOP_INK); // dark-on-white, readable regardless of intro theme
  });
});
