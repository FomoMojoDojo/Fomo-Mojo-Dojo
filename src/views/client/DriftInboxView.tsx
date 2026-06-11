import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import { useCompany } from "@/hooks/useCompany";
import { renderMarketDriftSummary } from "@/lib/marketDriftVoice";
import { useIntegrityRecord } from "@/hooks/useIntegrityRecord";
import { useDriftInbox, type DriftInboxItem, type InboxFilter } from "@/hooks/useDriftInbox";
import { useDriftInboxCount } from "@/hooks/useDriftInbox";
import DriftDetailPanel from "@/components/drift/DriftDetailPanel";
import { WorkshopSidebar } from "@/components/client/WorkshopSidebar";
import {
  CLIENT_REFINE_PREVIEW_ROUTE,
  CLIENT_REFINE_PREVIEW_INBOX_ROUTE,
} from "@/lib/clientRefinePreview";

// ─── Design tokens (mirrors CRPV palette) ────────────────────────────────────
const MONO = "monospace" as const;
const INK = "#111111";
const INK_FAINT = "rgba(17,17,17,0.35)";
const INK_QUIET = "rgba(17,17,17,0.55)";
const HAIRLINE = "rgba(17,17,17,0.08)";
const MATERIAL_COLOR = "#c45c00";
const SLIGHT_COLOR = "#b08800";
const NEW_COLOR = "#3a6ea8";
const PAGE_BG = "#f9f9f7";

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

function SeverityDot({ state }: { state: string }) {
  const color = state === "material_drift" ? MATERIAL_COLOR : SLIGHT_COLOR;
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        marginTop: 2,
      }}
    />
  );
}

function SurfaceTypeChip({ type }: { type: string }) {
  const label: Record<string, string> = {
    cascade: "Strategy",
    positioning: "Positioning",
    route: "Route",
    opportunity: "Opportunity",
    market_definition: "Market",
  };
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 8,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: INK_FAINT,
        border: `1px solid ${HAIRLINE}`,
        borderRadius: 2,
        padding: "1px 5px",
        flexShrink: 0,
      }}
    >
      {label[type] ?? type}
    </span>
  );
}

// ─── Inbox row ────────────────────────────────────────────────────────────────

function DriftInboxRow({
  item,
  isSelected,
  onToggle,
  onOpenDetail,
  onViewSurface,
  onAcceptRow,
  acceptingId,
}: {
  item: DriftInboxItem;
  isSelected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
  onViewSurface: () => void;
  onAcceptRow: () => void;
  acceptingId: string | null;
}) {
  const isNew = !item.operator_seen_at;
  const isAccepting = acceptingId === item.id;
  const marketVoice = item.surface_type === "market_definition"
    ? renderMarketDriftSummary(item.assessment_basis)
    : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 20px",
        borderBottom: `1px solid ${HAIRLINE}`,
        background: isSelected ? "rgba(17,17,17,0.03)" : "transparent",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onClick={onOpenDetail}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => { e.stopPropagation(); onToggle(); }}
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: 3, flexShrink: 0, cursor: "pointer" }}
      />

      {/* Severity dot */}
      <SeverityDot state={item.drift_state} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: INK, letterSpacing: "0.01em" }}>
            {item.surface_display_name}
          </span>
          <SurfaceTypeChip type={item.surface_type} />
          {isNew && (
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.12em", textTransform: "uppercase", color: NEW_COLOR, fontWeight: 700 }}>
              NEW
            </span>
          )}
          <span style={{ fontFamily: MONO, fontSize: 9, color: item.drift_state === "material_drift" ? MATERIAL_COLOR : SLIGHT_COLOR, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {item.drift_state === "material_drift" ? "material drift" : "slight drift"}
          </span>
        </div>

        {/* B2.2c Client-Facing Voice: market_definition rows say the structured findings
            plainly (operator-signed pattern); scores/model names/dimension keys stay in
            assessment_basis behind View surface. Other surface types render unchanged. */}
        {item.surface_type === "market_definition" && marketVoice ? (
          <div style={{ margin: "0 0 4px" }}>
            <p style={{ fontFamily: MONO, fontSize: 10, color: INK, fontWeight: 600, margin: "0 0 2px", lineHeight: 1.5 }}>
              {marketVoice.headline}
            </p>
            <p style={{ fontFamily: MONO, fontSize: 10, color: INK_QUIET, margin: "0 0 2px", lineHeight: 1.5 }}>
              {marketVoice.sentences.join(" ")}
            </p>
            <p style={{ fontFamily: MONO, fontSize: 10, color: INK_QUIET, fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
              {marketVoice.closing}
            </p>
          </div>
        ) : item.llm_confirmation ? (
          <p style={{ fontFamily: MONO, fontSize: 10, color: INK_QUIET, margin: "0 0 4px", lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {item.llm_confirmation}
          </p>
        ) : null}

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: INK_FAINT, letterSpacing: "0.05em" }}>
            {timeAgo(item.last_assessed_at)}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onViewSurface(); }}
            style={{ fontFamily: MONO, fontSize: 9, color: INK_QUIET, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", letterSpacing: "0.04em" }}
          >
            View surface →
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAcceptRow(); }}
            disabled={isAccepting}
            style={{ fontFamily: MONO, fontSize: 9, color: INK_FAINT, background: "none", border: "none", cursor: isAccepting ? "wait" : "pointer", padding: 0, textDecoration: "underline", letterSpacing: "0.04em", opacity: isAccepting ? 0.4 : 1 }}
          >
            {isAccepting ? "Accepting…" : "Accept as aligned"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter chip ─────────────────────────────────────────────────────────────

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: MONO,
        fontSize: 10,
        letterSpacing: "0.06em",
        color: active ? INK : INK_QUIET,
        background: active ? "rgba(17,17,17,0.07)" : "none",
        border: `1px solid ${active ? "rgba(17,17,17,0.2)" : HAIRLINE}`,
        borderRadius: 2,
        padding: "3px 10px",
        cursor: "pointer",
        transition: "all 0.1s",
      }}
    >
      {label} {count}
    </button>
  );
}

// ─── Bulk confirm overlay ─────────────────────────────────────────────────────

function BulkConfirm({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", border: `1px solid ${HAIRLINE}`, borderRadius: 4,
        padding: "28px 32px", maxWidth: 440, width: "90%",
      }}>
        <p style={{ fontFamily: MONO, fontSize: 12, color: INK, margin: "0 0 20px", lineHeight: 1.6 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em",
              color: "#fff", background: INK, border: "none", borderRadius: 2,
              padding: "6px 16px", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Working…" : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em",
              color: INK_QUIET, background: "none", border: `1px solid ${HAIRLINE}`,
              borderRadius: 2, padding: "6px 16px", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function DriftInboxView() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  // B2.2b: the context provides no `companyId` member — destructuring it yielded
  // undefined, so the inbox never queried for ANY company (pre-existing defect).
  const companyId = activeCompany?.id ?? null;

  const [filter, setFilter] = useState<InboxFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailPanel, setDetailPanel] = useState<{ surfaceType: string; surfaceId: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<"accept" | "propose" | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [inboxRefreshKey, setInboxRefreshKey] = useState(0);

  const {
    items,
    newCount,
    totalUnresolved,
    materialCount,
    slightCount,
    lastFullScanAt,
    isLoading,
    error,
    bulkLoading,
    refresh,
    acceptBulkAsAligned,
    proposeChangesForBulk,
  } = useDriftInbox(companyId, { filter });

  const { totalUnresolved: navCount, newCount: navNew } = useDriftInboxCount(companyId);
  // Reconciler trigger law: a failed market reconcile is a recorded, VISIBLE event —
  // the inbox carries the signed didn't-complete line whether or not drift rows exist.
  const reconcileIntegrity = useIntegrityRecord(companyId, "market_reconcile");
  const reconcileFailed = reconcileIntegrity.record?.status === "failed";

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const handleOpenDetail = useCallback((item: DriftInboxItem) => {
    setDetailPanel({ surfaceType: item.surface_type, surfaceId: item.surface_id });
  }, []);

  const handleAcceptRow = useCallback(async (item: DriftInboxItem) => {
    setAcceptingId(item.id);
    try {
      await acceptBulkAsAligned([item.id]);
      toast.success(`Accepted as aligned · ${item.surface_display_name}`, { duration: 3000 });
    } catch (err) {
      toast.error(`Accept failed — ${err instanceof Error ? err.message : String(err)}`, { duration: 5000 });
    } finally {
      setAcceptingId(null);
    }
  }, [acceptBulkAsAligned]);

  const handleBulkAccept = useCallback(async () => {
    const ids = Array.from(selected);
    setConfirmAction(null);
    try {
      await acceptBulkAsAligned(ids);
      toast.success(`Accepted ${ids.length} item${ids.length === 1 ? "" : "s"} as aligned`, { duration: 4000 });
      clearSelection();
    } catch (err) {
      toast.error(`Bulk accept failed — ${err instanceof Error ? err.message : String(err)}`, { duration: 5000 });
    }
  }, [selected, acceptBulkAsAligned, clearSelection]);

  const handleBulkPropose = useCallback(async () => {
    if (!companyId) return;
    const ids = Array.from(selected);
    setConfirmAction(null);
    const toastId = "bulk-propose";
    toast.loading(`Generating ${ids.length} proposed change${ids.length === 1 ? "" : "s"}…`, { id: toastId });
    try {
      const { generated, failed } = await proposeChangesForBulk(ids, companyId);
      if (failed > 0 && generated > 0) {
        toast.warning(`Generated ${generated} of ${ids.length} — ${failed} failed`, { id: toastId, duration: 5000 });
      } else {
        toast.success(`Generated ${generated} proposed change${generated === 1 ? "" : "s"}`, { id: toastId, duration: 4000 });
      }
      clearSelection();
    } catch (err) {
      toast.error(`Proposal generation failed — ${err instanceof Error ? err.message : String(err)}`, { id: toastId, duration: 5000 });
    }
  }, [companyId, selected, proposeChangesForBulk, clearSelection]);

  const selectedCount = selected.size;

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: PAGE_BG, fontFamily: MONO }}>
      <WorkshopSidebar
        activeTab={null}
        onTabClick={(tab) => navigate(`/preview/client-refine/workshop?tab=${tab}`)}
        onHome={() => navigate(CLIENT_REFINE_PREVIEW_ROUTE)}
        onInbox={() => navigate(CLIENT_REFINE_PREVIEW_INBOX_ROUTE)}
        inboxCount={navCount}
        inboxHasNew={navNew > 0}
      />

      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "24px 32px 16px", borderBottom: `1px solid ${HAIRLINE}`, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginBottom: 12 }}>
            <h1 style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: INK, margin: 0, letterSpacing: "0.04em" }}>
              Drift Inbox
            </h1>
            {activeCompany?.name && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: INK_FAINT, letterSpacing: "0.06em" }}>
                {activeCompany.name}
              </span>
            )}
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterChip label="All" count={totalUnresolved} active={filter === "all"} onClick={() => setFilter("all")} />
            <FilterChip label="New" count={newCount} active={filter === "new"} onClick={() => setFilter("new")} />
            <FilterChip label="Material" count={materialCount} active={filter === "material"} onClick={() => setFilter("material")} />
            <FilterChip label="Slight" count={slightCount} active={filter === "slight"} onClick={() => setFilter("slight")} />
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedCount > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "8px 32px",
            background: "rgba(17,17,17,0.04)", borderBottom: `1px solid ${HAIRLINE}`, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: INK_QUIET, letterSpacing: "0.05em" }}>
              {selectedCount} selected
            </span>
            <button
              type="button"
              onClick={() => setConfirmAction("accept")}
              disabled={bulkLoading}
              style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.05em", color: INK, background: "none", border: `1px solid rgba(17,17,17,0.2)`, borderRadius: 2, padding: "3px 10px", cursor: bulkLoading ? "wait" : "pointer" }}
            >
              Accept {selectedCount} as aligned
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("propose")}
              disabled={bulkLoading}
              style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.05em", color: "#fff", background: "#c45c00", border: "none", borderRadius: 2, padding: "3px 10px", cursor: bulkLoading ? "wait" : "pointer", opacity: bulkLoading ? 0.6 : 1 }}
            >
              Generate changes for {selectedCount}
            </button>
            <button
              type="button"
              onClick={clearSelection}
              style={{ fontFamily: MONO, fontSize: 9, color: INK_FAINT, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", letterSpacing: "0.04em" }}
            >
              Clear
            </button>
          </div>
        )}

        {/* Select-all bar when items exist and nothing selected */}
        {selectedCount === 0 && items.length > 1 && (
          <div style={{ padding: "6px 32px", borderBottom: `1px solid ${HAIRLINE}` }}>
            <button
              type="button"
              onClick={selectAll}
              style={{ fontFamily: MONO, fontSize: 9, color: INK_FAINT, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", letterSpacing: "0.04em" }}
            >
              Select all {items.length}
            </button>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1 }}>
          {isLoading && (
            <div style={{ padding: "40px 32px", fontFamily: MONO, fontSize: 10, color: INK_FAINT, letterSpacing: "0.08em" }}>
              Loading…
            </div>
          )}

          {error && !isLoading && (
            <div style={{ padding: "24px 32px", fontFamily: MONO, fontSize: 10, color: "#c0392b" }}>
              Error: {error}
            </div>
          )}

          {!isLoading && !error && reconcileFailed && (
            <div style={{ padding: "10px 20px", borderBottom: `1px solid ${HAIRLINE}` }}>
              <p style={{ fontFamily: MONO, fontSize: 10, color: MATERIAL_COLOR, margin: 0, letterSpacing: "0.04em" }}>
                Market check: This check didn't complete — it will run again on the next scan.
              </p>
            </div>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 32px", gap: 8 }}>
              <p style={{ fontFamily: MONO, fontSize: 13, color: INK, margin: 0, letterSpacing: "0.02em" }}>
                All clear
              </p>
              <p style={{ fontFamily: MONO, fontSize: 10, color: INK_FAINT, margin: 0, letterSpacing: "0.05em" }}>
                {lastFullScanAt
                  ? `Last full scan ${formatDistanceToNow(lastFullScanAt, { addSuffix: true })}`
                  : "No drift assessments recorded yet"}
              </p>
            </div>
          )}

          {!isLoading && !error && items.map((item) => (
            <DriftInboxRow
              key={item.id}
              item={item}
              isSelected={selected.has(item.id)}
              onToggle={() => toggleSelect(item.id)}
              onOpenDetail={() => handleOpenDetail(item)}
              onViewSurface={() => navigate(item.surface_navigation_path)}
              onAcceptRow={() => handleAcceptRow(item)}
              acceptingId={acceptingId}
            />
          ))}
        </div>

        {/* Footer */}
        {!isLoading && lastFullScanAt && items.length > 0 && (
          <div style={{ padding: "10px 32px", borderTop: `1px solid ${HAIRLINE}`, background: "#fff" }}>
            <p style={{ fontFamily: MONO, fontSize: 9, color: INK_FAINT, margin: 0, letterSpacing: "0.06em" }}>
              Last full scan {formatDistanceToNow(lastFullScanAt, { addSuffix: true })}
            </p>
          </div>
        )}
      </div>

      {/* Drift detail panel — reused from A79a */}
      <DriftDetailPanel
        open={detailPanel !== null}
        onClose={() => { setDetailPanel(null); refresh(); setInboxRefreshKey((k) => k + 1); }}
        surfaceType={detailPanel?.surfaceType ?? ""}
        surfaceId={detailPanel?.surfaceId ?? ""}
        refreshKey={inboxRefreshKey}
        onRefresh={() => { refresh(); setInboxRefreshKey((k) => k + 1); }}
      />

      {/* Bulk accept confirmation */}
      {confirmAction === "accept" && (
        <BulkConfirm
          message={`Accept ${selectedCount} drift assessment${selectedCount === 1 ? "" : "s"} as aligned? These surfaces will not appear in the inbox again until new drift is detected.`}
          confirmLabel={`Accept ${selectedCount} as aligned`}
          onConfirm={handleBulkAccept}
          onCancel={() => setConfirmAction(null)}
          loading={bulkLoading}
        />
      )}

      {/* Bulk propose confirmation */}
      {confirmAction === "propose" && (
        <BulkConfirm
          message={`Generate proposed changes for ${selectedCount} surface${selectedCount === 1 ? "" : "s"}? Each will get a pending proposal based on current evidence. You'll review and accept each proposal on its surface.`}
          confirmLabel={`Generate ${selectedCount} proposal${selectedCount === 1 ? "" : "s"}`}
          onConfirm={handleBulkPropose}
          onCancel={() => setConfirmAction(null)}
          loading={bulkLoading}
        />
      )}
    </div>
  );
}
