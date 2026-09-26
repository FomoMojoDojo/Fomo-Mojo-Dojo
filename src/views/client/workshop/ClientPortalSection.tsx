// B1 (Notion "Client Portals" sync) — the operator section on /preview/client-refine/company.
//
// R1: the "Track in Notion" switch is the per-company decision. Only flagged companies sync.
// R-frozen: the section RENDERS NOTHING for a frozen company. This is the second of two
//   independent gates — the DB's enforce_company_freeze trigger on client_portal_links refuses a
//   CB1 row whatever the UI does, and this early return means the UI never asks it to.
//   Deliberately NOT the CompanyRenameControl idiom (attempt it, render the trigger's refusal):
//   that control edits a row that already exists, whereas here the frozen answer is "there is no
//   such decision to make for this company", so drawing the controls at all would be a lie.
// R-cas: a status save updates only while the stored status still equals what this view read.
//   On a lost race the section refetches, snaps back to the stored value, and says so with the
//   C3 string (signed after the B1 screenshot round — B1 shipped this state silent, and on the
//   live proof the bare snap-back read as "my click didn't register"). The notice clears on the
//   next successful save, on Cancel, and on reload.
//
// CONFIRM-THEN-SAVE, copied from EngagementPhaseSection (same file this mounts in): the switch and
// the select STAGE a change, an explicit Confirm commits. One ceremony commits both, because the
// two are one operator decision ("track this client, at this status") and two confirms would ask
// twice for one intent.
//
// THE UI WRITES `enabled` AND `client_status`, NOTHING ELSE. The sync-owned columns are read and
// rendered; they are never in a payload from here.
import { useCallback, useEffect, useState } from "react";
import {
  CANCEL_LABEL,
  CLIENT_PORTAL_STATUSES,
  CLIENT_PORTAL_STRINGS as S,
  CONFIRM_LABEL,
  SAVING_LABEL,
  defaultClientPortalDeps,
  emptyLink,
  type ClientPortalDeps,
  type ClientPortalLinkRow,
  type ClientStatus,
} from "./clientPortalLink";

// Page palette — the Company page's own tokens (it lives outside .crpv-page vars where portals
// cannot reach, so this file mirrors the constants rather than importing a CSS variable).
const C = {
  ink: "#111111",
  inkSoft: "#555555",
  inkFaint: "#999999",
  line: "#d9d9d9",
  lineSoft: "#ededed",
  paper2: "#efefec",
  canvas: "#f6f6f4",
  warm: "#C4503D",
  mono: '"JetBrains Mono", ui-monospace, monospace',
  inter: '"Inter", system-ui, sans-serif',
};

/** `undefined` = nothing staged. `null` = staged "not set" (the empty choice). */
type StagedStatus = ClientStatus | null | undefined;

export function ClientPortalSection({
  companyId,
  frozen,
  deps = defaultClientPortalDeps,
}: {
  companyId: string;
  /** companies.frozen. R-frozen: true ⇒ this component renders nothing at all. */
  frozen: boolean;
  /** Injectable for tests; production uses supabase. */
  deps?: ClientPortalDeps;
}) {
  const [row, setRow] = useState<ClientPortalLinkRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingEnabled, setPendingEnabled] = useState<boolean | null>(null);
  const [pendingStatus, setPendingStatus] = useState<StagedStatus>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // C3 — a compare-and-set matched 0 rows and the select snapped back. Kept apart from `error`:
  // this is not a failure to report verbatim from the database, it is a signed sentence about a
  // race that the database handled correctly.
  const [staleNotice, setStaleNotice] = useState(false);

  const load = useCallback(async () => {
    const { row: fetched, error: readError } = await deps.readLink(companyId);
    setRow(fetched ?? emptyLink(companyId));
    setError(readError);
    setLoading(false);
  }, [companyId, deps]);

  useEffect(() => {
    if (frozen) return; // never read for a frozen company either
    setLoading(true);
    setPendingEnabled(null);
    setPendingStatus(undefined);
    setStaleNotice(false); // C3 — clears on reload
    void load();
  }, [frozen, load]);

  // R-frozen — the whole section, before any control or string exists.
  if (frozen) return null;

  const stored = row ?? emptyLink(companyId);
  const shownEnabled = pendingEnabled ?? stored.enabled;
  const shownStatus = pendingStatus === undefined ? stored.client_status : pendingStatus;
  const dirty = pendingEnabled !== null || pendingStatus !== undefined;

  const cancel = () => {
    setPendingEnabled(null);
    setPendingStatus(undefined);
    setError(null);
    setStaleNotice(false); // C3 — clears on Cancel
  };

  const confirm = async () => {
    setSaving(true);
    setError(null);

    const ensureError = await deps.ensureRow(companyId);
    if (ensureError) {
      setError(ensureError);
      setSaving(false);
      return;
    }

    if (pendingEnabled !== null) {
      const enabledError = await deps.saveEnabled(companyId, pendingEnabled);
      if (enabledError) {
        setError(enabledError);
        setSaving(false);
        await load();
        return;
      }
    }

    if (pendingStatus !== undefined) {
      const result = await deps.saveStatus(companyId, stored.client_status, pendingStatus);
      if (result.kind === "error") {
        setError(result.message);
        setSaving(false);
        await load();
        return;
      }
      // R-cas lost race: the stored value wins. Refetch, show it, and say so (C3) — the snap-back
      // on its own reads as "my click didn't register", which is the wrong thing to have learned.
      if (result.kind === "stale") {
        setPendingEnabled(null);
        setPendingStatus(undefined);
        setStaleNotice(true);
        setSaving(false);
        await load();
        return;
      }
    }

    setPendingEnabled(null);
    setPendingStatus(undefined);
    setStaleNotice(false); // C3 — clears on the next successful save
    setSaving(false);
    await load();
  };

  const busy = saving || loading;

  return (
    <section style={{ marginBottom: 36 }} data-testid="client-portal-section">
      {/* string 1. C2: the page's eyebrow idiom in full, uppercase transform included, so this
          section's heading sits with Engagement Phase and Artifact Provenance rather than beside
          them. The transform is CSS ONLY — the text node stays the signed "Client portal (Notion)"
          byte for byte, which is what the byte-exact test reads. */}
      <div style={{ marginBottom: 16 }}>
        <p
          style={{
            fontFamily: C.mono,
            fontSize: 9.5,
            textTransform: "uppercase",
            letterSpacing: "0.13em",
            color: C.inkFaint,
            margin: "0 0 2px",
          }}
        >
          {S.title}
        </p>
      </div>

      {/* string 2 — the R1 switch */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 14,
          cursor: busy ? "default" : "pointer",
        }}
      >
        <input
          type="checkbox"
          role="switch"
          checked={shownEnabled}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked;
            setPendingEnabled(next === stored.enabled ? null : next);
            setError(null);
          }}
          data-testid="client-portal-track-switch"
        />
        <span style={{ fontFamily: C.inter, fontSize: 13, color: C.ink }}>{S.switchLabel}</span>
      </label>

      {/* string 3 — the status field */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <label
          htmlFor="client-portal-status"
          style={{ fontFamily: C.inter, fontSize: 13, color: C.ink }}
        >
          {S.statusLabel}
        </label>
        <select
          id="client-portal-status"
          value={shownStatus ?? ""}
          disabled={busy}
          onChange={(e) => {
            const raw = e.target.value;
            const next: ClientStatus | null = raw === "" ? null : (raw as ClientStatus);
            setPendingStatus(next === stored.client_status ? undefined : next);
            setError(null);
          }}
          style={{
            fontFamily: C.inter,
            fontSize: 13,
            color: C.ink,
            padding: "5px 8px",
            border: `1px solid ${C.line}`,
            background: "#fff",
          }}
          data-testid="client-portal-status-select"
        >
          {/* the empty choice = not set (client_status NULL) */}
          <option value="" />
          {CLIENT_PORTAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Confirm-then-save. Labels reused byte-identically from EngagementPhaseSection. */}
      {dirty && (
        <div
          style={{
            border: `1px solid ${C.line}`,
            padding: "12px 14px",
            background: C.canvas,
            display: "flex",
            gap: 8,
            marginBottom: 14,
          }}
          data-testid="client-portal-confirm"
        >
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={saving}
            style={{
              fontFamily: C.mono,
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: saving ? C.inkFaint : "#fff",
              background: saving ? C.lineSoft : C.ink,
              border: "none",
              padding: "5px 14px",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? SAVING_LABEL : CONFIRM_LABEL}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            style={{
              fontFamily: C.mono,
              fontSize: 9.5,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: C.inkSoft,
              background: "none",
              border: `1px solid ${C.line}`,
              padding: "5px 14px",
              cursor: "pointer",
            }}
          >
            {CANCEL_LABEL}
          </button>
        </div>
      )}

      {/* string 7 (C3) — the lost compare-and-set. Renders ONLY after a save matched 0 rows and the
          select snapped back to the stored value. */}
      {staleNotice && (
        <p
          style={{ fontFamily: C.inter, fontSize: 12, color: C.warm, margin: "0 0 10px" }}
          data-testid="client-portal-stale-save"
        >
          {S.staleSave}
        </p>
      )}

      {/* string 5 — flagged for sync, no Notion row yet. Reads the STORED switch, not the staged
          one: it describes what the next sync will do, which a not-yet-confirmed click has not
          changed. */}
      {stored.enabled && stored.notion_page_id === null && (
        <p
          style={{ fontFamily: C.inter, fontSize: 12, color: C.inkSoft, margin: "0 0 6px" }}
          data-testid="client-portal-not-linked"
        >
          {S.notLinked}
        </p>
      )}

      {/* string 4 — only when last_synced_at is set */}
      {stored.last_synced_at && (
        <p
          style={{ fontFamily: C.mono, fontSize: 10, color: C.inkFaint, margin: "0 0 6px" }}
          data-testid="client-portal-last-synced"
        >
          {S.lastSynced(stored.last_synced_at)}
        </p>
      )}

      {/* string 6 — only when last_sync_error is set. The timestamp is last_sync_error_at; if the
          sync recorded a reason without its date, the reason still has to be sayable, so the row's
          own last_synced_at stands in and, failing that, the reason renders with no date rather
          than being swallowed. */}
      {stored.last_sync_error && (
        <p
          style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: "0 0 6px" }}
          data-testid="client-portal-sync-failed"
        >
          {S.syncFailed(
            stored.last_sync_error,
            stored.last_sync_error_at ?? stored.last_synced_at ?? "",
          )}
        </p>
      )}

      {/* A read/write failure from the DB, rendered verbatim as returned (the CompanyRenameControl
          law: the database is the authority on its own refusals). Not a signed product string. */}
      {error && (
        <p
          style={{ fontFamily: C.mono, fontSize: 10, color: C.warm, margin: 0 }}
          data-testid="client-portal-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}

export default ClientPortalSection;
