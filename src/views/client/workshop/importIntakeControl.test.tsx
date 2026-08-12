// Fix B — ImportIntakeControl renders honest per-row results and passes
// allow_pipeline=false (import only; never triggers run-agent-flow).

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import ImportIntakeControl, { IMPORT_INTAKE_LABEL } from "./ImportIntakeControl";

describe("ImportIntakeControl", () => {
  it("invokes the importer with allow_pipeline=false and renders per-row results", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        processed: 3,
        results: [
          { id: "aaaaaaaa-1111", status: "imported", company_id: "fd3f7f63-2222", pipeline: "skipped" },
          { id: "bbbbbbbb-3333", status: "failed", reason: "frozen_match", company: "Cafe Barra" },
          { id: "cccccccc-4444", status: "failed", error: "boom" },
        ],
      },
      error: null,
    });
    render(<ImportIntakeControl invoke={invoke} />);
    fireEvent.click(screen.getByText(IMPORT_INTAKE_LABEL));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("import-intake-submissions", { body: { allow_pipeline: false } });

    await waitFor(() => expect(screen.getByText(/Processed 3: 1 imported, 2 failed\./)).toBeTruthy());
    // honest, distinct rendering per outcome
    expect(screen.getByText(/imported \(fd3f7f63/)).toBeTruthy();
    expect(screen.getByText(/refused: frozen reference company Cafe Barra/)).toBeTruthy();
    expect(screen.getByText(/failed: boom/)).toBeTruthy();
  });

  it("shows the empty state when nothing is pending", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { processed: 0, results: [] }, error: null });
    render(<ImportIntakeControl invoke={invoke} />);
    fireEvent.click(screen.getByText(IMPORT_INTAKE_LABEL));
    await waitFor(() => expect(screen.getByText("No pending submissions.")).toBeTruthy());
  });

  it("surfaces a function error honestly (e.g. missing hosted secrets)", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: { error: "Missing HOSTED_INTAKE_URL / HOSTED_INTAKE_SERVICE_KEY secrets." },
      error: null,
    });
    render(<ImportIntakeControl invoke={invoke} />);
    fireEvent.click(screen.getByText(IMPORT_INTAKE_LABEL));
    await waitFor(() => expect(screen.getByText(/Missing HOSTED_INTAKE_URL/)).toBeTruthy());
  });
});
