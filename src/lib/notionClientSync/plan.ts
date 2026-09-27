// B2b — the ordered call plan for one company. Pure: no network, no DB, no clock.
//
// R11's ordering lives here, in one place, so the dry run prints exactly what --live would execute and
// the guard can exercise the execution against a fake Notion. Notion first, DB second; a `planned`
// audit row before every Notion write and never before a DB-only action.
import type { DecidedBy, Decision, MojoSide, NotionSide } from "./decide";

export const MAP_CREATED = "Map Created";

export type PlanStep =
  | { kind: "rpc"; fn: "sync_plan_notion_write"; label: string; args: Record<string, unknown> }
  | { kind: "notion"; op: "createRow"; label: string; args: { name: string; mojoMapId: string; status: string | null } }
  | { kind: "notion"; op: "patchStatus"; label: string; args: { pageId: string; status: string | null; expectLastEditedTime?: string } }
  | { kind: "rpc"; fn: "sync_client_portal_link"; label: string; args: Record<string, unknown> }
  /** R13: closing a planned row as failed is a PLANNED step, not only a catch-block reaction. */
  | { kind: "rpc"; fn: "sync_fail_notion_write"; label: string; args: Record<string, unknown> };

/** A client_status_sync row left 'planned' by an earlier run. */
export type PlannedRow = { id: number; action: string; to: string | null };

/**
 * R13 — the planned-row reconciliation, and the ONLY thing that may happen to a company carrying an
 * open `planned` row.
 *
 * A planned row with no partner means a Notion write may have landed while the DB write did not. The
 * row is found again ONLY through POST /v1/data_sources/{id}/query, matched by MojoMap ID — never by
 * enumerating a page's children. Then exactly two outcomes, and no third:
 *
 *   the row exists AND its Status equals the planned `to`  → the write DID land. Complete it: link
 *       notion_page_id, close the plan, audit with decided_by = 'reconcile'. NO Notion write.
 *   otherwise (no row, or a different Status)               → close the plan as FAILED, record
 *       last_sync_error, and report needs-operator. NO Notion write.
 *
 * It NEVER re-pushes. Re-pushing would double-apply a write that had already landed, and for a Map
 * Created promotion that is a second promotion — the one thing map_created_set_at exists to prevent.
 * Where the sync cannot tell, it stops and says so rather than guessing.
 */
export function reconcilePlan(
  m: MojoSide,
  n: NotionSide | null,
  planned: PlannedRow,
): { action: "reconcile-completed" | "reconcile-failed"; rule: string; decidedBy: DecidedBy; steps: PlanStep[] } {
  const landed = n !== null && n.status === planned.to;

  if (landed) {
    const promo = planned.action === "create-at-map-created" || planned.action === "map-created";
    const pulls = planned.action === "pull";
    const rule =
      `R13: integrity_runs ${planned.id} was left 'planned' for ${planned.action}, and the Notion row ` +
      `matched by MojoMap ID now holds "${planned.to ?? "(empty)"}" — the write DID land. Completing it here ` +
      `(link the page, close the plan, decided_by reconcile). Nothing is pushed to Notion.`;
    return {
      action: "reconcile-completed",
      decidedBy: "reconcile",
      rule,
      steps: [
        {
          kind: "rpc",
          fn: "sync_client_portal_link",
          label: `R13 reconcile: the Notion write landed — link it and close the plan, with NO Notion write`,
          args: {
            p_company_id: m.companyId,
            p_action: planned.action,
            p_expected_status: m.clientStatus,
            p_set_client_status: promo || pulls,
            p_next_status: promo ? MAP_CREATED : pulls ? planned.to : null,
            p_notion_page_id: n!.pageId,
            p_last_notion_status_seen: n!.status,
            p_set_map_created: promo && m.mapCreatedSetAt === null,
            p_planned_audit_id: planned.id,
            p_rule: rule,
            p_decided_by: "reconcile",
          },
        },
      ],
    };
  }

  const seen = n === null ? "no Notion row carries this MojoMap ID" : `the Notion row holds "${n.status ?? "(empty)"}"`;
  const rule =
    `R13: integrity_runs ${planned.id} was left 'planned' for ${planned.action} with to="${planned.to ?? "(empty)"}", but ` +
    `${seen}. The sync cannot tell whether the write never landed or landed and was then changed, so it closes the plan ` +
    `as failed and stops. NEEDS OPERATOR — nothing is pushed.`;
  return {
    action: "reconcile-failed",
    decidedBy: "reconcile",
    rule,
    steps: [
      {
        kind: "rpc",
        fn: "sync_fail_notion_write",
        label: "R13 reconcile: the Notion write did NOT land as planned — close the plan as failed, record last_sync_error, and stop",
        args: {
          p_company_id: m.companyId,
          p_action: planned.action,
          p_error: rule,
          p_planned_audit_id: planned.id,
          p_rule: rule,
          p_decided_by: "reconcile",
        },
      },
    ],
  };
}

/** The ordered steps --live would execute. Empty for none / needs-operator / refused-frozen. */
export function planSteps(d: Decision, m: MojoSide, n: NotionSide | null): PlanStep[] {
  const expected = m.clientStatus; // R-cas: the value the sync read
  const planRow = (action: string, from: string | null, to: string | null, pageId: string | null): PlanStep => ({
    kind: "rpc",
    fn: "sync_plan_notion_write",
    label: `record the intent as 'planned' before touching Notion (${action}: ${from ?? "(not set)"} → ${to ?? "(empty)"})`,
    args: { p_company_id: m.companyId, p_action: action, p_from: from, p_to: to, p_notion_page_id: pageId },
  });
  const dbRow = (
    action: string,
    over: {
      setClientStatus?: boolean;
      nextStatus?: string | null;
      notionPageId?: string | null;
      lastSeen?: string | null;
      setMapCreated?: boolean;
    },
  ): PlanStep => ({
    kind: "rpc",
    fn: "sync_client_portal_link",
    label: `close it: write the sync-owned columns and ONE client_status_sync audit row, in one transaction (${action})`,
    args: {
      p_company_id: m.companyId,
      p_action: action,
      p_expected_status: expected,
      p_set_client_status: over.setClientStatus ?? false,
      p_next_status: over.nextStatus ?? null,
      p_notion_page_id: over.notionPageId ?? null,
      p_last_notion_status_seen: over.lastSeen ?? null,
      p_set_map_created: over.setMapCreated ?? false,
      p_planned_audit_id: "<the id the planned row returned>",
      p_rule: d.rule,
      p_decided_by: d.decidedBy,
    },
  });

  switch (d.action) {
    case "create":
      return [
        planRow("create", null, m.clientStatus, null),
        {
          kind: "notion",
          op: "createRow",
          label: `create the Notion row (Name, MojoMap ID, Status = "${m.clientStatus ?? "(empty)"}")`,
          args: { name: m.companyName, mojoMapId: m.companyId, status: m.clientStatus },
        },
        // a create does NOT move client_status: the operator chose it
        dbRow("create", { notionPageId: "<the new page id>", lastSeen: m.clientStatus }),
      ];

    case "create-at-map-created":
      return [
        planRow("create-at-map-created", m.clientStatus, MAP_CREATED, null),
        {
          kind: "notion",
          op: "createRow",
          label: `create the Notion row directly at "${MAP_CREATED}" (R10 — never at Cold Intake first)`,
          args: { name: m.companyName, mojoMapId: m.companyId, status: MAP_CREATED },
        },
        dbRow("create-at-map-created", {
          setClientStatus: true,
          nextStatus: MAP_CREATED,
          notionPageId: "<the new page id>",
          lastSeen: MAP_CREATED,
          setMapCreated: true,
        }),
      ];

    case "push":
      if (n === null) return [];
      return [
        planRow("push", m.lastNotionStatusSeen, m.clientStatus, n.pageId),
        {
          kind: "notion",
          op: "patchStatus",
          label: `re-read the page, confirm its parent is the Client Portals data source, then PATCH Status = "${m.clientStatus ?? "(empty)"}"`,
          args: { pageId: n.pageId, status: m.clientStatus, expectLastEditedTime: n.lastEditedTime },
        },
        dbRow("push", { notionPageId: n.pageId, lastSeen: m.clientStatus }),
      ];

    case "pull":
      if (n === null) return [];
      // no Notion write, so NO planned row: there is nothing that could half-land
      return [dbRow("pull", { notionPageId: n.pageId, setClientStatus: true, nextStatus: n.status, lastSeen: n.status })];

    case "seed-seen":
      if (n === null) return [];
      return [dbRow("seed-seen", { notionPageId: n.pageId, lastSeen: n.status })];

    case "map-created":
      if (n === null) return [];
      return [
        planRow("map-created", m.clientStatus, MAP_CREATED, n.pageId),
        {
          kind: "notion",
          op: "patchStatus",
          label: `re-read the page, then PATCH Status = "${MAP_CREATED}"`,
          args: { pageId: n.pageId, status: MAP_CREATED, expectLastEditedTime: n.lastEditedTime },
        },
        dbRow("map-created", { notionPageId: n.pageId, setClientStatus: true, nextStatus: MAP_CREATED, lastSeen: MAP_CREATED, setMapCreated: true }),
      ];

    case "link-only":
      if (n === null) return [];
      // no planned row: there is no Notion write that could half-land
      return [dbRow("seed-seen", { notionPageId: n.pageId, lastSeen: n.status })];

    case "none":
    case "needs-operator":
    case "refused-frozen":
      return [];
  }
}

/** Does this plan touch Notion at all? Used to assert a dry run planned no write it did not declare. */
export function planTouchesNotion(steps: readonly PlanStep[]): boolean {
  return steps.some((s) => s.kind === "notion");
}
