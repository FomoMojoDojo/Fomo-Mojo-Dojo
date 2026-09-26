// B1 (Notion "Client Portals" sync) — the section's laws.
//
// Every signed string is asserted BYTE-EXACT against the signed literal written out here in full,
// not against the constant the component imports: a test that reads CLIENT_PORTAL_STRINGS would
// still pass if someone edited the string, which is the one thing these assertions exist to catch.
//
// Each guard is red-proved in the B1 report by planting one difference, seeing the named assertion
// fail, and removing it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import * as fs from "node:fs";
import * as path from "node:path";
import { ClientPortalSection } from "./ClientPortalSection";
import {
  emptyLink,
  type ClientPortalDeps,
  type ClientPortalLinkRow,
  type ClientStatus,
  type SaveLinkArgs,
  type SaveLinkResult,
} from "./clientPortalLink";

// ── the signed strings, written out here as the operator signed them ────────────────────────────
const SIGNED = {
  title: "Client portal (Notion)",
  switchLabel: "Track in Notion",
  statusLabel: "Client status",
  notLinked: "Not linked yet — the next sync creates the Notion row.",
  staleSave: "This status changed before your save — showing the saved status.",
};
const SIGNED_STATUSES = [
  "Cold Intake",
  "Web Intake",
  "Map Created",
  "In Progress",
  "Completed",
  "On Hold",
  "Ongoing",
];

// The repo has no @testing-library/user-event dependency, so interactions go through fireEvent —
// the idiom already used by src/lib/firstReadMarks/marks.ui.test.tsx. `act` flushes the async
// handlers the confirm path awaits.
const user = {
  click: async (el: Element) => { await act(async () => { fireEvent.click(el); }); },
  selectOptions: async (el: Element, value: string) => {
    await act(async () => { fireEvent.change(el, { target: { value } }); });
  },
};

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b"; // Edgewood
const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // frozen

type Calls = {
  save: Array<{ companyId: string } & SaveLinkArgs>;
  reads: number;
};

/**
 * Deps over a mutable fake row, recording every argument so "the UI writes two columns" stays
 * testable. B1a: one saveLink stands in for set_client_portal_link — it creates the row if absent,
 * moves both columns together, and on a lost compare-and-set writes NOTHING (B1's three separate
 * calls could leave the `enabled` half stored; one transaction cannot).
 */
function fakeDeps(initial: ClientPortalLinkRow | null, opts: { staleOnce?: boolean } = {}) {
  let row: ClientPortalLinkRow | null = initial;
  let stalePending = opts.staleOnce === true;
  const calls: Calls = { save: [], reads: 0 };
  let nextAuditId = 6000;

  const deps: ClientPortalDeps = {
    readLink: async (companyId) => {
      calls.reads += 1;
      return { row: row ? { ...row } : null, error: null };
    },
    saveLink: async (companyId, args): Promise<SaveLinkResult> => {
      calls.save.push({ companyId, ...args });
      const before = row;
      // R-cas, evaluated before anything is written — the RPC does this under a row lock.
      if (args.setStatus) {
        const storedStatus = before?.client_status ?? null;
        if (stalePending) {
          stalePending = false;
          return { kind: "stale", stored: storedStatus };
        }
        if (storedStatus !== args.expectedStatus) {
          return { kind: "stale", stored: storedStatus };
        }
      }
      const base = before ?? emptyLink(companyId);
      row = {
        ...base,
        enabled: args.enabled === null ? base.enabled : args.enabled,
        client_status: args.setStatus ? args.nextStatus : base.client_status,
        status_changed_at: args.setStatus && args.nextStatus !== base.client_status
          ? "2026-09-25T18:00:00.000Z"
          : base.status_changed_at,
      };
      nextAuditId += 1;
      return { kind: "saved", audit_id: nextAuditId };
    },
  };
  return { deps, calls, current: () => row };
}

const linkedRow = (over: Partial<ClientPortalLinkRow> = {}): ClientPortalLinkRow => ({
  ...emptyLink(CO),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("R-frozen — the section renders nothing for a frozen company", () => {
  it("renders no section, no control and none of the six strings", async () => {
    const { deps, calls } = fakeDeps(linkedRow({ enabled: true, last_synced_at: "2026-09-25T01:02:03.000Z", last_sync_error: "boom", last_sync_error_at: "2026-09-25T01:02:03.000Z" }));
    const { container } = render(<ClientPortalSection companyId={CB1} frozen deps={deps} />);

    expect(container.querySelector('[data-testid="client-portal-section"]')).toBeNull();
    expect(screen.queryByText(SIGNED.title)).toBeNull();
    expect(screen.queryByText(SIGNED.switchLabel)).toBeNull();
    expect(screen.queryByText(SIGNED.statusLabel)).toBeNull();
    expect(screen.queryByText(SIGNED.notLinked)).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    // and it never even asks the database about a frozen company
    expect(calls.reads).toBe(0);
  });
});

describe("the three always-present signed strings render byte-exact", () => {
  it("title, switch label and status label are byte-exact, and the select carries the seven values plus an empty choice", async () => {
    const { deps } = fakeDeps(null);
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);

    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    // byte-exact: getByText with an exact string throws if no node's text is exactly this
    expect(screen.getByText(SIGNED.title).textContent).toBe(SIGNED.title);
    expect(screen.getByText(SIGNED.switchLabel).textContent).toBe(SIGNED.switchLabel);
    expect(screen.getByText(SIGNED.statusLabel).textContent).toBe(SIGNED.statusLabel);

    // C2: the heading is uppercased by CSS so it sits with the page's other eyebrows. The TEXT
    // NODE must stay the signed casing — a JS .toUpperCase() would pass a screenshot and fail the
    // signature, so the assertion is on the node's text plus the computed style, never on one alone.
    const titleNode = screen.getByText(SIGNED.title);
    expect(titleNode.textContent).toBe(SIGNED.title);
    expect(titleNode.textContent).not.toBe(SIGNED.title.toUpperCase());
    expect(titleNode.style.textTransform).toBe("uppercase");

    const select = screen.getByTestId("client-portal-status-select") as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toEqual(["", ...SIGNED_STATUSES]);
    // the seven option LABELS are the signed values verbatim
    expect(Array.from(select.options).slice(1).map((o) => o.textContent)).toEqual(SIGNED_STATUSES);
  });
});

describe("the three conditional signed strings render ONLY in their state", () => {
  it("'Not linked yet' renders when the switch is on and notion_page_id is NULL, and not otherwise", async () => {
    const on = fakeDeps(linkedRow({ enabled: true, notion_page_id: null }));
    const { unmount } = render(<ClientPortalSection companyId={CO} frozen={false} deps={on.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-not-linked")).toBeTruthy());
    expect(screen.getByTestId("client-portal-not-linked").textContent).toBe(SIGNED.notLinked);
    unmount();

    // switch OFF → absent
    const off = fakeDeps(linkedRow({ enabled: false, notion_page_id: null }));
    const r2 = render(<ClientPortalSection companyId={CO} frozen={false} deps={off.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    expect(screen.queryByTestId("client-portal-not-linked")).toBeNull();
    r2.unmount();

    // switch ON but already linked → absent
    const linked = fakeDeps(linkedRow({ enabled: true, notion_page_id: "abc123" }));
    render(<ClientPortalSection companyId={CO} frozen={false} deps={linked.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    expect(screen.queryByTestId("client-portal-not-linked")).toBeNull();
  });

  it("'Last synced {date, time}' renders only when last_synced_at is set, in the viewer's local time", async () => {
    const absent = fakeDeps(linkedRow({ last_synced_at: null }));
    const r1 = render(<ClientPortalSection companyId={CO} frozen={false} deps={absent.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    expect(screen.queryByTestId("client-portal-last-synced")).toBeNull();
    r1.unmount();

    const iso = "2026-09-25T18:04:05.000Z";
    const present = fakeDeps(linkedRow({ last_synced_at: iso }));
    render(<ClientPortalSection companyId={CO} frozen={false} deps={present.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-last-synced")).toBeTruthy());
    // byte-exact against the signed template, with the date rendered in the VIEWER's local time
    expect(screen.getByTestId("client-portal-last-synced").textContent).toBe(
      `Last synced ${new Date(iso).toLocaleString()}`,
    );
  });

  it("'Sync failed — {reason} · {date, time}' renders only when last_sync_error is set", async () => {
    const absent = fakeDeps(linkedRow({ last_sync_error: null }));
    const r1 = render(<ClientPortalSection companyId={CO} frozen={false} deps={absent.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    expect(screen.queryByTestId("client-portal-sync-failed")).toBeNull();
    r1.unmount();

    const iso = "2026-09-25T18:06:07.000Z";
    const present = fakeDeps(
      linkedRow({ last_sync_error: "Notion 429 rate limited", last_sync_error_at: iso }),
    );
    render(<ClientPortalSection companyId={CO} frozen={false} deps={present.deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-sync-failed")).toBeTruthy());
    expect(screen.getByTestId("client-portal-sync-failed").textContent).toBe(
      `Sync failed — Notion 429 rate limited · ${new Date(iso).toLocaleString()}`,
    );
  });
});

describe("R1 + first save — the switch and the status, confirm-then-save", () => {
  it("staging is inert until Confirm; Confirm upserts the row and writes enabled + client_status", async () => {
    const { deps, calls, current } = fakeDeps(null); // no row yet
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    // no row ⇒ switch off, status empty
    expect((screen.getByTestId("client-portal-track-switch") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("client-portal-status-select") as HTMLSelectElement).value).toBe("");
    expect(screen.queryByTestId("client-portal-confirm")).toBeNull();

    await user.click(screen.getByTestId("client-portal-track-switch"));
    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "In Progress");

    // staged, nothing written
    expect(screen.getByTestId("client-portal-confirm")).toBeTruthy();
    expect(calls.save).toEqual([]);

    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    await waitFor(() => expect(screen.queryByTestId("client-portal-confirm")).toBeNull());
    // B1a: ONE call carries the whole decision — the row's creation, both columns, and the
    // compare-and-set the RPC evaluates under a lock.
    expect(calls.save).toEqual([
      { companyId: CO, enabled: true, setStatus: true, expectedStatus: null, nextStatus: "In Progress" },
    ]);

    const saved = current()!;
    expect(saved.enabled).toBe(true);
    expect(saved.client_status).toBe("In Progress");
    // every sync-owned column still NULL — the UI never writes them
    expect(saved.map_created_set_at).toBeNull();
    expect(saved.last_synced_at).toBeNull();
    expect(saved.last_sync_error).toBeNull();
    expect(saved.last_sync_error_at).toBeNull();

    // and "Not linked yet" now stands, because the switch is on with no Notion row
    expect(screen.getByTestId("client-portal-not-linked").textContent).toBe(SIGNED.notLinked);
  });

  it("Cancel discards the staged change and writes nothing", async () => {
    const { deps, calls } = fakeDeps(linkedRow({ enabled: false, client_status: null }));
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.click(screen.getByTestId("client-portal-track-switch"));
    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "On Hold");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Cancel"));

    expect(screen.queryByTestId("client-portal-confirm")).toBeNull();
    expect((screen.getByTestId("client-portal-track-switch") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("client-portal-status-select") as HTMLSelectElement).value).toBe("");
    expect(calls.save).toEqual([]);
  });

  it("the empty choice saves a NULL status (not set) through the same compare-and-set", async () => {
    const { deps, calls, current } = fakeDeps(linkedRow({ enabled: true, client_status: "Completed" }));
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    await waitFor(() => expect(screen.queryByTestId("client-portal-confirm")).toBeNull());
    expect(calls.save).toEqual([
      { companyId: CO, enabled: null, setStatus: true, expectedStatus: "Completed", nextStatus: null },
    ]);
    expect(current()!.client_status).toBeNull();
  });
});

describe("R-cas — a stale compare-and-set leaves the stored value unchanged", () => {
  it("snaps back to the stored value, writes nothing, and adds no new string", async () => {
    // The row holds 'On Hold'; another writer moved first, so the save comes back stale.
    const { deps, calls, current } = fakeDeps(
      linkedRow({ enabled: true, client_status: "On Hold" }),
      { staleOnce: true },
    );
    const { container } = render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    expect((screen.getByTestId("client-portal-status-select") as HTMLSelectElement).value).toBe("Completed");

    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    // the attempt was made with what this view had read
    await waitFor(() => expect(calls.save.length).toBe(1));
    expect(calls.save[0]).toEqual({
      companyId: CO, enabled: null, setStatus: true, expectedStatus: "On Hold", nextStatus: "Completed",
    });

    // ...and the stored value stands, shown in the select
    await waitFor(() =>
      expect((screen.getByTestId("client-portal-status-select") as HTMLSelectElement).value).toBe("On Hold"),
    );
    expect(current()!.client_status).toBe("On Hold");
    expect(screen.queryByTestId("client-portal-confirm")).toBeNull();

    // NO new string was introduced for this state (the signed set is closed). The only text in the
    // section is the signed strings and the reused control labels.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/stale|conflict|someone else|changed by|try again|refresh/i);
    expect(screen.queryByTestId("client-portal-error")).toBeNull();
  });
});

describe("C3 — the lost compare-and-set says so", () => {
  it("renders byte-exact after a 0-row compare-and-set, and not before any save", async () => {
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }), { staleOnce: true });
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    // absent before any save
    expect(screen.queryByTestId("client-portal-stale-save")).toBeNull();

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    expect(screen.queryByTestId("client-portal-stale-save")).toBeNull(); // still absent while staged
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    await waitFor(() => expect(screen.getByTestId("client-portal-stale-save")).toBeTruthy());
    expect(screen.getByTestId("client-portal-stale-save").textContent).toBe(SIGNED.staleSave);
    // ...and the select shows the SAVED status, which is what the sentence claims
    expect((screen.getByTestId("client-portal-status-select") as HTMLSelectElement).value).toBe("On Hold");
  });

  it("is absent after a save that succeeds", async () => {
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }));
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    await waitFor(() => expect(screen.queryByTestId("client-portal-confirm")).toBeNull());
    expect(screen.queryByTestId("client-portal-stale-save")).toBeNull();
  });

  it("clears on the NEXT successful save", async () => {
    // staleOnce: the first save loses the race, the second wins.
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }), { staleOnce: true });
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("client-portal-stale-save")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Ongoing");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));

    await waitFor(() => expect(screen.queryByTestId("client-portal-stale-save")).toBeNull());
  });

  it("clears on Cancel", async () => {
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }), { staleOnce: true });
    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("client-portal-stale-save")).toBeTruthy());

    // stage something again so Cancel is reachable, then cancel
    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Ongoing");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Cancel"));

    expect(screen.queryByTestId("client-portal-stale-save")).toBeNull();
  });

  // "Clears on reload" has two halves. A real browser reload remounts the component, whose state
  // starts false by construction — nothing to guard there, and a test of it would pass against any
  // implementation (it did: the first draft of this test stayed green with the clearing line
  // deleted). The half that IS load-bearing is a re-read WITHOUT a remount — the effect re-running
  // because the page switched company — so that is what this asserts.
  it("clears when the section re-reads without remounting (company switch)", async () => {
    const OTHER = "dea66de5-647e-45b7-9f13-a9673f641006"; // FomoMojoDojo
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }), { staleOnce: true });
    const { rerender } = render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("client-portal-stale-save")).toBeTruthy());

    await act(async () => {
      rerender(<ClientPortalSection companyId={OTHER} frozen={false} deps={deps} />);
    });
    await waitFor(() => expect(screen.queryByTestId("client-portal-stale-save")).toBeNull());
  });

  it("a fresh mount (a browser reload) starts with no notice", async () => {
    const { deps } = fakeDeps(linkedRow({ enabled: true, client_status: "On Hold" }), { staleOnce: true });
    const { unmount } = render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());

    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed");
    await user.click(within(screen.getByTestId("client-portal-confirm")).getByText("Confirm"));
    await waitFor(() => expect(screen.getByTestId("client-portal-stale-save")).toBeTruthy());
    unmount();

    render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    expect(screen.queryByTestId("client-portal-stale-save")).toBeNull();
  });
});

describe("the closed string set — the section renders no text beyond what was signed", () => {
  it("every text node is a signed string, a signed status value, or a reused control label", async () => {
    const iso = "2026-09-25T18:08:09.000Z";
    const { deps } = fakeDeps(
      linkedRow({
        enabled: true,
        client_status: "In Progress",
        notion_page_id: null,
        last_synced_at: iso,
        last_sync_error: "Notion 500",
        last_sync_error_at: iso,
      }),
    );
    const { container } = render(<ClientPortalSection companyId={CO} frozen={false} deps={deps} />);
    await waitFor(() => expect(screen.getByTestId("client-portal-section")).toBeTruthy());
    await user.selectOptions(screen.getByTestId("client-portal-status-select"), "Completed"); // reveal Confirm/Cancel

    const allowed = new Set<string>([
      SIGNED.title,
      SIGNED.staleSave, // C3 — the seventh signed string, and the only addition to the set
      SIGNED.switchLabel,
      SIGNED.statusLabel,
      SIGNED.notLinked,
      `Last synced ${new Date(iso).toLocaleString()}`,
      `Sync failed — Notion 500 · ${new Date(iso).toLocaleString()}`,
      ...SIGNED_STATUSES,
      "Confirm",
      "Cancel",
      "Saving…",
      "",
    ]);

    const section = screen.getByTestId("client-portal-section");
    const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
    const unexpected: string[] = [];
    while (walker.nextNode()) {
      const t = (walker.currentNode.textContent ?? "").trim();
      if (t && !allowed.has(t)) unexpected.push(t);
    }
    expect(unexpected).toEqual([]);
    expect(container).toBeTruthy();
  });
});

describe("source guards — the column ownership the UI must never break", () => {
  const src = fs.readFileSync(path.join(__dirname, "clientPortalLink.ts"), "utf8");
  const componentSrc = fs.readFileSync(path.join(__dirname, "ClientPortalSection.tsx"), "utf8");

  // B1a (R7) REPLACES the B1 form of this guard, it does not drop it. B1 asserted the law over the
  // module's `.update(` / `.upsert(` payload literals; after B1a there are no such literals — every
  // write goes through set_client_portal_link — so the old form would not weaken, it would FAIL on
  // its own `payloads.length > 0` precondition. The law is unchanged and is now asserted over the
  // RPC's argument list, plus the absence of any direct write. The SQL half of the same law (the
  // function's own UPDATE touches only these two columns) lives in
  // scripts/guards/client-portal-audit-guard.sh, check (s).
  const SYNC_OWNED = [
    "map_created_set_at",
    "last_synced_at",
    "last_sync_error",
    "last_sync_error_at",
    "status_changed_at",
    "notion_page_id",
    "last_notion_status_seen",
  ];

  it("no RPC argument names a sync-owned column or status_changed_at", () => {
    const args = src.match(/\.rpc\(\s*"set_client_portal_link"\s*,\s*\{[^}]*\}/g) ?? [];
    expect(args.length).toBe(1); // exactly one write path
    for (const owned of SYNC_OWNED) expect(args[0]).not.toContain(owned);
    // and the five arguments it does send, named
    for (const p of ["p_company_id", "p_enabled", "p_set_status", "p_expected_status", "p_next_status"]) {
      expect(args[0]).toContain(p);
    }
  });

  it("the client sends no update / upsert / insert against client_portal_links", () => {
    for (const s of [src, componentSrc]) {
      expect(s).not.toMatch(/\.(?:update|upsert|insert)\(/);
    }
    // the only table access left in the module is the read
    expect(src.match(/\.from\("client_portal_links"\)/g)?.length).toBe(1);
    expect(src).toContain(".select(SELECT_COLS)");
  });

  it("the three B1 write deps are gone and saveLink is the only write dep", () => {
    for (const gone of ["ensureRow:", "saveEnabled:", "saveStatus:"]) {
      expect(src).not.toContain(gone);
      expect(componentSrc).not.toContain(`deps.${gone.replace(":", "")}`);
    }
    expect(componentSrc).toContain("deps.saveLink(");
  });

  // B1a REPLACES this guard too. B1 asserted the compare-and-set as a PostgREST spelling of IS NOT
  // DISTINCT FROM (.is(null) / .eq(value)); the predicate has moved into the RPC, where the row is
  // locked first, so the client's remaining duty is narrower and sharper: it must hand the RPC the
  // status IT READ, never the value it is about to write. The predicate itself is asserted in SQL
  // by scripts/guards/client-portal-audit-guard.sh, plant PLANT=stale.
  it("the component sends the status it READ as the compare-and-set expectation", () => {
    expect(componentSrc).toMatch(/expectedStatus:\s*stored\.client_status/);
    // never the staged value — that would compare-and-set against itself and always win
    expect(componentSrc).not.toMatch(/expectedStatus:\s*pendingStatus/);
    expect(componentSrc).not.toMatch(/expectedStatus:\s*shownStatus/);
  });

  it("the component returns null for a frozen company before rendering anything", () => {
    expect(componentSrc).toMatch(/if \(frozen\) return null;/);
  });

  it("companies and program_phase are never touched from this section", () => {
    expect(src).not.toContain("program_phase");
    expect(componentSrc).not.toContain("program_phase");
    expect(src).not.toMatch(/from\("companies"\)/);
    expect(componentSrc).not.toMatch(/from\("companies"\)/);
  });
});
