// B1 (Notion "Client Portals" sync) — the seven signed strings, the seven signed statuses, and the
// read/write path for client_portal_links. Kept out of the component so the strings and the
// compare-and-set decision are assertable without rendering the 1.5k-line Company page.
//
// THE STRING SET IS CLOSED. Six strings were signed with B1; a seventh (staleSave) was signed as
// C3 after the screenshot round. No others may be added. Everything the section renders beyond
// them is either a signed status value, or a control label already present verbatim on this page
// (see CONFIRM_LABEL below, ratified as C1).
//
// THE UI WRITES EXACTLY TWO COLUMNS: `enabled` and `client_status`. The sync-owned columns
// (map_created_set_at, last_synced_at, last_sync_error, last_sync_error_at) and the DB-stamped
// status_changed_at never appear in a payload from here — asserted in the component test by
// inspecting the payloads these functions receive.
import { supabase } from "@/integrations/supabase/client";

// client_portal_links is newly added and is not in the generated Supabase types, so we use the
// established `supabase as any` access pattern (see src/lib/pollPublicBaseline.ts for
// long_runner_runs, and src/lib/admin/companiesInventory.ts). `npm run types:gen` would regenerate
// the whole file, which is not this brief's to change. ClientPortalLinkRow below is the hand-written
// shape, and it is the migration's column list — the SQL test is what holds the two in step.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ── R-status: exactly the seven Notion single-select values, in Notion's own option order ───────
// B2a moved the three of these into ./clientPortalStatuses, which imports nothing, so B2a's sync
// runner can compare them against the live Notion options from Node — this module imports the
// browser Supabase client and cannot run there. Re-exported here so every importer is unchanged and
// there is still exactly ONE definition of the seven.
// Imported for this module's own use AND re-exported: a bare `export … from` would not bring
// ClientStatus into scope here, and this file's own signatures are written in terms of it.
import {
  CLIENT_PORTAL_STATUSES,
  isClientStatus,
  type ClientStatus,
} from "./clientPortalStatuses";
export { CLIENT_PORTAL_STATUSES, isClientStatus, type ClientStatus };

/** Dates render in the VIEWER's local time (signed). Both timestamp strings go through this. */
export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ── operator-signed strings (byte-exact; no others may be added) ────────────────────────────────
export const CLIENT_PORTAL_STRINGS = {
  /** string 1 — section title */
  title: "Client portal (Notion)",
  /** string 2 — switch label */
  switchLabel: "Track in Notion",
  /** string 3 — status field label */
  statusLabel: "Client status",
  /** string 4 — renders ONLY when last_synced_at is set */
  lastSynced: (iso: string) => `Last synced ${formatLocalDateTime(iso)}`,
  /** string 5 — renders when the switch is on and notion_page_id is NULL */
  notLinked: "Not linked yet — the next sync creates the Notion row.",
  /** string 6 — renders ONLY when last_sync_error is set */
  syncFailed: (reason: string, iso: string) =>
    `Sync failed — ${reason} · ${formatLocalDateTime(iso)}`,
  /**
   * string 7 (C3, signed after the B1 screenshot round) — the lost compare-and-set.
   *
   * B1 shipped this state SILENT: a lost race changed the select from what the operator had just
   * picked to what was stored, with nothing said. On the live proof that read as "my click didn't
   * register" — the one state where the operator most needs to be told something happened. Renders
   * ONLY after a compare-and-set matched 0 rows and the select snapped back; clears on the next
   * successful save, on Cancel, and on reload.
   */
  staleSave: "This status changed before your save — showing the saved status.",
} as const;

// The confirm/cancel/saving labels are NOT new strings: they are reused byte-identically from
// EngagementPhaseSection in ClientRefinePreviewCompanyView.tsx, whose confirm-then-save pattern
// this section copies. Reusing an existing control label is not adding to the signed vocabulary —
// and without a confirm step there is no pattern left to copy. Flagged for ratification.
export const CONFIRM_LABEL = "Confirm";
export const CANCEL_LABEL = "Cancel";
export const SAVING_LABEL = "Saving…";

// ── the row ─────────────────────────────────────────────────────────────────────────────────────
export type ClientPortalLinkRow = {
  company_id: string;
  enabled: boolean;
  client_status: ClientStatus | null;
  status_changed_at: string | null;
  notion_page_id: string | null;
  last_notion_status_seen: ClientStatus | null;
  /** sync-owned — read here, never written here */
  map_created_set_at: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  last_sync_error_at: string | null;
};

/** A company with no row has never been considered for sync: switch off, status not set. */
export function emptyLink(companyId: string): ClientPortalLinkRow {
  return {
    company_id: companyId,
    enabled: false,
    client_status: null,
    status_changed_at: null,
    notion_page_id: null,
    last_notion_status_seen: null,
    map_created_set_at: null,
    last_synced_at: null,
    last_sync_error: null,
    last_sync_error_at: null,
  };
}

const SELECT_COLS =
  "company_id,enabled,client_status,status_changed_at,notion_page_id,last_notion_status_seen,map_created_set_at,last_synced_at,last_sync_error,last_sync_error_at";

/**
 * What one Confirm asks for. The tri-states mirror the component's staging model exactly:
 * `enabled: null` = the switch was not touched; `setStatus: false` = the select was not touched.
 * `expectedStatus` is R-cas — the value the operator READ, which the RPC compares under a row lock.
 */
export type SaveLinkArgs = {
  enabled: boolean | null;
  setStatus: boolean;
  expectedStatus: ClientStatus | null;
  nextStatus: ClientStatus | null;
};

/**
 * Outcome of one Confirm. `stale` carries what the row actually holds now.
 *
 * B1a (R4): `saved` means the row change AND its integrity_runs audit row committed together.
 * `stale` means a lost compare-and-set, and — changed from B1 — means NOTHING was written: B1
 * committed the `enabled` half before the status leg ran, so a lost race left half an operator
 * decision stored. One RPC, one transaction, so a lost race now leaves the row exactly as it was.
 */
export type SaveLinkResult =
  | { kind: "saved"; audit_id: number | null }
  | { kind: "stale"; stored: ClientStatus | null }
  | { kind: "error"; message: string };

/** Kept for callers that still name the old result type. */
export type StatusSaveResult = SaveLinkResult;

export type ClientPortalDeps = {
  /** null = no row yet. */
  readLink: (companyId: string) => Promise<{ row: ClientPortalLinkRow | null; error: string | null }>;
  /**
   * B1a (R4/R6/R7): the ONE write path. Replaces ensureRow + saveEnabled + saveStatus, which were
   * three separate PostgREST calls in three separate transactions. Refuses a non-admin, a frozen
   * company and a no-op; on success writes one integrity_runs audit row in the same transaction.
   */
  saveLink: (companyId: string, args: SaveLinkArgs) => Promise<SaveLinkResult>;
};

export const defaultClientPortalDeps: ClientPortalDeps = {
  readLink: async (companyId) => {
    const { data, error } = await sb
      .from("client_portal_links")
      .select(SELECT_COLS)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) return { row: null, error: error.message || "Could not read the portal link." };
    return { row: (data as ClientPortalLinkRow | null) ?? null, error: null };
  },

  // ONE RPC, ONE TRANSACTION (B1a, R4). The row is created if absent, both columns move together,
  // and the audit row lands with them. Nothing here names the actor: the RPC takes it from
  // auth.uid() and requires the admin role, so a caller cannot write an audit row as someone else.
  // No sync-owned column and no status_changed_at appears in any argument — status_changed_at is
  // still stamped by the DB trigger, because a browser clock must never date a status change.
  saveLink: async (companyId, args) => {
    const { data, error } = await sb.rpc("set_client_portal_link", {
      p_company_id: companyId,
      p_enabled: args.enabled,
      p_set_status: args.setStatus,
      p_expected_status: args.expectedStatus,
      p_next_status: args.nextStatus,
    });
    if (error) return { kind: "error", message: error.message || "Could not save the portal link." };
    const row = (data ?? {}) as {
      ok?: boolean;
      kind?: string;
      stored_status?: ClientStatus | null;
      audit_id?: number | null;
    };
    if (row.ok === false && row.kind === "stale") {
      return { kind: "stale", stored: row.stored_status ?? null };
    }
    if (row.ok !== true) return { kind: "error", message: "Could not save the portal link." };
    return { kind: "saved", audit_id: row.audit_id ?? null };
  },
};
