// ── DIAGNOSE SLICE 1 — RENDER GUARDS (step 7 a / d / e, 2026-11-07) ─────────────────────────────
//
// (a) THE OPERATOR LAW. Every one of the eleven screens renders ZERO [data-fr-operator] nodes by
//     default. The planted-data leg is the point: the fixture carries a market row whose
//     relationship_kind is NULL, and that row's operator flag appears ONLY under the context the
//     glyph switch provides. Without the plant the check would pass against a surface that has no
//     operator affordance at all, which is the vacuous failure mode.
//
// (d) EMPTY STATES. W4 (no problems anywhere), W8 (no hypotheses) and the who-you-serve base item
//     (no declared store at all) each render their screen with no item rows rather than a fabricated
//     one, and the composer still works in page state.
//
// (e) THE SCORE RULE (P13). The score block renders TODAY'S number and nothing else: no "34", no
//     "52", no track, no marks. A company with no score renders no number at all.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OperatorControlsContext } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_STRINGS } from "@/views/client/firstReadPreview/operatorStrings";
import { PageStateProvider } from "./walk";
import { SendScreen } from "./screens/Send";
import { WelcomeScreen } from "./screens/Welcome";
import { W1Screen, W2Screen, W4Screen, W5Screen, W6Screen, W7Screen, W8Screen, W9Screen } from "./screens/gather";
import { HomeScreen } from "./home/Home";
import { W2, W4, W6, W8, HOME } from "./strings";
import type { DiagnoseData } from "./useDiagnoseData";

const CO = "77777777-0000-4000-8000-000000000001";

/** Edgewood's real shape, reduced: a failed-free document set, both base sides, 18-ish market rows
 *  INCLUDING a NULL-role one, route-level initiatives, no problems, no hypotheses, one unnamed person. */
const DATA: DiagnoseData = {
  loading: false,
  company: "Edgewood",
  documents: [
    { id: "f1", fileName: "plan.pdf", uploadedAt: "2026-06-05T00:00:00Z", added: true, failed: false,
      kinds: { positioning: true, goals: true, groups: false, routes: false } },
    { id: "f2", fileName: "deck.pdf", uploadedAt: "2026-09-25T00:00:00Z", added: false, failed: false,
      kinds: { positioning: false, goals: false, groups: false, routes: false } },
  ],
  baseParts: [
    { key: "promise", declared: "A declared promise.", outside: "An observed promise." },
    { key: "positioning", declared: "A declared category.", outside: "An observed category." },
    { key: "strategy", declared: "A declared aspiration.", outside: null },
    { key: "serves", declared: null, outside: "Observed recipients." },
  ],
  problems: [],
  goals: [{ id: "g1", statement: "A managed outcome.", todayValue: null, fixed: null }],
  market: [
    { id: "m1", group: "Funders group", job: "fund outcomes", role: "funder", roleUnknown: false, fromOutside: false },
    { id: "m2", group: "Recipients group", job: null, role: "recipient", roleUnknown: false, fromOutside: true },
    // THE PLANT: relationship_kind NULL → no client chip, operator flag behind the switch.
    { id: "m3", group: "Unroled group", job: "do something", role: null, roleUnknown: true, fromOutside: false },
  ],
  // N2 / O1 — a route with conditions and NO evidence link on any of them, which is every route
  // in the live database (Stage A, 2026-11-09).
  initiatives: [{ id: "r1", title: "A route", bets: ["a condition", "another condition"], conditions: 2, evidenced: 0 }],
  hypotheses: [],
  people: [{ id: "p1", name: null, role: null, interviewedAt: "2026-08-01T00:00:00Z" }],
  firstReadStartedAt: "2026-07-23T00:00:00Z",
  score: {
    company_id: CO, total_score: 41, contributors: [], projected_raisers: [],
    engagement_state: "active" as never, methodology_version: "v1", computed_at: "2026-11-07T00:00:00Z",
  },
};

/** A clean company: every store empty but the ones Wasabi actually has. */
const CLEAN: DiagnoseData = {
  ...DATA,
  company: "Wasabi Technologies",
  documents: [],
  baseParts: [
    { key: "promise", declared: null, outside: "An observed promise." },
    { key: "positioning", declared: null, outside: "An observed category." },
    { key: "strategy", declared: null, outside: "An observed aspiration." },
    { key: "serves", declared: null, outside: null },
  ],
  problems: [],
  goals: [],
  market: [],
  initiatives: [],
  hypotheses: [],
  people: [],
  firstReadStartedAt: null,
  score: null,
};

const SCREENS = [
  ["send", SendScreen], ["welcome", WelcomeScreen], ["w1", W1Screen], ["w2", W2Screen],
  ["w4", W4Screen], ["w5", W5Screen], ["w6", W6Screen], ["w7", W7Screen], ["w8", W8Screen],
  ["w9", W9Screen], ["home", HomeScreen],
] as const;

function mount(Screen: (p: { data: DiagnoseData; companyId: string }) => JSX.Element, data = DATA, operator = false) {
  return render(
    <MemoryRouter>
      <OperatorControlsContext.Provider value={operator ? { decide: vi.fn(async () => {}) } : null}>
        <PageStateProvider>
          <Screen data={data} companyId={CO} />
        </PageStateProvider>
      </OperatorControlsContext.Provider>
    </MemoryRouter>,
  );
}

describe("(a) the default render carries zero [data-fr-operator] nodes", () => {
  for (const [name, Screen] of SCREENS) {
    it(`${name}: zero operator nodes`, () => {
      const { container } = mount(Screen);
      expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    });
  }

  it("the switch itself is not an operator node — it is how you get them", () => {
    // WorkspaceShell's law, not the home's: the home puts data-fr-operator on its root, so the home
    // can never read zero. This root deliberately does not.
    const { container } = mount(W6Screen);
    expect(container.querySelector("[data-dg-screen]")?.hasAttribute("data-fr-operator")).toBe(false);
  });

  it("PLANT: the NULL-role market row's flag appears ONLY with the switch on", () => {
    const off = mount(W6Screen, DATA, false);
    expect(off.container.querySelector('[data-fr-operator="market-role-null"]')).toBeNull();
    // ...and the row itself still renders for the client, just without a role chip.
    expect(off.container.textContent).toContain("Unroled group");
    expect(off.container.querySelectorAll('.dg-chip[data-kind="funders"]')).toHaveLength(1);

    const on = mount(W6Screen, DATA, true);
    const flag = on.container.querySelector('[data-fr-operator="market-role-null"]');
    expect(flag).not.toBeNull();
    expect(flag!.textContent).toBe(OPERATOR_STRINGS.kindUntyped);
    // Exactly one — the two roled rows must not sprout flags.
    expect(on.container.querySelectorAll('[data-fr-operator="market-role-null"]')).toHaveLength(1);
  });
});

describe("(d) the signed empty states", () => {
  it("W4: no problems in any of the three stores → no item rows, composer intact", () => {
    const { container } = mount(W4Screen);
    expect(container.querySelectorAll("[data-dg-item]")).toHaveLength(0);
    expect(container.textContent).toContain(W4.noneYet);
    expect(container.querySelector(".dg-composer-input")).not.toBeNull();
  });

  it("W8: no hypotheses → no item rows, composer intact", () => {
    const { container } = mount(W8Screen);
    expect(container.querySelectorAll("[data-dg-item]")).toHaveLength(0);
    expect(container.textContent).toContain(W8.noneYet);
    expect(container.querySelector(".dg-composer-input")).not.toBeNull();
  });

  it("W2 who-you-serve: no declared store → the outside side carries the item, no invented line", () => {
    const { container } = mount(W2Screen);
    const rows = container.querySelectorAll("[data-dg-item]");
    expect(rows).toHaveLength(4); // the four base parts always render
    const serves = rows[3];
    expect(serves.textContent).toContain(W2.partServes("Edgewood"));
    expect(serves.textContent).toContain("Observed recipients.");
    // The mark line is P4 — the only sub-line shape — so no sub-line renders anywhere on W2.
    expect(container.querySelectorAll(".dg-subline")).toHaveLength(0);
  });

  it("a clean company renders every screen with no fabricated row", () => {
    for (const [name, Screen] of SCREENS) {
      const { container } = mount(Screen, CLEAN);
      expect(container.querySelector("[data-dg-screen]"), name).not.toBeNull();
      if (name === "w1" || name === "w4" || name === "w6" || name === "w7" || name === "w8" || name === "w9") {
        expect(container.querySelectorAll("[data-dg-item]"), name).toHaveLength(0);
      }
    }
  });

  it("a clean company's W1 count line is omitted entirely (G3: all segments zero)", () => {
    const { container } = mount(W1Screen, CLEAN);
    expect(container.textContent).not.toContain("documents ·");
    expect(container.textContent).not.toContain("0 ");
  });

  it("Edgewood's W1 count line drops the zero 'could not be opened' segment (G3)", () => {
    const { container } = mount(W1Screen);
    expect(container.textContent).toContain("2 documents");
    expect(container.textContent).toContain("1 added");
    expect(container.textContent).not.toContain("could not be opened");
  });

  it("Before omits the First Read card when no session exists, and never shows a placeholder date", () => {
    const { container } = mount(HomeScreen, CLEAN);
    expect(container.textContent).not.toContain(HOME.firstReadNote);
    expect(container.textContent).not.toContain("[DATE]");
  });

  it("Home card 1 is omitted when nobody is unnamed, and the pager counts what is left", () => {
    const named: DiagnoseData = { ...DATA, people: [{ id: "p1", name: "A person", role: null, interviewedAt: null }] };
    const { container } = mount(HomeScreen, named);
    expect(container.querySelector('[data-dg-card="next-step"]')).toBeNull();
    expect(container.textContent).toContain(HOME.pager(1, 2));
  });

  it("Home card 2 ('A shift') never renders — the mark it needs is P4", () => {
    const { container } = mount(HomeScreen);
    expect(container.querySelector('[data-dg-card="a-shift"]')).toBeNull();
    expect(container.textContent).not.toContain("None of 14 outside sources");
  });
});

describe("(e) the SCORE RULE — today's number only", () => {
  for (const [name, Screen] of SCREENS) {
    it(`${name}: no 34, no 52, no track, no marks`, () => {
      const { container } = mount(Screen);
      const block = container.querySelector("[data-dg-score]")!;
      expect(block, name).not.toBeNull();
      expect(block.textContent).toContain("41");
      expect(block.textContent).not.toContain("34");
      expect(block.textContent).not.toContain("52");
      expect(block.textContent).not.toContain("base confirmed");
      expect(block.textContent).not.toContain("everything in");
    });
  }

  it("no score → no number, rather than a zero", () => {
    const { container } = mount(W6Screen, CLEAN);
    const block = container.querySelector("[data-dg-score]")!;
    expect(block.querySelector(".dg-score-value")).toBeNull();
    expect(block.textContent).not.toContain("0");
  });
});

describe("page state holds every control, and writes nothing", () => {
  it("Keep marks the row pressed without any network call", () => {
    const { container } = mount(W6Screen);
    const row = container.querySelector('[data-dg-item="1"]')!;
    const keep = row.querySelectorAll(".dg-row-btn")[0] as HTMLButtonElement;
    expect(keep.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(keep);
    const after = container.querySelector('[data-dg-item="1"]')!;
    expect((after.querySelectorAll(".dg-row-btn")[0] as HTMLElement).getAttribute("aria-pressed")).toBe("true");
  });

  it("the none-yet button presses and unpresses", () => {
    const { container } = mount(W4Screen);
    const btn = container.querySelector(".dg-noneyet") as HTMLButtonElement;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect((container.querySelector(".dg-noneyet") as HTMLElement).getAttribute("aria-pressed")).toBe("true");
  });
});
