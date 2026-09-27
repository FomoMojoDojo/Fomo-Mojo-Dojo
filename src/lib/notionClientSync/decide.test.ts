// B2a — the decision rules. Today's nine rows are ALL first syncs (last_notion_status_seen and
// last_synced_at are NULL on every one), so the newest-wins branch is unreachable in the live dry
// run. These tests are the only place it is exercised, which is exactly why they exist.
import { describe, it, expect } from "vitest";
import {
  decide,
  ignoreReason,
  mapCreatedEligible,
  CB1_FROZEN_ID,
  type MojoSide,
  type NotionSide,
  type BaselineFacts,
} from "./decide";

const NO_BASELINE: BaselineFacts = { finished: false, longRunnerRunIds: [], publicBaselineRunIds: [] };
const BASELINE: BaselineFacts = { finished: true, longRunnerRunIds: ["25ce9eaa-2dea-4155-8546-ec23bb109a8e"], publicBaselineRunIds: [202] };

const mojo = (over: Partial<MojoSide> = {}): MojoSide => ({
  companyId: "3dd2cfbb-0792-4bf1-9cd4-15db9646874b",
  companyName: "Edgewood",
  clientStatus: "In Progress",
  statusChangedAt: "2026-09-26T23:12:29.161Z",
  lastNotionStatusSeen: null,
  lastSyncedAt: null,
  mapCreatedSetAt: null,
  notionPageId: null,
  ...over,
});
const notion = (over: Partial<NotionSide> = {}): NotionSide => ({
  pageId: "3b2f0a3f-6171-807b-81e4-d3649ffbf0c3",
  status: "In Progress",
  lastEditedTime: "2026-09-26T21:18:00.000Z",
  ...over,
});

describe("CB1 and creation", () => {
  it("CB1 is refused before anything else, even flagged and even with a Notion row", () => {
    const d = decide(mojo({ companyId: CB1_FROZEN_ID }), notion(), BASELINE);
    expect(d.action).toBe("refused-frozen");
  });

  it("a flagged company with no linked Notion row is a create", () => {
    expect(decide(mojo(), null, NO_BASELINE).action).toBe("create");
  });

  // CHANGED BY R10. B2a asserted the opposite — that create won and the promotion waited for the
  // next run. R10 reverses it: the promotion is decided first, so an eligible new company is born at
  // Map Created and never passes through a Cold Intake row.
  it("R10: an eligible new company is created directly AT Map Created, not at its current status", () => {
    const d = decide(mojo({ clientStatus: "Cold Intake" }), null, BASELINE);
    expect(d.action).toBe("create-at-map-created");
    expect(d.rule).toMatch(/R10/);
    expect(d.rule).toMatch(/SAME run/);
  });

  it("R10 applies from an empty status and from Web Intake too", () => {
    for (const from of [null, "Web Intake"] as const) {
      expect(decide(mojo({ clientStatus: from }), null, BASELINE).action).toBe("create-at-map-created");
    }
  });

  it("without a finished baseline a new company is still a plain create", () => {
    expect(decide(mojo({ clientStatus: "Cold Intake" }), null, NO_BASELINE).action).toBe("create");
  });

  it("a new company already past Cold Intake / Web Intake is a plain create even with a baseline", () => {
    for (const from of ["In Progress", "Completed", "On Hold", "Ongoing", "Map Created"] as const) {
      expect(decide(mojo({ clientStatus: from }), null, BASELINE).action).toBe("create");
    }
  });

  it("a new company whose map_created_set_at is already set is a plain create — never promoted twice", () => {
    const d = decide(mojo({ clientStatus: "Cold Intake", mapCreatedSetAt: "2026-09-01T00:00:00Z" }), null, BASELINE);
    expect(d.action).toBe("create");
  });
});

describe("first sync (last_notion_status_seen is NULL) — R8", () => {
  it("statuses agree → seed-seen, nothing resolved and nothing pushed", () => {
    const d = decide(mojo(), notion({ status: "In Progress" }), NO_BASELINE);
    expect(d.action).toBe("seed-seen");
  });

  it("statuses differ → needs-operator, never resolved automatically", () => {
    const d = decide(mojo({ clientStatus: "In Progress" }), notion({ status: "On Hold" }), NO_BASELINE);
    expect(d.action).toBe("needs-operator");
    expect(d.rule).toMatch(/R8/);
  });

  it("differing on a first sync is needs-operator even when Notion is plainly newer", () => {
    const d = decide(
      mojo({ clientStatus: "In Progress", statusChangedAt: "2026-01-01T00:00:00.000Z" }),
      notion({ status: "On Hold", lastEditedTime: "2026-09-26T21:18:00.000Z" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("needs-operator");
  });

  it("a NULL MojoMap status against an empty Notion select agrees", () => {
    const d = decide(mojo({ clientStatus: null }), notion({ status: null }), NO_BASELINE);
    expect(d.action).toBe("seed-seen");
  });
});

describe("newest wins (not reachable from today's data — only here)", () => {
  const seen = { lastNotionStatusSeen: "In Progress" as const, lastSyncedAt: "2026-09-20T00:00:00.000Z" };

  it("only Notion moved → pull", () => {
    const d = decide(
      mojo({ ...seen, clientStatus: "In Progress", statusChangedAt: "2026-09-19T00:00:00.000Z" }),
      notion({ status: "On Hold" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("pull");
  });

  it("only MojoMap moved → push", () => {
    const d = decide(
      mojo({ ...seen, clientStatus: "Completed", statusChangedAt: "2026-09-25T00:00:00.000Z" }),
      notion({ status: "In Progress" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("push");
  });

  it("both moved, MojoMap newer → push", () => {
    const d = decide(
      mojo({ ...seen, clientStatus: "Completed", statusChangedAt: "2026-09-26T23:00:00.000Z" }),
      notion({ status: "On Hold", lastEditedTime: "2026-09-26T21:18:00.000Z" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("push");
    expect(d.rule).toMatch(/newest wins/);
  });

  it("both moved, Notion newer → pull", () => {
    const d = decide(
      mojo({ ...seen, clientStatus: "Completed", statusChangedAt: "2026-09-26T20:00:00.000Z" }),
      notion({ status: "On Hold", lastEditedTime: "2026-09-26T21:18:00.000Z" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("pull");
  });

  it("both moved with equal timestamps → needs-operator, because last_edited_time is minute-granular", () => {
    const t = "2026-09-26T21:18:00.000Z";
    const d = decide(
      mojo({ ...seen, clientStatus: "Completed", statusChangedAt: t }),
      notion({ status: "On Hold", lastEditedTime: t }),
      NO_BASELINE,
    );
    expect(d.action).toBe("needs-operator");
    expect(d.rule).toMatch(/minute-granular/);
  });

  it("the values differ but neither side records a change → needs-operator, not a guess", () => {
    const d = decide(
      mojo({ lastNotionStatusSeen: "On Hold", lastSyncedAt: "2026-09-26T23:59:00.000Z", clientStatus: "Completed", statusChangedAt: "2026-09-20T00:00:00.000Z" }),
      notion({ status: "On Hold" }),
      NO_BASELINE,
    );
    expect(d.action).toBe("needs-operator");
  });

  // CHANGED with the link fix (2026-09-27): a row whose statuses agree is only `none` once the LINK
  // is recorded. With notion_page_id still NULL it is link-only — see the link-only tests in plan.test.
  it("agreed statuses after a first sync, with the link recorded, are none", () => {
    const d = decide(mojo({ ...seen, notionPageId: "pg-1" }), notion({ status: "In Progress" }), NO_BASELINE);
    expect(d.action).toBe("none");
  });

  it("agreed statuses with the link NOT recorded are link-only, not none", () => {
    const d = decide(mojo({ ...seen, notionPageId: null }), notion({ status: "In Progress" }), NO_BASELINE);
    expect(d.action).toBe("link-only");
  });
});

describe("Map Created promotion", () => {
  it("fires only from empty / Cold Intake / Web Intake, with a baseline and a NULL map_created_set_at", () => {
    for (const from of [null, "Cold Intake", "Web Intake"] as const) {
      expect(mapCreatedEligible(mojo({ clientStatus: from }), BASELINE)).toBe(true);
    }
    for (const from of ["Map Created", "In Progress", "Completed", "On Hold", "Ongoing"] as const) {
      expect(mapCreatedEligible(mojo({ clientStatus: from }), BASELINE)).toBe(false);
    }
  });

  it("never without a finished baseline, and never twice", () => {
    expect(mapCreatedEligible(mojo({ clientStatus: "Cold Intake" }), NO_BASELINE)).toBe(false);
    expect(
      mapCreatedEligible(mojo({ clientStatus: "Cold Intake", mapCreatedSetAt: "2026-09-01T00:00:00Z" }), BASELINE),
    ).toBe(false);
  });

  it("is decided only once the two sides agree", () => {
    const agreed = decide(
      mojo({ clientStatus: "Cold Intake", lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z" }),
      notion({ status: "Cold Intake" }),
      BASELINE,
    );
    expect(agreed.action).toBe("map-created");
  });

  it("is DEFERRED while a Notion edit is unresolved — the promotion never overwrites an operator", () => {
    const contested = decide(
      mojo({ clientStatus: "Cold Intake", lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z", statusChangedAt: "2026-09-19T00:00:00.000Z" }),
      notion({ status: "On Hold" }),
      BASELINE,
    );
    expect(contested.action).toBe("pull");
  });
});

describe("which Notion rows are ignored", () => {
  const flagged = new Set(["3dd2cfbb-0792-4bf1-9cd4-15db9646874b"]);
  const known = new Set(["3dd2cfbb-0792-4bf1-9cd4-15db9646874b", "dea66de5-647e-45b7-9f13-a9673f641006"]);

  it("no MojoMap ID at all", () => {
    expect(ignoreReason(null, flagged, known)).toBe("no-mojomap-id");
    expect(ignoreReason("   ", flagged, known)).toBe("no-mojomap-id");
  });
  it("an ID that names a company nobody flagged", () => {
    expect(ignoreReason("dea66de5-647e-45b7-9f13-a9673f641006", flagged, known)).toBe("id-not-flagged");
  });
  it("an ID that names no company at all", () => {
    expect(ignoreReason("00000000-0000-4000-8000-000000000000", flagged, known)).toBe("id-matches-no-company");
  });
  it("CB1 by id, whatever else is true of it", () => {
    expect(ignoreReason(CB1_FROZEN_ID, new Set([CB1_FROZEN_ID]), new Set([CB1_FROZEN_ID]))).toBe("cb1");
  });
  it("a flagged company is not ignored, and surrounding whitespace is tolerated", () => {
    expect(ignoreReason(" 3dd2cfbb-0792-4bf1-9cd4-15db9646874b ", flagged, known)).toBeNull();
  });
});
