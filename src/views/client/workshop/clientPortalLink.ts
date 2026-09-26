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
export const CLIENT_PORTAL_STATUSES = [
  "Cold Intake",
  "Web Intake",
  "Map Created",
  "In Progress",
  "Completed",
  "On Hold",
  "Ongoing",
] as const;

export type ClientStatus = (typeof CLIENT_PORTAL_STATUSES)[number];

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && (CLIENT_PORTAL_STATUSES as readonly string[]).includes(value);
}

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

/** Outcome of a compare-and-set status write. `stale` carries what the row actually holds now. */
export type StatusSaveResult =
  | { kind: "saved" }
  | { kind: "stale"; stored: ClientStatus | null }
  | { kind: "error"; message: string };

export type ClientPortalDeps = {
  /** null = no row yet. */
  readLink: (companyId: string) => Promise<{ row: ClientPortalLinkRow | null; error: string | null }>;
  /** Insert the default row if absent; never touches client_status or a sync-owned column. */
  ensureRow: (companyId: string) => Promise<string | null>;
  saveEnabled: (companyId: string, enabled: boolean) => Promise<string | null>;
  /** R-cas. Updates only while the stored status still equals what the writer read. */
  saveStatus: (
    companyId: string,
    expected: ClientStatus | null,
    next: ClientStatus | null,
  ) => Promise<StatusSaveResult>;
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

  // ON CONFLICT DO NOTHING. The payload is the key alone, so an existing row — its status, its
  // sync bookkeeping — is left exactly as it was. This is the "upsert on first save" step; the
  // status itself is only ever set by the compare-and-set below.
  ensureRow: async (companyId) => {
    const { error } = await sb
      .from("client_portal_links")
      .upsert({ company_id: companyId }, { onConflict: "company_id", ignoreDuplicates: true });
    return error ? error.message || "Could not create the portal link row." : null;
  },

  saveEnabled: async (companyId, enabled) => {
    const { error } = await sb
      .from("client_portal_links")
      .update({ enabled })
      .eq("company_id", companyId);
    return error ? error.message || "Could not save the switch." : null;
  },

  // R-cas: `AND client_status IS NOT DISTINCT FROM <expected>`, spelled through PostgREST as
  // .is(null) or .eq(value) — the two halves of IS NOT DISTINCT FROM. status_changed_at is NOT in
  // the payload: the DB trigger stamps it with server now() (a browser clock must never date a
  // status change). A returned empty set means another writer moved first.
  saveStatus: async (companyId, expected, next) => {
    let q = sb
      .from("client_portal_links")
      .update({ client_status: next })
      .eq("company_id", companyId);
    q = expected === null ? q.is("client_status", null) : q.eq("client_status", expected);
    const { data, error } = await q.select("client_status");
    if (error) return { kind: "error", message: error.message || "Could not save the status." };
    if (!Array.isArray(data) || data.length === 0) {
      const fresh = await defaultClientPortalDeps.readLink(companyId);
      return { kind: "stale", stored: fresh.row?.client_status ?? null };
    }
    return { kind: "saved" };
  },
};
