// FR-REOPEN-3 — the operator Reopen control on the workshop Inputs tab, beside
// "Open First Read →" (R6). Renders ONLY when the current session is proposal_issued.
// While unresolved contests exist it renders DISABLED with the reason visible (R8 +
// the standing "blocked shows the reason, never hidden" rule). Consequences-before-act:
// the confirmation states what changes before the operator commits (same shape as
// contest resolution). Reason is required — submit stays disabled until it is non-empty,
// and the RPC refuses an empty reason regardless. The UI never re-implements the RPC's
// guards; a refusal is surfaced VERBATIM, never swallowed to a generic error.

import { useState } from "react";
import { useReopenFirstRead } from "@/hooks/useReopenFirstRead";
import { useClaimContests } from "@/hooks/useClaimContests";

// ── Operator-signed copy — OPERATOR-SIGNED 2026-08-03 (FR-REOPEN-3) ───────────
export const REOPEN_LABEL = "Reopen First Read →";
export const REOPEN_TITLE = "Reopen this First Read?";
export const REOPEN_BODY =
  "The client's verdicts become editable again, and the meeting counts reset. The proposal you issued stays on the record until you issue a new one. Nothing you've already judged is changed.";
export const REOPEN_REASON_LABEL = "Why are you reopening?";
export const reopenBlockedReason = (n: number): string =>
  n === 1
    ? "1 contested finding is still awaiting your judgment."
    : `${n} contested findings are still awaiting your judgment.`;
// ──────────────────────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "monospace", letterSpacing: "0.06em" };

export default function ReopenFirstReadControl({
  companyId,
  dark,
}: {
  companyId: string | null;
  dark?: boolean;
}) {
  const { session, reopen } = useReopenFirstRead(companyId);
  const { open } = useClaimContests(companyId ?? undefined);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // R6 / state law: the control exists ONLY for an issued session.
  if (!session || session.status !== "proposal_issued") return null;

  const unresolved = open.filter((c) => c.session_id === session.id).length;
  const blocked = unresolved > 0;
  const fs = dark ? 9 : 10;

  async function submit() {
    if (!reason.trim() || !session) return;
    setBusy(true);
    setErr(null);
    try {
      await reopen(session.id, reason.trim());
      // Success: the ["fr-reopen-session"] refetch flips status → open and this control
      // unmounts. Nothing else to reset here.
    } catch (e) {
      // Reflect the RPC's refusal verbatim — never a generic message.
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: dark ? 14 : 10 }}>
      {!confirming ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={blocked}
            aria-disabled={blocked}
            onClick={() => { if (!blocked) { setConfirming(true); setReason(""); setErr(null); } }}
            style={{
              ...mono, fontSize: fs,
              color: blocked ? (dark ? "rgba(246,246,244,0.25)" : "#bbb") : (dark ? "#c98b6e" : "#a4442f"),
              background: "none", padding: 0, border: "none",
              textDecoration: "underline", textDecorationStyle: "dashed", textUnderlineOffset: 3,
              cursor: blocked ? "default" : "pointer",
            }}
          >
            {REOPEN_LABEL}
          </button>
          {/* Blocked shows the reason, never hidden (R8). */}
          {blocked && (
            <span role="status" style={{ ...mono, fontSize: fs, letterSpacing: "0.04em", color: dark ? "rgba(246,246,244,0.5)" : "#8a6d1c" }}>
              {reopenBlockedReason(unresolved)}
            </span>
          )}
        </div>
      ) : (
        <div style={{ padding: 12, maxWidth: 520, background: dark ? "rgba(246,246,244,0.04)" : "rgba(30,51,64,0.03)", border: `1px solid ${dark ? "rgba(246,246,244,0.12)" : "rgba(30,51,64,0.1)"}`, borderRadius: 3 }}>
          <p style={{ ...mono, fontSize: fs, textTransform: "uppercase", letterSpacing: "0.09em", color: dark ? "rgba(246,246,244,0.7)" : "#33475a", margin: "0 0 8px" }}>
            {REOPEN_TITLE}
          </p>
          {/* Consequences-before-act. */}
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: dark ? "rgba(246,246,244,0.6)" : "#33475a", margin: "0 0 10px" }}>
            {REOPEN_BODY}
          </p>
          <label style={{ ...mono, fontSize: fs, color: dark ? "rgba(246,246,244,0.5)" : "#6e847f", display: "block", marginBottom: 5 }}>
            {REOPEN_REASON_LABEL}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            aria-label={REOPEN_REASON_LABEL}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 12.5, padding: 8, border: "1px solid rgba(30,51,64,0.2)", borderRadius: 2, resize: "vertical" }}
          />
          {err && <p role="alert" style={{ fontSize: 11.5, color: "#a4442f", margin: "6px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", gap: 12, marginTop: 9, alignItems: "center" }}>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !reason.trim()}
              style={{ ...mono, fontSize: fs, color: "#fff", background: busy || !reason.trim() ? "rgba(164,68,47,0.35)" : "#a4442f", border: "none", borderRadius: 2, padding: "5px 12px", cursor: busy || !reason.trim() ? "default" : "pointer" }}
            >
              {busy ? "…" : "Reopen"}
            </button>
            <button
              type="button"
              onClick={() => { setConfirming(false); setReason(""); setErr(null); }}
              disabled={busy}
              style={{ ...mono, fontSize: fs, color: dark ? "rgba(246,246,244,0.45)" : "#6e847f", background: "none", border: "none", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
