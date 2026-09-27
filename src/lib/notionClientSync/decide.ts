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
  /** The page this row is linked to, or null when the link was never recorded. */
  notionPageId: string | null;
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
  /** R10: an eligible new company is born at Map Created — one run, not two. */
  | "create-at-map-created"
  | "push"
  | "pull"
  | "seed-seen"
  /** The two sides agree but the link was never recorded — bookkeeping only, no status moves. */
  | "link-only"
  | "map-created"
  | "needs-operator"
  | "none";

/** R11: which branch chose the action. Rides in the audit row beside the rule. */
export type DecidedBy =
  | "frozen"
  | "create"
  | "promotion"
  | "first-sync"
  | "only-one-side-moved"
  | "newest-wins"
  | "no-change"
  | "link"
  | "reconcile";

export type Decision = {
  action: SyncAction;
  /** The rule that decided it, in words, for the operator's report. */
  rule: string;
  decidedBy: DecidedBy;
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
 *   2. No linked Notion row → create. R10: the promotion is decided FIRST, so an eligible company
 *      is created directly AT Map Created and MojoMap moves there in the same run. B2a's message
 *      described a two-run cascade (create at Cold Intake, promote on the next pass); R10 supersedes
 *      it, because the intermediate Cold Intake row was a state no one wanted to see and a second
 *      run was needed to leave it.
 *   3. For a LINKED row the two sides are compared and any disagreement resolved first.
 *   4. The promotion on a linked row is considered ONLY when that comparison came out `none`.
 *
 * Step 4's ordering is NOT in the signed design and is a choice: on a linked row the promotion is a
 * MojoMap-side status change, so firing it while a Notion edit is still unresolved would overwrite an
 * operator's edit with a machine's. Deferring it costs one run and is the cheaper mistake. Step 2 is
 * different and needs no such care: there is no Notion row yet, so there is no edit to overwrite.
 */
export function decide(m: MojoSide, n: NotionSide | null, b: BaselineFacts): Decision {
  if (m.companyId === CB1_FROZEN_ID) {
    return { action: "refused-frozen", decidedBy: "frozen", rule: "CB1 is the frozen reference company and is never synced, flagged or not." };
  }

  if (n === null) {
    // R10 — the promotion is decided BEFORE creation.
    if (mapCreatedEligible(m, b)) {
      return {
        action: "create-at-map-created",
        decidedBy: "promotion",
        rule: `R10: flagged company with no linked Notion row, a finished baseline, status ${m.clientStatus === null ? "empty" : `"${m.clientStatus}"`} and map_created_set_at NULL → the row is created directly at Map Created and MojoMap moves to Map Created in the SAME run. No Cold Intake row is ever written.`,
      };
    }
    return {
      action: "create",
      decidedBy: "create",
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
        decidedBy: "first-sync",
        rule: "First sync and the two statuses already agree → nothing to resolve; B2b records last_notion_status_seen so the next run can detect a Notion change.",
      };
    }
    return {
      action: "needs-operator",
      decidedBy: "first-sync",
      rule: `R8: first sync (last_notion_status_seen is NULL) with differing statuses — MojoMap "${m.clientStatus ?? "(not set)"}" vs Notion "${notionStatus ?? "(empty)"}" — is never resolved automatically.`,
    };
  }

  if (agree) {
    if (mapCreatedEligible(m, b)) {
      return {
        action: "map-created",
        decidedBy: "promotion",
        rule: `Statuses agree, the company has a finished baseline, the status is ${m.clientStatus === null ? "empty" : `"${m.clientStatus}"`} and map_created_set_at is NULL → promote to Map Created, once, never backward.`,
      };
    }
// The sides agree and no promotion applies — but if this row never recorded WHICH page it is
    // linked to, that is still something to write. B1 specifies notion_page_id as "NULL until a sync
    // creates or links the row", and the section renders "Not linked yet — the next sync creates the
    // Notion row." while it is NULL: on an already-linked company that string is false, and it
    // promises a creation that will never happen. So the link is recorded, and nothing else moves.
    if (m.notionPageId === null) {
      return {
        action: "link-only",
        decidedBy: "link",
        rule: `The two statuses agree, but notion_page_id was never recorded for this row. Linking page ${n.pageId} — bookkeeping only: no status moves on either side, and no Notion write.`,
      };
    }
    return { action: "none", decidedBy: "no-change", rule: "The two statuses already agree and no promotion applies." };
  }

  // ── both sides disagree: decide who moved, then newest wins ──
  const notionChanged = notionStatus !== m.lastNotionStatusSeen;
  const mojoChanged =
    m.statusChangedAt !== null && (m.lastSyncedAt === null || m.statusChangedAt > m.lastSyncedAt);

  if (notionChanged && !mojoChanged) {
    return {
      action: "pull",
      decidedBy: "only-one-side-moved",
      rule: `Notion Status differs from last_notion_status_seen ("${m.lastNotionStatusSeen}") and MojoMap has not moved since the last sync → pull Notion's value into MojoMap.`,
    };
  }
  if (mojoChanged && !notionChanged) {
    return {
      action: "push",
      decidedBy: "only-one-side-moved",
      rule: "MojoMap status_changed_at is newer than last_synced_at and Notion still holds last_notion_status_seen → push MojoMap's value to Notion.",
    };
  }
  if (!notionChanged && !mojoChanged) {
    // Neither side shows a change yet the values differ: the bookkeeping disagrees with the rows.
    return {
      action: "needs-operator",
      decidedBy: "no-change",
      rule: "The statuses differ but neither side records a change since the last sync — the bookkeeping cannot say who moved, so nothing is resolved automatically.",
    };
  }

  // Both moved. Newest wins, MojoMap's status_changed_at against the page's last_edited_time.
  const mojoAt = m.statusChangedAt === null ? 0 : Date.parse(m.statusChangedAt);
  const notionAt = Date.parse(n.lastEditedTime);
  if (!Number.isFinite(mojoAt) || !Number.isFinite(notionAt)) {
    return { action: "needs-operator", decidedBy: "newest-wins", rule: "Both sides moved but a timestamp could not be parsed, so newest-wins cannot be evaluated." };
  }
  if (mojoAt === notionAt) {
    return {
      action: "needs-operator",
      decidedBy: "newest-wins",
      rule: "Both sides moved and the two timestamps are equal — Notion's last_edited_time is page-level and minute-granular, so a tie is not evidence of order.",
    };
  }
  return mojoAt > notionAt
    ? { action: "push", decidedBy: "newest-wins", rule: `Both sides moved; MojoMap status_changed_at (${m.statusChangedAt}) is newer than the page's last_edited_time (${n.lastEditedTime}) → newest wins, push.` }
    : { action: "pull", decidedBy: "newest-wins", rule: `Both sides moved; the page's last_edited_time (${n.lastEditedTime}) is newer than MojoMap status_changed_at (${m.statusChangedAt}) → newest wins, pull.` };
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
