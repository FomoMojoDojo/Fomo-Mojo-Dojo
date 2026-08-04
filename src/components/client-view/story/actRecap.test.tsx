// Name-the-moves — ActRecap device + the gap recap mounted at the END of DiagnoseMarketAct.
// Proves: the device suppresses on !hasContent (EOV-1 guard) and carries no bar; the recap
// lands as the LAST child of its act (position in the mounted tree, not file order) and is
// ABSENT when the act renders its honest-empty state; a no-move act renders no recap.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// ── DiagnoseMarketAct deps, controllable via `d.ready` ───────────────────────
const d = vi.hoisted(() => ({ ready: true }));
vi.mock("@/hooks/useCompany", () => ({ useCompany: () => ({ activeCompany: { id: "co" } }) }));
vi.mock("@/hooks/useMarketPortfolio", () => ({ useMarketPortfolio: () => ({ loading: false, portfolio: { active: [], deferred: [] } }) }));
vi.mock("@/lib/marketPortfolio/diagnosePairs", () => ({
  deriveDiagnoseModel: () => ({ ready: d.ready, declaredPairs: [], inferredPairs: [], internalOnly: [], publicOnly: [], fanOut: [] }),
}));

import ActRecap from "./ActRecap";
import DiagnoseMarketAct from "./diagnose/DiagnoseMarketAct";
import OutsideNextMoveAct from "./OutsideNextMoveAct";
import { GAP_RECAP } from "./recapCopy";

const LINE = "That was the gap — a method line.";

beforeEach(() => { d.ready = true; });

describe("ActRecap — the device", () => {
  it("renders the verbatim recap in the .cvs-act-def register, no vertical bar", () => {
    const { container } = render(<ActRecap recap={LINE} hasContent />);
    const el = container.querySelector("[data-act-recap]") as HTMLElement | null;
    expect(el).toBeTruthy();
    expect(el!.className).toBe("cvs-act-def");
    expect(el!.textContent).toBe(LINE); // verbatim, unformatted
    expect(el!.style.borderLeft).toBe("");
    expect(el!.style.borderInlineStart).toBe("");
  });

  it("SUPPRESSES entirely when hasContent is false (EOV-1 guard)", () => {
    const { container } = render(<ActRecap recap={LINE} hasContent={false} />);
    expect(container.querySelector("[data-act-recap]")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("gap recap — DiagnoseMarketAct (/client-view)", () => {
  it("renders as the LAST child of the act when the act has content (model.ready)", () => {
    d.ready = true;
    const { container } = render(<DiagnoseMarketAct />);
    const section = container.querySelector("section.cvs-dg") as HTMLElement;
    const recap = section.querySelector("[data-act-recap]") as HTMLElement | null;
    expect(recap).toBeTruthy();
    expect(recap!.textContent).toBe(GAP_RECAP); // the signed line, verbatim
    // Position: the recap is the act's LAST element — after its content.
    expect(section.lastElementChild).toBe(recap);
  });

  it("is ABSENT when the act renders its honest-empty state (!model.ready)", () => {
    d.ready = false;
    const { container } = render(<DiagnoseMarketAct />);
    expect(container.querySelector("[data-act-recap]")).toBeNull();
  });
});

describe("no recap on a no-move act", () => {
  it("OutsideNextMoveAct (navigation) renders no recap", () => {
    const { container } = render(<OutsideNextMoveAct onStartDiagnose={() => {}} />);
    expect(container.querySelector("[data-act-recap]")).toBeNull();
  });
});
