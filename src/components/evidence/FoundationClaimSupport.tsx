import { useMemo, useState } from "react";
import type { FoundationClaimSupport as FoundationClaimSupportEntry } from "@/hooks/useFoundationProvenance";

const MONO = '"JetBrains Mono", ui-monospace, "SFMono-Regular", monospace';

function supportTagLabel(entry: FoundationClaimSupportEntry) {
  if (entry.contradictionCount > 0) return "Contradicted";
  if (entry.supportShape.customer > 0) return "Customer-backed";
  if (entry.supportShape.organization > 0) return "Organization-backed";
  if (entry.supportShape.outside > 0) return "Outside-backed";
  return "Needs validation";
}

function supportTagColor(entry: FoundationClaimSupportEntry) {
  const label = supportTagLabel(entry);
  if (label === "Contradicted") return { bg: "#fff2f0", border: "#ef4444", text: "#a12318" };
  if (label === "Customer-backed") return { bg: "#edf8f4", border: "#5f9b8c", text: "#285f53" };
  if (label === "Organization-backed") return { bg: "#f4f5f9", border: "#8fa1c3", text: "#49576f" };
  if (label === "Outside-backed") return { bg: "#fef7ea", border: "#e8b347", text: "#8d6324" };
  return { bg: "#f7f7f5", border: "#cbd5e1", text: "#5f6b76" };
}

function signalLabel(value: string | null | undefined) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "signal";
  return normalized.replace(/_/g, " ");
}

function SignalDetailRow({ title, value }: { title: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>{title}</span>
      <span style={{ fontSize: 12, color: "#233c4b", lineHeight: 1.5 }}>{value}</span>
    </div>
  );
}

function SignalDetailCard({
  signal,
  relationship,
}: {
  signal: NonNullable<FoundationClaimSupportEntry["supportingSignals"][number]["signal"]>;
  relationship: string;
}) {
  return (
    <div style={{ border: "1px solid #d7ded1", background: "#fff", padding: "12px 14px", borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>
            {signalLabel(signal.signal_band)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa7a2" }}>
            {signalLabel(relationship)}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa7a2" }}>
            {signalLabel(signal.source_type)}
          </span>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>
          {signalLabel(signal.validation_status)}
        </span>
      </div>
      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#233c4b", lineHeight: 1.6 }}>
        {signal.evidence_excerpt || signal.claim_text}
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        <SignalDetailRow title="Source" value={signal.source_title || null} />
        <SignalDetailRow title="Source ref" value={signal.source_id || null} />
        <SignalDetailRow title="Source URL" value={signal.source_url || null} />
        <SignalDetailRow title="Evidence type" value={signal.evidence_type || null} />
        <SignalDetailRow title="Framework" value={signal.framework || null} />
        <SignalDetailRow title="Directness" value={signal.directness || null} />
        <SignalDetailRow title="Confidence" value={signal.confidence_to_use || null} />
      </div>
    </div>
  );
}

export function FoundationClaimSupport({
  claims,
  mode,
}: {
  claims: FoundationClaimSupportEntry[];
  mode: "job_step" | "odi_need";
}) {
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

  const note = useMemo(() => {
    if (mode !== "odi_need") return null;
    const hasCustomerBacked = claims.some((entry) => entry.supportShape.customer > 0);
    return hasCustomerBacked ? null : "Customer validation is still limited.";
  }, [claims, mode]);

  if (claims.length === 0) {
    return (
      <div style={{ border: "1px solid #d7ded1", background: "#fbfaf6", padding: "12px 14px", borderRadius: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#54656a", lineHeight: 1.6 }}>
          This item does not yet have linked supporting evidence.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {note ? (
        <div style={{ border: "1px solid #e5dfcf", background: "#fdfaf4", padding: "10px 12px", borderRadius: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#8d6324" }}>
            Customer validation is still limited.
          </span>
        </div>
      ) : null}
      {claims.map((entry) => {
        const expanded = expandedClaimId === entry.claim.id;
        const tag = supportTagColor(entry);
        const strongestExcerpt = entry.strongestSupportingSignal?.evidence_excerpt || entry.strongestSupportingSignal?.claim_text || null;
        return (
          <div key={entry.claim.id} style={{ border: "1px solid #d7ded1", background: "#fff", borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setExpandedClaimId((current) => (current === entry.claim.id ? null : entry.claim.id))}
              style={{
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                padding: "14px 16px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>
                      {signalLabel(entry.claim.claim_type)}
                    </span>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 999,
                        border: `1px solid ${tag.border}`,
                        background: tag.bg,
                        color: tag.text,
                        fontFamily: MONO,
                        fontSize: 10,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      {supportTagLabel(entry)}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa7a2" }}>
                      {signalLabel(entry.derivedTriangulationState)}
                    </span>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9aa7a2" }}>
                      {signalLabel(entry.claim.confidence)}
                    </span>
                  </div>
                  {/* Strike Gate B honest render: struck = line-through + reason on
                      hover and inline who/when; minimized = de-emphasis (distinct). */}
                  <p
                    style={{
                      margin: 0, fontSize: 14, lineHeight: 1.55,
                      color: entry.claim.status === "struck" ? "#9aa7a2" : "#233c4b",
                      textDecoration: entry.claim.status === "struck" ? "line-through" : "none",
                      opacity: entry.claim.status === "minimized" ? 0.55 : 1,
                    }}
                    title={entry.claim.status === "struck" ? entry.claim.struck_reason ?? undefined : undefined}
                  >
                    {entry.claim.statement}
                  </p>
                  {entry.claim.status === "struck" ? (
                    <p style={{ margin: "4px 0 0", fontFamily: MONO, fontSize: 10, letterSpacing: "0.06em", color: "#9aa7a2" }}>
                      Struck{entry.claim.struck_at ? ` ${new Date(entry.claim.struck_at).toLocaleDateString()}` : ""}{entry.claim.struck_by ? ` by ${entry.claim.struck_by}` : ""}
                      {entry.claim.struck_reason ? ` — “${entry.claim.struck_reason}”` : ""}
                    </p>
                  ) : null}
                  {mode === "odi_need" && strongestExcerpt ? (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#54656a", lineHeight: 1.55 }}>
                      {strongestExcerpt}
                    </p>
                  ) : null}
                  {entry.contradictionCount > 0 ? (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#a12318", lineHeight: 1.55 }}>
                      Contradicting evidence exists.
                    </p>
                  ) : null}
                </div>
                <div style={{ minWidth: 120, textAlign: "right" }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>Support</div>
                  <div style={{ marginTop: 6, display: "grid", gap: 3 }}>
                    <div style={{ fontSize: 12, color: "#233c4b" }}>outside: {entry.supportShape.outside}</div>
                    <div style={{ fontSize: 12, color: "#233c4b" }}>organization: {entry.supportShape.organization}</div>
                    <div style={{ fontSize: 12, color: "#233c4b" }}>customer: {entry.supportShape.customer}</div>
                  </div>
                </div>
              </div>
            </button>
            {expanded ? (
              <div style={{ borderTop: "1px solid #eef2ef", padding: "14px 16px", display: "grid", gap: 12 }}>
                {entry.supportingSignals.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>
                      Supporting signals
                    </span>
                    {entry.supportingSignals.map((detail) =>
                      detail.signal ? <SignalDetailCard key={`${detail.ref.id}:support`} signal={detail.signal} relationship={detail.ref.relationship} /> : null,
                    )}
                  </div>
                ) : null}
                {entry.qualifyingSignals.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6e847f" }}>
                      Signals that narrow or refine this claim
                    </span>
                    {entry.qualifyingSignals.map((detail) =>
                      detail.signal ? <SignalDetailCard key={`${detail.ref.id}:qualifies`} signal={detail.signal} relationship={detail.ref.relationship} /> : null,
                    )}
                  </div>
                ) : null}
                {entry.contradictorySignals.length > 0 ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#a12318" }}>
                      Contradicting evidence
                    </span>
                    {entry.contradictorySignals.map((detail) =>
                      detail.signal ? <SignalDetailCard key={`${detail.ref.id}:contradicts`} signal={detail.signal} relationship={detail.ref.relationship} /> : null,
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
