import { useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDriftAssessment, type DriftAssessment, type DriftAssessmentSignal } from "@/hooks/useDriftAssessment";

const MONO: React.CSSProperties = {
  fontFamily: "monospace",
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const SURFACE_LABEL: Record<string, string> = {
  cascade: "Strategy Cascade",
  positioning: "Positioning Canvas",
  route: "Route / Leg",
  opportunity: "Customer Opportunity",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  surfaceType: string;
  surfaceId: string;
  // refreshKey incremented by parent on accept so badge re-evaluates
  refreshKey?: number;
  onRefresh?: () => void;
  onProposeChanges?: () => void;
  proposeChangesLabel?: string;
};

function SignalList({ signals }: { signals: DriftAssessmentSignal[] }) {
  if (signals.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "#9aaba5", fontStyle: "italic" }}>
        No new contributing signals captured.
      </p>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {signals.map((s, i) => (
        <div key={s.signal_id ?? i} style={{ borderLeft: "2px solid #e8e3dc", paddingLeft: 10 }}>
          {s.claim_text ? (
            <p style={{ fontSize: 11, color: "#3d4f52", lineHeight: 1.55, margin: "0 0 2px" }}>
              "{s.claim_text}"
            </p>
          ) : (
            <p style={{ fontSize: 10, color: "#9aaba5", fontStyle: "italic", margin: "0 0 2px" }}>
              (no excerpt available)
            </p>
          )}
          {s.signal_created_at && (
            <span style={{ ...MONO, color: "#b8c3bf" }}>
              {timeAgo(s.signal_created_at)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function PanelBody({
  surfaceType,
  surfaceId,
  refreshKey,
  onRefresh,
  onProposeChanges,
  proposeChangesLabel,
  onClose,
}: Omit<Props, "open"> & { assessment?: DriftAssessment | null }) {
  const { assessment, isLoading, markSeen, acceptAsAligned } = useDriftAssessment(
    surfaceType,
    surfaceId,
    refreshKey,
  );

  useEffect(() => {
    if (assessment && !assessment.operator_seen_at) {
      markSeen();
    }
  // markSeen is stable; only run when assessment arrives or changes id
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  if (isLoading) {
    return (
      <div style={{ padding: "40px 32px" }}>
        <p style={{ ...MONO, color: "#9aaba5" }}>Loading…</p>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div style={{ padding: "40px 32px" }}>
        <p style={{ fontSize: 12, color: "#9aaba5" }}>No drift assessment found for this surface.</p>
      </div>
    );
  }

  const isMaterial = assessment.drift_state === "material_drift";
  const isAccepted = !!assessment.accepted_as_aligned_at;
  const signals = (assessment.assessment_basis?.new_signals ?? []) as DriftAssessmentSignal[];

  const stateColor = isMaterial ? "#c47039" : "#b09000";
  const stateLabel = isMaterial ? "Material drift" : "Slight drift";

  async function handleAccept() {
    try {
      await acceptAsAligned();
      onRefresh?.();
      onClose();
    } catch {
      // leave panel open; toast or retry would come from parent
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "20px 24px 16px",
        borderBottom: "1px solid #f0ede8",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ ...MONO, color: "#9aaba5" }}>
            {SURFACE_LABEL[surfaceType] ?? surfaceType}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#9aaba5", padding: 0, lineHeight: 1 }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px 2px 6px",
            background: isMaterial ? "rgba(196,112,57,0.1)" : "rgba(176,144,0,0.08)",
            borderRadius: 10,
            border: `1px solid ${isMaterial ? "rgba(196,112,57,0.3)" : "rgba(176,144,0,0.25)"}`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: stateColor, display: "inline-block" }} />
            <span style={{ ...MONO, color: stateColor, fontSize: 9 }}>{stateLabel}</span>
          </span>
          {isAccepted && (
            <span style={{ ...MONO, color: "#5f9b8c", fontSize: 8 }}>accepted as aligned</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Last assessed */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ ...MONO, color: "#9aaba5" }}>Last assessed</span>
          <p style={{ fontSize: 13, color: "#3d4f52", margin: "4px 0 0", lineHeight: 1.5 }}>
            {timeAgo(assessment.last_assessed_at)}
          </p>
        </div>

        {/* Why this drifted */}
        {assessment.llm_confirmation ? (
          <div style={{ marginBottom: 20 }}>
            <span style={{ ...MONO, color: "#9aaba5" }}>Why this drifted</span>
            <p style={{ fontSize: 13, color: "#3d4f52", margin: "4px 0 0", lineHeight: 1.6 }}>
              {assessment.llm_confirmation}
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <span style={{ ...MONO, color: "#9aaba5" }}>Why this drifted</span>
            <p style={{ fontSize: 12, color: "#9aaba5", margin: "4px 0 0", fontStyle: "italic" }}>
              No LLM confirmation captured — drift detected from signal delta only.
            </p>
          </div>
        )}

        {/* Contributing signals */}
        <div style={{ marginBottom: 24 }}>
          <span style={{ ...MONO, color: "#9aaba5", display: "block", marginBottom: 8 }}>
            Contributing signals ({signals.length})
          </span>
          <SignalList signals={signals} />
        </div>

        {/* Drift score */}
        <div style={{ marginBottom: 8 }}>
          <span style={{ ...MONO, color: "#c0b6ab" }}>Drift score</span>
          <p style={{ fontSize: 13, color: "#8a9a94", margin: "2px 0 0" }}>
            {typeof assessment.drift_score === "number"
              ? assessment.drift_score.toFixed(2)
              : "—"}
          </p>
        </div>
      </div>

      {/* Actions */}
      {!isAccepted && (
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid #f0ede8",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={handleAccept}
            style={{
              width: "100%",
              padding: "9px 16px",
              background: "#1e3340",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              fontSize: 12,
              fontFamily: "monospace",
              letterSpacing: "0.05em",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            Accept as aligned — surface is strategically correct
          </button>
          {onProposeChanges && (
            <button
              type="button"
              onClick={() => { onProposeChanges(); onClose(); }}
              style={{
                width: "100%",
                padding: "9px 16px",
                background: "none",
                color: "#5e7881",
                border: "1px solid #d0d5da",
                borderRadius: 5,
                fontSize: 12,
                fontFamily: "monospace",
                letterSpacing: "0.05em",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              {proposeChangesLabel ?? "Propose changes from current evidence"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DriftDetailPanel({
  open,
  onClose,
  surfaceType,
  surfaceId,
  refreshKey,
  onRefresh,
  onProposeChanges,
  proposeChangesLabel,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="sm:max-w-[480px] flex flex-col p-0 overflow-hidden"
        aria-label={`Drift detail: ${SURFACE_LABEL[surfaceType] ?? surfaceType}`}
      >
        <PanelBody
          open={open}
          surfaceType={surfaceType}
          surfaceId={surfaceId}
          refreshKey={refreshKey}
          onRefresh={onRefresh}
          onProposeChanges={onProposeChanges}
          proposeChangesLabel={proposeChangesLabel}
          onClose={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
