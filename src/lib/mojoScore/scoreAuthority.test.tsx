// ── SP-478 / SP-682 (2026-11-25): ONE Mojo Score authority ───────────────────────────────────────
//
// The authority is the live computation over ONE input rule. These tests hold the browser's path
// and the server's path against each other on one fixture, and pin the readers that used to take a
// stored number: the client decision view, the company switcher, and the two kinds of row in
// mojo_scores.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { computeMojoScore } from "./computeMojoScore";
import {
  SCORE_CLAIM_COLUMNS, SCORE_INPUT_SOURCES, SCORE_NEED_COLUMNS, SCORE_ROUTE_COLUMNS,
  claimCounts, needCounts, routeCounts, scoreInputSet,
} from "./types";
import { OUTSIDE_METHODOLOGY_VERSION } from "@/lib/outsideScore/computeOutsideScore";
import { fakeDb } from "../../../supabase/functions/_shared/fakeSupabaseForTests";
import { readScoreInputs } from "../../../supabase/functions/_shared/snapshotMojoScore";

const CO = "co-fixture";
const T = "2026-11-01T00:00:00Z";
// One fixture, holding every row the rule must leave out — and the ones it must keep.
const claims = [
  { id: "c-live", company_id: CO, state: "diagnose", claim_type: "x", topic: "t", outside_support_count: 1, organization_support_count: 0, customer_support_count: 0, updated_at: T, status: "active" },
  { id: "c-minimized", company_id: CO, state: "focus", claim_type: "x", topic: "t", outside_support_count: 0, organization_support_count: 1, customer_support_count: 0, updated_at: T, status: "minimized" },
  { id: "c-struck", company_id: CO, state: "flow", claim_type: "x", topic: "t", outside_support_count: 9, organization_support_count: 9, customer_support_count: 9, updated_at: T, status: "struck" },
];
const routes = [
  { id: "r-active", company_id: CO, category: "fix", level: "route", parent_id: null, updated_at: T, relevance_state: "active" },
  { id: "r-inactive", company_id: CO, category: "improve", level: "route", parent_id: null, updated_at: T, relevance_state: "deprioritized" },
];
const need = (id: string, over: Record<string, unknown> = {}) => ({
  id, company_id: CO, desired_outcome: `outcome ${id}`, importance: 8, satisfaction: 3, opportunity_score: 13,
  service_state: "underserved", updated_at: T, status: "active", journey_key: "customer", ...over,
});
// needs_in_market returns one row per need PER MARKET: n-two appears twice.
const needs = [
  need("n-live"),
  need("n-two"), need("n-two", { journey_key: "revenue" }),
  need("n-retracted", { status: "retracted" }),
  need("n-proposed", { status: "proposed" }),
  need("n-company-held", { journey_key: null }),
];
const ids = (x: { claims: Array<{ id: string }>; routes: Array<{ id: string }>; needs: Array<{ id: string }> }) =>
  ({ claims: x.claims.map((r) => r.id).sort(), routes: x.routes.map((r) => r.id).sort(), needs: x.needs.map((r) => r.id).sort() });

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => { throw new Error("no browser read in this test"); } } }));

describe("the score's one input rule", () => {
  it("leaves out a struck claim, an inactive route, and a retracted, proposed or company-held need; counts a need in two markets once", () => {
    const set = scoreInputSet({ claims, routes, needs });
    expect(ids(set)).toEqual({ claims: ["c-live", "c-minimized"], routes: ["r-active"], needs: ["n-live", "n-two"] });
    expect(set.needs.filter((n) => n.id === "n-two")).toHaveLength(1);
    // a minimized claim keeps counting (display-only de-emphasis)
    expect(claimCounts({ status: "minimized" })).toBe(true);
    expect([claimCounts({ status: "struck" }), routeCounts({ relevance_state: "deprioritized" }), routeCounts({ relevance_state: null })]).toEqual([false, false, false]);
    expect([needCounts({ status: "retracted", journey_key: "customer" }), needCounts({ status: "proposed", journey_key: "customer" }), needCounts({ status: "active", journey_key: null })]).toEqual([false, false, false]);
  });

  it("a row that does not carry a column passes: the read that made it already applied the rule", () => {
    expect([claimCounts({}), routeCounts({}), needCounts({})]).toEqual([true, true, true]);
    const set = scoreInputSet({ claims: [{ id: "c" }], routes: [{ id: "r" }], needs: [{ id: "n" }] } as never);
    expect([set.claims.length, set.routes.length, set.needs.length]).toEqual([1, 1, 1]);
  });

  it("BROWSER AND SERVER RETURN THE SAME INPUT SET on the fixture, and so the same score", async () => {
    const { liveScoreInputs } = await import("@/views/client/workspace/useLiveMojoScore");
    // the browser: the page's three reads hand their rows to the live hook, which applies the rule
    const browser = liveScoreInputs(new Map(claims.map((c) => [c.id, c])) as never, routes as never, needs as never);
    // the server: the writer's own read, against the same rows in the tables it reads
    const db = fakeDb({ [SCORE_INPUT_SOURCES.claims]: claims, [SCORE_INPUT_SOURCES.routes]: routes, [SCORE_INPUT_SOURCES.needs]: needs });
    const server = await readScoreInputs(db as never, CO);
    expect(ids(server)).toEqual(ids(browser as never));
    expect(ids(server)).toEqual({ claims: ["c-live", "c-minimized"], routes: ["r-active"], needs: ["n-live", "n-two"] });
    const at = "2026-11-25T00:00:00Z";
    const score = (x: { claims: unknown[]; routes: unknown[]; needs: unknown[] }) => computeMojoScore({ companyId: CO, claims: x.claims, routes: x.routes, needs: x.needs, computedAt: at } as never).total_score;
    expect(score(server)).toBe(score(browser as never));
    // and it is NOT the score of the unfiltered rows — so the equality above is not vacuous
    expect(score({ claims, routes, needs })).not.toBe(score(server));
  });

  it("the server reads the view the browser reads, with the columns the rule needs", () => {
    expect(SCORE_INPUT_SOURCES).toEqual({ claims: "claims", routes: "routes", needs: "needs_in_market" });
    expect(SCORE_CLAIM_COLUMNS).toContain("status");
    expect(SCORE_ROUTE_COLUMNS).toContain("relevance_state");
    expect(SCORE_NEED_COLUMNS).toContain("status");
    expect(SCORE_NEED_COLUMNS).toContain("journey_key");
  });

  it("the server's read is paged: 2,300 claims come back as 2,300, not as the first 1,000", async () => {
    const many = Array.from({ length: 2300 }, (_, i) => ({ ...claims[0], id: `c${String(i).padStart(5, "0")}` }));
    const db = fakeDb({ claims: many, routes: [], needs_in_market: [] });
    expect((await readScoreInputs(db as never, CO)).claims).toHaveLength(2300);
  });
});

describe("readers of mojo_scores say which score they want (rulings 1 and 4)", () => {
  it("the outside prefix this hook filters by is the outside scorer's own", async () => {
    const { OUTSIDE_SCORE_METHODOLOGY_PREFIX } = await import("@/hooks/useMojoScore");
    expect(OUTSIDE_METHODOLOGY_VERSION.startsWith(OUTSIDE_SCORE_METHODOLOGY_PREFIX)).toBe(true);
    expect("v1.1.0".startsWith(OUTSIDE_SCORE_METHODOLOGY_PREFIX)).toBe(false);
  });
});

describe("the company switcher's score", () => {
  it("prints the live number, and nothing for a company with no live score", async () => {
    const { switcherScoreLabel } = await import("@/views/client/workspace/useLiveMojoScores");
    const live = new Map([["charter", 8], ["zero", 0]]);
    expect(switcherScoreLabel(live, "charter")).toBe("score 8");
    expect(switcherScoreLabel(live, "zero")).toBe("score 0");
    expect(switcherScoreLabel(live, "unscored")).toBeNull();
    // nothing has been read until the switcher opens
    const { useLiveMojoScores } = await import("@/views/client/workspace/useLiveMojoScores");
    const { result } = renderHook(() => useLiveMojoScores([{ id: "charter", mojo_score: 11 }], false));
    await waitFor(() => expect(result.current.size).toBe(0));
  });
});
