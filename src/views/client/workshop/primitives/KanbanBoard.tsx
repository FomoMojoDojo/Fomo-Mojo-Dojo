import { useState, useRef } from "react";
import React from "react";
import type { CascadeItem } from "@/lib/types";

type CascadeStatusKey = CascadeItem["status"];

const KANBAN_COLS: { key: CascadeStatusKey; label: string }[] = [
  { key: "strong",     label: "Strong" },
  { key: "developing", label: "Building" },
  { key: "gap",        label: "Gap" },
];

export function KanbanBoard({
  label,
  items,
  onUpdate,
  isSaved,
}: {
  label: string;
  items: CascadeItem[];
  onUpdate: (updated: CascadeItem[]) => Promise<void>;
  isSaved?: boolean;
}) {
  const [draggingName,  setDraggingName]  = useState<string | null>(null);
  const [dragOverCol,   setDragOverCol]   = useState<CascadeStatusKey | null>(null);
  const [pendingMove,   setPendingMove]   = useState<{ name: string; toStatus: CascadeStatusKey } | null>(null);
  const [evidenceText,  setEvidenceText]  = useState("");
  const evidenceRef = useRef<HTMLTextAreaElement>(null);

  const grouped: Record<CascadeStatusKey, CascadeItem[]> = {
    strong:     items.filter((i) => i.status === "strong"),
    developing: items.filter((i) => i.status === "developing"),
    gap:        items.filter((i) => i.status === "gap"),
  };

  function onDragStart(e: React.DragEvent<HTMLDivElement>, name: string) {
    setDraggingName(name);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", name);
  }

  function onDragEnd() {
    setDraggingName(null);
    setDragOverCol(null);
  }

  function onDragOver(e: React.DragEvent<HTMLDivElement>, col: CascadeStatusKey) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(col);
  }

  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, toStatus: CascadeStatusKey) {
    e.preventDefault();
    const name = e.dataTransfer.getData("text/plain");
    setDragOverCol(null);
    setDraggingName(null);
    const item = items.find((i) => i.name === name);
    if (!item || item.status === toStatus) return;
    setPendingMove({ name, toStatus });
    setEvidenceText("");
    // Focus the textarea on next frame
    requestAnimationFrame(() => evidenceRef.current?.focus());
  }

  async function confirmMove(skipEvidence: boolean) {
    if (!pendingMove) return;
    const { name, toStatus } = pendingMove;
    const evidence = skipEvidence ? undefined : (evidenceText.trim() || undefined);
    const unverified = !evidence ? true : undefined;
    const updated = items.map((i) =>
      i.name === name ? { ...i, status: toStatus, evidence, unverified } : i
    );
    setPendingMove(null);
    setEvidenceText("");
    await onUpdate(updated);
  }

  const toLabel = pendingMove
    ? KANBAN_COLS.find((c) => c.key === pendingMove.toStatus)?.label ?? pendingMove.toStatus
    : "";

  return (
    <div className="crpv-ws-stmt-block">
      <div className="crpv-ws-stmt-block-hd">
        <label className="crpv-ws-label">{label}</label>
        {isSaved && <span className="crpv-ws-saved cap">Saved ✓</span>}
      </div>
      <div className="crpv-ws-kanban">
        {KANBAN_COLS.map((col) => (
          <div
            key={col.key}
            className={`crpv-ws-kanban-col crpv-ws-kanban-${col.key}${dragOverCol === col.key ? " crpv-ws-kanban-over" : ""}`}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div className="crpv-ws-kanban-hd">
              <span className="cap">{col.label}</span>
              <span className="crpv-ws-kanban-count">{grouped[col.key].length}</span>
            </div>
            {grouped[col.key].length === 0 && (
              <div className={`crpv-ws-kanban-empty cap${dragOverCol === col.key ? " crpv-ws-kanban-empty-over" : ""}`}>
                Drop here
              </div>
            )}
            {grouped[col.key].map((item, idx) => (
              <div
                key={idx}
                className={`crpv-ws-kanban-card${draggingName === item.name ? " crpv-ws-kanban-dragging" : ""}`}
                draggable
                onDragStart={(e) => onDragStart(e, item.name)}
                onDragEnd={onDragEnd}
              >
                <div className="crpv-ws-kanban-card-row">
                  <span className="crpv-ws-kanban-name">{item.name}</span>
                  {item.evidence ? (
                    <span
                      className="crpv-ws-kanban-verified"
                      title={item.evidence}
                      aria-label={`Evidence: ${item.evidence}`}
                    >●</span>
                  ) : item.unverified ? (
                    <span className="crpv-ws-kanban-unverified" title="No evidence provided">*</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {pendingMove && (
        <div className="crpv-ws-kanban-evidence-panel">
          <p className="crpv-ws-kanban-evidence-prompt cap">
            Moving <strong>{pendingMove.name}</strong> → {toLabel}
          </p>
          <textarea
            ref={evidenceRef}
            className="crpv-ws-kanban-evidence-input"
            value={evidenceText}
            onChange={(e) => setEvidenceText(e.target.value)}
            placeholder="What evidence supports this change? Leave blank to mark as unverified."
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmMove(false);
              if (e.key === "Escape") setPendingMove(null);
            }}
          />
          <div className="crpv-ws-kanban-evidence-actions">
            <button
              type="button"
              className="crpv-ws-kanban-evidence-save"
              onClick={() => confirmMove(false)}
            >
              {evidenceText.trim() ? "Save with evidence" : "Save (mark unverified)"}
            </button>
            <button
              type="button"
              className="crpv-ws-kanban-evidence-cancel"
              onClick={() => setPendingMove(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
