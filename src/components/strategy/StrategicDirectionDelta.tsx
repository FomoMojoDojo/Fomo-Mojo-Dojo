import { useState } from "react";
import { useStrategicDelta, type DeltaSignal, type PublicTheme, type DispositionValue } from "@/hooks/useStrategicDelta";
import { D } from "@/components/design-system/tokens";

// Local accent constants — not in D.* yet
const A = {
  intentional: "#4a8f7f",   // teal — deliberate choice
  queued:      "#c47a1c",   // amber — to address
  publicLabel: "#8a7560",   // warm neutral for public side
  publicBg:    "rgba(138,117,96,0.06)",
  sectionBorder: D.hairlineFaint,
} as const;

function truncate(t: string, max = 200) {
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

// ─── Disposition action buttons ───────────────────────────────────────────────

function DispositionActions({
  signalId,
  current,
  onSet,
}: {
  signalId: string;
  current: DispositionValue | undefined;
  onSet: (id: string, v: DispositionValue | null) => void;
}) {
  function handle(v: DispositionValue) {
    onSet(signalId, current === v ? null : v);
  }
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={() => handle("intentional")}
        style={{
          fontFamily: D.mono,
          fontSize: 9,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          padding: "2px 8px",
          border: `1px solid ${current === "intentional" ? A.intentional : D.hairline}`,
          borderRadius: 2,
          background: current === "intentional" ? `${A.intentional}18` : "transparent",
          color: current === "intentional" ? A.intentional : D.inkFaint,
          cursor: "pointer",
        }}
      >
        {current === "intentional" ? "✓ Intentional" : "Mark intentional"}
      </button>
      <button
        type="button"
        onClick={() => handle("queued")}
        style={{
          fontFamily: D.mono,
          fontSize: 9,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          padding: "2px 8px",
          border: `1px solid ${current === "queued" ? A.queued : D.hairline}`,
          borderRadius: 2,
          background: current === "queued" ? `${A.queued}18` : "transparent",
          color: current === "queued" ? A.queued : D.inkFaint,
          cursor: "pointer",
        }}
      >
        {current === "queued" ? "→ Queued" : "Queue"}
      </button>
    </div>
  );
}

// ─── Internal signal row ──────────────────────────────────────────────────────

function InternalRow({
  sig,
  disposition,
  onSet,
}: {
  sig: DeltaSignal;
  disposition: DispositionValue | undefined;
  onSet: (id: string, v: DispositionValue | null) => void;
}) {
  return (
    <div style={{
      paddingLeft: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderLeft: `2px solid ${disposition ? (disposition === "intentional" ? A.intentional : A.queued) : D.hairline}`,
      marginBottom: 10,
    }}>
      <p style={{ fontFamily: D.sans, fontSize: 13, color: D.ink, lineHeight: 1.5, margin: 0 }}>
        {truncate(sig.claim_text)}
      </p>
      <DispositionActions signalId={sig.id} current={disposition} onSet={onSet} />
    </div>
  );
}

// ─── Public theme row ─────────────────────────────────────────────────────────

function PublicThemeRow({ theme }: { theme: PublicTheme }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "baseline", gap: 8, width: "100%",
          background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left",
        }}
      >
        <span style={{
          fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase",
          letterSpacing: "0.1em", color: A.publicLabel, flexShrink: 0, minWidth: 56,
        }}>
          {theme.label}
        </span>
        <span style={{
          fontFamily: D.sans, fontSize: 11.5, color: D.inkSoft,
          lineHeight: 1.45, flex: 1,
        }}>
          {truncate(theme.headline, 100)}
        </span>
        <span style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint, flexShrink: 0 }}>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div style={{ marginTop: 6, paddingLeft: 64, display: "flex", flexDirection: "column", gap: 6 }}>
          {theme.signals.map(s => (
            <p key={s.id} style={{
              fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, lineHeight: 1.5,
              margin: 0, paddingLeft: 8, borderLeft: `1px solid ${D.hairlineFaint}`,
            }}>
              {truncate(s.claim_text, 160)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Disclosure expander ──────────────────────────────────────────────────────

function Disclosure({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderTop: `1px solid ${D.hairlineFaint}`, paddingTop: 12, marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <span style={{ fontFamily: D.mono, fontSize: 9.5, textTransform: "uppercase",
          letterSpacing: "0.1em", color: D.inkFaint }}>
          {label}
        </span>
        <span style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint, opacity: 0.6 }}>
          {count}
        </span>
        <span style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint }}>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StrategicDirectionDelta({ companyId }: { companyId: string }) {
  const { data, isLoading, setDisposition } = useStrategicDelta(companyId);

  if (isLoading) {
    return (
      <div style={{ padding: "16px 0", fontFamily: D.mono, fontSize: 9.5,
        textTransform: "uppercase", letterSpacing: "0.12em", color: D.inkFaint }}>
        Loading foundation…
      </div>
    );
  }

  if (!data) return null;

  const { internal, publicThemes, dispositions, currentRunId, alignmentTrend } = data;
  const { strategicBet, recommendations, sourceReads } = internal;

  // PVT-1: current snapshot's public-vs-internal alignment (minimal surface; rich
  // run-over-run trend rendering is the #2 step).
  const currentAlignment =
    alignmentTrend.find(p => p.run_id === currentRunId) ??
    (alignmentTrend.length > 0 ? alignmentTrend[alignmentTrend.length - 1] : null);

  // Nothing at all — skip the section entirely
  if (strategicBet.length + recommendations.length + sourceReads.length + publicThemes.length === 0) {
    return null;
  }

  const hasBet = strategicBet.length > 0;
  const hasRecs = recommendations.length > 0;
  const hasPublic = publicThemes.length > 0;

  // Primary hero: cascade signals, or recommendations if no cascade
  const primarySignals = hasBet ? strategicBet : recommendations;
  const primaryLabel   = hasBet ? "Strategic Bet · Internal" : "Recommendations & Gaps · Internal";
  const showRecsSecondary = hasBet && hasRecs;

  return (
    <div style={{
      borderTop: `1px solid ${D.hairline}`,
      paddingTop: 24,
      paddingBottom: 8,
      marginBottom: 32,
    }}>

      {/* Section eyebrow */}
      <p style={{
        fontFamily: D.mono, fontSize: 9, textTransform: "uppercase",
        letterSpacing: "0.16em", color: D.inkFaint, margin: "0 0 16px",
      }}>
        Strategic Foundation
      </p>

      {/* Hero + public side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 24, alignItems: "start" }}>

        {/* LEFT — primary internal spine */}
        <div>
          <p style={{
            fontFamily: D.mono, fontSize: 9, textTransform: "uppercase",
            letterSpacing: "0.12em", color: D.signal, margin: "0 0 12px",
          }}>
            {primaryLabel}
          </p>
          {primarySignals.length === 0 ? (
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.inkFaint, lineHeight: 1.5 }}>
              No internal signals yet.
            </p>
          ) : (
            primarySignals.map(sig => (
              <InternalRow
                key={sig.id}
                sig={sig}
                disposition={dispositions.get(sig.id)}
                onSet={setDisposition}
              />
            ))
          )}
        </div>

        {/* RIGHT — public baseline, visually secondary */}
        {hasPublic && (
          <div style={{
            background: A.publicBg,
            borderRadius: 4,
            padding: "12px 14px",
          }}>
            <p style={{
              fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase",
              letterSpacing: "0.12em", color: A.publicLabel, margin: "0 0 10px",
            }}>
              Presented publicly
              {currentRunId != null && (
                <span style={{ color: A.publicLabel, opacity: 0.7 }}> · snapshot #{currentRunId}</span>
              )}
            </p>
            {currentAlignment?.alignment_status && (
              <p style={{
                fontFamily: D.sans, fontSize: 11, lineHeight: 1.45,
                color: D.inkFaint, margin: "0 0 10px",
              }}>
                <span style={{
                  fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
                  letterSpacing: "0.1em", color: A.publicLabel, display: "block", marginBottom: 2,
                }}>
                  Alignment vs strategy
                </span>
                {currentAlignment.alignment_status}
              </p>
            )}
            {publicThemes.map(t => (
              <PublicThemeRow key={t.key} theme={t} />
            ))}
          </div>
        )}
      </div>

      {/* Recommendations & Gaps — secondary block (only if cascade signals exist) */}
      {showRecsSecondary && (
        <Disclosure label="Recommendations & Gaps" count={recommendations.length} defaultOpen={false}>
          <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, margin: "0 0 10px", lineHeight: 1.5 }}>
            Internal hypotheses to test — company-derived, not customer-validated.
          </p>
          {recommendations.map(sig => (
            <InternalRow
              key={sig.id}
              sig={sig}
              disposition={dispositions.get(sig.id)}
              onSet={setDisposition}
            />
          ))}
        </Disclosure>
      )}

      {/* Source reads — always behind disclosure */}
      {sourceReads.length > 0 && (
        <Disclosure label="Source reads" count={sourceReads.length} defaultOpen={false}>
          {sourceReads.map(sig => (
            <div key={sig.id} style={{
              paddingLeft: 8, borderLeft: `1px solid ${D.hairlineFaint}`,
              marginBottom: 8,
            }}>
              <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkFaint, lineHeight: 1.5, margin: 0 }}>
                {truncate(sig.claim_text, 200)}
              </p>
            </div>
          ))}
        </Disclosure>
      )}
    </div>
  );
}
