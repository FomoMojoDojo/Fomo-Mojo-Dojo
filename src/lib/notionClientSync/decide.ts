// B2a — the per-company decision, pure. No network, no DB, no clock of its own.
//
// This is the whole of what B2b will act on, kept here so it is testable without either side. The
// dry run prints exactly what this returns.
import { CLIENT_PORTAL_STATUSES, type ClientStatus } from "@/views/client/workshop/clientPortalStatuses";

/** CB1 — the frozen reference company. Never synced, even if someone flags it. */
export const CB1_FROZEN_ID = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";

/** The statuses from which the Map Created promotion may fire. */
export const MAP_CREATED_FROM: readonly (ClientStatus | null)[] = [null, "Cold Intake", "Web Intake"];

export type MojoSide = {
  companyId: string;
  companyName: string;
  clientStatus: ClientStatus | null;
  statusChangedAt: string | null;
  lastNotionStatusSeen: ClientStatus | null;
  lastSyncedAt: string | null;
  mapCreatedSetAt: string | null;
};

export type NotionSide = {
  pageId: string;
  status: string | null;
  /** Page-level, minute-granular. The known limit in the signed design. */
  lastEditedTime: string;
};

export type BaselineFacts = {
  finished: boolean;
  /** long_runner_runs.id is a uuid; public_baseline_runs.id is a bigint. */
  longRunnerRunIds: string[];
  publicBaselineRunIds: number[];
};

export type SyncAction =
  | "refused-frozen"
  | "create"
  | "push"
  | "pull"
  | "seed-seen"
  | "map-created"
  | "needs-operator"
  | "none";

export type Decision = {
  action: SyncAction;
  /** The rule that decided it, in words, for the operator's report. */
  rule: string;
};

export function mapCreatedEligible(m: MojoSide, b: BaselineFacts): boolean {
  return (
    b.finished &&
    MAP_CREATED_FROM.includes(m.clientStatus) &&
    m.mapCreatedSetAt === null
  );
}

/**
 * Precedence, and why it is this way:
 *
 *   1. CB1 is refused before anything else is considered.
 *   2. No linked Notion row  → create. There is nothing to compare yet.
 *   3. The two sides are compared and any disagreement resolved FIRST.
 *   4. The Map Created promotion is considered ONLY when that comparison came out `none`.
 *
 * Step 4's ordering is NOT in the signed design and is a choice: the promotion is a MojoMap-side
 * status change, so firing it while a Notion edit is still unresolved would overwrite an operator's
 * edit with a machine's. Deferring it costs one run — the promotion fires on the next pass, once the
 * disagreement is settled — and that is the cheaper mistake.
 */
export function decide(m: MojoSide, n: NotionSide | null, b: BaselineFacts): Decision {
  if (m.companyId === CB1_FROZEN_ID) {
    return { action: "refused-frozen", rule: "CB1 is the frozen reference company and is never synced, flagged or not." };
  }

  if (n === null) {
    return {
      action: "create",
      rule: "Flagged company with no linked Notion row → B2b creates one (Name, MojoMap ID, Status = MojoMap client_status).",
    };
  }

  const notionStatus = n.status;
  const agree = notionStatus === m.clientStatus;

  // ── first sync: last_notion_status_seen is NULL, so "did Notion change?" is unanswerable ──
  if (m.lastNotionStatusSeen === null) {
    if (agree) {
      return {
        action: "seed-seen",
        rule: "First sync and the two statuses already agree → nothing to resolve; B2b records last_notion_status_seen so the next run can detect a Notion change.",
      };
    }
    return {
      action: "needs-operator",
      rule: `R8: first sync (last_notion_status_seen is NULL) with differing statuses — MojoMap "${m.clientStatus ?? "(not set)"}" vs Notion "${notionStatus ?? "(empty)"}" — is never resolved automatically.`,
    };
  }

  if (agree) {
    if (mapCreatedEligible(m, b)) {
      return {
        action: "map-created",
        rule: `Statuses agree, the company has a finished baseline, the status is ${m.clientStatus === null ? "empty" : `"${m.clientStatus}"`} and map_created_set_at is NULL → promote to Map Created, once, never backward.`,
      };
    }
    return { action: "none", rule: "The two statuses already agree and no promotion applies." };
  }

  // ── both sides disagree: decide who moved, then newest wins ──
  const notionChanged = notionStatus !== m.lastNotionStatusSeen;
  const mojoChanged =
    m.statusChangedAt !== null && (m.lastSyncedAt === null || m.statusChangedAt > m.lastSyncedAt);

  if (notionChanged && !mojoChanged) {
    return {
      action: "pull",
      rule: `Notion Status differs from last_notion_status_seen ("${m.lastNotionStatusSeen}") and MojoMap has not moved since the last sync → pull Notion's value into MojoMap.`,
    };
  }
  if (mojoChanged && !notionChanged) {
    return {
      action: "push",
      rule: "MojoMap status_changed_at is newer than last_synced_at and Notion still holds last_notion_status_seen → push MojoMap's value to Notion.",
    };
  }
  if (!notionChanged && !mojoChanged) {
    // Neither side shows a change yet the values differ: the bookkeeping disagrees with the rows.
    return {
      action: "needs-operator",
      rule: "The statuses differ but neither side records a change since the last sync — the bookkeeping cannot say who moved, so nothing is resolved automatically.",
    };
  }

  // Both moved. Newest wins, MojoMap's status_changed_at against the page's last_edited_time.
  const mojoAt = m.statusChangedAt === null ? 0 : Date.parse(m.statusChangedAt);
  const notionAt = Date.parse(n.lastEditedTime);
  if (!Number.isFinite(mojoAt) || !Number.isFinite(notionAt)) {
    return { action: "needs-operator", rule: "Both sides moved but a timestamp could not be parsed, so newest-wins cannot be evaluated." };
  }
  if (mojoAt === notionAt) {
    return {
      action: "needs-operator",
      rule: "Both sides moved and the two timestamps are equal — Notion's last_edited_time is page-level and minute-granular, so a tie is not evidence of order.",
    };
  }
  return mojoAt > notionAt
    ? { action: "push", rule: `Both sides moved; MojoMap status_changed_at (${m.statusChangedAt}) is newer than the page's last_edited_time (${n.lastEditedTime}) → newest wins, push.` }
    : { action: "pull", rule: `Both sides moved; the page's last_edited_time (${n.lastEditedTime}) is newer than MojoMap status_changed_at (${m.statusChangedAt}) → newest wins, pull.` };
}

/** A Notion row is only in scope when its MojoMap ID names a flagged, non-CB1 company. */
export type IgnoreReason = "no-mojomap-id" | "id-not-flagged" | "id-matches-no-company" | "cb1";

export function ignoreReason(
  mojoMapId: string | null,
  flaggedCompanyIds: ReadonlySet<string>,
  knownCompanyIds: ReadonlySet<string>,
): IgnoreReason | null {
  if (mojoMapId === null || mojoMapId.trim() === "") return "no-mojomap-id";
  const id = mojoMapId.trim();
  if (id === CB1_FROZEN_ID) return "cb1";
  if (!knownCompanyIds.has(id)) return "id-matches-no-company";
  if (!flaggedCompanyIds.has(id)) return "id-not-flagged";
  return null;
}

export function isClientStatusValue(v: unknown): v is ClientStatus {
  return typeof v === "string" && (CLIENT_PORTAL_STATUSES as readonly string[]).includes(v);
}
