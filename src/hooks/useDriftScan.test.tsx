// useDriftScan gated wrappers (MOVED from ClientRefinePreviewWorkshopView.handleCheckSurfaceDrift /
// handleScanAllSurfaces in the Opportunities Tier 1 lift, 2026-09-12). Proves, against a supabase
// stub: gate false ⇒ zero invokes and no toast; success ⇒ the invoke body the view always sent, the
// caller's badge bump, and the view's exact toast text; failure ⇒ the view's exact error toast.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDriftScan } from "./useDriftScan";

const invoke = vi.hoisted(() => vi.fn(async (_fn: string, _opts: unknown) => ({ data: { assessed: 1, aligned: 0, slight_drift: 1, material_drift: 0 }, error: null })));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

beforeEach(() => { invoke.mockClear(); toasts.success.mockClear(); toasts.error.mockClear(); });

describe("useDriftScan.checkSurfaceGated", () => {
  it("gate false ⇒ zero invokes, no toast, no bump", async () => {
    const onAssessed = vi.fn();
    const { result } = renderHook(() => useDriftScan("c1", { canScan: false, onAssessed }));
    await act(async () => { result.current.checkSurfaceGated("opportunity", "need-1"); });
    expect(invoke).not.toHaveBeenCalled();
    expect(toasts.success).not.toHaveBeenCalled();
    expect(onAssessed).not.toHaveBeenCalled();
  });

  it("gate true ⇒ assess-surface-drift {company_id, surface_type, surface_id}, bump, and the view's toast", async () => {
    const onAssessed = vi.fn();
    const { result } = renderHook(() => useDriftScan("c1", { canScan: true, onAssessed }));
    await act(async () => { result.current.checkSurfaceGated("opportunity", "need-1"); });
    expect(invoke).toHaveBeenCalledWith("assess-surface-drift", { body: { company_id: "c1", surface_type: "opportunity", surface_id: "need-1" } });
    expect(onAssessed).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith("Checked opportunity · slight drift", { duration: 4000 });
  });

  it("invoke error ⇒ the view's error toast, no bump", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new Error("Edge Function returned a non-2xx status code") } as never);
    const onAssessed = vi.fn();
    const { result } = renderHook(() => useDriftScan("c1", { canScan: true, onAssessed }));
    await act(async () => { result.current.checkSurfaceGated("opportunity", "need-1"); });
    expect(toasts.error).toHaveBeenCalledWith("Check failed — Edge Function returned a non-2xx status code", { duration: 5000 });
    expect(onAssessed).not.toHaveBeenCalled();
  });
});

describe("useDriftScan.scanAllGated", () => {
  it("gate false ⇒ zero invokes", async () => {
    const { result } = renderHook(() => useDriftScan("c1", { canScan: false }));
    await act(async () => { result.current.scanAllGated({ onStatus: vi.fn(), onError: vi.fn() }); });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("gate true ⇒ company-wide invoke, error cleared, status handed back, the view's toast", async () => {
    const onStatus = vi.fn();
    const onError = vi.fn();
    const onAssessed = vi.fn();
    const { result } = renderHook(() => useDriftScan("c1", { canScan: true, onAssessed }));
    await act(async () => { result.current.scanAllGated({ onStatus, onError }); });
    expect(invoke).toHaveBeenCalledWith("assess-surface-drift", { body: { company_id: "c1" } });
    expect(onError).toHaveBeenCalledWith(null);
    expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ assessed: 1, slight_drift: 1 }));
    expect(onStatus.mock.calls[0][0].scannedAt).toBeInstanceOf(Date);
    expect(onAssessed).toHaveBeenCalledTimes(1);
    expect(toasts.success).toHaveBeenCalledWith("Scanned · 1 surface · 1 with drift", { duration: 4000 });
  });
});
