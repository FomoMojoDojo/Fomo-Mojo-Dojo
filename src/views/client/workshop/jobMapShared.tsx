// JOB MAP SHARED — pieces MOVED verbatim out of tabs/JobMapOrgPanel.tsx (Job Map Tier 1 lift,
// 2026-09-11) so the workspace Job Map renders the SAME evidence drawer the panel defines: the
// evidence-status dot table and EvidenceDrawer (status + confidence, the honest basis prose — internal
// metadata hidden at the render boundary — and the gap note, truncated at 90). No logic change;
// jobMapShared.test.tsx proves the drawer's markup is byte-identical to the pre-move snapshot and
// JobMapOrgPanel.parity.test.tsx proves the panel is unchanged. The workspace restyles it by selector
// only (.first-read .fr-ws-evidence), never by editing the component.
import type { JobStepRow } from "@/hooks/useJobSteps";
import { isInternalMetadataString } from "@/lib/clientFacingVoice";

/** The need row's "review pending" rule (moved from the panel with the drawer): these dependency_state values. */
export const NEEDS_REVIEW_STATES = new Set(["needs_review", "stale", "contradicted", "revalidate"]);

export const EVIDENCE_DOT: Record<string, { label: string; color: string }> = {
  evidenced: { label: "Evidenced", color: "#16a34a" },
  implied:   { label: "Implied",   color: "#E8A317" },
  unclear:   { label: "Unclear",   color: "#ef4444" },
  declared:  { label: "Declared",  color: "#b45309" },
};

export function EvidenceDrawer({ step }: { step: JobStepRow }) {
  const ev = step.evidence_status ? EVIDENCE_DOT[step.evidence_status] : null;
  const dotColor = ev?.color ?? "#d1d5db";
  const basisClean = (() => {
    const raw = step.evidence_basis;
    if (!raw) return null;
    if (isInternalMetadataString(raw)) return null; // run-tags / input-keys / bare keys → hide
    return raw;
  })();
  return (
    <div style={{ borderTop: "1px solid #f0f2f5", paddingTop: 7, marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
        <span style={{ fontSize: 10, color: "#6b7280" }}>{ev?.label ?? "Not assessed"}</span>
        {typeof step.evidence_confidence === "number" && (
          <span style={{ fontSize: 10, color: "#9ca3af" }}>· {step.evidence_confidence}%</span>
        )}
      </div>
      {basisClean && (
        <p style={{ fontSize: 10, color: "#9ca3af", lineHeight: 1.4, margin: 0 }}>{basisClean}</p>
      )}
      {step.has_gap && step.gap_note && (
        <p style={{ fontSize: 10, color: "#b45309", lineHeight: 1.4, margin: 0 }}>
          Gap: {step.gap_note.length > 90 ? step.gap_note.slice(0, 90) + "…" : step.gap_note}
        </p>
      )}
    </div>
  );
}
