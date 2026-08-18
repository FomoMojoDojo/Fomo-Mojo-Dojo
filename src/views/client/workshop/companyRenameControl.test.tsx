// Edit-company-name (in-place ruling 2026-08-18) — committing the edit IS the
// confirmation: Enter (or Done) renames immediately (UPDATE + audit + toast),
// Escape / blur-without-change cancels, empty/unchanged is a no-op cancel.
// The collision warn still interposes (two-Edgewoods guard). The frozen path
// renders the DB trigger's refusal verbatim (fixture with frozen=true — the
// test never touches CB1). Strings asserted byte-exact against the signed set.

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import {
  CompanyRenameControlBase,
  RENAME_LABEL,
  RENAME_CAPTION,
  collisionWarnText,
  RENAME_SUCCESS_TOAST,
} from "./CompanyRenameControl";

const FROZEN_REFUSAL =
  "This is a frozen reference company — its record is preserved and is not modified.";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    findCollision: vi.fn().mockResolvedValue(null),
    renameCompany: vi.fn().mockResolvedValue(null),
    recordRenameEvent: vi.fn().mockResolvedValue(null),
    notifySuccess: vi.fn(),
    ...overrides,
  };
}

function openEditor(newName: string) {
  fireEvent.click(screen.getByLabelText(RENAME_LABEL));
  const input = screen.getByLabelText("New company name");
  fireEvent.change(input, { target: { value: newName } });
  return input;
}

describe("CompanyRenameControl (in-place)", () => {
  it("Enter commits immediately: UPDATE + audit row (no reason) + signed toast — no dialog", async () => {
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
    const input = openEditor("Edgewood Partners");

    // string 2's surviving sentence renders as a caption WHILE editing
    expect(screen.getByText(RENAME_CAPTION)).toBeTruthy();
    expect(RENAME_CAPTION).toBe(
      "Existing documents and generated analysis keep the name as it was written at the time.",
    );

    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalledWith(COMPANY_ID, "Edgewood Partners"));
    expect(deps.recordRenameEvent).toHaveBeenCalledWith({
      companyId: COMPANY_ID,
      previousName: "Edgewood",
      newName: "Edgewood Partners",
      actorId: ACTOR_ID,
    });
    expect(deps.notifySuccess).toHaveBeenCalledWith(RENAME_SUCCESS_TOAST);
    expect(RENAME_SUCCESS_TOAST).toBe("Company renamed. Past documents keep the historical name.");
    expect(refetchCompany).toHaveBeenCalled();
    // editor closed, header restored
    await waitFor(() => expect(screen.queryByLabelText("New company name")).toBeNull());
  });

  it("Done commits too", async () => {
    const deps = makeDeps();
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    openEditor("Edgewood Partners");
    fireEvent.click(screen.getByText("Done"));
    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalledWith(COMPANY_ID, "Edgewood Partners"));
  });

  it("Escape cancels with zero writes", async () => {
    const deps = makeDeps();
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    const input = openEditor("Edgewood Partners");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("New company name")).toBeNull());
    expect(deps.findCollision).not.toHaveBeenCalled();
    expect(deps.renameCompany).not.toHaveBeenCalled();
  });

  it("blur-without-change cancels; empty and unchanged commits are no-op cancels", async () => {
    const deps = makeDeps();
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    // unchanged draft + blur → cancels
    const input = openEditor("Edgewood");
    fireEvent.blur(input);
    await waitFor(() => expect(screen.queryByLabelText("New company name")).toBeNull());

    // empty commit → no-op cancel, no error ceremony
    const input2 = openEditor("   ");
    fireEvent.keyDown(input2, { key: "Enter" });
    await waitFor(() => expect(screen.queryByLabelText("New company name")).toBeNull());
    expect(deps.findCollision).not.toHaveBeenCalled();
    expect(deps.renameCompany).not.toHaveBeenCalled();
  });

  it("collision interposes the signed warn; Rename anyway proceeds, Cancel closes", async () => {
    const deps = makeDeps({
      findCollision: vi.fn().mockResolvedValue({
        id: "33333333-3333-4333-8333-333333333333",
        name: "Edgewood",
        website: "https://edgewood.com",
      }),
    });
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Egdewood" actorId={ACTOR_ID} deps={deps} />,
    );
    const input = openEditor("Edgewood");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() =>
      expect(
        screen.getByText(
          'Another company is already named "Edgewood" (https://edgewood.com). Renaming will make these indistinguishable by name.',
        ),
      ).toBeTruthy(),
    );
    expect(collisionWarnText("Edgewood", "https://edgewood.com")).toBe(
      'Another company is already named "Edgewood" (https://edgewood.com). Renaming will make these indistinguishable by name.',
    );
    // no rename happened yet — the warn interposed
    expect(deps.renameCompany).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Rename anyway"));
    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalledWith(COMPANY_ID, "Edgewood"));
  });

  it("self-match is not a collision", async () => {
    const deps = makeDeps({
      findCollision: vi.fn().mockResolvedValue({ id: COMPANY_ID, name: "Edgewood", website: null }),
    });
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="EDGEWOOD" actorId={ACTOR_ID} deps={deps} />,
    );
    const input = openEditor("Edgewood");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(deps.renameCompany).toHaveBeenCalledWith(COMPANY_ID, "Edgewood"));
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
    const input = openEditor("Renamed Fixture Co");
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.getByText(FROZEN_REFUSAL)).toBeTruthy());
    expect(deps.recordRenameEvent).not.toHaveBeenCalled();
    expect(deps.notifySuccess).not.toHaveBeenCalled();
    // editor stays open so the operator can Escape out
    expect(screen.getByLabelText("New company name")).toBeTruthy();
  });

  it("audit failure after a landed rename is reported honestly", async () => {
    const deps = makeDeps({
      recordRenameEvent: vi.fn().mockResolvedValue("insert refused"),
    });
    render(
      <CompanyRenameControlBase companyId={COMPANY_ID} companyName="Edgewood" actorId={ACTOR_ID} deps={deps} />,
    );
    const input = openEditor("Edgewood Partners");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByText("Renamed, but the audit event failed: insert refused")).toBeTruthy(),
    );
    expect(deps.notifySuccess).not.toHaveBeenCalled();
  });

  it("signed label is byte-exact", () => {
    expect(RENAME_LABEL).toBe("Edit company name");
  });
});
