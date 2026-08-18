// Edit-company-name (design gate 2026-08-18) — rename happy path writes name +
// audit row; collision soft-warn fires on a duplicate name; the frozen path
// renders the DB trigger's refusal verbatim (fixture with frozen=true — the
// test never touches CB1). Strings asserted byte-exact against the signed set.

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import {
  CompanyRenameControlBase,
  RENAME_LABEL,
  renameConfirmText,
  collisionWarnText,
  RENAME_SUCCESS_TOAST,
} from "./CompanyRenameControl";

const FROZEN_REFUSAL =
  "This is a frozen reference company — its record is preserved and is not modified.";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function makeDeps(overrides: Partial<Parameters<typeof CompanyRenameControlBase>[0]["deps"] & object> = {}) {
  return {
    findCollision: vi.fn().mockResolvedValue(null),
    renameCompany: vi.fn().mockResolvedValue(null),
    recordRenameEvent: vi.fn().mockResolvedValue(null),
    notifySuccess: vi.fn(),
    ...overrides,
  };
}

async function driveToConfirm(newName: string) {
  fireEvent.click(screen.getByText(`✎ ${RENAME_LABEL}`));
  const input = screen.getByLabelText("New company name");
  fireEvent.change(input, { target: { value: newName } });
  fireEvent.click(screen.getByText("Save"));
  await waitFor(() => expect(screen.getByText("Confirm rename")).toBeTruthy());
}

describe("CompanyRenameControl", () => {
  it("happy path: confirm writes the name, records the audit event, toasts the signed string", async () => {
    const deps = makeDeps();
    const refetchCompany = vi.fn();
    render(
      <CompanyRenameControlBase
        companyId={COMPANY_ID}
        companyName="Edgewood"
        actorId={ACTOR_ID}
        refetchCompany={refetchCompany}
        deps={deps}
      />,
    );
    await driveToConfirm("Edgewood Partners");

    // signed confirm string, byte-exact
    expect(
      screen.getByText(
        'Rename "Edgewood" to "Edgewood Partners"? Existing documents and generated analysis keep the name as it was written at the time.',
      ),
    ).toBeTruthy();
    expect(renameConfirmText("Edgewood", "Edgewood Partners")).toBe(
      'Rename "Edgewood" to "Edgewood Partners"? Existing documents and generated analysis keep the name as it was written at the time.',
    );

    fireEvent.change(screen.getByLabelText("Rename reason (optional)"), {
      target: { value: "typo fix" },
    });
    fireEvent.click(screen.getByText("Confirm rename"));

    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalledWith(COMPANY_ID, "Edgewood Partners"));
    expect(deps.recordRenameEvent).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      previousName: "Edgewood",
      newName: "Edgewood Partners",
      actorId: ACTOR_ID,
      reason: "typo fix",
    });
    expect(deps.notifySuccess).toHaveBeenCalledWith(RENAME_SUCCESS_TOAST);
    expect(RENAME_SUCCESS_TOAST).toBe("Company renamed. Past documents keep the historical name.");
    expect(refetchCompany).toHaveBeenCalled();
  });

  it("collision soft-warn: duplicate name shows the signed warning and does NOT block confirm", async () => {
    const deps = makeDeps({
      findCollision: vi.fn().mockResolvedValue({
        id: "33333333-3333-4333-8333-333333333333",
        name: "Edgewood",
        website: "https://edgewood.com",
      }),
    });
    render(
      <CompanyRenameControlBase
        companyId={COMPANY_ID}
        companyName="Egdewood"
        actorId={ACTOR_ID}
        deps={deps}
      />,
    );
    await driveToConfirm("Edgewood");

    expect(
      screen.getByText(
        'Another company is already named "Edgewood" (https://edgewood.com). Renaming will make these indistinguishable by name.',
      ),
    ).toBeTruthy();
    expect(collisionWarnText("Edgewood", "https://edgewood.com")).toBe(
      'Another company is already named "Edgewood" (https://edgewood.com). Renaming will make these indistinguishable by name.',
    );
    // soft-warn: confirm still available and proceeds
    fireEvent.click(screen.getByText("Confirm rename"));
    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalled());
  });

  it("self-match is not a collision: renaming back to a near-identical own name shows no warning", async () => {
    const deps = makeDeps({
      findCollision: vi.fn().mockResolvedValue({ id: COMPANY_ID, name: "Edgewood", website: null }),
    });
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="EDGEWOOD" actorId={ACTOR_ID} deps={deps} />,
    );
    await driveToConfirm("Edgewood");
    expect(screen.queryByText(/Another company is already named/)).toBeNull();
  });

  it("frozen path: the trigger's refusal renders verbatim; no audit row, no toast (fixture, never CB1)", async () => {
    const deps = makeDeps({
      renameCompany: vi.fn().mockResolvedValue(FROZEN_REFUSAL), // what supabase surfaces from the trigger
    });
    render(
      <CompanyRenameControlBase
        companyId={COMPANY_ID}
        companyName="Frozen Fixture Co"
        actorId={ACTOR_ID}
        deps={deps}
      />,
    );
    await driveToConfirm("Renamed Fixture Co");
    fireEvent.click(screen.getByText("Confirm rename"));

    await waitFor(() => expect(screen.getByText(FROZEN_REFUSAL)).toBeTruthy());
    expect(deps.recordRenameEvent).not.toHaveBeenCalled();
    expect(deps.notifySuccess).not.toHaveBeenCalled();
  });

  it("empty name is refused inline; unchanged name is a silent no-op", async () => {
    const deps = makeDeps();
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    fireEvent.click(screen.getByText(`✎ ${RENAME_LABEL}`));
    fireEvent.change(screen.getByLabelText("New company name"), { target: { value: "   " } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("Company name cannot be empty.")).toBeTruthy());
    expect(deps.findCollision).not.toHaveBeenCalled();

    // unchanged name closes the editor without any write
    fireEvent.change(screen.getByLabelText("New company name"), { target: { value: "Edgewood" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.queryByLabelText("New company name")).toBeNull());
    expect(deps.renameCompany).not.toHaveBeenCalled();
  });

  it("audit failure after a landed rename is reported honestly", async () => {
    const deps = makeDeps({
      recordRenameEvent: vi.fn().mockResolvedValue("insert refused"),
    });
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    await driveToConfirm("Edgewood Partners");
    fireEvent.click(screen.getByText("Confirm rename"));
    await waitFor(() =>
      expect(screen.getByText("Renamed, but the audit event failed: insert refused")).toBeTruthy(),
    );
    expect(deps.notifySuccess).not.toHaveBeenCalled();
  });

  it("signed label is byte-exact", () => {
    expect(RENAME_LABEL).toBe("Edit company name");
  });
});
