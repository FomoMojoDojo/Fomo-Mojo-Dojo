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
    // the cell now carries the methodology tag too, so assert the number, not the whole cell
    expect(getByTestId("delta-up").textContent).toBe("+2.0outside");
    expect(getByTestId("delta-up").textContent?.startsWith("+2.0")).toBe(true);
    expect(getByTestId("delta-up").getAttribute("data-tone")).toBe("positive");
    expect(getByTestId("delta-up").getAttribute("title")).toContain("vs 19 on 2026-09-01");
  });

  it("a fall renders negative, a flat run renders 0.0", () => {
    const down = renderTable([co("dn", "Dn", false)], [inv("dn", { score: 13, previous: 14.5 })]);
    expect(down.getByTestId("delta-dn").textContent?.startsWith("−1.5")).toBe(true);
    expect(down.getByTestId("delta-dn").getAttribute("data-tone")).toBe("negative");
    const flat = renderTable([co("fl", "Fl", false)], [inv("fl", { score: 20, previous: 20 })]);
    expect(flat.getByTestId("delta-fl").textContent?.startsWith("0.0")).toBe(true);
    expect(flat.getByTestId("delta-fl").getAttribute("data-tone")).toBe("flat");
  });

  it("a single-reading company renders an em dash with no tone", () => {
    const { getByTestId } = renderTable([co("one", "One", false)], [inv("one", { score: 20 })]);
    expect(getByTestId("delta-one").textContent).toBe("—");
    expect(getByTestId("delta-one").getAttribute("data-tone")).toBe("none");
    expect(getByTestId("delta-one").getAttribute("title")).toBeNull();
  });
});

describe("the Δ methodology tag", () => {
  it("an internal-newest company is tagged 'internal', an outside one 'outside'", () => {
    const mk = (id: string, methodology: string) =>
      buildInventory({
        companies: [{ id, name: id, website: null, frozen: false }],
        mojoScores: [
          { company_id: id, total_score: 35, methodology_version: methodology, computed_at: "2026-07-10T05:56:00.000Z" },
          { company_id: id, total_score: 35, methodology_version: methodology, computed_at: "2026-07-09T00:00:00.000Z" },
        ],
        integrity: [], ownWords: [], deltas: [], reads: [], recurrence: [], baselines: [], ledger: [],
      })[0];
    // FomoMojoDojo's real shape: its newest row is the INTERNAL methodology while most of the fleet
    // is on the outside one, so the column mixes two scales and the cell must say which.
    const internal = renderTable([co("fmd", "FomoMojoDojo", false)].map((x) => ({ ...x, id: "fmd" })), [mk("fmd", "v1.1.0")]);
    expect(internal.getByTestId("delta-tag-fmd").textContent).toBe("internal");
    const outside = renderTable([{ ...co("out", "Out", false), id: "out" }], [mk("out", "outside-v1.1.0")]);
    expect(outside.getByTestId("delta-tag-out").textContent).toBe("outside");
  });

  it("a single-reading company has no tag at all", () => {
    const { queryByTestId } = renderTable([co("one", "One", false)], [inv("one", { score: 20 })]);
    expect(queryByTestId("delta-tag-one")).toBeNull();
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

// ── the read-only variant (the /preview/client-refine landing mount) ─────────────────────────────
// One component, two mounts. The read-only inventory law says this surface reports and does not act,
// so the variant renders NO action column at all rather than disabled buttons: an action that cannot
// be taken should not be drawn.
describe("readonly variant — row click only", () => {
  const rows = [co("live1", "Riverlane", false), co(CB1, "Cafe Barra", true)];
  const invs = [inv("live1"), inv(CB1, { frozen: true })];

  function renderReadOnly(onRowClick = () => {}) {
    return render(
      <MemoryRouter>
        <InventoryTable
          variant="readonly"
          companies={rows}
          inventory={new Map(invs.map((r) => [r.id, r]))}
          inventoryLoading={false}
          activeCompanyId={null}
          runLocksByCompany={{}}
          userId="u1"
          labelForUser={(id) => id}
          busyIds={{ researchingId: null, baselineId: null, comboId: null }}
          onSelect={() => {}}
          onCancelLock={() => {}}
          onRowClick={onRowClick}
        />
      </MemoryRouter>,
    );
  }

  it("renders NO action column and NO mutating control", () => {
    const { container, queryByTestId } = renderReadOnly();
    expect(container.textContent).not.toContain("Actions");
    expect(queryByTestId("delete-live1")).toBeNull();
    expect(queryByTestId(`delete-${CB1}`)).toBeNull();
    expect(container.querySelectorAll("button[disabled]")).toHaveLength(0);
  });

  it("a row click reports the company id", () => {
    const seen: string[] = [];
    const { getByText } = renderReadOnly((id) => seen.push(id));
    (getByText("Riverlane") as HTMLElement).click();
    expect(seen).toEqual(["live1"]);
  });

  it("a FROZEN row is still clickable — viewing is allowed — and still visibly frozen", () => {
    const seen: string[] = [];
    const { getByText, getByTestId } = renderReadOnly((id) => seen.push(id));
    expect(getByTestId(`company-row-${CB1}`).getAttribute("data-frozen")).toBe("true");
    expect(getByTestId(`state-${CB1}`).textContent).toContain("frozen");
    (getByText("Cafe Barra") as HTMLElement).click();
    expect(seen).toEqual([CB1]);   // navigating to view it is fine…
  });

  it("…and the frozen row still exposes no mutating action to enable", () => {
    const { container } = renderReadOnly();
    expect(container.textContent).not.toContain("Delete");
    for (const banned of ["baseline + research", "ai research", "web baseline", "re-enter"]) {
      expect((container.textContent ?? "").toLowerCase()).not.toContain(banned);
    }
  });

  it("the admin variant still renders its actions — one component, two behaviours", () => {
    const { getByTestId, container } = renderTable(rows, invs);
    expect(container.textContent).toContain("Actions");
    expect(getByTestId("delete-live1")).toBeTruthy();
  });
});
