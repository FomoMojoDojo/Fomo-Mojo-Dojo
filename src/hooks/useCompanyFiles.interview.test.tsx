// Gate B guard (k), listing side — ruling A2 (2026-09-19): retiring an interview = the record's retraction +
// input_files.archived_at; the Inputs listing read (useCompanyFiles) hides an archived file. Plant: the
// archived_at filter dropped → the archived interview file is listed again.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const ROWS = vi.hoisted(() => ({ files: [] as Array<Record<string, unknown>> }));
vi.mock("@/integrations/supabase/client", () => {
  const q = (rows: () => Array<Record<string, unknown>>) => {
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; };
    b.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b; };
    b.is = (c: string, v: unknown) => { filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return b; };
    b.order = () => b;
    b.then = (res: (v: unknown) => void) => res({ data: rows().filter((r) => filters.every((f) => f(r))), error: null });
    return b;
  };
  return { supabase: { from: (t: string) => q(() => (t === "inputs" ? [{ id: "in-1", company_id: "co" }] : t === "input_files" ? ROWS.files : [])) } };
});
import { useCompanyFiles } from "./useCompanyFiles";

const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

describe("useCompanyFiles — an archived (retired) interview file is hidden", () => {
  it("(k) lists the live interview file and hides the archived one", async () => {
    ROWS.files = [
      { id: "f-live", input_id: "in-1", file_name: "fixture-live.txt", archived_at: null, is_interview: true },
      { id: "f-retired", input_id: "in-1", file_name: "fixture-retired.txt", archived_at: "2026-09-19T12:00:00Z", is_interview: true },
    ];
    const { result } = renderHook(() => useCompanyFiles("co"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.map((f) => f.id)).toEqual(["f-live"]);
  });
});
