// B2b — R11's ordering, asserted per action.
import { describe, it, expect } from "vitest";
import { planSteps, reconcilePlan, planTouchesNotion, MAP_CREATED, type PlannedRow } from "./plan";
import { decide, type MojoSide, type NotionSide, type BaselineFacts } from "./decide";

const NO_BASELINE: BaselineFacts = { finished: false, longRunnerRunIds: [], publicBaselineRunIds: [] };
const BASELINE: BaselineFacts = { finished: true, longRunnerRunIds: ["25ce9eaa"], publicBaselineRunIds: [3] };

const mojo = (over: Partial<MojoSide> = {}): MojoSide => ({
  companyId: "e55ac325-2897-4d06-9fbd-d9ddd776be3b",
  companyName: "Sonos",
  clientStatus: "Cold Intake",
  statusChangedAt: "2026-09-26T16:13:54.403Z",
  lastNotionStatusSeen: null,
  lastSyncedAt: null,
  mapCreatedSetAt: null,
  notionPageId: null,
  ...over,
});
const notion = (over: Partial<NotionSide> = {}): NotionSide => ({
  pageId: "3b2f0a3f-6171-807b-81e4-d3649ffbf0c3",
  status: "Cold Intake",
  lastEditedTime: "2026-09-26T21:18:00.000Z",
  ...over,
});

const shape = (steps: ReturnType<typeof planSteps>) =>
  steps.map((s) => (s.kind === "rpc" ? `rpc:${s.fn}` : `notion:${s.op}`));

describe("R11 ordering — Notion first, DB second, planned row before every Notion write", () => {
  it("create-at-map-created: plan → create at Map Created → one DB write that also sets map_created_set_at", () => {
    const m = mojo();
    const d = decide(m, null, BASELINE);
    expect(d.action).toBe("create-at-map-created");
    const steps = planSteps(d, m, null);
    expect(shape(steps)).toEqual(["rpc:sync_plan_notion_write", "notion:createRow", "rpc:sync_client_portal_link"]);
    expect(steps[1].kind === "notion" && steps[1].args).toMatchObject({ status: MAP_CREATED, mojoMapId: m.companyId, name: "Sonos" });
    expect(steps[2].args).toMatchObject({
      p_action: "create-at-map-created",
      p_expected_status: "Cold Intake", // R-cas against what the sync read
      p_set_client_status: true,
      p_next_status: MAP_CREATED,
      p_set_map_created: true,
      p_last_notion_status_seen: MAP_CREATED,
    });
  });

  it("a plain create does NOT move client_status — the operator chose it", () => {
    const m = mojo();
    const d = decide(m, null, NO_BASELINE);
    const steps = planSteps(d, m, null);
    expect(shape(steps)).toEqual(["rpc:sync_plan_notion_write", "notion:createRow", "rpc:sync_client_portal_link"]);
    expect(steps[2].args).toMatchObject({ p_set_client_status: false, p_set_map_created: false, p_last_notion_status_seen: "Cold Intake" });
  });

  it("push: the PATCH carries the last_edited_time the sync read, so a concurrent edit refuses", () => {
    const m = mojo({ clientStatus: "Completed", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-20T00:00:00.000Z" });
    const n = notion({ status: "In Progress" });
    const d = decide(m, n, NO_BASELINE);
    expect(d.action).toBe("push");
    const steps = planSteps(d, m, n);
    expect(shape(steps)).toEqual(["rpc:sync_plan_notion_write", "notion:patchStatus", "rpc:sync_client_portal_link"]);
    expect(steps[1].kind === "notion" && steps[1].args).toMatchObject({
      pageId: n.pageId, status: "Completed", expectLastEditedTime: n.lastEditedTime,
    });
    expect(steps[2].args).toMatchObject({ p_set_client_status: false, p_last_notion_status_seen: "Completed" });
  });

  it("pull writes NO planned row — there is no Notion write that could half-land", () => {
    const m = mojo({ clientStatus: "In Progress", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-25T00:00:00.000Z", statusChangedAt: "2026-09-19T00:00:00.000Z" });
    const n = notion({ status: "On Hold" });
    const d = decide(m, n, NO_BASELINE);
    expect(d.action).toBe("pull");
    const steps = planSteps(d, m, n);
    expect(shape(steps)).toEqual(["rpc:sync_client_portal_link"]);
    expect(planTouchesNotion(steps)).toBe(false);
    expect(steps[0].args).toMatchObject({ p_set_client_status: true, p_next_status: "On Hold", p_last_notion_status_seen: "On Hold" });
  });

  it("seed-seen is a single DB write and touches neither Notion nor client_status", () => {
    const m = mojo({ clientStatus: "In Progress" });
    const n = notion({ status: "In Progress" });
    const d = decide(m, n, NO_BASELINE);
    expect(d.action).toBe("seed-seen");
    const steps = planSteps(d, m, n);
    expect(shape(steps)).toEqual(["rpc:sync_client_portal_link"]);
    expect(planTouchesNotion(steps)).toBe(false);
    expect(steps[0].args).toMatchObject({ p_set_client_status: false, p_last_notion_status_seen: "In Progress" });
  });

  it("map-created on a linked row: plan → patch → DB with set_map_created", () => {
    const m = mojo({ lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z" });
    const n = notion({ status: "Cold Intake" });
    const d = decide(m, n, BASELINE);
    expect(d.action).toBe("map-created");
    const steps = planSteps(d, m, n);
    expect(shape(steps)).toEqual(["rpc:sync_plan_notion_write", "notion:patchStatus", "rpc:sync_client_portal_link"]);
    expect(steps[2].args).toMatchObject({ p_set_map_created: true, p_next_status: MAP_CREATED });
  });

  it("none / needs-operator / refused-frozen plan NOTHING", () => {
    for (const [m, n, b] of [
      // notionPageId is set here on purpose: without it this row is link-only, not none (the link fix).
      [mojo({ clientStatus: "In Progress", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-25T00:00:00.000Z", notionPageId: "pg-1" }), notion({ status: "In Progress" }), NO_BASELINE],
      [mojo({ clientStatus: "In Progress" }), notion({ status: "On Hold" }), NO_BASELINE],
      [mojo({ companyId: "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc" }), notion(), BASELINE],
    ] as Array<[MojoSide, NotionSide, BaselineFacts]>) {
      const d = decide(m, n, b);
      expect(["none", "needs-operator", "refused-frozen"]).toContain(d.action);
      expect(planSteps(d, m, n)).toEqual([]);
    }
  });

  it("every plan that touches Notion has its planned row FIRST", () => {
    const cases: Array<[MojoSide, NotionSide | null, BaselineFacts]> = [
      [mojo(), null, BASELINE],
      [mojo(), null, NO_BASELINE],
      [mojo({ clientStatus: "Completed", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-20T00:00:00.000Z" }), notion({ status: "In Progress" }), NO_BASELINE],
      [mojo({ lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z" }), notion({ status: "Cold Intake" }), BASELINE],
    ];
    for (const [m, n, b] of cases) {
      const steps = planSteps(decide(m, n, b), m, n);
      if (planTouchesNotion(steps)) {
        expect(steps[0]).toMatchObject({ kind: "rpc", fn: "sync_plan_notion_write" });
        const notionAt = steps.findIndex((s) => s.kind === "notion");
        const dbAt = steps.findIndex((s) => s.kind === "rpc" && s.fn === "sync_client_portal_link");
        expect(notionAt).toBeLessThan(dbAt); // Notion first, DB second
      }
    }
  });

  it("every DB step carries the compare-and-set expectation", () => {
    const m = mojo({ clientStatus: "Web Intake" });
    for (const [n, b] of [[null, BASELINE], [null, NO_BASELINE]] as Array<[NotionSide | null, BaselineFacts]>) {
      const steps = planSteps(decide(m, n, b), m, n);
      const db = steps.find((s) => s.kind === "rpc" && s.fn === "sync_client_portal_link")!;
      expect(db.args.p_expected_status).toBe("Web Intake");
    }
  });
});

describe("the link is recorded on every action that holds a page", () => {
  // Found in the 2026-09-27 full live run: seed-seen did not pass the page id, so Edgewood synced with
  // notion_page_id NULL — and the section renders "Not linked yet — the next sync creates the Notion
  // row." while that column is NULL, which on an already-linked company is false AND promises a
  // creation that will never happen. B1 specifies the column as "NULL until a sync creates or links
  // the row"; every action below holds a page, so every one of them records it.
  const cases: Array<[string, MojoSide, NotionSide, BaselineFacts]> = [
    ["seed-seen", mojo({ clientStatus: "In Progress" }), notion({ status: "In Progress" }), NO_BASELINE],
    ["push", mojo({ clientStatus: "Completed", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-20T00:00:00.000Z" }), notion({ status: "In Progress" }), NO_BASELINE],
    ["pull", mojo({ clientStatus: "In Progress", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-25T00:00:00.000Z", statusChangedAt: "2026-09-19T00:00:00.000Z" }), notion({ status: "On Hold" }), NO_BASELINE],
    ["map-created", mojo({ lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z" }), notion({ status: "Cold Intake" }), BASELINE],
  ];
  for (const [label, m, n, b] of cases) {
    it(`${label} records notion_page_id`, () => {
      const steps = planSteps(decide(m, n, b), m, n);
      const db = steps.find((s) => s.kind === "rpc" && s.fn === "sync_client_portal_link")!;
      expect(db.args.p_notion_page_id).toBe(n.pageId);
    });
  }

  it("agreed statuses with the link already recorded are NONE — nothing to write", () => {
    const m = mojo({ clientStatus: "In Progress", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-25T00:00:00.000Z", notionPageId: "pg-1" });
    const d = decide(m, notion({ status: "In Progress" }), NO_BASELINE);
    expect(d.action).toBe("none");
    expect(planSteps(d, m, notion({ status: "In Progress" }))).toEqual([]);
  });

  it("agreed statuses with the link MISSING are link-only: one DB write, no Notion write, no status moves", () => {
    const m = mojo({ clientStatus: "In Progress", lastNotionStatusSeen: "In Progress", lastSyncedAt: "2026-09-25T00:00:00.000Z", notionPageId: null });
    const n = notion({ status: "In Progress", pageId: "pg-7" });
    const d = decide(m, n, NO_BASELINE);
    expect(d.action).toBe("link-only");
    expect(d.decidedBy).toBe("link");
    const steps = planSteps(d, m, n);
    expect(planTouchesNotion(steps)).toBe(false);
    expect(shape(steps)).toEqual(["rpc:sync_client_portal_link"]);
    expect(steps[0].args).toMatchObject({
      p_notion_page_id: "pg-7",
      p_set_client_status: false,
      p_set_map_created: false,
      p_last_notion_status_seen: "In Progress",
    });
  });

  it("link-only never fires when a promotion is due — the promotion wins", () => {
    const m = mojo({ clientStatus: "Cold Intake", lastNotionStatusSeen: "Cold Intake", lastSyncedAt: "2026-09-20T00:00:00.000Z", notionPageId: null });
    expect(decide(m, notion({ status: "Cold Intake" }), BASELINE).action).toBe("map-created");
  });
});

describe("R13 — a planned row is reconciled, never re-pushed", () => {
  const planned = (over: Partial<PlannedRow> = {}): PlannedRow => ({
    id: 6400, action: "create-at-map-created", to: MAP_CREATED, ...over,
  });

  it("LANDED: the Notion row holds the planned `to` → complete it, link the page, and touch NO Notion", () => {
    const m = mojo({ clientStatus: "Cold Intake" });
    const n = notion({ status: MAP_CREATED, pageId: "pg-new" });
    const r = reconcilePlan(m, n, planned());
    expect(r.action).toBe("reconcile-completed");
    expect(r.decidedBy).toBe("reconcile");
    expect(planTouchesNotion(r.steps)).toBe(false);
    expect(shape(r.steps)).toEqual(["rpc:sync_client_portal_link"]);
    expect(r.steps[0].args).toMatchObject({
      p_notion_page_id: "pg-new",
      p_planned_audit_id: 6400,
      p_set_client_status: true,
      p_next_status: MAP_CREATED,
      p_set_map_created: true,
      p_last_notion_status_seen: MAP_CREATED,
      p_decided_by: "reconcile",
      p_expected_status: "Cold Intake",
    });
    expect(r.rule).toMatch(/R13/);
    expect(r.rule).toMatch(/DID land/);
  });

  it("LANDED but already promoted: map_created_set_at is not set a second time", () => {
    const r = reconcilePlan(mojo({ clientStatus: MAP_CREATED, mapCreatedSetAt: "2026-09-01T00:00:00Z" }), notion({ status: MAP_CREATED }), planned());
    expect(r.steps[0].args).toMatchObject({ p_set_map_created: false });
  });

  it("MISSING: no Notion row carries the MojoMap ID → close the plan as failed, needs-operator, no Notion write", () => {
    const r = reconcilePlan(mojo(), null, planned());
    expect(r.action).toBe("reconcile-failed");
    expect(planTouchesNotion(r.steps)).toBe(false);
    expect(shape(r.steps)).toEqual(["rpc:sync_fail_notion_write"]);
    expect(r.steps[0].args).toMatchObject({ p_planned_audit_id: 6400, p_decided_by: "reconcile" });
    expect(r.rule).toMatch(/NEEDS OPERATOR/);
    expect(r.rule).toMatch(/no Notion row carries this MojoMap ID/);
  });

  it("MISMATCH: the row exists but holds another Status → failed, not a re-push", () => {
    const r = reconcilePlan(mojo(), notion({ status: "On Hold" }), planned());
    expect(r.action).toBe("reconcile-failed");
    expect(planTouchesNotion(r.steps)).toBe(false);
    expect(r.rule).toMatch(/holds "On Hold"/);
  });

  it("a planned PULL that landed sets client_status from the planned `to`, not from Map Created", () => {
    const r = reconcilePlan(
      mojo({ clientStatus: "In Progress" }),
      notion({ status: "On Hold" }),
      planned({ action: "pull", to: "On Hold" }),
    );
    expect(r.action).toBe("reconcile-completed");
    expect(r.steps[0].args).toMatchObject({ p_set_client_status: true, p_next_status: "On Hold", p_set_map_created: false });
  });

  it("a planned PUSH that landed moves no client_status — the push was MojoMap's own value", () => {
    const r = reconcilePlan(
      mojo({ clientStatus: "Completed" }),
      notion({ status: "Completed" }),
      planned({ action: "push", to: "Completed" }),
    );
    expect(r.action).toBe("reconcile-completed");
    expect(r.steps[0].args).toMatchObject({ p_set_client_status: false, p_set_map_created: false });
  });

  it("NO reconciliation outcome ever plans a Notion call", () => {
    for (const n of [null, notion({ status: MAP_CREATED }), notion({ status: "On Hold" })]) {
      for (const act of ["create-at-map-created", "push", "pull", "map-created", "seed-seen"]) {
        const r = reconcilePlan(mojo(), n, planned({ action: act }));
        expect(planTouchesNotion(r.steps)).toBe(false);
      }
    }
  });
});

describe("R11 — every normal plan carries its rule and decided_by into the audit", () => {
  it("the DB step passes decide()'s own rule and branch", () => {
    const m = mojo();
    const d = decide(m, null, BASELINE);
    const steps = planSteps(d, m, null);
    const db = steps.find((s) => s.kind === "rpc" && s.fn === "sync_client_portal_link")!;
    expect(db.args.p_rule).toBe(d.rule);
    expect(db.args.p_decided_by).toBe("promotion");
  });
});
