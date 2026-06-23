import { useState } from "react";
import { useStrategicDelta, type DeltaSignal, type PublicTheme, type DispositionValue, type PublicVoiceDelta } from "@/hooks/useStrategicDelta";
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

// ─── Public read: provenance helpers + section + trend ────────────────────────

// Short per-row provenance tag from source_type.
const SOURCE_TAG: Record<string, string> = {
  customer_review: "Customer review",
  employee_review: "Employee review",
  news_signal: "News",
  third_party_profile: "Listing",
  community_discussion: "Community",
  review_signal: "Review",
  profile_or_company_page: "Company-stated",
  public_web: "Web",
  analysis: "Public mention",   // findings-layer synthesis stamp — same as blank's fallback (net-zero)
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function provenanceTag(s: DeltaSignal): string {
  const st = typeof s.rawPayload.source_type === "string" ? s.rawPayload.source_type : "";
  const tag = SOURCE_TAG[st] ?? "Public mention";
  const url = typeof s.rawPayload.url === "string" ? s.rawPayload.url : "";
  const host = hostOf(url);
  return host ? `${tag} · ${host}` : tag;
}

// Profile-link discoveries carry a generic "declared in page metadata (/)" /
// "fallback social link discovered from …" claim — show the actual URL instead of
// that useless string.
function rowContent(s: DeltaSignal): string {
  const claim = (s.claim_text ?? "").trim();
  const url = typeof s.rawPayload.url === "string" ? s.rawPayload.url : "";
  if (!claim || /declared in page metadata|fallback social link/i.test(claim)) {
    return url || claim;
  }
  return claim;
}

// One source-type section: humanized header + provenance-tagged rows.
function PublicSection({ theme, primary }: { theme: PublicTheme; primary: boolean }) {
  return (
    <div style={{ marginBottom: primary ? 20 : 12 }}>
      <p style={{
        fontFamily: D.mono, fontSize: primary ? 10 : 8.5, textTransform: "uppercase",
        letterSpacing: "0.1em", color: A.publicLabel, margin: "0 0 8px",
      }}>
        {theme.label}
      </p>
      {theme.signals.map(s => (
        <div key={s.id} style={{
          marginBottom: 8, paddingLeft: 8, borderLeft: `1px solid ${D.hairlineFaint}`,
        }}>
          <p style={{
            fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
            letterSpacing: "0.06em", color: D.inkFaint, margin: "0 0 2px",
          }}>
            {provenanceTag(s)}
          </p>
          <p style={{
            fontFamily: D.sans, fontSize: primary ? 13 : 11.5,
            color: primary ? D.ink : D.inkSoft, lineHeight: 1.45, margin: 0,
            wordBreak: "break-word",
          }}>
            {truncate(rowContent(s), primary ? 220 : 140)}
          </p>
        </div>
      ))}
    </div>
  );
}

function shortStatus(status: string | null): string {
  if (!status) return "—";
  const head = status.split(/[—:.]/)[0].trim();
  return head || status.slice(0, 16);
}

function statusColor(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s.startsWith("aligned")) return A.intentional;
  if (s.startsWith("partial")) return A.queued;
  return D.inkFaint;
}

// Run-over-run alignment: horizontal strip (primary) / vertical stack (sidebar).
function AlignmentTrend({
  trend, currentRunId, primary,
}: {
  trend: { run_id: number; alignment_status: string | null; alignment_summary: string | null }[];
  currentRunId: number | null;
  primary: boolean;
}) {
  if (!trend || trend.length < 2) return null;
  return (
    <div style={{ marginTop: 14 }}>
      <p style={{
        fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase",
        letterSpacing: "0.1em", color: A.publicLabel, margin: "0 0 8px",
      }}>
        Alignment over time
      </p>
      <div style={primary
        ? { display: "flex", gap: 12, flexWrap: "wrap" }
        : { display: "flex", flexDirection: "column", gap: 8 }}>
        {trend.map(p => {
          const isNow = p.run_id === currentRunId;
          return (
            <div key={p.run_id} style={{
              flex: primary ? "1 1 200px" : undefined,
              opacity: isNow ? 1 : 0.6,
              paddingLeft: 8, borderLeft: `2px solid ${statusColor(p.alignment_status)}`,
            }}>
              <p style={{ fontFamily: D.mono, fontSize: 8.5, color: D.inkFaint, margin: "0 0 1px" }}>
                #{p.run_id}{isNow ? " · now" : ""}
                <span style={{ color: statusColor(p.alignment_status), marginLeft: 6 }}>
                  {shortStatus(p.alignment_status)}
                </span>
              </p>
              {primary && p.alignment_summary && (
                <p style={{ fontFamily: D.sans, fontSize: 11, color: D.inkFaint, lineHeight: 1.4, margin: 0 }}>
                  {truncate(p.alignment_summary, 150)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The public read ("Presented Publicly"), rendered full width (variant "primary").
// PVT-2: what moved in public voice between the baseline run and the current run.
// Source-level + honest (counts are sources, never inflated to signals). Client voice,
// second person. Dropped sources are shown struck/quiet — both runs' rows still exist;
// this is a read, nothing deleted. Shifted is labelled APPROXIMATE (claim_text is
// LLM-regenerated, so a moved claim set is a hint, not a verdict).
function PublicVoiceDeltaBlock({ delta, primary }: { delta: PublicVoiceDelta; primary: boolean }) {
  const { baselineRunId, currentRunId, newSources, droppedSources, shiftedSources } = delta;
  const labelStyle: React.CSSProperties = {
    fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
    letterSpacing: "0.1em", color: A.publicLabel, display: "block", marginBottom: 4,
  };
  // Empty state: fewer than 2 runs → nothing to diff yet.
  if (baselineRunId == null || currentRunId == null || baselineRunId === currentRunId) {
    return (
      <div style={{ marginBottom: 14 }}>
        <span style={labelStyle}>What changed in public voice</span>
        <p style={{ fontFamily: D.sans, fontSize: primary ? 12 : 11, color: D.inkFaint, lineHeight: 1.45, margin: 0 }}>
          Baseline established — no delta yet.
        </p>
      </div>
    );
  }
  const total = newSources.length + droppedSources.length + shiftedSources.length;
  // Show the page, not just the host — distinct pages on one host (iaqm.com/blog vs
  // iaqm.com/about vs bare iaqm.com) are distinct sources and must read as distinct.
  const nameOf = (e: { host: string | null; url: string }) =>
    e.url.replace(/^https?:\/\//, "").replace(/^www\./, "") || e.host || e.url;
  const rowStyle: React.CSSProperties = {
    fontFamily: D.sans, fontSize: primary ? 12 : 11, color: D.ink, lineHeight: 1.5, margin: "0 0 4px",
  };
  return (
    <div style={{ marginBottom: 16 }}>
      <span style={labelStyle}>
        What changed since snapshot #{baselineRunId}
        {" · "}
        <span style={{ color: D.inkFaint }}>
          {newSources.length} new · {droppedSources.length} quiet · {shiftedSources.length} shifted
        </span>
      </span>
      {total === 0 ? (
        <p style={{ fontFamily: D.sans, fontSize: primary ? 12 : 11, color: D.inkFaint, lineHeight: 1.45, margin: 0 }}>
          Public voice is holding steady — same sources as the baseline.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {newSources.map((e) => (
            <p key={`n-${e.url}`} style={rowStyle}>
              <span style={{ color: D.signal, fontWeight: 600 }}>+ </span>
              You're now hearing from <strong>{nameOf(e)}</strong>.
            </p>
          ))}
          {shiftedSources.map((e) => (
            <p key={`s-${e.url}`} style={rowStyle}>
              <span style={{ color: A.queued, fontWeight: 600 }}>~ </span>
              <strong>{nameOf(e)}</strong> is still talking, but the voice has moved
              <span style={{ color: D.inkFaint }}> (approximate)</span>.
            </p>
          ))}
          {droppedSources.map((e) => (
            <p key={`d-${e.url}`} style={{ ...rowStyle, color: D.inkFaint }}>
              <span style={{ fontWeight: 600 }}>– </span>
              <span style={{ textDecoration: "line-through" }}>{nameOf(e)}</span> has gone quiet since baseline.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function PublicPanel({
  variant, currentRunId, currentAlignment, alignmentTrend, themes, delta,
}: {
  variant: "primary" | "sidebar";
  currentRunId: number | null;
  currentAlignment: { alignment_status: string | null } | null;
  alignmentTrend: { run_id: number; alignment_status: string | null; alignment_summary: string | null }[];
  themes: PublicTheme[];
  delta: PublicVoiceDelta;
}) {
  const primary = variant === "primary";
  return (
    <div style={primary ? undefined : { background: A.publicBg, borderRadius: 4, padding: "12px 14px" }}>
      <p style={{
        fontFamily: D.mono, fontSize: primary ? 9 : 8.5, textTransform: "uppercase",
        letterSpacing: "0.12em", color: primary ? D.signal : A.publicLabel, margin: "0 0 12px",
      }}>
        Presented Publicly
        {currentRunId != null && (
          <span style={{ color: A.publicLabel, opacity: 0.7 }}> · Snapshot #{currentRunId}</span>
        )}
      </p>
      {currentAlignment?.alignment_status && (
        <div style={{ marginBottom: 14 }}>
          <span style={{
            fontFamily: D.mono, fontSize: 8, textTransform: "uppercase",
            letterSpacing: "0.1em", color: A.publicLabel, display: "block", marginBottom: 2,
          }}>
            Alignment vs strategy
          </span>
          <p style={{ fontFamily: D.sans, fontSize: primary ? 12 : 11, color: D.inkFaint, lineHeight: 1.45, margin: 0 }}>
            {currentAlignment.alignment_status}
          </p>
        </div>
      )}
      <PublicVoiceDeltaBlock delta={delta} primary={primary} />
      {themes.map(t => <PublicSection key={t.key} theme={t} primary={primary} />)}
      <AlignmentTrend trend={alignmentTrend} currentRunId={currentRunId} primary={primary} />
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

  const { internal, publicThemes, dispositions, currentRunId, alignmentTrend, publicVoiceDelta } = data;
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

  // The public read ("Presented Publicly") always renders full width below the
  // internal spine — the former narrow 260px sidebar layout was removed.
  const hasInternal = hasBet || hasRecs;

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

      {/* ── Internal spine — full width, stacked (two-column grid removed) ── */}
      {hasInternal ? (
        <div style={{ marginBottom: 24 }}>
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
      ) : (
        <p style={{
          fontFamily: D.mono, fontSize: 9, textTransform: "uppercase",
          letterSpacing: "0.1em", color: D.inkFaint, margin: "0 0 20px",
        }}>
          Internal strategy — build it in Diagnose to compare against this public read.
        </p>
      )}

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

      {/* ── Presented Publicly — full width, below the internal spine ── */}
      {hasPublic && (
        <div style={{ marginTop: 24 }}>
          <PublicPanel
            variant="primary"
            currentRunId={currentRunId}
            currentAlignment={currentAlignment}
            alignmentTrend={alignmentTrend}
            themes={publicThemes}
            delta={publicVoiceDelta}
          />
        </div>
      )}
    </div>
  );
}
