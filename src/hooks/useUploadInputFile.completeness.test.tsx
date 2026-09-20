// Gate B guard (u) — R15 (2026-09-19): an interview upload never toggles an input checklist subitem (the
// hook's single-item convenience at useInputs.ts) — so completeness never moves from the client side; an
// ordinary upload still toggles it as before. Plant: the toggle restored for interviews → an update lands.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const CALLS = vi.hoisted(() => ({ subitemUpdates: [] as Array<Record<string, unknown>>, inserts: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const b: Record<string, unknown> = {};
    b.insert = () => { CALLS.inserts.push(name); return b; };
    b.select = () => b;
    b.single = () => Promise.resolve({ data: { id: "f-new", file_path: "p", uploaded_at: "2026-09-19T00:00:00Z" }, error: null });
    b.eq = () => b;
    b.order = () => Promise.resolve({ data: name === "input_subitems" ? [{ id: "sub-1", done: false }] : [], error: null }); // ONE undone subitem
    b.update = (patch: Record<string, unknown>) => { if (name === "input_subitems") CALLS.subitemUpdates.push(patch); return { eq: () => Promise.resolve({ error: null }) }; };
    return b;
  };
  return { supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) }, from: (t: string) => table(t), storage: { from: () => ({ upload: () => Promise.resolve({ error: null }), remove: () => Promise.resolve({ error: null }) }) } } };
});
import { useUploadInputFile } from "./useInputs";
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const file = (name: string) => new File(["FIXTURE (not a transcript)"], name, { type: "text/plain" });

describe("useUploadInputFile — subitems and completeness (R15)", () => {
  it("(u) an interview upload leaves the single undone subitem untouched", async () => {
    CALLS.subitemUpdates.length = 0;
    const { result } = renderHook(() => useUploadInputFile(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ inputId: "in-1", inputKey: "customer-research", companyName: "Co", file: file("fixture-interview.txt"), tags: [], isInterview: true }); });
    expect(CALLS.subitemUpdates).toEqual([]);
  });
  it("an ordinary upload still marks the single undone subitem done (unchanged behaviour)", async () => {
    CALLS.subitemUpdates.length = 0;
    const { result } = renderHook(() => useUploadInputFile(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ inputId: "in-1", inputKey: "k", companyName: "Co", file: file("ordinary.pdf"), tags: [] }); });
    expect(CALLS.subitemUpdates).toEqual([{ done: true }]);
  });
});
