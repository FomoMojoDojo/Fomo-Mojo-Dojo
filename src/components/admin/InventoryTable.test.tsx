// ADMIN INVENTORY TABLE (Gate 1) — frozen rows are protected, and the score cell is not the cache.
//
// Before this gate the page did not select `companies.frozen` at all, so CB1 rendered like any other
// row with a live Delete. Clicking it hit the enforce_company_freeze trigger and surfaced as a raw
// error toast. The DB refusal was the only thing standing between an operator and a destructive
// click on the frozen reference fixture.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { InventoryTable } from "./InventoryTable";
import { buildInventory, type CompanyInventoryRow } from "@/lib/admin/companiesInventory";
import type { Company } from "@/hooks/useCompany";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const co = (id: string, name: string, frozen: boolean): Company =>
  ({ id, name, website: "https://x.example", frozen } as unknown as Company);

function renderTable(companies: Company[], rows: CompanyInventoryRow[]) {
  return render(
    <MemoryRouter>
      <InventoryTable
        companies={companies}
        inventory={new Map(rows.map((r) => [r.id, r]))}
        inventoryLoading={false}
        activeCompanyId={null}
        runLocksByCompany={{}}
        userId="u1"
        labelForUser={(id) => id}
        busyIds={{ researchingId: null, baselineId: null, comboId: null }}
        onSelect={() => {}}
        onCancelLock={() => {}}
        onDelete={() => {}}
        onOpenReview={() => {}}
        navigate={() => {}}
      />
    </MemoryRouter>,
  );
}

const inv = (id: string, over: Partial<{ frozen: boolean; score: number; previous: number }> = {}) =>
  buildInventory({
    companies: [{ id, name: id, website: null, frozen: over.frozen ?? false }],
    mojoScores: over.score !== undefined
      ? [
          { company_id: id, total_score: over.score, methodology_version: "outside-v1.1.0", computed_at: "2026-09-09T22:41:57.000Z" },
          ...(over.previous !== undefined
            ? [{ company_id: id, total_score: over.previous, methodology_version: "outside-v1.1.0", computed_at: "2026-09-01T00:00:00.000Z" }]
            : []),
        ]
      : [],
    integrity: [], ownWords: [], deltas: [], reads: [], recurrence: [], baselines: [], ledger: [],
  })[0];

describe("frozen rows are greyed and protected", () => {
  it("CB1 renders with the frozen marker and a DISABLED Delete", () => {
    const { container, getByTestId } = renderTable(
      [co(CB1, "Cafe Barra", true), co("live1", "Riverlane", false)],
      [inv(CB1, { frozen: true }), inv("live1")],
    );

    const frozenRow = getByTestId(`company-row-${CB1}`);
    expect(frozenRow.getAttribute("data-frozen")).toBe("true");
    expect(getByTestId(`state-${CB1}`).textContent).toContain("frozen");

    const del = getByTestId(`delete-${CB1}`) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
    expect(del.getAttribute("title")).toContain("Frozen reference company");

    // and the live row is untouched
    expect(getByTestId("company-row-live1").getAttribute("data-frozen")).toBeNull();
    expect((getByTestId("delete-live1") as HTMLButtonElement).disabled).toBe(false);
    expect(getByTestId("state-live1").textContent).toContain("live");
    expect(container.querySelectorAll('tr[data-frozen="true"]')).toHaveLength(1);
  });

  it("VACUOUS PROOF — the same row NOT marked frozen has Delete enabled", () => {
    // If `frozen` stopped reaching the row (the pre-gate state, where useCompany never selected the
    // column), this is exactly what CB1 would render as.
    const { getByTestId } = renderTable([co(CB1, "Cafe Barra", false)], [inv(CB1, { frozen: false })]);
    expect((getByTestId(`delete-${CB1}`) as HTMLButtonElement).disabled).toBe(false);
    expect(getByTestId(`state-${CB1}`).textContent).toContain("live");
  });

  it("no button on the page starts a baseline, a fill or a read", () => {
    const { container } = renderTable([co("live1", "Riverlane", false)], [inv("live1")]);
    const text = (container.textContent ?? "").toLowerCase();
    for (const banned of ["baseline + research", "ai research", "web baseline", "re-enter", "run fill"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("the score cell reads mojo_scores, not companies.mojo_score", () => {
  it("a company whose cache is 0 and whose newest row is 20 renders 20", () => {
    const brandai = { ...co("brandai", "Brand AI", false), mojo_score: 0 } as unknown as Company;
    const { getByTestId } = renderTable([brandai], [inv("brandai", { score: 20 })]);
    const cell = getByTestId("score-brandai").textContent ?? "";
    // The SCORE is the leading token. Asserting on the whole cell would catch the ".0" in the
    // methodology label, which is why the first version of this assertion was wrong.
    expect(/^\s*(\d+)/.exec(cell)?.[1]).toBe("20");
    expect(cell).toContain("outside-v1.1.0");
  });
});

describe("the Δ cell", () => {
  it("renders signed to one decimal with the right tone", () => {
    const { getByTestId } = renderTable([co("up", "Up", false)], [inv("up", { score: 21, previous: 19 })]);
    expect(getByTestId("delta-up").textContent).toBe("+2.0");
    expect(getByTestId("delta-up").getAttribute("data-tone")).toBe("positive");
    expect(getByTestId("delta-up").getAttribute("title")).toContain("vs 19 on 2026-09-01");
  });

  it("a fall renders negative, a flat run renders 0.0", () => {
    const down = renderTable([co("dn", "Dn", false)], [inv("dn", { score: 13, previous: 14.5 })]);
    expect(down.getByTestId("delta-dn").textContent).toBe("−1.5");
    expect(down.getByTestId("delta-dn").getAttribute("data-tone")).toBe("negative");
    const flat = renderTable([co("fl", "Fl", false)], [inv("fl", { score: 20, previous: 20 })]);
    expect(flat.getByTestId("delta-fl").textContent).toBe("0.0");
    expect(flat.getByTestId("delta-fl").getAttribute("data-tone")).toBe("flat");
  });

  it("a single-reading company renders an em dash with no tone", () => {
    const { getByTestId } = renderTable([co("one", "One", false)], [inv("one", { score: 20 })]);
    expect(getByTestId("delta-one").textContent).toBe("—");
    expect(getByTestId("delta-one").getAttribute("data-tone")).toBe("none");
    expect(getByTestId("delta-one").getAttribute("title")).toBeNull();
  });
});

describe("Gate 3 cells are honest empties", () => {
  it("both costs read 'not captured yet', never 0", () => {
    const { getByTestId } = renderTable([co("c", "C", false)], [inv("c")]);
    expect(getByTestId("delta-c").textContent).toBe("—");
    expect(getByTestId("lastcost-c").textContent).toBe("not captured yet");
    expect(getByTestId("totalcost-c").textContent).toBe("not captured yet");
    expect(getByTestId("lastupdate-c").textContent).toBe("never");
  });
});
