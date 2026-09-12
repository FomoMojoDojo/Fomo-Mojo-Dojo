// DriftDetailPanel "Accept as aligned" gate (ruling 1, Opportunities Tier 1, 2026-09-12): the action is
// gated on governance.drift.review on every surface that opens the panel. drift.review false ⇒ the
// button is disabled and a click reaches no write; true ⇒ the click calls acceptAsAligned and the
// panel refreshes + closes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import DriftDetailPanel from "./DriftDetailPanel";

const caps = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useCapability", () => ({ useCapability: () => caps.value }));
const drift = vi.hoisted(() => ({
  acceptAsAligned: vi.fn(async () => {}),
  assessment: {
    id: "da-1", company_id: "c1", surface_type: "opportunity", surface_id: "need-1", drift_state: "slight_drift", drift_score: 0.4,
    assessment_basis: { new_signals: [] }, last_assessed_at: "2026-09-01T00:00:00Z", operator_seen_at: "2026-09-01T00:00:00Z", accepted_as_aligned_at: null,
  },
}));
vi.mock("@/hooks/useDriftAssessment", () => ({
  useDriftAssessment: () => ({ assessment: drift.assessment, isLoading: false, error: null, markSeen: async () => {}, acceptAsAligned: drift.acceptAsAligned, setAssessment: () => {} }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const accept = () => document.querySelector('[data-testid="drift-accept-aligned"]') as HTMLButtonElement | null;

beforeEach(() => { caps.value = true; drift.acceptAsAligned.mockClear(); });

describe("DriftDetailPanel Accept as aligned gate", () => {
  it("drift.review false ⇒ disabled; a click reaches no write", async () => {
    caps.value = false;
    const onRefresh = vi.fn();
    render(<DriftDetailPanel open onClose={() => {}} surfaceType="opportunity" surfaceId="need-1" onRefresh={onRefresh} />);
    await waitFor(() => expect(accept()).toBeTruthy());
    expect(accept()!.disabled).toBe(true);
    fireEvent.click(accept()!);
    expect(drift.acceptAsAligned).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("drift.review true ⇒ enabled; the click calls acceptAsAligned, refreshes and closes", async () => {
    const onRefresh = vi.fn();
    const onClose = vi.fn();
    render(<DriftDetailPanel open onClose={onClose} surfaceType="opportunity" surfaceId="need-1" onRefresh={onRefresh} />);
    await waitFor(() => expect(accept()).toBeTruthy());
    expect(accept()!.disabled).toBe(false);
    fireEvent.click(accept()!);
    await waitFor(() => expect(drift.acceptAsAligned).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalled();
  });
});
