// First Read outside-only — the deltaState read DROPS any say-vs-see delta whose declared claim is
// uploaded-document-derived. Because useFirstReadCapture is the sole item source for the rail AND
// the export, this one filter covers both. Falsification: the file-derived delta must NOT appear in
// `items`; a public/told-us delta must.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const DELTAS = [
  { id: "d1", delta_type: "echoed", content_identity: "delta-doc", declared_claim_id: "doc-claim", public_claim_id: "pubA" },
  { id: "d2", delta_type: "echoed", content_identity: "delta-ok", declared_claim_id: "ok-claim", public_claim_id: "pubB" },
];
// doc-claim is backed by an uploaded_file signal → document-derived → excluded. ok-claim is public.
const PROV_REFS = [
  { claim_id: "doc-claim", signal_id: "sig-file" },
  { claim_id: "ok-claim", signal_id: "sig-pub" },
];
const SIGNALS_SRC = [
  { id: "sig-file", source_type: "uploaded_file" },
  { id: "sig-pub", source_type: "public_baseline_run" },
];
const CLAIMS = [
  { id: "doc-claim", statement: "doc declared", provenance: "internal_declared" },
  // PUBLIC-ONLY ruling (2026-08-20): the kept delta's declared side must be a PUBLIC
  // claim — internal_declared no longer renders anywhere in First Read.
  { id: "ok-claim", statement: "ok declared", provenance: "public_observed" },
  { id: "pubA", statement: "public A", provenance: "public_observed" },
  { id: "pubB", statement: "public B", provenance: "public_observed" },
];

vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));
vi.mock("@/hooks/useStandingFindings", () => { const R = { data: { findings: [] }, isLoading: false, error: null }; return { useStandingFindings: () => R }; });
vi.mock("@/hooks/useMarketOptions", () => { const R = { options: [], loading: false, error: null }; return { useMarketOptions: () => R }; });
vi.mock("@/hooks/usePositioningCanvas", () => { const R = { item: null, loading: false, error: null }; return { usePositioningCanvas: () => R }; });

vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    let sel = "";
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: (s: string) => { sel = s; return b; },
      eq: () => b, in: () => b, not: () => b, order: () => b, limit: () => b, gte: () => b, or: () => b, abortSignal: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      then: (res: (v: { data: unknown[]; error: null }) => unknown) => {
        let data: unknown[] = [];
        if (table === "claim_deltas") data = DELTAS;
        else if (table === "claims") data = CLAIMS;
        else if (table === "claim_signal_refs") data = PROV_REFS;
        else if (table === "signals") data = sel.includes("source_type") ? SIGNALS_SRC : [];
        return res({ data, error: null });
      },
    };
    return b;
  };
  return { supabase: { from: (t: string) => make(t), auth: { getUser: async () => ({ data: { user: null } }) } } };
});

import { useFirstReadCapture } from "./useFirstReadCapture";

describe("useFirstReadCapture — provenance filter (outside-only)", () => {
  it("drops the document-derived delta; keeps the public/told-us one", async () => {
    const { result } = renderHook(() => useFirstReadCapture("co-1", undefined));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(0));
    const ids = result.current.items.map((i) => i.identity);
    expect(ids).toContain("delta-ok");    // public-backed → renders
    expect(ids).not.toContain("delta-doc"); // uploaded-file-backed → structurally excluded
  });
});
