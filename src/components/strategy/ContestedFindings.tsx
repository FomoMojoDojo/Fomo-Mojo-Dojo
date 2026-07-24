import { useState } from "react";
import { useClaimContests, type ContestRow, type ContestResolution } from "@/hooks/useClaimContests";
import { KIND_LABEL, RESOLVED_LABEL, resolutionOptionsFor, CONTEST_COPY } from "@/lib/firstRead/contestCopy";

// OC-3 — the operator's "Contested — awaiting your judgment" surface (Extracts only).
// Each open contest is a claim the client pushed back on; the operator resolves it via the
// SOLE sanctioned path (resolve_contest → set_claim_status for strike/set-aside). Controls
// are kind-appropriate and state their consequence BEFORE acting. Resolved contests drop
// into the historical trail. All copy is PENDING OPERATOR SIGNATURE (see contestCopy.ts).

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

const mono: React.CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
};

function KindChip({ kind }: { kind: ContestRow["contest_kind"] }) {
  const disputed = kind === "disputed";
  return (
    <span
      style={{
        ...mono,
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        color: disputed ? "#a4442f" : "#8a6d1c",
        background: disputed ? "rgba(164,68,47,0.08)" : "rgba(138,109,28,0.08)",
        border: `1px solid ${disputed ? "rgba(164,68,47,0.25)" : "rgba(138,109,28,0.25)"}`,
        borderRadius: 2,
        padding: "2px 6px",
        whiteSpace: "nowrap",
      }}
    >
      Contested · {KIND_LABEL[kind]}
    </span>
  );
}

function OpenContestRow({
  c,
  onResolve,
}: {
  c: ContestRow;
  onResolve: (id: string, resolution: ContestResolution, reason: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<ContestResolution | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = resolutionOptionsFor(c.contest_kind);
  const chosen = options.find((o) => o.resolution === pending) ?? null;

  async function confirm() {
    if (!chosen || !reason.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await onResolve(c.id, chosen.resolution, reason.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ paddingLeft: 10, paddingTop: 10, paddingBottom: 10, borderLeft: "2px solid rgba(164,68,47,0.35)", marginBottom: 14 }}>
      <div style={{ marginBottom: 6 }}>
        <KindChip kind={c.contest_kind} />
      </div>
      <p style={{ fontFamily: "Georgia, serif", fontSize: 14, color: "#1e3340", lineHeight: 1.5, margin: 0 }}>
        {c.claim_statement}
      </p>
      <p style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "#9298B5", margin: "5px 0 0" }}>
        {CONTEST_COPY.sessionDatePrefix} · {fmtDate(c.session_date)}
      </p>
      {c.rationale && (
        <p style={{ fontSize: 12.5, color: "#4a5d68", fontStyle: "italic", margin: "6px 0 0" }}>
          {CONTEST_COPY.rationaleLabel}: “{c.rationale}”
        </p>
      )}

      {!pending ? (
        <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
          {options.map((o) => (
            <button
              key={o.resolution}
              type="button"
              onClick={() => { setPending(o.resolution); setReason(""); setErr(null); }}
              style={{ ...mono, fontSize: 10, letterSpacing: "0.05em", color: "#1e3340", background: "none", border: "1px solid rgba(30,51,64,0.25)", borderRadius: 2, padding: "4px 10px", cursor: "pointer" }}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 10, padding: 12, background: "rgba(30,51,64,0.03)", border: "1px solid rgba(30,51,64,0.1)", borderRadius: 3 }}>
          {/* Consequences-before-act: state what WILL happen before the operator confirms. */}
          <p style={{ fontSize: 12.5, color: "#33475a", lineHeight: 1.5, margin: "0 0 9px" }}>
            {chosen?.consequence}
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={CONTEST_COPY.reasonPlaceholder}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12.5, padding: 8, border: "1px solid rgba(30,51,64,0.2)", borderRadius: 2, resize: "vertical" }}
          />
          {err && <p style={{ fontSize: 11.5, color: "#a4442f", margin: "6px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 9, alignItems: "center" }}>
            <button
              type="button"
              onClick={confirm}
              disabled={busy || !reason.trim()}
              style={{ ...mono, fontSize: 10, letterSpacing: "0.05em", color: "#fff", background: busy || !reason.trim() ? "rgba(30,51,64,0.35)" : "#1e3340", border: "none", borderRadius: 2, padding: "5px 12px", cursor: busy || !reason.trim() ? "default" : "pointer" }}
            >
              {busy ? "…" : CONTEST_COPY.confirm}
            </button>
            <button
              type="button"
              onClick={() => { setPending(null); setReason(""); setErr(null); }}
              disabled={busy}
              style={{ ...mono, fontSize: 10, letterSpacing: "0.05em", color: "#6e847f", background: "none", border: "none", cursor: "pointer" }}
            >
              {CONTEST_COPY.cancel}
            </button>
            {!reason.trim() && <span style={{ fontSize: 10.5, color: "#9298B5" }}>{CONTEST_COPY.reasonRequiredHint}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function ContestedFindings({ companyId }: { companyId: string }) {
  const { open, resolved, resolve, isError } = useClaimContests(companyId);

  // OC-3b error honesty: a FAILED query is not "no contests". Render an honest inline
  // error (never silently vanish — the created_at-embed masquerade). Empty (below) is
  // still a null-render.
  if (isError) {
    return (
      <p style={{ ...mono, fontSize: 11, color: "#a4442f", margin: 0 }} role="status">
        {CONTEST_COPY.loadError}
      </p>
    );
  }

  // Quiet when there is nothing contested at all (matches StandingFindings' behavior).
  if (open.length === 0 && resolved.length === 0) return null;

  return (
    <div>
      <p style={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", color: "#9298B5", margin: "0 0 6px" }}>
        {CONTEST_COPY.sectionTitle}{open.length > 0 ? ` (${open.length})` : ""}
      </p>
      <p style={{ fontSize: 12, color: "#6e847f", lineHeight: 1.5, margin: "0 0 16px", maxWidth: 560 }}>
        {CONTEST_COPY.sectionIntro}
      </p>

      {open.map((c) => (
        <OpenContestRow key={c.id} c={c} onResolve={resolve} />
      ))}

      {resolved.length > 0 && (
        <div style={{ marginTop: open.length > 0 ? 20 : 0, paddingTop: 16, borderTop: "1px solid rgba(30,51,64,0.08)" }}>
          <p style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "#b3bacb", margin: "0 0 10px" }}>
            {CONTEST_COPY.resolvedTrailTitle}
          </p>
          {resolved.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 12.5, color: "#4a5d68", lineHeight: 1.45, margin: 0 }}>
                <span style={{ ...mono, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", color: c.resolution === "strike_resolved" ? "#a4442f" : c.resolution === "set_aside" ? "#8a6d1c" : "#6e847f", marginRight: 6 }}>
                  {c.resolution ? RESOLVED_LABEL[c.resolution] : ""}
                </span>
                {c.claim_statement}
              </p>
              {c.resolution_reason && (
                <p style={{ fontSize: 11.5, color: "#8a9a95", fontStyle: "italic", margin: "2px 0 0" }}>
                  {c.resolution_reason} · {fmtDate(c.resolved_at)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
