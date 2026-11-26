// SP-686 ruling 4 (2026-11-25): the outside scorer's own record decides which signed note stands in
// for a missing score — and the copy SP-686 / SP-688 retired is in no source file.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const seen: Array<{ table: string; method: string; args: unknown[] }> = [];
let row: unknown = null;
vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const chain: Record<string, unknown> = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: row, error: null });
        return (...args: unknown[]) => { seen.push({ table, method: prop, args }); return chain; };
      },
    });
    return chain;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

import { OUTSIDE_SCORE_RECORD_COMPONENT, outsideScoreStateFromRecord, useOutsideScoreState } from "./useOutsideScoreState";

describe("the outside scorer's record", () => {
  it("maps the record's state, and treats anything else — no record included — as 'not known'", () => {
    expect(outsideScoreStateFromRecord({ excluded_by_rule: { state: "ineligible", eligible_signals: 5, threshold: 10 } })).toBe("ineligible");
    expect(outsideScoreStateFromRecord({ excluded_by_rule: { state: "scored" } })).toBe("scored");
    expect(outsideScoreStateFromRecord({ excluded_by_rule: { state: "something else" } })).toBeNull();
    expect(outsideScoreStateFromRecord({ excluded_by_rule: null })).toBeNull();
    expect(outsideScoreStateFromRecord(null)).toBeNull();
  });

  it("reads the newest first_read_outside_score row for the company, and is settled only once that read has returned", async () => {
    seen.length = 0;
    row = { excluded_by_rule: { state: "ineligible" } };
    const { result } = renderHook(() => useOutsideScoreState("co-1"));
    expect(result.current.settled).toBe(false);                  // nothing has been read yet
    await waitFor(() => expect(result.current.settled).toBe(true));
    expect(result.current.state).toBe("ineligible");
    expect(OUTSIDE_SCORE_RECORD_COMPONENT).toBe("first_read_outside_score");
    expect(seen[0].table).toBe("integrity_runs");
    expect(seen).toContainEqual({ table: "integrity_runs", method: "eq", args: ["component", "first_read_outside_score"] });
    expect(seen).toContainEqual({ table: "integrity_runs", method: "eq", args: ["company_id", "co-1"] });
    expect(seen).toContainEqual({ table: "integrity_runs", method: "order", args: ["ran_at", { ascending: false }] });
  });

  it("with no company there is nothing to read and nothing is settled", () => {
    seen.length = 0;
    const { result } = renderHook(() => useOutsideScoreState(null));
    expect(result.current).toMatchObject({ state: null, settled: false });
    expect(seen).toHaveLength(0);
  });
});

describe("the retired copy is gone from the source", () => {
  it("no source file prints the old empty pair or the false caveat", () => {
    const RETIRED = ["No score has been computed yet", "It appears once the first analysis runs", "every lens added moves it"];
    const files: string[] = [];
    const walk = (dir: string) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p); } };
    walk(join(__dirname, ".."));
    expect(files.length).toBeGreaterThan(500);
    // a line that only talks ABOUT the retired copy, in a comment, is not printing it
    const hits = files.flatMap((f) => readFileSync(f, "utf8").split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && RETIRED.some((r) => l.includes(r))).map((l) => `${f}: ${l.trim().slice(0, 80)}`));
    expect(hits).toEqual([]);
  });
});
