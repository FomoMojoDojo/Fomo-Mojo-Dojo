import { useEffect } from "react";
import type { JobStepRow } from "@/hooks/useJobSteps";
import type { ActiveCheckpoint } from "./types";

function journeyLabel(step: JobStepRow) {
  return step.journey_title
    || (step.journey_key.charAt(0).toUpperCase() + step.journey_key.slice(1));
}

function EvidenceBadge({
  status,
  confidence,
}: {
  status: string | null;
  confidence: number | null;
}) {
  const label =
    status === "evidenced" ? "Evidenced"
    : status === "implied" ? "Implied"
    : status === "unclear" ? "Unclear"
    : "Not assessed";
  const color =
    status === "evidenced" ? "#16a34a"
    : status === "implied" ? "#E8A317"
    : "#9ca3af";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {label}
      {typeof confidence === "number" && (
        <span style={{ color: "#bbb" }}>· {confidence}%</span>
      )}
    </span>
  );
}

export default function JobMapPanel({
  open,
  onClose,
  steps,
  activeCheckpoint,
  suggestedStepId,
  onSelect,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  steps: JobStepRow[];
  activeCheckpoint: ActiveCheckpoint;
  suggestedStepId: string | null;
  onSelect: (cp: NonNullable<ActiveCheckpoint>) => void;
  onClear: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const suggestedStep = steps.find((s) => s.id === suggestedStepId) ?? null;
  const otherSteps = steps.filter((s) => s.id !== suggestedStepId);

  // Group other steps by journey_key
  const journeyOrder: string[] = [];
  const grouped = new Map<string, JobStepRow[]>();
  for (const s of otherSteps) {
    if (!grouped.has(s.journey_key)) {
      journeyOrder.push(s.journey_key);
      grouped.set(s.journey_key, []);
    }
    grouped.get(s.journey_key)!.push(s);
  }

  function StepButton({ step, isSuggested }: { step: JobStepRow; isSuggested?: boolean }) {
    const isActive = activeCheckpoint?.jobStepId === step.id;
    return (
      <button
        type="button"
        onClick={() => {
          onSelect({
            journeyKey: step.journey_key,
            stepNum: step.step_number ?? 0,
            stepLabel: step.step_label ?? "",
            jobStepId: step.id,
          });
          onClose();
        }}
        style={{
          display: "block", width: "100%", textAlign: "left",
          padding: "10px 12px", borderRadius: 7, marginBottom: 4,
          border: `1px solid ${isActive ? "#111" : isSuggested ? "#E8A317" : "#e8e8e8"}`,
          background: isActive ? "#111" : isSuggested ? "#fffbf0" : "#fff",
          cursor: "pointer",
          transition: "border-color 120ms, background 120ms",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0,
            color: isActive ? "#fff" : "#111",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {step.step_label ?? "Untitled checkpoint"}
          </span>
          {isSuggested && !isActive && (
            <span style={{
              fontSize: 9, fontFamily: "monospace", textTransform: "uppercase",
              letterSpacing: "0.12em", color: "#E8A317",
              background: "#fff3c4", borderRadius: 3, padding: "1px 5px",
              flexShrink: 0,
            }}>
              Suggested
            </span>
          )}
        </div>

        <EvidenceBadge
          status={step.evidence_status ?? null}
          confidence={step.evidence_confidence ?? null}
        />

        {step.has_gap && step.gap_note && (
          <p style={{
            fontSize: 11, margin: "5px 0 0", lineHeight: 1.4, fontStyle: "italic",
            color: isActive ? "rgba(255,255,255,0.6)" : "#888",
          }}>
            Gap: {step.gap_note}
          </p>
        )}
        {step.has_gap && !step.gap_note && (
          <p style={{
            fontSize: 11, margin: "5px 0 0",
            color: isActive ? "rgba(255,255,255,0.5)" : "#bbb",
          }}>
            Gap flagged
          </p>
        )}
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 100 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 400,
        background: "#fff", zIndex: 101,
        display: "flex", flexDirection: "column",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.10)",
      }}>
        {/* Header */}
        <div style={{
          padding: "22px 22px 14px",
          borderBottom: "1px solid #e8e8e8",
          flexShrink: 0,
        }}>
          <p style={{
            fontFamily: "monospace", fontSize: 9,
            textTransform: "uppercase", letterSpacing: "0.14em",
            color: "#aaa", margin: "0 0 3px",
          }}>
            Checkpoint Map
          </p>
          <p style={{ fontSize: 14, fontWeight: 500, color: "#111", margin: 0 }}>
            Set active checkpoint
          </p>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 16px" }}>

          {/* Suggested next focus */}
          {suggestedStep && (
            <div style={{ marginBottom: 16 }}>
              <p style={{
                fontFamily: "monospace", fontSize: 8,
                textTransform: "uppercase", letterSpacing: "0.16em",
                color: "#E8A317", margin: "0 0 6px",
                paddingBottom: 4, borderBottom: "1px solid #fde68a",
              }}>
                Suggested next focus
              </p>
              <StepButton step={suggestedStep} isSuggested />
            </div>
          )}

          {/* Other / all checkpoints grouped by journey */}
          {otherSteps.length === 0 && !suggestedStep && (
            <p style={{ fontSize: 13, color: "#aaa", margin: "16px 0" }}>
              No checkpoints found.
            </p>
          )}

          {otherSteps.length > 0 && (
            <div>
              <p style={{
                fontFamily: "monospace", fontSize: 8,
                textTransform: "uppercase", letterSpacing: "0.16em",
                color: "#bbb", margin: "0 0 6px",
                paddingBottom: 4, borderBottom: "1px solid #f0f0f0",
              }}>
                {suggestedStep ? "Other checkpoints" : "All checkpoints"}
              </p>

              {journeyOrder.map((jk) => {
                const jSteps = grouped.get(jk)!;
                const jLabel = jSteps[0] ? journeyLabel(jSteps[0]) : jk;
                return (
                  <div key={jk} style={{ marginBottom: 12 }}>
                    {journeyOrder.length > 1 && (
                      <p style={{
                        fontFamily: "monospace", fontSize: 8,
                        textTransform: "uppercase", letterSpacing: "0.14em",
                        color: "#ccc", margin: "8px 0 4px",
                      }}>
                        {jLabel}
                      </p>
                    )}
                    {jSteps.map((step) => (
                      <StepButton key={step.id} step={step} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid #e8e8e8",
          flexShrink: 0, display: "flex", gap: 8,
        }}>
          {activeCheckpoint && (
            <button
              type="button"
              onClick={() => { onClear(); onClose(); }}
              style={{
                flex: 1, padding: "9px 0",
                border: "1px solid #e8e8e8", borderRadius: 7,
                background: "#fff", fontSize: 12, color: "#777", cursor: "pointer",
              }}
            >
              Clear focus
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "9px 0",
              border: "1px solid #e8e8e8", borderRadius: 7,
              background: "#fff", fontSize: 12, color: "#777", cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
}
