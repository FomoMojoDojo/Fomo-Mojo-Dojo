// Gate B guard (a) — ruling A1 (2026-09-19): the input_files row of an interview upload is inserted with
// is_interview = true IN THE SAME INSERT that creates the row (useInputs.ts useUploadInputFile); an ordinary
// upload inserts is_interview = false. Plant: the flag dropped from the insert → the payload lacks it.
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const CALLS = vi.hoisted(() => ({ inserts: [] as Array<{ table: string; row: Record<string, unknown> }>, uploads: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const table = (name: string) => {
    const b: Record<string, unknown> = {};
    b.insert = (row: Record<string, unknown>) => { CALLS.inserts.push({ table: name, row }); return b; };
    b.select = () => b;
    b.single = () => Promise.resolve({ data: { id: "f-new", file_path: "p", uploaded_at: "2026-09-19T00:00:00Z" }, error: null });
    b.eq = () => b; b.order = () => Promise.resolve({ data: [], error: null });
    b.update = () => ({ eq: () => Promise.resolve({ error: null }) });
    return b;
  };
  return { supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: (t: string) => table(t),
    storage: { from: () => ({ upload: (p: string) => { CALLS.uploads.push(p); return Promise.resolve({ error: null }); }, remove: () => Promise.resolve({ error: null }) }) },
  } };
});
import { useUploadInputFile } from "./useInputs";

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
const file = (name: string) => new File(["FIXTURE (not a transcript)"], name, { type: "text/plain" });

describe("useUploadInputFile — the interview flag (A1)", () => {
  it("(a) with the switch on, the input_files insert carries is_interview: true", async () => {
    CALLS.inserts.length = 0;
    const { result } = renderHook(() => useUploadInputFile(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ inputId: "in-1", inputKey: "k", companyName: "Co", file: file("fixture-interview.txt"), tags: [], isInterview: true }); });
    const ins = CALLS.inserts.find((i) => i.table === "input_files")!;
    expect(ins.row.is_interview).toBe(true);
    expect(ins.row.file_name).toBe("fixture-interview.txt");
    expect(ins.row.tags).toEqual([]);
  });
  it("an ordinary upload inserts is_interview: false (byte-identical otherwise)", async () => {
    CALLS.inserts.length = 0;
    const { result } = renderHook(() => useUploadInputFile(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ inputId: "in-1", inputKey: "k", companyName: "Co", file: file("ordinary.pdf"), tags: ["Company"] }); });
    const ins = CALLS.inserts.find((i) => i.table === "input_files")!;
    expect(ins.row.is_interview).toBe(false);
    expect(Object.keys(ins.row).sort()).toEqual(["file_name", "file_path", "file_type", "input_id", "is_interview", "tags"]);
  });
});
