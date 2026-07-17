import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldAlert, HelpCircle, RefreshCw, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// VOICE-GATE-5 — the operator surface for per-document voice classification.
// Shows each contributing upload's verdict + verbatim basis, flags the docs that
// block a declared run, and lets the operator classify (model) or override
// (client_voice / external) — one immutable doc_voice_verdicts row per doc, BESIDE
// the model verdict, attributed. A whole-corpus attest writes one override row per
// doc, each stamped basis="corpus attestation".

type Verdict = "client_voice" | "external" | "uncertain";
type Override = "client_voice" | "external";

type DocStatus = {
  input_file_id: string;
  file_name: string;
  content_sha: string;
  verdict: Verdict | null;
  basis: string | null;
  operator_override: Override | null;
  status: "classified" | "unclassified";
};

const c = {
  line: "#DDE6D1",
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  cleared: "#2F7A4F",
  clearedBg: "#EAF4EC",
  blocked: "#B0472F",
  blockedBg: "#F7ECE8",
  warn: "#B67A45",
  warnBg: "#F6EFE6",
};

// Mirror of the gate's per-doc decision, purely for display.
function docDecision(d: DocStatus): "cleared" | "excluded" | "blocked" {
  if (d.operator_override === "client_voice") return "cleared";
  if (d.operator_override === "external") return "excluded";
  if (d.verdict === "client_voice") return "cleared";
  return "blocked"; // external / uncertain / unclassified
}

export default function VoiceGatePanel({ companyId }: { companyId: string }) {
  const [docs, setDocs] = useState<DocStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("classify-upload-voice", {
        body: { company_id: companyId, plan: true },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; error?: string; docs?: DocStatus[] };
      if (payload.error) throw new Error(payload.error);
      setDocs(Array.isArray(payload.docs) ? payload.docs : []);
    } catch (err) {
      toast.error(`Could not load voice-gate status: ${err instanceof Error ? err.message : String(err)}`);
      setDocs(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const summary = useMemo(() => {
    const list = docs ?? [];
    const blocked = list.filter((d) => docDecision(d) === "blocked");
    const cleared = list.filter((d) => docDecision(d) === "cleared");
    const excluded = list.filter((d) => docDecision(d) === "excluded");
    return { total: list.length, blocked, cleared, excluded, runnable: blocked.length === 0 };
  }, [docs]);

  const classifyAll = useCallback(async () => {
    setBusy("classify");
    try {
      const { data, error } = await supabase.functions.invoke("classify-upload-voice", {
        body: { company_id: companyId },
      });
      if (error) throw error;
      const payload = (data ?? {}) as { ok?: boolean; error?: string; totals?: { classified_now?: number; skipped_existing?: number } };
      if (payload.error) throw new Error(payload.error);
      toast.success(`Classified ${payload.totals?.classified_now ?? 0} document(s) (${payload.totals?.skipped_existing ?? 0} already classified).`);
      await loadPlan();
    } catch (err) {
      toast.error(`Classification failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  }, [companyId, loadPlan]);

  // Immutable override row written BESIDE the model verdict, attributed.
  const writeOverride = useCallback(
    async (rows: Array<{ input_file_id: string; content_sha: string }>, value: Override, basis: string, reason: string) => {
      const { data: authRes } = await supabase.auth.getUser();
      const overrideBy = authRes?.user?.id ?? null;
      const payload = rows.map((r) => ({
        input_file_id: r.input_file_id,
        company_id: companyId,
        content_sha: r.content_sha,
        verdict: value, // mirror the override on the row
        operator_override: value,
        basis,
        override_by: overrideBy,
        override_reason: reason,
      }));
      const { error } = await supabase.from("doc_voice_verdicts").insert(payload);
      if (error) {
        if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
          throw new Error("An override already exists for this exact document content (overrides are immutable per content — re-upload to reset).");
        }
        throw error;
      }
    },
    [companyId],
  );

  const overrideOne = useCallback(
    async (d: DocStatus, value: Override) => {
      setBusy(d.input_file_id);
      try {
        await writeOverride([{ input_file_id: d.input_file_id, content_sha: d.content_sha }], value, "operator override", `operator marked as ${value} via files panel`);
        toast.success(`Marked “${d.file_name}” as ${value.replace("_", " ")}.`);
        await loadPlan();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [writeOverride, loadPlan],
  );

  const attestAll = useCallback(async () => {
    const targets = (docs ?? []).filter((d) => !d.operator_override);
    if (targets.length === 0) {
      toast.message("Every document already carries an operator override.");
      return;
    }
    if (!window.confirm(`Attest all ${targets.length} document(s) as the client's voice? This writes one immutable override row per document (basis: "corpus attestation").`)) return;
    setBusy("attest");
    try {
      await writeOverride(
        targets.map((d) => ({ input_file_id: d.input_file_id, content_sha: d.content_sha })),
        "client_voice",
        "corpus attestation",
        "whole-corpus attestation via files panel",
      );
      toast.success(`Attested ${targets.length} document(s) as client voice.`);
      await loadPlan();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [docs, writeOverride, loadPlan]);

  if (docs !== null && docs.length === 0) {
    return (
      <div style={{ border: `1px solid ${c.line}`, borderRadius: 10, padding: 16, fontSize: 13, color: c.muted }}>
        <strong style={{ color: c.charcoal }}>Voice gate</strong> — no uploaded documents contribute to a declared run for this company. Nothing to classify.
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 10, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: c.charcoal }}>Voice gate — is this the client's voice?</div>
          <div style={{ fontSize: 12.5, color: c.muted, marginTop: 2 }}>
            An upload is a channel, not proof the words are the client's. A declared run is blocked until every contributing document is cleared as client voice.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => void loadPlan()} disabled={loading || busy !== null}
            style={btn(c.secondary, false)} title="Refresh status">
            <RefreshCw size={14} /> Refresh
          </button>
          <button onClick={() => void classifyAll()} disabled={loading || busy !== null}
            style={btn(c.charcoal, true)} title="Run the local classifier on unclassified docs">
            <Play size={14} /> {busy === "classify" ? "Classifying…" : "Classify uploads"}
          </button>
        </div>
      </div>

      {docs === null ? (
        <div style={{ fontSize: 13, color: c.muted }}>{loading ? "Loading…" : "Status unavailable."}</div>
      ) : (
        <>
          <div style={{
            fontSize: 13, fontWeight: 600, marginBottom: 10, padding: "8px 12px", borderRadius: 8,
            background: summary.runnable ? c.clearedBg : c.blockedBg,
            color: summary.runnable ? c.cleared : c.blocked,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            {summary.runnable ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
            {summary.runnable
              ? `Cleared — ${summary.cleared.length} client-voice, ${summary.excluded.length} excluded. A declared run is allowed.`
              : `Blocked — ${summary.blocked.length} of ${summary.total} document(s) are not cleared as the client's voice.`}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map((d) => {
              const decision = docDecision(d);
              return (
                <div key={d.input_file_id} style={{ border: `1px solid ${c.line}`, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: c.charcoal, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file_name}</div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>{verdictChip(d)}</div>
                    </div>
                    {!d.operator_override && (
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => void overrideOne(d, "client_voice")} disabled={busy !== null}
                          style={btn(c.cleared, false)} title="Override: this IS the client's voice">Client voice</button>
                        <button onClick={() => void overrideOne(d, "external")} disabled={busy !== null}
                          style={btn(c.muted, false)} title="Override: exclude — not the client's voice">External</button>
                      </div>
                    )}
                  </div>
                  {d.basis && (
                    <div style={{ fontSize: 12, color: c.secondary, marginTop: 6, fontStyle: "italic" }}>“{d.basis}”</div>
                  )}
                  {decision === "blocked" && d.status === "unclassified" && (
                    <div style={{ fontSize: 11.5, color: c.warn, marginTop: 4 }}>Not classified for the current content — run Classify uploads, or override.</div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => void attestAll()} disabled={busy !== null || summary.total === 0}
              style={btn(c.charcoal, true)} title="Write one client-voice override per un-overridden document">
              {busy === "attest" ? "Attesting…" : "Attest all as client voice"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function verdictChip(d: DocStatus) {
  if (d.operator_override) {
    const label = d.operator_override === "client_voice" ? "override: client voice" : "override: external (excluded)";
    const color = d.operator_override === "client_voice" ? c.cleared : c.muted;
    return <span style={{ color, fontWeight: 600 }}><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> {label}</span>;
  }
  if (d.verdict === "client_voice") return <span style={{ color: c.cleared, fontWeight: 600 }}>client voice</span>;
  if (d.verdict === "external") return <span style={{ color: c.blocked, fontWeight: 600 }}><ShieldAlert size={12} style={{ verticalAlign: -2 }} /> external — blocks declared run</span>;
  if (d.verdict === "uncertain") return <span style={{ color: c.warn, fontWeight: 600 }}><HelpCircle size={12} style={{ verticalAlign: -2 }} /> uncertain — needs a decision</span>;
  return <span style={{ color: c.warn, fontWeight: 600 }}>unclassified</span>;
}

function btn(color: string, filled: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 7, cursor: "pointer",
    border: `1px solid ${color}`,
    background: filled ? color : "transparent",
    color: filled ? "#fff" : color,
  };
}
