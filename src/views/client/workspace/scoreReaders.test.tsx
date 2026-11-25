// ── SP-478 / SP-682 (2026-11-25): the readers that used to take a stored Mojo Score ──────────────
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { toDecisionPathViewModel } from "@/lib/decisionPathAdapter";
import { summarizeEvidenceSources, summarizeInputCoverage, summarizeOwnership, summarizePrimaryConstraint } from "@/lib/clientViewModel";

// A chainable stand-in for the browser client that records every call made on a mojo_scores read.
const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
let rowsFor: (table: string, seen: typeof calls) => unknown[] = () => [];
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const mine: typeof calls = [];
    const chain: Record<string, unknown> = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: rowsFor(table, mine), error: null });
        return (...args: unknown[]) => { const c = { table, method: prop, args }; calls.push(c); mine.push(c); return chain; };
      },
    });
    return chain;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

import { useMojoScore } from "@/hooks/useMojoScore";
import { useLiveMojoScores } from "./useLiveMojoScores";

const base = () => {
  const ownership = summarizeOwnership([]);
  return {
    topActions: [], allActions: [], ownership,
    primaryConstraint: summarizePrimaryConstraint([], [], null),
    evidence: summarizeEvidenceSources(null),
    inputCoverage: summarizeInputCoverage({ evidenceStatus: null, actions: [] }),
    teamBeliefs: [], selectedPriorityId: null, recentlyCommittedActionId: null,
    actionConfidenceById: {}, defaultActionConfidenceLevel: "Low" as const, phase: "diagnosis" as const,
  };
};

describe("the client decision view shows the LIVE score (ruling 2)", () => {
  it("takes the live number it is handed, and never the cached column on the company row", () => {
    // Charter on 2026-11-25: cached 11, live 8
    const company = { name: "Charter Communications", mojo_score: 11, potential_score: 47 } as never;
    const vm = toDecisionPathViewModel({ ...base(), activeCompany: company, liveMojoScore: 8 });
    expect(vm.hero.score).toBe(8);
    expect(vm.hero.trajectory.currentScore).toBe(8);
    // a different live number moves it; the cached 11 never appears
    expect(toDecisionPathViewModel({ ...base(), activeCompany: company, liveMojoScore: 25 }).hero.score).toBe(25);
    // while the live score is loading there is no number yet — not the cached one
    expect(toDecisionPathViewModel({ ...base(), activeCompany: company, liveMojoScore: null }).hero.score).toBe(0);
    expect(toDecisionPathViewModel({ ...base(), activeCompany: company }).hero.score).toBe(0);
  });
});

describe("useMojoScore reads ONE kind of row (rulings 1 and 4)", () => {
  const filtersOf = () => calls.filter((c) => c.table === "mojo_scores" && (c.method === "like" || c.method === "not"));

  it("'outside' — the client story card — asks for outside-methodology rows only", async () => {
    calls.length = 0;
    rowsFor = () => [{ id: "o1", company_id: "co", computed_at: "2026-11-17T18:40:27Z", total_score: 12, component_scores: {}, explanation: {}, methodology_version: "outside-v1.1.0" }];
    const { result } = renderHook(() => useMojoScore("co", "outside"));
    await waitFor(() => expect(result.current.score).not.toBeNull());
    expect(filtersOf()).toEqual([{ table: "mojo_scores", method: "like", args: ["methodology_version", "outside-%"] }]);
    expect(result.current.score!.total_score).toBe(12);
  });

  it("'mojo' — the home's sparkline — asks for everything that is NOT an outside row", async () => {
    calls.length = 0;
    rowsFor = () => [
      { id: "m2", company_id: "co", computed_at: "2026-11-17T16:02:00Z", total_score: 11, component_scores: {}, explanation: {}, methodology_version: "v1.1.0" },
      { id: "m1", company_id: "co", computed_at: "2026-11-17T15:45:01Z", total_score: 10, component_scores: {}, explanation: {}, methodology_version: "v1.1.0" },
    ];
    const { result } = renderHook(() => useMojoScore("co", "mojo"));
    await waitFor(() => expect(result.current.history.length).toBe(2));
    expect(filtersOf()).toEqual([{ table: "mojo_scores", method: "not", args: ["methodology_version", "like", "outside-%"] }]);
  });
});

describe("the company switcher reads the live score for the whole list in three reads", () => {
  it("scores every company the writer has scored, from the one rule's three sources, and skips the rest", async () => {
    calls.length = 0;
    const T = "2026-11-01T00:00:00Z";
    rowsFor = (table, seen) => {
      const chunk = (seen.find((c) => c.method === "in")?.args[1] ?? []) as string[];
      if (table === "claims") return chunk.includes("a")
        ? [{ company_id: "a", id: "c1", state: "diagnose", claim_type: "x", topic: "t", outside_support_count: 1, organization_support_count: 0, customer_support_count: 0, updated_at: T, status: "active" },
           { company_id: "a", id: "c2", state: "flow", claim_type: "x", topic: "t", outside_support_count: 9, organization_support_count: 9, customer_support_count: 9, updated_at: T, status: "struck" }]
        : [];
      return [];
    };
    const listed = [{ id: "a", mojo_score: 11 }, { id: "b", mojo_score: 0 }, { id: "never-scored", mojo_score: null }];
    const { result, rerender } = renderHook(({ open }) => useLiveMojoScores(listed, open), { initialProps: { open: false } });
    expect(calls).toHaveLength(0);                                   // nothing is read until it opens
    rerender({ open: true });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect([...result.current.keys()].sort()).toEqual(["a", "b"]);   // the never-scored company gets no number
    expect(typeof result.current.get("a")).toBe("number");
    expect([...new Set(calls.map((c) => c.table))].sort()).toEqual(["claims", "needs_in_market", "routes"]);
    // one request names the whole list — not one per company
    const ins = calls.filter((c) => c.method === "in");
    expect(ins).toHaveLength(3);
    for (const c of ins) expect(c.args).toEqual(["company_id", ["a", "b"]]);
  });
});
