// B2a — the option sets must match byte for byte.
import { describe, it, expect } from "vitest";
import { compareStatusOptions } from "./statusOptions";
import { CLIENT_PORTAL_STATUSES } from "@/views/client/workshop/clientPortalStatuses";

describe("compareStatusOptions", () => {
  it("matches the live Client Portals options, in order", () => {
    // read from the live data source on 2026-09-26
    const live = ["Cold Intake", "Web Intake", "Map Created", "In Progress", "Completed", "On Hold", "Ongoing"];
    const c = compareStatusOptions(live);
    expect(c.match).toBe(true);
    expect(c.sameOrder).toBe(true);
    expect(c.missingInNotion).toEqual([]);
    expect(c.extraInNotion).toEqual([]);
    expect(c.nearMisses).toEqual([]);
  });

  it("a missing option is reported, not tolerated", () => {
    const c = compareStatusOptions(["Cold Intake", "Web Intake"]);
    expect(c.match).toBe(false);
    expect(c.missingInNotion).toContain("Map Created");
  });

  it("an extra Notion option is reported", () => {
    const c = compareStatusOptions([...CLIENT_PORTAL_STATUSES, "Archived"]);
    expect(c.match).toBe(false);
    expect(c.extraInNotion).toEqual(["Archived"]);
  });

  it("catches the dangerous near-miss: same words, different bytes", () => {
    const c = compareStatusOptions(
      CLIENT_PORTAL_STATUSES.map((s) => (s === "Map Created" ? "Map created" : s)),
    );
    expect(c.match).toBe(false);
    expect(c.nearMisses).toEqual([{ notion: "Map created", mojomap: "Map Created" }]);
  });

  it("a trailing space is a mismatch, because the sync copies the string across", () => {
    const c = compareStatusOptions(CLIENT_PORTAL_STATUSES.map((s) => (s === "On Hold" ? "On Hold " : s)));
    expect(c.match).toBe(false);
    expect(c.nearMisses).toEqual([{ notion: "On Hold ", mojomap: "On Hold" }]);
  });

  it("the same seven in a different order still matches, and says the order differs", () => {
    const c = compareStatusOptions([...CLIENT_PORTAL_STATUSES].reverse());
    expect(c.match).toBe(true);
    expect(c.sameOrder).toBe(false);
  });
});
