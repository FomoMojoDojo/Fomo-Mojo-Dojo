import { useEffect, useState } from "react";
import { useStrategicDelta, type ClaimDeltaRow, type DeltaSignal, type PublicTheme, type DispositionValue, type PublicVoiceDelta, type StruckClaim } from "@/hooks/useStrategicDelta";
import { useClaimDeltaRecompute } from "@/hooks/useClaimDeltaRecompute";
import OpenQuestionRecomputeControl from "@/components/strategy/OpenQuestionRecomputeControl";
import { D } from "@/components/design-system/tokens";
import { sourceHost, sourceLinkTitle } from "@/lib/sourceHost";
import { supabase } from "@/integrations/supabase/client";
import { previewStrikeScoreDelta, type StrikeScorePreview } from "@/lib/mojoScore/strikePreview";
import { residualStruckClaims } from "@/lib/claimState/struckResidual";

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

// MO-2: host derivation consolidated into src/lib/sourceHost.ts.
const hostOf = (url: string): string => sourceHost(url) ?? "";

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
  // MO-2: the source name links out to the page when we have a url; plain text
  // otherwise (honest degrade — never a dead link). Signed label on the anchor.
  const SourceName = ({ e }: { e: { host: string | null; url: string } }) =>
    e.url ? (
      <a
        href={e.url}
        target="_blank"
        rel="noopener noreferrer"
        title={sourceLinkTitle(null)}
        style={{ color: "inherit", textDecorationColor: D.hairline }}
      >
        {nameOf(e)}
      </a>
    ) : (
      <>{nameOf(e)}</>
    );
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
              You're now hearing from <strong><SourceName e={e} /></strong>.
            </p>
          ))}
          {shiftedSources.map((e) => (
            <p key={`s-${e.url}`} style={rowStyle}>
              <span style={{ color: A.queued, fontWeight: 600 }}>~ </span>
              <strong><SourceName e={e} /></strong> is still talking, but the voice has moved
              <span style={{ color: D.inkFaint }}> (approximate)</span>.
            </p>
          ))}
          {droppedSources.map((e) => (
            <p key={`d-${e.url}`} style={{ ...rowStyle, color: D.inkFaint }}>
              <span style={{ fontWeight: 600 }}>– </span>
              <span style={{ textDecoration: "line-through" }}><SourceName e={e} /></span> has gone quiet since baseline.
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


// ─── INT-3: Declared vs Observed — the founding signal ────────────────────────
//
// Renders persisted claim deltas: judged pairs (echoed / divergent) with the
// tri-state honesty law (inferred pairings visibly labeled), and the two
// silence rails (publicly_silent = OPEN QUESTIONS — absence ≠ contradiction;
// internally_silent = the market speaks, nothing declared). Divergence shows a
// PASSIVE banner — the strong off-strategy alert arms only once a choosing act
// exists (pre-choosing, nothing can be "off-strategy").

const DELTA_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  echoed:    { label: "Echoed",    color: "#2f6b3a", bg: "#eef7ef" },
  divergent: { label: "Divergent", color: "#8a3b1f", bg: "#fdf1e9" },
};

// FR-D3: provenance chip for the DECLARED side of a client-spoken delta. Only
// client_attested claims earn it — a document-declared (internal_declared) delta
// stays chip-less (absence is the default state; chips only when earned). Matches
// the chip grammar above (mono, bordered, tinted); a distinct blue reads as
// "attested in the room," apart from the green/rust delta chips. Date comes from
// the attesting First Read session; absent -> the chip renders WITHOUT a date
// rather than a wrong one. Copy is DRAFT, PENDING OPERATOR SIGNATURE (FR-D3).
function AttestedChip({ date }: { date: string | null }) {
  let day: string | null = null;
  if (date) {
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) day = d.toLocaleDateString();
  }
  const label = day ? `Client-attested · First Read · ${day}` : "Client-attested · First Read";
  return (
    <span
      title="This declared statement was spoken by the client in a First Read meeting (client_attested provenance) — not read from an uploaded document."
      style={{
        fontFamily: D.mono, fontSize: 8.5, letterSpacing: "0.06em",
        color: "#37527d", background: "#eef2f9", border: "1px solid #cad6ea",
        borderRadius: 3, padding: "2px 7px", whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function DeltaDispositionActions({ row, onSet }: {
  row: ClaimDeltaRow;
  onSet: (id: string, v: "acknowledged" | "intentional" | "queued" | "rejected_pairing" | null) => void;
}) {
  const opts: Array<{ v: "acknowledged" | "intentional" | "queued" | "rejected_pairing"; label: string; title: string }> = [
    { v: "acknowledged", label: "Acknowledge", title: "Seen — no action needed now" },
    { v: "intentional", label: "Intentional", title: "This difference is deliberate" },
    { v: "queued", label: "Queue", title: "Queue this for strategy work" },
    { v: "rejected_pairing", label: "Not a pair", title: "These statements are not about the same thing — dismissed pairings never re-propose" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          title={o.title}
          onClick={() => onSet(row.id, row.operator_disposition === o.v ? null : o.v)}
          style={{
            fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.08em",
            padding: "3px 8px", borderRadius: 3, cursor: "pointer",
            border: `1px solid ${row.operator_disposition === o.v ? D.signal : D.hairline}`,
            background: row.operator_disposition === o.v ? "#f2f6f4" : "transparent",
            color: row.operator_disposition === o.v ? D.ink : D.inkFaint,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Strike Gate B: per-claim status controls (admin-only surface) ────────────
//
// Strike = the claim stops counting everywhere (score, readiness, deltas) but
// its history is preserved and it can be restored. Minimize = display-only
// de-emphasis, still counts everywhere. ALL writes go through the Gate A
// set_claim_status RPC (the hook's setClaimStatus) — the DB trigger blocks any
// other path. Client-visible strings are DRAFTS pending operator signature.

type ClaimStatus = "active" | "minimized" | "struck";
type PendingStatusAction = {
  slotId: string;          // unique render site — a claim can appear in several rows
  claimId: string;
  statement: string;
  kind: "strike" | "minimize";
};
type SetClaimStatusFn = (claimId: string, status: ClaimStatus, reason?: string) => Promise<void>;

// Honest render states: struck = line-through (never hidden mid-lifecycle),
// minimized = de-emphasis (visually DISTINCT from struck), active = unchanged.
function statementStatusStyle(status: ClaimStatus | null): React.CSSProperties {
  if (status === "struck") return { textDecoration: "line-through", color: D.inkFaint };
  if (status === "minimized") return { opacity: 0.55 };
  return {};
}

// Inline who/when/reason for a struck claim — the same signed line the
// residual section uses ("Struck {date} by {actor} — \u201c{reason}\u201d").
function StruckMetaLine({ claim }: { claim: StruckClaim | undefined }) {
  if (!claim) return null;
  return (
    <p style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint, margin: "2px 0 0" }}>
      Struck{claim.struck_at ? ` ${new Date(claim.struck_at).toLocaleDateString()}` : ""}{claim.struck_by ? ` by ${claim.struck_by}` : ""}
      {claim.struck_reason ? ` — \u201c${claim.struck_reason}\u201d` : ""}
    </p>
  );
}

function ClaimStatusControls({ slotId, claimId, statement, status, pending, onRequest, onRestore, busy }: {
  slotId: string;
  claimId: string;
  statement: string;
  status: ClaimStatus | null;
  pending: PendingStatusAction | null;
  onRequest: (a: PendingStatusAction) => void;
  onRestore: (claimId: string) => void;
  busy: boolean;
}) {
  if (!status) return null;
  const btn = (label: string, title: string, onClick: () => void): JSX.Element => (
    <button
      key={label}
      type="button"
      title={title}
      disabled={busy}
      onClick={onClick}
      style={{
        fontFamily: D.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em",
        padding: "1px 6px", borderRadius: 3, cursor: busy ? "default" : "pointer",
        border: `1px solid ${D.hairlineFaint}`, background: "transparent", color: D.inkFaint,
      }}
    >
      {label}
    </button>
  );
  const isPendingHere = pending?.slotId === slotId;
  return (
    <span style={{ display: "inline-flex", gap: 4, marginLeft: 8, verticalAlign: "middle" }}>
      {status === "active" && !isPendingHere && btn("Strike", "Set this claim aside — it stops counting everywhere; restorable", () => onRequest({ slotId, claimId, statement, kind: "strike" }))}
      {status === "active" && !isPendingHere && btn("Minimize", "De-emphasize on screen — still counts everywhere", () => onRequest({ slotId, claimId, statement, kind: "minimize" }))}
      {status === "minimized" && !isPendingHere && btn("Strike", "Set this claim aside — it stops counting everywhere; restorable", () => onRequest({ slotId, claimId, statement, kind: "strike" }))}
      {status !== "active" && btn("Restore", "Return this claim to active — counts and renders normally again", () => onRestore(claimId))}
    </span>
  );
}

// Consequence-render confirm (INT-4 pattern): name what the act changes before
// the operator confirms. Strike requires a reason and shows the live score
// effect (same selects + same compute as the snapshot, run read-only).
function ClaimStatusConfirm({ pending, companyId, onConfirm, onCancel }: {
  pending: PendingStatusAction;
  companyId: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<StrikeScorePreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    if (pending.kind !== "strike") return;
    let cancelled = false;
    previewStrikeScoreDelta(supabase, companyId, pending.claimId)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setPreviewFailed(true); });
    return () => { cancelled = true; };
  }, [pending.kind, pending.claimId, companyId]);

  const isStrike = pending.kind === "strike";
  const confirmDisabled = isStrike && reason.trim().length === 0;

  return (
    <div style={{ border: `1px solid ${D.hairline}`, background: "#faf9f6", borderRadius: 4, padding: "10px 12px", margin: "8px 0" }}>
      <p style={{ fontFamily: D.sans, fontSize: 12, color: D.ink, margin: "0 0 6px", lineHeight: 1.55 }}>
        {isStrike
          ? "Striking sets this claim aside — it stops counting in the Mojo Score, phase readiness, and the Declared-vs-Observed comparison. Its history is preserved and you can restore it any time."
          : "Minimize de-emphasizes this claim on screen — it still counts everywhere."}
      </p>
      {isStrike && (
        <p style={{ fontFamily: D.mono, fontSize: 9.5, color: D.inkSoft, margin: "0 0 8px" }}>
          {preview
            ? (preview.delta === 0
              ? `Mojo Score unchanged (${preview.before})`
              : `Mojo Score ${preview.before} → ${preview.after} (${preview.delta > 0 ? "+" : ""}${preview.delta})`)
            : previewFailed
              ? "Score effect unavailable — striking still removes this claim from the score."
              : "Computing score effect…"}
        </p>
      )}
      {isStrike && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this claim being struck? (required)"
          rows={2}
          style={{ width: "100%", fontFamily: D.sans, fontSize: 12, color: D.ink, border: `1px solid ${D.hairline}`, borderRadius: 3, padding: "6px 8px", marginBottom: 8, resize: "vertical", background: "#fff" }}
        />
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={confirmDisabled}
          onClick={() => onConfirm(reason.trim())}
          style={{
            fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
            padding: "4px 12px", borderRadius: 3, border: "none",
            background: confirmDisabled ? D.hairline : D.ink, color: confirmDisabled ? D.inkFaint : "#fff",
            cursor: confirmDisabled ? "default" : "pointer",
          }}
        >
          {isStrike ? "Strike claim" : "Minimize claim"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 12px", borderRadius: 3, border: `1px solid ${D.hairline}`, background: "transparent", color: D.inkSoft, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Struck claims never fold away (operator ruling 07-09): rows render line-
// through IN PLACE wherever their delta rows still show. This residual section
// is the post-recompute honest surface — recompute DELETES a struck claim's
// delta rows, so any struck claim with no surviving on-screen row renders here,
// from the claims table, ALWAYS EXPANDED. Never count-only, never collapsed.

function StruckResidualSection({ residual, onRestore, busy }: {
  residual: StruckClaim[];
  onRestore: (claimId: string) => void;
  busy: boolean;
}) {
  if (residual.length === 0) return null;
  return (
    <div style={{ marginTop: 16, borderTop: `1px solid ${D.hairlineFaint}`, paddingTop: 10 }}>
      <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: 0 }}>
        Struck claims ({residual.length})
      </p>
      {residual.map((c) => (
        <div key={c.id} style={{ paddingLeft: 8, borderLeft: `2px solid ${D.hairlineFaint}`, margin: "10px 0" }}>
          <p style={{ fontFamily: D.sans, fontSize: 11.5, margin: 0, lineHeight: 1.5, textDecoration: "line-through", color: D.inkFaint }}
            title={c.struck_reason ?? undefined}>
            {c.statement}
          </p>
          <p style={{ fontFamily: D.mono, fontSize: 9, color: D.inkFaint, margin: "3px 0 0" }}>
            Struck{c.struck_at ? ` ${new Date(c.struck_at).toLocaleDateString()}` : ""}{c.struck_by ? ` by ${c.struck_by}` : ""}
            {c.struck_reason ? ` — “${c.struck_reason}”` : ""}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRestore(c.id)}
            style={{ fontFamily: D.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.08em", padding: "1px 6px", borderRadius: 3, marginTop: 4, border: `1px solid ${D.hairlineFaint}`, background: "transparent", color: D.inkFaint, cursor: busy ? "default" : "pointer" }}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

function ClaimDeltaBlock({ deltas, struckClaims, companyId, onSet, onSetStatus }: {
  deltas: ClaimDeltaRow[];
  struckClaims: StruckClaim[];
  companyId: string;
  onSet: (id: string, v: "acknowledged" | "intentional" | "queued" | "rejected_pairing" | null) => void;
  onSetStatus: SetClaimStatusFn;
}) {
  const [pending, setPending] = useState<PendingStatusAction | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function applyStatus(claimId: string, status: ClaimStatus, reason?: string) {
    setStatusBusy(true);
    setStatusError(null);
    try {
      await onSetStatus(claimId, status, reason);
      setPending(null);
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusBusy(false);
    }
  }

  if (deltas.length === 0 && struckClaims.length === 0) return null;

  // Tombstoned pairings never render as pairs (their claims re-enter the
  // silence rails on the next recompute).
  const pairs = deltas.filter(
    (d) => (d.delta_type === "echoed" || d.delta_type === "divergent") && d.operator_disposition !== "rejected_pairing",
  );
  // Struck rows NEVER fold away (operator ruling): rail rows keep rendering in
  // place, line-through, with reason/who/when + Restore — same as pair members.
  const openQuestions = deltas.filter((d) => d.delta_type === "publicly_silent");
  const undeclared = deltas.filter((d) => d.delta_type === "internally_silent");
  const divergentConfirmed = pairs.filter((d) => d.delta_type === "divergent" && d.pairing_basis === "judge_confirmed");

  const struckById = new Map(struckClaims.map((c) => [c.id, c]));
  const residual = residualStruckClaims(deltas, struckClaims);
  const controlProps = { pending, busy: statusBusy, onRequest: setPending, onRestore: (id: string) => void applyStatus(id, "active") };

  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: D.signal, margin: "0 0 12px" }}>
        Declared vs Observed
      </p>

      {/* Passive divergence banner — prominent, never interrupting. */}
      {divergentConfirmed.length > 0 && (
        <div style={{ border: "1px solid #e8c9a8", background: "#fdf6ee", borderRadius: 4, padding: "10px 12px", margin: "0 0 14px" }}>
          <p style={{ fontFamily: D.sans, fontSize: 12, color: "#8a3b1f", margin: 0, lineHeight: 1.5 }}>
            The public voice diverges from your declared direction in {divergentConfirmed.length === 1 ? "one place" : `${divergentConfirmed.length} places`} — details below. Nothing is chosen yet, so this is a reading, not an alarm.
          </p>
        </div>
      )}

      {/* Judged pairs */}
      {pairs.map((d) => {
        const chip = DELTA_CHIP[d.delta_type];
        return (
          <div key={d.id} style={{ border: `1px solid ${D.hairline}`, borderRadius: 4, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.08em", color: chip.color, background: chip.bg, border: `1px solid ${chip.color}33`, borderRadius: 3, padding: "2px 7px" }}>
                {chip.label}
              </span>
              {d.pairing_basis === "inferred" && (
                <span style={{ fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7a6a2f", background: "#fbf6e3", border: "1px solid #e3d9a8", borderRadius: 3, padding: "2px 7px" }}
                  title="Best-guess pairing — the judge was not confident these are the same subject">
                  Inferred pairing
                </span>
              )}
              {d.declared_claim_provenance === "client_attested" && <AttestedChip date={d.declared_attested_date} />}
            </div>
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.ink, margin: "0 0 4px", lineHeight: 1.5 }}>
              <span style={{ fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase", color: D.inkFaint }}>You declare · </span>
              <span style={statementStatusStyle(d.declared_claim_status)}
                title={d.declared_claim_id ? struckById.get(d.declared_claim_id)?.struck_reason ?? undefined : undefined}>
                {d.declared_statement}
              </span>
              {d.declared_claim_id && (
                <ClaimStatusControls slotId={`${d.id}:declared`} claimId={d.declared_claim_id}
                  statement={d.declared_statement ?? ""} status={d.declared_claim_status} {...controlProps} />
              )}
            </p>
            {d.declared_claim_status === "struck" && d.declared_claim_id && (
              <StruckMetaLine claim={struckById.get(d.declared_claim_id)} />
            )}
            {pending?.slotId === `${d.id}:declared` && (
              <ClaimStatusConfirm pending={pending} companyId={companyId}
                onConfirm={(reason) => void applyStatus(pending.claimId, pending.kind === "strike" ? "struck" : "minimized", reason || undefined)}
                onCancel={() => setPending(null)} />
            )}
            <p style={{ fontFamily: D.sans, fontSize: 12, color: D.ink, margin: "0 0 4px", lineHeight: 1.5 }}>
              <span style={{ fontFamily: D.mono, fontSize: 8.5, textTransform: "uppercase", color: D.inkFaint }}>Public says · </span>
              <span style={statementStatusStyle(d.public_claim_status)}
                title={d.public_claim_id ? struckById.get(d.public_claim_id)?.struck_reason ?? undefined : undefined}>
                {d.public_statement}
              </span>
              {d.public_claim_id && (
                <ClaimStatusControls slotId={`${d.id}:public`} claimId={d.public_claim_id}
                  statement={d.public_statement ?? ""} status={d.public_claim_status} {...controlProps} />
              )}
            </p>
            {d.public_claim_status === "struck" && d.public_claim_id && (
              <StruckMetaLine claim={struckById.get(d.public_claim_id)} />
            )}
            {pending?.slotId === `${d.id}:public` && (
              <ClaimStatusConfirm pending={pending} companyId={companyId}
                onConfirm={(reason) => void applyStatus(pending.claimId, pending.kind === "strike" ? "struck" : "minimized", reason || undefined)}
                onCancel={() => setPending(null)} />
            )}
            {d.judge_reason && (
              <p style={{ fontFamily: D.sans, fontSize: 11, color: D.inkFaint, margin: "4px 0 0", lineHeight: 1.5 }}>
                {d.judge_reason}
              </p>
            )}
            <DeltaDispositionActions row={d} onSet={onSet} />
          </div>
        );
      })}

      {/* Silence rail 1 — OPEN QUESTIONS (absence ≠ contradiction, by law) */}
      {openQuestions.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: "0 0 8px" }}>
            Not yet heard publicly — open questions
          </p>
          {openQuestions.map((d) => (
            <div key={d.id} style={{ paddingLeft: 8, borderLeft: `2px solid ${D.hairlineFaint}`, marginBottom: 8 }}>
              {d.declared_claim_provenance === "client_attested" && (
                <div style={{ marginBottom: 4 }}><AttestedChip date={d.declared_attested_date} /></div>
              )}
              <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkSoft, margin: 0, lineHeight: 1.5 }}>
                <span style={statementStatusStyle(d.declared_claim_status)}
                  title={d.declared_claim_id ? struckById.get(d.declared_claim_id)?.struck_reason ?? undefined : undefined}>
                  {d.declared_statement}
                </span>
                {d.declared_claim_id && (
                  <ClaimStatusControls slotId={`${d.id}:declared`} claimId={d.declared_claim_id}
                    statement={d.declared_statement ?? ""} status={d.declared_claim_status} {...controlProps} />
                )}
              </p>
              {d.declared_claim_status === "struck" && d.declared_claim_id && (
                <StruckMetaLine claim={struckById.get(d.declared_claim_id)} />
              )}
              {pending?.slotId === `${d.id}:declared` && (
                <ClaimStatusConfirm pending={pending} companyId={companyId}
                  onConfirm={(reason) => void applyStatus(pending.claimId, pending.kind === "strike" ? "struck" : "minimized", reason || undefined)}
                  onCancel={() => setPending(null)} />
              )}
              <p style={{ fontFamily: D.sans, fontSize: 10.5, color: D.inkFaint, margin: "2px 0 0" }}>
                The market hasn't heard this yet — an open question, not a conflict.
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Silence rail 2 — the market speaks, nothing declared */}
      {undeclared.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontFamily: D.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: D.inkFaint, margin: "0 0 8px" }}>
            The market says — undeclared
          </p>
          {undeclared.map((d) => (
            <div key={d.id} style={{ paddingLeft: 8, borderLeft: `2px solid ${D.hairlineFaint}`, marginBottom: 8 }}>
              <p style={{ fontFamily: D.sans, fontSize: 11.5, color: D.inkSoft, margin: 0, lineHeight: 1.5 }}>
                <span style={statementStatusStyle(d.public_claim_status)}
                  title={d.public_claim_id ? struckById.get(d.public_claim_id)?.struck_reason ?? undefined : undefined}>
                  {d.public_statement}
                </span>
                {d.public_claim_id && (
                  <ClaimStatusControls slotId={`${d.id}:public`} claimId={d.public_claim_id}
                    statement={d.public_statement ?? ""} status={d.public_claim_status} {...controlProps} />
                )}
              </p>
              {d.public_claim_status === "struck" && d.public_claim_id && (
                <StruckMetaLine claim={struckById.get(d.public_claim_id)} />
              )}
              {pending?.slotId === `${d.id}:public` && (
                <ClaimStatusConfirm pending={pending} companyId={companyId}
                  onConfirm={(reason) => void applyStatus(pending.claimId, pending.kind === "strike" ? "struck" : "minimized", reason || undefined)}
                  onCancel={() => setPending(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {statusError && (
        <p style={{ fontFamily: D.mono, fontSize: 9.5, color: "#8a3b1f", margin: "10px 0 0" }}>
          Could not update claim: {statusError}
        </p>
      )}

      <StruckResidualSection residual={residual}
        onRestore={(id) => void applyStatus(id, "active")} busy={statusBusy} />
    </div>
  );
}

// ─── CH-2b-2: deliberate recompute (plan → packed chunks → finalize) ──────────
//
// The real invocation path for generate-claim-deltas (was harness-only). Every
// click re-plans (server truth): banked verdicts show up as fresh 0 and are
// skipped, so re-click IS resume. Chunk completion is trusted from the HTTP
// response only; the finalize alone may fall back to a row-change poll. All
// client-facing strings below are DRAFTS pending operator signature.

function DeltaRecomputeControl({ companyId }: { companyId: string }) {
  const { running, progress, start } = useClaimDeltaRecompute(companyId);

  const failedChunks = progress?.results.filter((r) => !r.ok).length ?? 0;
  const priorIncomplete = !running && progress?.stage === "done" &&
    (failedChunks > 0 || (progress.finalize !== null && !progress.finalize.ok));
  const buttonLabel = running ? "Recomputing…" : priorIncomplete ? "Resume recompute" : "Recompute deltas";

  const line: React.CSSProperties = { fontFamily: D.mono, fontSize: 9.5, letterSpacing: "0.04em", color: D.inkFaint, margin: "4px 0 0", lineHeight: 1.6 };

  return (
    <div style={{ margin: "0 0 16px" }}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={running}
        style={{
          fontFamily: D.mono, fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase",
          padding: "3px 10px", border: `1px solid ${D.hairline}`, borderRadius: 2,
          background: "transparent", color: running ? D.inkFaint : D.inkSoft,
          cursor: running ? "default" : "pointer",
        }}
      >
        {buttonLabel}
      </button>

      {progress && (
        <div style={{ marginTop: 8 }}>
          {progress.error && (
            <p style={{ ...line, color: "#8a3b1f" }}>Could not recompute: {progress.error}</p>
          )}

          {!progress.error && progress.stage === "plan" && <p style={line}>Sizing the work…</p>}

          {/* NEG-CACHE: frozen rejections the plan skipped — hidden at zero. DRAFT copy, unsigned. */}
          {!progress.error && progress.stage !== "plan" && progress.rejectedTotal > 0 && (
            <p style={line}>{progress.rejectedTotal} previously rejected — skipped.</p>
          )}

          {!progress.error && progress.stage !== "plan" && progress.totalChunks === 0 && (
            <p style={line}>Nothing new to compare — running the wrap-up only.</p>
          )}

          {progress.results.map((r, i) => (
            <p key={i} style={{ ...line, color: r.ok ? D.inkFaint : "#8a3b1f" }}>
              {r.ok
                ? `✓ Batch ${i + 1} — ${r.claims} claim${r.claims === 1 ? "" : "s"}, ${r.fresh} fresh comparison${r.fresh === 1 ? "" : "s"} (${r.seconds}s)`
                : `✗ Batch ${i + 1} — ${r.reason} (verdicts reached so far are kept)`}
            </p>
          ))}

          {!progress.error && progress.stage === "chunks" && progress.currentChunk > progress.results.length && (
            <p style={line}>Comparing batch {progress.currentChunk} of {progress.totalChunks}…</p>
          )}

          {!progress.error && progress.stage === "finalize" && (
            <p style={line}>Wrap-up: settling silences and clearing stale rows…</p>
          )}

          {progress.finalize && (
            <p style={{ ...line, color: progress.finalize.ok ? D.inkFaint : "#8a3b1f" }}>
              {progress.finalize.ok
                ? `✓ Wrap-up complete (${progress.finalize.seconds}s)${progress.finalize.polled ? " — landed after the response was cut" : ""}`
                : `✗ Wrap-up — ${progress.finalize.reason} — click again to re-run it (banked verdicts are kept).`}
            </p>
          )}

          {!progress.error && progress.stage === "done" && (
            <p style={{ ...line, color: D.inkSoft }}>
              {failedChunks === 0 && progress.finalize?.ok
                ? "Recompute complete."
                : `${progress.results.filter((r) => r.ok).length} of ${progress.totalChunks} batches completed — click again to resume (finished verdicts are kept).`}
            </p>
          )}

          {running && (
            <p style={{ ...line, fontSize: 8.5 }}>
              Pair verdicts bank the moment they land; silences settle in the wrap-up.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StrategicDirectionDelta({ companyId }: { companyId: string }) {
  const { data, isLoading, setDisposition, setClaimDeltaDisposition, setClaimStatus } = useStrategicDelta(companyId);

  if (isLoading) {
    return (
      <div style={{ padding: "16px 0", fontFamily: D.mono, fontSize: 9.5,
        textTransform: "uppercase", letterSpacing: "0.12em", color: D.inkFaint }}>
        Loading foundation…
      </div>
    );
  }

  if (!data) return null;

  const { internal, publicThemes, dispositions, currentRunId, alignmentTrend, publicVoiceDelta, claimDeltas, struckClaims } = data;
  const { strategicBet, recommendations, sourceReads } = internal;

  // PVT-1: current snapshot's public-vs-internal alignment (minimal surface; rich
  // run-over-run trend rendering is the #2 step).
  const currentAlignment =
    alignmentTrend.find(p => p.run_id === currentRunId) ??
    (alignmentTrend.length > 0 ? alignmentTrend[alignmentTrend.length - 1] : null);

  // Nothing at all — skip the section entirely
  if (strategicBet.length + recommendations.length + sourceReads.length + publicThemes.length + claimDeltas.length + struckClaims.length === 0) {
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

      {/* CH-2b-2: deliberate chunked recompute — the real generate-claim-deltas path */}
      <DeltaRecomputeControl companyId={companyId} />

      {/* V2-4: the post-findings open-question generator — findings + publicly_silent
          deltas unified into ONE open-question list (generate-open-questions). */}
      <OpenQuestionRecomputeControl companyId={companyId} />

      {/* ── INT-3: Declared vs Observed — the founding signal, first position ── */}
      <ClaimDeltaBlock deltas={claimDeltas} struckClaims={struckClaims} companyId={companyId}
        onSet={setClaimDeltaDisposition} onSetStatus={setClaimStatus} />

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
