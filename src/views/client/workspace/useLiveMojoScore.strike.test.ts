// STRIKE LAW on the live score (operator brief 2026-09-14). The home's live score must exclude struck
// claims exactly as the server's snapshotMojoScore does (.neq("status","struck")) and keep minimized ones
// (display-only de-emphasis) — live and server agree on the same fixture.
import { describe, expect, it } from "vitest";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import { excludeStruck } from "./useLiveMojoScore";

const now = "2026-09-14T12:00:00Z";
const claim = (id: string, state: string, status: string, updated = "2026-09-13T00:00:00Z") =>
  ({ id, state, claim_type: "observation", topic: "problem", outside_support_count: 0, organization_support_count: 1, customer_support_count: 0, updated_at: updated, status });
const score = (claims: ReturnType<typeof claim>[]) => computeMojoScore({ companyId: "co", computedAt: now, claims: claims.map(({ status: _s, ...c }) => c), routes: [], needs: [] } as never);
const serverSelection = (claims: ReturnType<typeof claim>[]) => claims.filter((c) => c.status !== "struck"); // snapshotMojoScore: .neq("status","struck")

describe("live score honours the strike law", () => {
  const fixture = [claim("a", "diagnose", "active"), claim("b", "outside_view", "active"), claim("s1", "diagnose", "struck"), claim("s2", "diagnose", "struck"), claim("m", "outside_view", "minimized")];
  it("a. a struck claim is excluded from the live score", () => {
    const live = score(excludeStruck(fixture));
    const sdh = live.contributors.find((c) => c.key === "state_distribution_health")!;
    expect(sdh.sub_scores).toMatchObject({ diagnose: 1, outside_view: 2 }); // s1, s2 gone; a, b, m remain
    expect(excludeStruck(fixture).map((c) => c.id)).toEqual(["a", "b", "m"]);
  });
  it("b. a minimized claim keeps counting — exactly as the server does", () => {
    expect(excludeStruck(fixture).some((c) => c.status === "minimized")).toBe(true);
    expect(serverSelection(fixture).some((c) => c.status === "minimized")).toBe(true);
  });
  it("c. live and server agree on the same fixture (total, unrounded, every contributor)", () => {
    const live = score(excludeStruck(fixture)); const server = score(serverSelection(fixture));
    expect(live.total_score).toBe(server.total_score);
    expect(live.contributors.map((c) => [c.key, c.weighted])).toEqual(server.contributors.map((c) => [c.key, c.weighted]));
    // and the unfiltered read (the defect) does NOT agree
    const unfiltered = score(fixture);
    expect(unfiltered.contributors.find((c) => c.key === "state_distribution_health")!.weighted).not.toBe(server.contributors.find((c) => c.key === "state_distribution_health")!.weighted);
  });
  it("a row with no status (legacy shape) counts — only an explicit strike excludes", () => {
    expect(excludeStruck([{ id: "x", status: undefined }, { id: "y", status: null }]).length).toBe(2);
  });
});
