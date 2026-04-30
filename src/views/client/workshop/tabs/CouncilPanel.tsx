import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "../primitives";

type CouncilKey = "strategy_council" | "mojo_council";
type CouncilRecStatus = "pending" | "accepted" | "ignored";

interface CouncilRec {
  id: string;
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  status: CouncilRecStatus;
  source_context_json: Record<string, unknown> | null;
  decided_at: string | null;
  created_at: string;
}

interface CouncilRun {
  id: string;
  status: "running" | "completed" | "failed";
  summary: string;
  recommendation_count: number;
  source_snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

const COUNCIL_OPTIONS: Array<{ key: CouncilKey; label: string; desc: string }> = [
  { key: "mojo_council",     label: "Mojo Council",     desc: "Heath, Dunford, Roger Martin, Berger, Torres, Miller, Ulwick" },
  { key: "strategy_council", label: "Strategy Council", desc: "Jobs, Bartlett, Hormozi, Robbins, Priestley" },
];

function councilKeyFromRun(run: CouncilRun): CouncilKey {
  const snap = (run.source_snapshot_json ?? {}) as Record<string, unknown>;
  return String(snap.council_key || "").trim().toLowerCase() === "mojo_council"
    ? "mojo_council" : "strategy_council";
}

function councilKeyFromRec(rec: CouncilRec): CouncilKey {
  const ctx = (rec.source_context_json ?? {}) as Record<string, unknown>;
  const direct = String(ctx.council_key || "").trim().toLowerCase();
  if (direct === "mojo_council") return "mojo_council";
  const snap = (ctx.source_snapshot ?? {}) as Record<string, unknown>;
  return String(snap.council_key || "").trim().toLowerCase() === "mojo_council"
    ? "mojo_council" : "strategy_council";
}

function panelDiscussion(run: CouncilRun | null): string {
  if (!run) return "";
  const snap = (run.source_snapshot_json ?? {}) as Record<string, unknown>;
  const raw = snap.panel_discussion;
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw.map((e) => String(e || "").trim()).filter(Boolean).join("\n\n");
  return "";
}

function councilFmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

async function extractCouncilError(error: unknown, fallback: string): Promise<string> {
  const err = error as { message?: string; context?: { text?: () => Promise<string> } } | null;
  const base = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : fallback;
  try {
    const raw = (await err?.context?.text?.())?.trim();
    if (!raw) return base;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      if (parsed?.error) return parsed.error;
      if (parsed?.message) return parsed.message;
    } catch { /* ignore */ }
    return `${base}: ${raw}`;
  } catch {
    return base;
  }
}

export default function WorkshopCouncilTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [councilKey, setCouncilKey]       = useState<CouncilKey>("mojo_council");
  const [runs, setRuns]                   = useState<CouncilRun[]>([]);
  const [recs, setRecs]                   = useState<CouncilRec[]>([]);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [decisionId, setDecisionId]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter]   = useState<CouncilRecStatus | "all">("pending");
  const [error, setError]                 = useState<string | null>(null);

  const scopedRuns = useMemo(() => runs.filter((r) => councilKeyFromRun(r) === councilKey), [runs, councilKey]);
  const scopedRecs = useMemo(() => recs.filter((r) => councilKeyFromRec(r) === councilKey), [recs, councilKey]);
  const latestRun  = scopedRuns[0] ?? null;
  const discussion = useMemo(() => panelDiscussion(latestRun), [latestRun]);
  const filtered   = useMemo(() =>
    statusFilter === "all" ? scopedRecs : scopedRecs.filter((r) => r.status === statusFilter),
    [scopedRecs, statusFilter]);

  const counts = useMemo(() => ({
    pending:  scopedRecs.filter((r) => r.status === "pending").length,
    accepted: scopedRecs.filter((r) => r.status === "accepted").length,
    ignored:  scopedRecs.filter((r) => r.status === "ignored").length,
  }), [scopedRecs]);

  const meta = COUNCIL_OPTIONS.find((o) => o.key === councilKey)!;
  const sb = supabase as any;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [recRes, runRes] = await Promise.all([
        sb.from("council_recommendations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(250),
        sb.from("council_review_runs").select("id, status, summary, recommendation_count, source_snapshot_json, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(40),
      ]);
      if (recRes.error) throw recRes.error;
      if (runRes.error) throw runRes.error;
      setRecs((recRes.data ?? []) as CouncilRec[]);
      setRuns((runRes.data ?? []) as CouncilRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load council data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [companyId]);

  async function runCouncil() {
    setRunning(true);
    setError(null);
    const beforeId = scopedRuns[0]?.id ?? null;
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("council-review", {
        body: { company_id: companyId, council_key: councilKey },
      });
      if (invokeError) {
        const msg = await extractCouncilError(invokeError, "Council review failed");
        const mayTimeout = ["upstream", "timing out", "timed out", "timeout"].some((s) => msg.toLowerCase().includes(s));
        if (!mayTimeout) throw new Error(msg);
        // Poll for completion after timeout
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const { data: polled } = await sb.from("council_review_runs")
            .select("id, source_snapshot_json").eq("company_id", companyId).order("created_at", { ascending: false }).limit(20);
          const newest = (Array.isArray(polled) ? polled : [])
            .find((r: any) => String((r?.source_snapshot_json ?? {}).council_key || "") === councilKey && r.id !== beforeId);
          if (newest) { await load(); return; }
        }
        throw new Error(`${msg}. The run may still be processing — refresh in a few seconds.`);
      }
      if (data?.error) throw new Error(String(data.error));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Council review failed");
    } finally {
      setRunning(false);
    }
  }

  async function decide(id: string, status: CouncilRecStatus) {
    setDecisionId(`${id}:${status}`);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await sb.from("council_recommendations").update({
        status, decided_at: new Date().toISOString(), decided_by: user?.id ?? null,
      }).eq("id", id).eq("company_id", companyId);
      setRecs((prev) => prev.map((r) => r.id === id ? { ...r, status, decided_at: new Date().toISOString() } : r));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setDecisionId(null);
    }
  }

  const STATUS_FILTERS: Array<{ key: CouncilRecStatus | "all"; label: string; count?: number }> = [
    { key: "all",      label: "All",      count: scopedRecs.length },
    { key: "pending",  label: "Pending",  count: counts.pending },
    { key: "accepted", label: "Accepted", count: counts.accepted },
    { key: "ignored",  label: "Ignored",  count: counts.ignored },
  ];

  return (
    <div className="crpv-ws-section crpv-ws-section-wide">
      <SectionHeader title="Council" desc="Run an outside-in advisory session based on what the research and org signals have found so far." />

      {/* Council selector */}
      <div className="crpv-ws-field">
        <label className="crpv-ws-label">Select council</label>
        <div className="crpv-council-selector">
          {COUNCIL_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`crpv-council-selector-btn${councilKey === opt.key ? " active" : ""}`}
              onClick={() => setCouncilKey(opt.key)}
            >
              <span className="crpv-council-selector-name">{opt.label}</span>
              <span className="crpv-council-selector-desc cap">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Run button */}
      <div className="crpv-council-run-row">
        <button
          type="button"
          className="crpv-council-run-btn"
          onClick={runCouncil}
          disabled={running}
        >
          {running ? `Running ${meta.label}…` : `Run ${meta.label}`}
        </button>
        {latestRun && (
          <span className="crpv-council-run-meta cap">
            Last run {councilFmtDate(latestRun.created_at)} · {latestRun.recommendation_count} recommendations
          </span>
        )}
        <button type="button" className="btn ghost" onClick={load} disabled={loading || running}>
          Refresh
        </button>
      </div>

      {error && <p className="crpv-ws-hint" style={{ color: "var(--crpv-hot)" }}>{error}</p>}

      {/* Latest run summary */}
      {latestRun?.summary && (
        <div className="crpv-ws-field">
          <label className="crpv-ws-label">Summary</label>
          <div className="crpv-ws-readonly crpv-council-summary">{latestRun.summary}</div>
        </div>
      )}

      {/* Panel discussion (collapsible) */}
      {discussion && (
        <div className="crpv-ws-field">
          <details className="crpv-council-discussion">
            <summary className="crpv-ws-label" style={{ cursor: "pointer", listStyle: "none" }}>
              Panel Discussion ▸
            </summary>
            <div className="crpv-ws-readonly crpv-council-discussion-body">{discussion}</div>
          </details>
        </div>
      )}

      {/* Status filter + recommendations */}
      <div className="crpv-ws-field">
        <div className="crpv-council-filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`crpv-council-filter${statusFilter === f.key ? " active" : ""}`}
              onClick={() => setStatusFilter(f.key)}
            >
              <span className="cap">{f.label}</span>
              {f.count !== undefined && <span className="crpv-council-filter-count">{f.count}</span>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="crpv-ws-placeholder cap">Loading council recommendations…</div>
        ) : filtered.length === 0 ? (
          <div className="crpv-ws-placeholder">
            {scopedRecs.length === 0
              ? `No recommendations yet. Run ${meta.label} to get started.`
              : "No recommendations in this filter."}
          </div>
        ) : (
          <div className="crpv-council-recs">
            {filtered.map((rec) => (
              <article key={rec.id} className={`crpv-council-rec crpv-council-rec-${rec.status}`}>
                <div className="crpv-council-rec-hd">
                  <span className="crpv-council-rec-title">{rec.title}</span>
                  <div className="crpv-council-rec-badges">
                    <span className={`crpv-council-badge crpv-council-priority-${rec.priority} cap`}>{rec.priority}</span>
                    <span className={`crpv-council-badge crpv-council-status-${rec.status} cap`}>{rec.status}</span>
                  </div>
                </div>
                <p className="crpv-council-rec-meta cap">{rec.category} · {rec.confidence}% confidence</p>
                <p className="crpv-council-rec-body">{rec.recommendation}</p>
                {rec.rationale && (
                  <div className="crpv-council-rationale">
                    <p className="crpv-ws-label">Why this matters</p>
                    <p className="crpv-council-rationale-body">{rec.rationale}</p>
                  </div>
                )}
                <div className="crpv-council-rec-footer">
                  <span className="crpv-council-rec-date cap">{councilFmtDate(rec.created_at)}</span>
                  <div className="crpv-council-rec-actions">
                    <button
                      type="button"
                      className={`crpv-council-action-accept${rec.status === "accepted" ? " active" : ""}`}
                      onClick={() => decide(rec.id, "accepted")}
                      disabled={!!decisionId || rec.status === "accepted"}
                    >
                      {decisionId === `${rec.id}:accepted` ? "Saving…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      className={`crpv-council-action-ignore${rec.status === "ignored" ? " active" : ""}`}
                      onClick={() => decide(rec.id, "ignored")}
                      disabled={!!decisionId || rec.status === "ignored"}
                    >
                      {decisionId === `${rec.id}:ignored` ? "Saving…" : "Ignore"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
