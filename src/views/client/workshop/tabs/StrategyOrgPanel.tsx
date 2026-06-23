import { useState, useMemo, useEffect } from "react";
import type { StrategyCascade, CascadeItem } from "@/lib/types";
import type { SourceConfidenceSignals } from "@/lib/sourceConfidence";
import type { BaselineResult } from "../types";
import { useSaveFlash } from "../hooks";
import { alignmentOf } from "../helpers";
import { SectionHeader, StatementField, KanbanBoard } from "../primitives";
import StrategyInspectPanel from "@/views/Strategy/StrategyInspectPanel";
import InlineTextareaEdit from "@/components/inline-edit/InlineTextareaEdit";
import { HierarchyPageShell } from "@/components/design-system/HierarchyPageShell";
import { HierarchySectionHeader } from "@/components/design-system/HierarchySectionHeader";
import { D } from "@/components/design-system/tokens";
import DriftBadge from "@/components/drift/DriftBadge";
import ProposeChangesButton from "@/components/drift/ProposeChangesButton";
import type { EngagementPhase } from "@/lib/engagementPhase";
import type { SignalBasis } from "@/components/design-system/SignalBasisChip";
import type { ClaimRow } from "@/lib/claims/useCompanyClaims";
import type { CascadeProposalRow } from "@/hooks/useCascadeProposal";
import { useCapability } from "@/hooks/useCapability";
import { StrategicDirectionDelta } from "@/components/strategy/StrategicDirectionDelta";
import { StandingFindings } from "@/components/strategy/StandingFindings";

// ── Design tokens (mirrors PositioningOrgPanel hierarchy tokens) ───────────────
const P = {
  ink:           "#111111",
  inkSoft:       "#555555",
  inkFaint:      "#999999",
  signal:        "#ff5b29",
  hairline:      "rgba(17,17,17,0.12)",
  hairlineFaint: "rgba(17,17,17,0.08)",
  mono:          '"IBM Plex Mono", ui-monospace, monospace',
  sans:          '"Inter", system-ui, sans-serif',
} as const;

// ── Proposal field config ──────────────────────────────────────────────────────
const CASCADE_FIELD_LABELS: Record<string, string> = {
  winning_aspiration:     "Winning Aspiration",
  where_to_play:          "Where to Play",
  how_to_win:             "How to Win",
  capabilities_json:      "Capabilities",
  management_systems_json: "Management Systems",
  assumptions_json:       "Assumptions",
};
const CASCADE_FIELDS = Object.keys(CASCADE_FIELD_LABELS);

function summarizeCascadeValue(field: string, val: unknown): string {
  if (field.endsWith("_json")) {
    if (!Array.isArray(val) || val.length === 0) return "(empty)";
    const key = field === "assumptions_json" ? "assumption" : "name";
    const names = (val as unknown[])
      .map((item) => (typeof item === "object" && item ? String((item as Record<string, unknown>)[key] ?? "") : ""))
      .filter(Boolean);
    if (names.length === 0) return "(empty)";
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  }
  return String(val ?? "") || "(empty)";
}

function cascadeDiffedFields(proposal: CascadeProposalRow): string[] {
  return CASCADE_FIELDS.filter((field) => {
    const curr = proposal.current_state[field];
    const prop = proposal.proposed_state[field];
    if (field.endsWith("_json")) {
      const key = field === "assumptions_json" ? "assumption" : "name";
      const names = (arr: unknown) =>
        (Array.isArray(arr) ? arr : [])
          .map((item) => (typeof item === "object" && item ? String((item as Record<string, unknown>)[key] ?? "") : ""))
          .filter(Boolean)
          .sort()
          .join("|");
      return names(curr) !== names(prop);
    }
    return String(curr ?? "") !== String(prop ?? "");
  });
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── CascadeProposalSection ─────────────────────────────────────────────────────
function CascadeProposalSection({
  proposal,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
  hierarchy,
  reEvalProgress,
  canApply = true,
  canReject = true,
}: {
  proposal: CascadeProposalRow;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  canApply?: boolean;
  canReject?: boolean;
  hierarchy: boolean;
  reEvalProgress?: string | null;
}) {
  const diffFields = useMemo(() => cascadeDiffedFields(proposal), [proposal]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(diffFields));

  useEffect(() => {
    setSelected(new Set(cascadeDiffedFields(proposal)));
  }, [proposal.id]);

  const nSelected = selected.size;
  const nTotal = diffFields.length;
  const allUnchecked = nSelected === 0;

  function toggle(field: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  function handleAccept() {
    const acceptedFields = diffFields.filter((f) => selected.has(f));
    const skippedFields = diffFields.filter((f) => !selected.has(f));
    onAcceptProposal?.(proposal.id, acceptedFields, skippedFields);
  }

  const signalColor = hierarchy ? P.signal : "#e05a2b";
  const monoFont = hierarchy ? P.mono : "monospace";
  const sansFont = hierarchy ? P.sans : "inherit";
  const hairlineFaint = hierarchy ? P.hairlineFaint : "rgba(17,17,17,0.06)";
  const hairline = hierarchy ? P.hairline : "rgba(17,17,17,0.15)";
  const inkFaint = hierarchy ? P.inkFaint : "#bbb";
  const inkSoft = hierarchy ? P.inkSoft : "#555";
  const ink = hierarchy ? P.ink : "#111";

  return (
    <div style={{
      borderLeft: `3px solid ${signalColor}`,
      background: "#fffaf8",
      padding: hierarchy ? "20px 24px" : "16px 20px",
      borderRadius: 2,
      marginBottom: hierarchy ? 48 : 24,
      ...(hierarchy ? { marginLeft: -4 } : {}),
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hierarchy ? 10 : 8 }}>
        <span style={{ fontFamily: monoFont, fontSize: hierarchy ? 10 : 9, textTransform: "uppercase" as const, letterSpacing: "0.14em", color: signalColor }}>
          Proposed Changes
        </span>
        <span style={{ fontFamily: monoFont, fontSize: 9, color: inkFaint }}>
          {timeAgo(proposal.created_at)} · {nTotal} section{nTotal !== 1 ? "s" : ""} would change
        </span>
      </div>
      {proposal.reason && (
        <p style={{ fontFamily: sansFont, fontSize: 13, color: inkSoft, margin: `0 0 ${hierarchy ? 16 : 14}px`, lineHeight: 1.55, maxWidth: 600 }}>
          {proposal.reason}
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: hierarchy ? 12 : 10, marginBottom: hierarchy ? 20 : 16 }}>
        {diffFields.map((field) => {
          const isSelected = selected.has(field);
          const currVal = summarizeCascadeValue(field, proposal.current_state[field]);
          const propVal = summarizeCascadeValue(field, proposal.proposed_state[field]);
          const isListField = field.endsWith("_json");
          return (
            <div key={field} style={{ borderTop: `1px solid ${hairlineFaint}`, paddingTop: hierarchy ? 10 : 8 }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: hierarchy ? 10 : 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(field)}
                  style={{ marginTop: 3, accentColor: signalColor, flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: monoFont, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: inkFaint }}>
                      {CASCADE_FIELD_LABELS[field] ?? field}
                    </span>
                    {isListField && (
                      <span style={{ fontFamily: monoFont, fontSize: 8, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkFaint, opacity: 0.7 }}>
                        LIST
                      </span>
                    )}
                  </div>
                  <p style={{ fontFamily: sansFont, fontSize: 12, color: "rgba(17,17,17,0.35)", margin: "0 0 4px", lineHeight: 1.4 }}>{currVal}</p>
                  {isSelected ? (
                    <p style={{ fontFamily: sansFont, fontSize: 13, color: ink, fontWeight: 500, margin: 0, lineHeight: 1.4 }}>{propVal}</p>
                  ) : (
                    <p style={{ fontFamily: monoFont, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: inkFaint, margin: 0 }}>
                      KEEP CURRENT
                    </p>
                  )}
                </div>
              </label>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: hierarchy ? 10 : 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleAccept}
          disabled={acceptLoading || rejectLoading || allUnchecked || !canApply}
          title={!canApply ? "Approval requires the apply capability" : undefined}
          style={{
            fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em",
            color: "#fff", background: allUnchecked || !canApply ? "rgba(17,17,17,0.2)" : signalColor,
            border: "none",
            cursor: acceptLoading ? "wait" : allUnchecked || !canApply ? "default" : "pointer",
            padding: hierarchy ? "6px 14px" : "5px 12px", borderRadius: 2,
            opacity: rejectLoading ? 0.5 : 1,
          }}
        >
          {acceptLoading ? "Accepting…" : `Apply ${nSelected} of ${nTotal} change${nTotal !== 1 ? "s" : ""}`}
        </button>
        <button
          type="button"
          onClick={() => onRejectProposal?.(proposal.id)}
          disabled={acceptLoading || rejectLoading || !canReject}
          title={!canReject ? "Rejecting requires the reject capability" : undefined}
          style={{
            fontFamily: monoFont, fontSize: 10, letterSpacing: "0.08em",
            color: inkSoft, background: "none", border: `1px solid ${hairline}`,
            cursor: rejectLoading ? "wait" : "pointer",
            padding: hierarchy ? "6px 14px" : "5px 12px", borderRadius: 2,
            opacity: (acceptLoading || rejectLoading) ? 0.5 : 1,
          }}
        >
          {rejectLoading ? "Rejecting…" : "Reject"}
        </button>
        {allUnchecked && (
          <span style={{ fontFamily: monoFont, fontSize: 9, color: inkFaint, letterSpacing: "0.06em" }}>
            Select at least one change to apply, or use Reject
          </span>
        )}
      </div>
      {reEvalProgress && (
        <p style={{ fontFamily: monoFont, fontSize: 9, color: inkFaint, letterSpacing: "0.06em", margin: "12px 0 0" }}>
          {reEvalProgress}
        </p>
      )}
    </div>
  );
}

export default function StrategyOrgPanel({
  strategy,
  loading,
  updatedAt,
  baseline,
  signals,
  directionContextNote,
  updateNarrativeField,
  updateListField,
  hasHierarchy,
  signalBasis,
  claimsMap,
  onGenerateProposal,
  generateLoading,
  generateMessage,
  proposal,
  onAcceptProposal,
  onRejectProposal,
  acceptLoading,
  rejectLoading,
  reEvalProgress,
  cascadeId,
  phase,
  onDriftClick,
  driftRefreshKey,
  onCheckSurfaceDrift,
  checkingSurfaceId,
  companyName,
  companyId,
}: {
  strategy: StrategyCascade | null;
  loading: boolean;
  updatedAt?: string;
  baseline: BaselineResult | null;
  signals: SourceConfidenceSignals;
  directionContextNote?: string | null;
  updateNarrativeField: (field: "winning_aspiration" | "where_to_play" | "how_to_win", value: string, opts?: { isManualInline?: boolean }) => Promise<void>;
  updateListField: (field: "capabilities_json" | "management_systems_json", items: CascadeItem[]) => Promise<void>;
  hasHierarchy?: boolean;
  signalBasis?: SignalBasis;
  claimsMap?: Map<string, ClaimRow>;
  onGenerateProposal?: () => void;
  generateLoading?: boolean;
  generateMessage?: string | null;
  proposal?: CascadeProposalRow | null;
  onAcceptProposal?: (proposalId: string, acceptedFields: string[], skippedFields: string[]) => void;
  onRejectProposal?: (proposalId: string) => void;
  acceptLoading?: boolean;
  rejectLoading?: boolean;
  reEvalProgress?: string | null;
  cascadeId?: string | null;
  phase?: EngagementPhase;
  onDriftClick?: (surfaceType: string, surfaceId: string) => void;
  driftRefreshKey?: number;
  onCheckSurfaceDrift?: (surfaceType: string, surfaceId: string) => void;
  checkingSurfaceId?: string | null;
  companyName?: string;
  companyId?: string;
}) {
  const [inspectOpen, setInspectOpen] = useState(false);
  const { savedField, flash } = useSaveFlash();
  // Governance split (checkpoint 3a): cascade apply/reject controls gated by capability.
  const canApply = useCapability("governance.proposal.apply", companyId);
  const canReject = useCapability("governance.proposal.reject", companyId);
  const canGenerate = useCapability("structure.cascade.generate", companyId); // 3b
  const canInlineEdit = useCapability("structure.cascade.inlineEdit", companyId); // 3b

  if (loading) return <div className="crpv-ws-placeholder cap">Loading…</div>;
  if (!strategy) {
    // Still render the foundation delta even when no cascade is defined yet.
    if (companyId) {
      return (
        <div className="crpv-ws-section crpv-ws-section-wide">
          <StrategicDirectionDelta companyId={companyId} />
          <StandingFindings companyId={companyId} />
          <p style={{ fontFamily: D.mono, fontSize: 10, color: D.inkFaint, marginTop: 12 }}>
            No strategic cascade yet — add winning aspiration, where to play, and how to win above.
          </p>
        </div>
      );
    }
    return <div className="crpv-ws-placeholder">No strategy data yet.</div>;
  }

  // ── Hierarchy layout ───────────────────────────────────────────────────────
  if (hasHierarchy) {
    return (
      <>
        <HierarchyPageShell
          eyebrowSegments={["Strategy"]}
          h1Before="Your Strategic"
          h1Signal="Direction"
          subhead={`Your full strategy — from the change you're building toward, down to the systems that keep you delivering.`}
          signalBasis={signalBasis}
          compactHero
        >
          {/* Drift badge */}
          {cascadeId && onDriftClick && (
            <div style={{ marginBottom: 16 }}>
              <DriftBadge
                surfaceType="cascade"
                surfaceId={cascadeId}
                phase={phase}
                refreshKey={driftRefreshKey}
                onClick={(a) => onDriftClick("cascade", a.surface_id)}
              />
            </div>
          )}

          {/* Propose changes + check for drift */}
          {(onGenerateProposal || (cascadeId && onCheckSurfaceDrift)) && (
            <div style={{ marginBottom: 32, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
              {onGenerateProposal && (
                <div>
                  <ProposeChangesButton
                    surfaceType="cascade"
                    surfaceId={cascadeId}
                    onGenerate={onGenerateProposal}
                    canGenerate={canGenerate}
                    generateLoading={generateLoading}
                    generateMessage={generateMessage}
                    variant="panel"
                    refreshKey={driftRefreshKey}
                  />
                </div>
              )}
              {cascadeId && onCheckSurfaceDrift && (
                <button
                  type="button"
                  onClick={() => onCheckSurfaceDrift("cascade", cascadeId)}
                  disabled={checkingSurfaceId === cascadeId}
                  style={{ fontFamily: P.mono, fontSize: 10, letterSpacing: "0.06em", color: checkingSurfaceId === cascadeId ? "rgba(17,17,17,0.25)" : "rgba(17,17,17,0.45)", background: "none", border: "1px solid rgba(17,17,17,0.15)", cursor: checkingSurfaceId === cascadeId ? "wait" : "pointer", padding: "4px 10px", borderRadius: 2, flexShrink: 0, marginTop: 2 }}
                >
                  {checkingSurfaceId === cascadeId ? "Checking…" : "Check for drift"}
                </button>
              )}
            </div>
          )}

          {/* Pending proposal section */}
          {proposal && (
            <CascadeProposalSection
              canApply={canApply}
              canReject={canReject}
              proposal={proposal}
              onAcceptProposal={onAcceptProposal}
              onRejectProposal={onRejectProposal}
              acceptLoading={acceptLoading}
              rejectLoading={rejectLoading}
              hierarchy={true}
              reEvalProgress={reEvalProgress}
            />
          )}

          {companyId && <StrategicDirectionDelta companyId={companyId} />}
          {companyId && <StandingFindings companyId={companyId} />}

          {/* § 01 WINNING ASPIRATION */}
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number="01" label="Winning Aspiration" />
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, lineHeight: 1.55, margin: "0 0 14px", maxWidth: 560 }}>
              The change you're building toward — what becomes possible if this strategy wins.
            </p>
            <InlineTextareaEdit
              value={strategy.winning_aspiration?.trim() ?? ""}
              onSave={(v) => updateNarrativeField("winning_aspiration", v, { isManualInline: true })}
              rows={3}
              placeholder="Not yet defined."
              style={{ fontFamily: D.sans, fontSize: 28, fontWeight: 700, lineHeight: 1.35, color: D.ink, maxWidth: 640 }}
            />
          </div>

          {/* § 02 WHERE TO PLAY */}
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number="02" label="Where to Play" />
            <InlineTextareaEdit
              value={strategy.where_to_play?.trim() ?? ""}
              onSave={(v) => updateNarrativeField("where_to_play", v, { isManualInline: true })}
              rows={3}
              placeholder="Not yet defined."
              style={{ fontFamily: D.sans, fontSize: 15, lineHeight: 1.65, color: D.inkSoft, maxWidth: 600 }}
            />
          </div>

          {/* § 03 HOW TO WIN */}
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number="03" label="How to Win" />
            <InlineTextareaEdit
              value={strategy.how_to_win?.trim() ?? ""}
              onSave={(v) => updateNarrativeField("how_to_win", v, { isManualInline: true })}
              rows={3}
              placeholder="Not yet defined."
              style={{ fontFamily: D.sans, fontSize: 15, lineHeight: 1.65, color: D.inkSoft, maxWidth: 600 }}
            />
          </div>

          {/* § 04 CAPABILITIES */}
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number="04" label="Capabilities" />
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, lineHeight: 1.55, margin: "0 0 16px", maxWidth: 560 }}>
              What you have to be able to do to win.
            </p>
            {strategy.capabilities.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {strategy.capabilities.map((cap, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "40px 1fr", borderTop: idx === 0 ? `1px solid ${D.hairlineFaint}` : "none", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "12px 0" }}>
                    <span style={{ fontFamily: D.mono, fontSize: 11, color: "rgba(17,17,17,0.3)" }}>{String(idx + 1).padStart(2, "0")}</span>
                    <div>
                      <p style={{ fontFamily: D.sans, fontSize: 14, color: D.ink, margin: cap.note ? "0 0 2px" : "0", lineHeight: 1.4 }}>{cap.name}</p>
                      {cap.note && <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, margin: 0, lineHeight: 1.5 }}>{cap.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: D.sans, fontSize: 15, color: D.inkFaint, margin: 0 }}>Not yet defined.</p>
            )}
          </div>

          {/* § 05 MANAGEMENT SYSTEMS */}
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number="05" label="Management Systems" />
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, lineHeight: 1.55, margin: "0 0 16px", maxWidth: 560 }}>
              What keeps the strategy delivering over time.
            </p>
            {strategy.management_systems.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {strategy.management_systems.map((sys, idx) => {
                  const isGap = sys.status === "gap";
                  return (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "40px 1fr", borderTop: idx === 0 ? `1px solid ${D.hairlineFaint}` : "none", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "12px 0" }}>
                      <span style={{ fontFamily: D.mono, fontSize: 11, color: "rgba(17,17,17,0.3)" }}>{String(idx + 1).padStart(2, "0")}</span>
                      <div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                          <p style={{ fontFamily: D.sans, fontSize: 14, color: isGap ? D.inkSoft : D.ink, margin: sys.note ? "0 0 2px" : "0", lineHeight: 1.4 }}>{sys.name}</p>
                          {isGap && <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: D.signal, flexShrink: 0 }}>[GAP]</span>}
                        </div>
                        {sys.note && <p style={{ fontFamily: D.sans, fontSize: 12, color: isGap ? D.signal : D.inkFaint, margin: 0, lineHeight: 1.5 }}>{sys.note}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontFamily: D.sans, fontSize: 15, color: D.inkFaint, margin: 0 }}>Not yet defined.</p>
            )}
          </div>

          {/* § 06 ASSUMPTIONS */}
          {(() => {
            const assumptionClaims = claimsMap
              ? [...claimsMap.values()].filter((c) => c.claim_type === "assumption" && c.topic === "strategy")
              : [];
            if (assumptionClaims.length === 0) return null;
            const STATE_LABELS: Record<string, string> = {
              outside_view: "Outside View",
              diagnose: "Diagnose",
              focus: "Focus",
              flow: "Flow",
            };
            const untestedCount = assumptionClaims.filter((c) => c.state === "outside_view").length;
            return (
              <div style={{ marginBottom: 48 }}>
                <HierarchySectionHeader number="06" label="Assumptions" />
                <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, lineHeight: 1.55, margin: "0 0 16px", maxWidth: 560 }}>
                  What has to be true for this strategy to win. Each one is a bet — track which ones hold.
                </p>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {assumptionClaims.map((c, idx) => (
                    <div key={c.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", borderTop: idx === 0 ? `1px solid ${D.hairlineFaint}` : "none", borderBottom: `1px solid ${D.hairlineFaint}`, padding: "12px 0", gap: 12, alignItems: "baseline" }}>
                      <span style={{ fontFamily: D.mono, fontSize: 11, color: "rgba(17,17,17,0.3)" }}>{String(idx + 1).padStart(2, "0")}</span>
                      <p style={{ fontFamily: D.sans, fontSize: 14, color: D.ink, margin: 0, lineHeight: 1.5 }}>{c.statement}</p>
                      <span style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: D.inkFaint, flexShrink: 0 }}>
                        {STATE_LABELS[c.state] ?? c.state}
                      </span>
                    </div>
                  ))}
                </div>
                {untestedCount > 0 && (
                  <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkSoft, lineHeight: 1.55, margin: "14px 0 0", maxWidth: 560 }}>
                    {untestedCount} of {assumptionClaims.length} untested — running these experiments would increase confidence.
                  </p>
                )}
              </div>
            );
          })()}
        </HierarchyPageShell>
      </>
    );
  }

  // ── Legacy layout ──────────────────────────────────────────────────────────
  return (
    <>
    <div className="crpv-ws-section crpv-ws-section-wide">
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9aaba5", margin: "0 0 8px" }}>
          The organizational bet
          {updatedAt && (
            <span style={{ color: "#bbb", marginLeft: 8 }}>· {updatedAt}</span>
          )}
        </p>
        <p style={{ fontSize: 15, fontWeight: 400, color: "#1e3340", lineHeight: 1.5, margin: "0 0 4px", letterSpacing: "-0.005em", maxWidth: 640 }}>
          {directionContextNote ?? "Where the organization is placing its weight, and what that commitment implies."}
        </p>
        {(onGenerateProposal || (cascadeId && onCheckSurfaceDrift)) && (
          <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            {onGenerateProposal && (
              <div>
                <ProposeChangesButton
                  surfaceType="cascade"
                  surfaceId={cascadeId}
                  onGenerate={onGenerateProposal}
                  canGenerate={canGenerate}
                  generateLoading={generateLoading}
                  generateMessage={generateMessage}
                  variant="panel"
                  refreshKey={driftRefreshKey}
                />
              </div>
            )}
            {cascadeId && onCheckSurfaceDrift && (
              <button
                type="button"
                onClick={() => onCheckSurfaceDrift("cascade", cascadeId)}
                disabled={checkingSurfaceId === cascadeId}
                style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.06em", color: checkingSurfaceId === cascadeId ? "#ccc" : "#aaa", background: "none", border: "1px solid #ddd", cursor: checkingSurfaceId === cascadeId ? "wait" : "pointer", padding: "4px 10px", borderRadius: 2, flexShrink: 0, marginTop: 2 }}
              >
                {checkingSurfaceId === cascadeId ? "Checking…" : "Check for drift"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pending proposal section */}
      {proposal && (
        <CascadeProposalSection
          canApply={canApply}
          canReject={canReject}
          proposal={proposal}
          onAcceptProposal={onAcceptProposal}
          onRejectProposal={onRejectProposal}
          acceptLoading={acceptLoading}
          rejectLoading={rejectLoading}
          hierarchy={false}
          reEvalProgress={reEvalProgress}
        />
      )}

      {companyId && <StrategicDirectionDelta companyId={companyId} />}
      {companyId && <StandingFindings companyId={companyId} />}

      <StatementField
        label="Where you're headed"
        value={strategy.winning_aspiration}
        onSave={async (v) => { await updateNarrativeField("winning_aspiration", v); flash("aspiration"); }}
        readOnly={!canInlineEdit}
        hint="What does winning look like in the market you're in right now?"
        rows={4}
        isSaved={savedField === "aspiration"}
        gap={baseline ? {
          alignment: alignmentOf(strategy.winning_aspiration, baseline.top_hypotheses?.[0]),
          baselineValue: baseline.top_hypotheses?.[0],
        } : undefined}
      />

      <StatementField
        label="Where you'll compete"
        value={strategy.where_to_play}
        onSave={async (v) => { await updateNarrativeField("where_to_play", v); flash("where"); }}
        readOnly={!canInlineEdit}
        hint="Which customers, geographies, and channels are you going after?"
        rows={3}
        isSaved={savedField === "where"}
        gap={baseline ? {
          alignment: alignmentOf(strategy.where_to_play, baseline.category_archetype),
          baselineValue: baseline.category_archetype,
        } : undefined}
      />

      <StatementField
        label="How you'll win"
        value={strategy.how_to_win}
        onSave={async (v) => { await updateNarrativeField("how_to_win", v); flash("how"); }}
        readOnly={!canInlineEdit}
        hint="What holds as your edge when challenged?"
        rows={3}
        isSaved={savedField === "how"}
      />

      {strategy.capabilities.length > 0 && (
        <KanbanBoard
          label="Capabilities you need"
          items={strategy.capabilities}
          onUpdate={async (updated) => { await updateListField("capabilities_json", updated); flash("capabilities_json"); }}
          isSaved={savedField === "capabilities_json"}
        />
      )}

      {strategy.management_systems.length > 0 && (
        <KanbanBoard
          label="Systems that enable it"
          items={strategy.management_systems}
          onUpdate={async (updated) => { await updateListField("management_systems_json", updated); flash("management_systems_json"); }}
          isSaved={savedField === "management_systems_json"}
        />
      )}

      <div style={{ paddingTop: 8, display: "flex", justifyContent: "flex-start" }}>
        <button
          type="button"
          className="crpv-ws-need-inspect-btn"
          onClick={() => setInspectOpen(true)}
        >
          Inspect strategy →
        </button>
      </div>
    </div>

    <StrategyInspectPanel
      open={inspectOpen}
      onClose={() => setInspectOpen(false)}
      cascade={strategy}
      frameworksUsed={[]}
      signals={signals}
      hasBaseline={baseline !== null}
    />
    </>
  );
}
