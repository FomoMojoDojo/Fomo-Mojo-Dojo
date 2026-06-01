import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SectionHeader } from "../primitives";
import TensionBlock from "@/components/tensions/TensionBlock";
import type { StrategicTension } from "@/lib/tensionTypes";
import { decisionStateColor, decisionStateBorderColor } from "@/lib/decisionPostureNarrative";
import { DECISION_STATE_LABELS } from "@/lib/strategicDecisionDomain";
import { HierarchyPageShell } from "@/components/design-system/HierarchyPageShell";
import { HierarchySectionHeader } from "@/components/design-system/HierarchySectionHeader";
import { D } from "@/components/design-system/tokens";
import type { SignalBasis } from "@/components/design-system/SignalBasisChip";

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
  decision_id?: string | null;
  decision_note?: string | null;
}

interface DecisionSummary {
  id: string;
  title: string;
  decision_question: string | null;
  decision_state: string;
}

interface CouncilRun {
  id: string;
  status: "running" | "completed" | "failed";
  summary: string;
  recommendation_count: number;
  source_snapshot_json: Record<string, unknown> | null;
  created_at: string;
}

const COUNCIL_OPTIONS: Array<{ key: CouncilKey; label: string; desc: string; role: string }> = [
  { key: "mojo_council",     label: "Mojo Council",     desc: "Heath, Dunford, Roger Martin, Berger, Torres, Miller, Ulwick", role: "Frameworks for diagnosis and decision" },
  { key: "strategy_council", label: "Strategy Council", desc: "Jobs, Bartlett, Hormozi, Robbins, Priestley",                  role: "Founder and operator perspective" },
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

const EXECUTION_CATEGORIES = new Set(["execution", "execution focus", "routes"]);
function isExecutionCategory(category: string): boolean {
  return EXECUTION_CATEGORIES.has(category.trim().toLowerCase());
}
function parseLegId(decisionNote: string | null | undefined): string | null {
  if (!decisionNote) return null;
  try { const p = JSON.parse(decisionNote) as Record<string, unknown>; return typeof p.leg_id === "string" ? p.leg_id : null; } catch { return null; }
}
function recBadgeLabel(rec: CouncilRec): string {
  if (rec.status === "pending") return "Unresolved";
  if (rec.status === "ignored") return "Set aside";
  if (isExecutionCategory(rec.category) && parseLegId(rec.decision_note) !== null) return "Integrated";
  return "Accepted";
}

// Suggestion→route fit: text-overlap only (same tokenizer as routeOpportunityFitScore in
// research-company, category bonus omitted — suggestion.category is "execution"/"routes",
// not an opportunity priority_tier, so the route-category mapping doesn't apply).
const ROUTE_FIT_STOP_WORDS = new Set([
  "the", "and", "for", "with", "into", "from", "that", "this", "your", "their", "while", "through", "across",
  "customer", "customers", "partner", "partners", "team", "teams", "step", "journey",
  "increase", "reduce", "improve", "maximize", "minimize", "avoid",
]);
function routeFitTokens(text: string): Set<string> {
  const tokens = String(text || "").toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? [];
  return new Set(tokens.filter((t) => !ROUTE_FIT_STOP_WORDS.has(t)));
}
function suggestionRouteFitScore(
  suggestion: { title: string; recommendation: string },
  route: { title: string; short_description: string | null },
): number {
  const suggTokens = routeFitTokens(`${suggestion.title} ${suggestion.recommendation}`);
  const routeTokens = routeFitTokens(`${route.title} ${route.short_description ?? ""}`);
  if (suggTokens.size === 0 || routeTokens.size === 0) return 0;
  let overlap = 0;
  for (const token of suggTokens) { if (routeTokens.has(token)) overlap++; }
  return overlap * 1.1;
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


export default function WorkshopCouncilTab({ companyId, companyName, tensions = [], hasHierarchy, signalBasis }: { companyId: string; companyName: string; tensions?: StrategicTension[]; hasHierarchy?: boolean; signalBasis?: SignalBasis }) {
  const [councilKey, setCouncilKey]       = useState<CouncilKey>("mojo_council");
  const [runs, setRuns]                   = useState<CouncilRun[]>([]);
  const [recs, setRecs]                   = useState<CouncilRec[]>([]);
  const [decisions, setDecisions]         = useState<DecisionSummary[]>([]);
  const [loading, setLoading]             = useState(true);
  const [running, setRunning]             = useState(false);
  const [decisionId, setDecisionId]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter]   = useState<CouncilRecStatus | "all">("pending");
  const [error, setError]                 = useState<string | null>(null);
  const [showIgnored, setShowIgnored]     = useState(false);
  const [draftRecId, setDraftRecId]             = useState<string | null>(null);
  const [draftTitle, setDraftTitle]             = useState("");
  const [draftParentRouteId, setDraftParentRouteId] = useState<string | null>(null);
  const [topLevelRoutes, setTopLevelRoutes]     = useState<Array<{ id: string; title: string; short_description: string | null; fitScore: number }>>([]);
  const [routesLoading, setRoutesLoading]       = useState(false);
  const [confirmingLeg, setConfirmingLeg]       = useState(false);


  const scopedRuns = useMemo(() => runs.filter((r) => councilKeyFromRun(r) === councilKey), [runs, councilKey]);
  const scopedRecs = useMemo(() => recs.filter((r) => councilKeyFromRec(r) === councilKey), [recs, councilKey]);
  const latestRun  = scopedRuns[0] ?? null;
  const discussion = useMemo(() => panelDiscussion(latestRun), [latestRun]);
  const filtered   = useMemo(() =>
    statusFilter === "all" ? scopedRecs : scopedRecs.filter((r) => r.status === statusFilter),
    [scopedRecs, statusFilter]);

  const counts = useMemo(() => ({
    pending:   scopedRecs.filter((r) => r.status === "pending").length,
    accepted:  scopedRecs.filter((r) => r.status === "accepted").length,
    confirmed: scopedRecs.filter((r) => r.status === "accepted" && isExecutionCategory(r.category) && parseLegId(r.decision_note) !== null).length,
    ignored:   scopedRecs.filter((r) => r.status === "ignored").length,
  }), [scopedRecs]);

  const meta = COUNCIL_OPTIONS.find((o) => o.key === councilKey)!;
  const sb = supabase as any;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [recRes, runRes, decRes] = await Promise.all([
        sb.from("council_recommendations").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(250),
        sb.from("council_review_runs").select("id, status, summary, recommendation_count, source_snapshot_json, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(40),
        sb.from("strategic_decisions").select("id, title, decision_question, decision_state").eq("company_id", companyId).neq("decision_state", "retired").limit(50),
      ]);
      if (recRes.error) throw recRes.error;
      if (runRes.error) throw runRes.error;
      setRecs((recRes.data ?? []) as CouncilRec[]);
      setRuns((runRes.data ?? []) as CouncilRun[]);
      setDecisions((decRes.data ?? []) as DecisionSummary[]);
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
      if (status === "accepted") {
        const rec = recs.find((r) => r.id === id);
        if (rec && isExecutionCategory(rec.category) && parseLegId(rec.decision_note) === null) {
          setDraftRecId(id);
          setDraftTitle(rec.title);
          setDraftParentRouteId(null);
          void loadTopLevelRoutes(rec);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setDecisionId(null);
    }
  }

  async function loadTopLevelRoutes(rec?: CouncilRec) {
    setRoutesLoading(true);
    try {
      const { data, error } = await sb.from("routes")
        .select("id, title, short_description")
        .eq("company_id", companyId)
        .eq("level", "route")
        .limit(100);
      if (error) throw error;
      const raw = (data ?? []) as Array<{ id: string; title: string; short_description: string | null }>;
      const scored = raw.map((r) => ({
        ...r,
        fitScore: rec ? suggestionRouteFitScore(rec, r) : 0,
      }));
      // Sort best match first; ties keep DB order
      scored.sort((a, b) => b.fitScore - a.fitScore);
      setTopLevelRoutes(scored);
      if (rec) {
        const best = scored[0];
        if (best && best.fitScore >= 1.2) setDraftParentRouteId(best.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load routes");
    } finally {
      setRoutesLoading(false);
    }
  }

  async function confirmLeg() {
    if (!draftRecId || !draftParentRouteId || !draftTitle.trim()) return;
    setConfirmingLeg(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rec = recs.find((r) => r.id === draftRecId);
      const { data: inserted, error: insertErr } = await sb.from("routes").insert({
        company_id: companyId,
        user_id: user?.id ?? null,
        level: "leg",
        parent_id: draftParentRouteId,
        title: draftTitle.trim(),
        short_description: rec?.recommendation ?? null,
        category: "improve",
      }).select("id").single();
      if (insertErr) throw insertErr;
      const legId = (inserted as { id: string }).id;
      const decisionNote = JSON.stringify({ leg_id: legId });
      await sb.from("council_recommendations")
        .update({ decision_note: decisionNote })
        .eq("id", draftRecId)
        .eq("company_id", companyId);
      setRecs((prev) => prev.map((r) => r.id === draftRecId ? { ...r, decision_note: decisionNote } : r));
      setDraftRecId(null);
      setDraftTitle("");
      setDraftParentRouteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create leg");
    } finally {
      setConfirmingLeg(false);
    }
  }

  const STATUS_FILTERS: Array<{ key: CouncilRecStatus | "all"; label: string; count?: number }> = [
    { key: "all",      label: "All",        count: scopedRecs.length },
    { key: "pending",  label: "Unresolved", count: counts.pending },
    { key: "accepted", label: "Accepted",   count: counts.accepted },
    { key: "ignored",  label: "Set aside",  count: counts.ignored },
  ];

  const topPendingHighPriority = useMemo(
    () => scopedRecs.find((r) => r.status === "pending" && r.priority === "high") ?? scopedRecs.find((r) => r.status === "pending") ?? null,
    [scopedRecs],
  );

  const decisionMap = useMemo(
    () => new Map(decisions.map((d) => [d.id, d])),
    [decisions],
  );

  // Group filtered recs by decision_id: [{decision: DecisionSummary | null, recs: CouncilRec[]}]
  const groupedRecs = useMemo(() => {
    const linked: Map<string, CouncilRec[]> = new Map();
    const unlinked: CouncilRec[] = [];
    for (const rec of filtered) {
      const did = rec.decision_id;
      const dec = did ? decisionMap.get(did) : null;
      if (dec) {
        const group = linked.get(dec.id) ?? [];
        group.push(rec);
        linked.set(dec.id, group);
      } else {
        unlinked.push(rec);
      }
    }
    const result: Array<{ decision: DecisionSummary | null; recs: CouncilRec[] }> = [];
    for (const [did, groupRecs] of linked.entries()) {
      result.push({ decision: decisionMap.get(did) ?? null, recs: groupRecs });
    }
    if (unlinked.length > 0) result.push({ decision: null, recs: unlinked });
    return result;
  }, [filtered, decisionMap]);

  const editorialHeadline = useMemo(() => {
    const summary = latestRun?.summary?.split(/\n{2,}/)[0]?.trim();
    if (summary && summary.length > 0 && summary.length < 280) return summary;
    if (scopedRecs.length === 0) {
      // Use a tension statement as the lead if no session has been run
      const blocker = tensions.find((t) => t.is_commitment_blocker);
      const highPressure = tensions.find((t) => t.pressure === "high" || t.pressure === "critical");
      if (blocker?.statement) return blocker.statement;
      if (highPressure?.statement) return highPressure.statement;
      return `No advisory session run for ${meta.label} yet.`;
    }
    if (counts.pending > 0) {
      // If a tension is blocking commitment, lead with that
      const blocker = tensions.find((t) => t.is_commitment_blocker);
      if (blocker?.statement) return blocker.statement;
      return `${counts.pending} interpretation${counts.pending === 1 ? "" : "s"} unresolved.`;
    }
    if (counts.accepted > 0 && counts.pending === 0) return `${counts.accepted} interpretation${counts.accepted === 1 ? "" : "s"} integrated.`;
    return `All ${scopedRecs.length} interpretation${scopedRecs.length === 1 ? "" : "s"} reviewed.`;
  }, [scopedRecs, counts, meta.label, latestRun, tensions]);

  const editorialContext = useMemo(() => {
    if (!latestRun?.summary) return null;
    const paras = latestRun.summary.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    const headline = paras[0] ?? "";
    const usedAsHeadline = headline.length > 0 && headline.length < 280;
    return usedAsHeadline ? (paras[1] ?? null) : null;
  }, [latestRun]);

  const highCriticalTensions = useMemo(
    () => tensions.filter((t) => t.pressure === "high" || t.pressure === "critical"),
    [tensions],
  );

  const activeHierarchyRecs = useMemo(
    () => scopedRecs.filter((r) => r.status !== "ignored"),
    [scopedRecs],
  );

  const ignoredHierarchyRecs = useMemo(
    () => scopedRecs.filter((r) => r.status === "ignored"),
    [scopedRecs],
  );

  const activeHierarchyGrouped = useMemo(() => {
    const linked: Map<string, CouncilRec[]> = new Map();
    const unlinked: CouncilRec[] = [];
    for (const rec of activeHierarchyRecs) {
      const did = rec.decision_id;
      const dec = did ? decisionMap.get(did) : null;
      if (dec) {
        const group = linked.get(dec.id) ?? [];
        group.push(rec);
        linked.set(dec.id, group);
      } else {
        unlinked.push(rec);
      }
    }
    const result: Array<{ decision: DecisionSummary | null; recs: CouncilRec[] }> = [];
    for (const [did, groupRecs] of linked.entries()) {
      result.push({ decision: decisionMap.get(did) ?? null, recs: groupRecs });
    }
    if (unlinked.length > 0) result.push({ decision: null, recs: unlinked });
    return result;
  }, [activeHierarchyRecs, decisionMap]);

  // ── Hierarchy layout ───────────────────────────────────────────────────────
  if (hasHierarchy) {
    const pressureNum = highCriticalTensions.length > 0 ? "01" : null;
    const interpretationNum = highCriticalTensions.length > 0 ? "02" : "01";

    return (
      <HierarchyPageShell
        eyebrowSegments={["Council"]}
        h1Before="Advisory"
        h1Signal="Council"
        subhead="Things you might otherwise miss — tensions and outside interpretations worth a second look."
        signalBasis={signalBasis}
        compactHero
      >
        {/* § 01 STRATEGIC PRESSURE */}
        {pressureNum && highCriticalTensions.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <HierarchySectionHeader number={pressureNum} label="Strategic Pressure" />
            <p style={{ fontFamily: D.sans, fontSize: 13, color: D.inkSoft, lineHeight: 1.6, margin: "0 0 16px", maxWidth: 560 }}>
              The tension the council is responding to.
              {counts.pending > 0 && ` ${counts.pending} interpretation${counts.pending === 1 ? "" : "s"} remain unresolved.`}
            </p>
            <TensionBlock tensions={highCriticalTensions} context="council" showBlockerCallout={highCriticalTensions.some((t) => t.is_commitment_blocker)} lead />
          </div>
        )}

        {/* § 01/02 ADVISORY INTERPRETATIONS */}
        <div id="council-interpretations" style={{ marginBottom: 32 }}>
          <HierarchySectionHeader number={interpretationNum} label="Advisory Interpretations" />

          {/* Council selector with role descriptions */}
          <div className="crpv-council-selector" style={{ marginBottom: 16 }}>
            {COUNCIL_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`crpv-council-selector-btn${councilKey === opt.key ? " active" : ""}`}
                onClick={() => setCouncilKey(opt.key)}
              >
                <span className="crpv-council-selector-name">{opt.label}</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: D.signal, textTransform: "uppercase" as const, letterSpacing: "0.08em", display: "block", marginTop: 2 }}>{opt.role}</span>
                <span className="crpv-council-selector-desc cap">{opt.desc}</span>
              </button>
            ))}
          </div>

          {/* Run + refresh row */}
          <div className="crpv-council-run-row" style={{ marginBottom: 24 }}>
            <button type="button" className="crpv-council-run-btn" onClick={runCouncil} disabled={running}>
              {running ? `Running ${meta.label}…` : `Run ${meta.label}`}
            </button>
            {latestRun && (
              <span className="crpv-council-run-meta cap">
                {latestRun.recommendation_count} interpretation{latestRun.recommendation_count === 1 ? "" : "s"}
              </span>
            )}
            <button type="button" className="btn ghost" onClick={load} disabled={loading || running}>
              {loading ? "Loading…" : "Refresh"}
            </button>
          </div>

          {error && <p className="crpv-ws-hint" style={{ color: "var(--crpv-hot)" }}>{error}</p>}

          {/* Active interpretations (pending + accepted) */}
          {loading ? (
            <div className="crpv-ws-placeholder cap">Loading advisory interpretations…</div>
          ) : activeHierarchyRecs.length === 0 ? (
            <div className="crpv-ws-placeholder">
              {scopedRecs.length === 0
                ? `No advisory session run for ${meta.label} yet.`
                : "No active interpretations."}
            </div>
          ) : (
            <div className="crpv-council-recs">
              {activeHierarchyGrouped.map((group, gi) => (
                <div key={group.decision?.id ?? `unlinked-${gi}`}>
                  {group.decision && (
                    <div style={{ borderLeft: `2px solid ${decisionStateBorderColor(group.decision.decision_state)}`, paddingLeft: 10, marginBottom: 8, marginTop: gi > 0 ? 16 : 0 }}>
                      <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: decisionStateColor(group.decision.decision_state), marginBottom: 2 }}>
                        {DECISION_STATE_LABELS[group.decision.decision_state as keyof typeof DECISION_STATE_LABELS] ?? group.decision.decision_state}
                      </p>
                      <p style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, color: "#233C4B", lineHeight: 1.35 }}>
                        {group.decision.title}
                      </p>
                      {group.decision.decision_question && (
                        <p style={{ fontFamily: "sans-serif", fontSize: 11, color: "#6E847F", marginTop: 2, fontStyle: "italic", lineHeight: 1.4 }}>
                          {group.decision.decision_question}
                        </p>
                      )}
                    </div>
                  )}
                  {group.recs.map((rec) => {
                    const daysPending = !rec.decided_at && rec.status === "pending"
                      ? Math.floor((Date.now() - new Date(rec.created_at).getTime()) / 86400000)
                      : 0;
                    const isPersistent = daysPending >= 7;
                    return (
                      <article key={rec.id} className={`crpv-council-rec crpv-council-rec-${rec.status}${isPersistent ? " crpv-council-rec-persistent" : ""}`}>
                        <div className="crpv-council-rec-hd">
                          <span className="crpv-council-rec-title">{rec.title}</span>
                          <div className="crpv-council-rec-badges">
                            <span className={`crpv-council-badge crpv-council-priority-${rec.priority} cap`}>{rec.priority}</span>
                            <span className={`crpv-council-badge crpv-council-status-${rec.status} cap`}>{recBadgeLabel(rec)}</span>
                          </div>
                        </div>
                        <p className="crpv-council-rec-meta cap">{rec.category} · {rec.confidence}% confidence</p>
                        <p className="crpv-council-rec-body">{rec.recommendation}</p>
                        {rec.rationale && (
                          <div className="crpv-council-rationale">
                            <p className="crpv-ws-label">Advisory pressure point</p>
                            <p className="crpv-council-rationale-body">{rec.rationale}</p>
                          </div>
                        )}
                        <div className="crpv-council-rec-footer">
                          <span className="crpv-council-rec-date cap">
                            {isPersistent ? `${daysPending}d unresolved · ` : ""}{councilFmtDate(rec.created_at)}
                          </span>
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
                              disabled={!!decisionId}
                            >
                              {decisionId === `${rec.id}:ignored` ? "Saving…" : "Ignore"}
                            </button>
                            {rec.status === "accepted" && isExecutionCategory(rec.category) && parseLegId(rec.decision_note) === null && draftRecId !== rec.id && (
                              <button
                                type="button"
                                className="crpv-council-action-accept"
                                onClick={() => { setDraftRecId(rec.id); setDraftTitle(rec.title); setDraftParentRouteId(null); void loadTopLevelRoutes(rec); }}
                                disabled={!!decisionId || confirmingLeg}
                              >
                                Create leg
                              </button>
                            )}
                          </div>
                        </div>
                        {draftRecId === rec.id && (
                          <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(0,0,0,0.03)", borderRadius: 6, borderTop: "1px solid #e8ecea" }}>
                            <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#6E847F", margin: "0 0 10px" }}>
                              Draft execution leg
                            </p>
                            <div style={{ marginBottom: 8 }}>
                              <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#6E847F", margin: "0 0 4px" }}>Leg title</p>
                              <input
                                type="text"
                                value={draftTitle}
                                onChange={(e) => setDraftTitle(e.target.value)}
                                style={{ width: "100%", fontFamily: "sans-serif", fontSize: 13, padding: "6px 8px", border: "1px solid #d4dbd8", borderRadius: 4, background: "#fff", boxSizing: "border-box" as const }}
                                placeholder="Leg title"
                              />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#6E847F", margin: "0 0 4px" }}>Parent route</p>
                              {routesLoading ? (
                                <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#6E847F", margin: 0 }}>Loading routes…</p>
                              ) : topLevelRoutes.length === 0 ? (
                                <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#6E847F", margin: 0 }}>No top-level routes found.</p>
                              ) : (
                                <select
                                  value={draftParentRouteId ?? ""}
                                  onChange={(e) => setDraftParentRouteId(e.target.value || null)}
                                  style={{ width: "100%", fontFamily: "sans-serif", fontSize: 13, padding: "6px 8px", border: "1px solid #d4dbd8", borderRadius: 4, background: "#fff" }}
                                >
                                  <option value="">Pick a route…</option>
                                  {topLevelRoutes.map((r) => (
                                    <option key={r.id} value={r.id}>{r.fitScore >= 1.2 ? `${r.title ?? r.id} (suggested)` : (r.title ?? r.id)}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button
                                type="button"
                                className="crpv-council-action-accept"
                                onClick={confirmLeg}
                                disabled={confirmingLeg || !draftParentRouteId || !draftTitle.trim()}
                              >
                                {confirmingLeg ? "Creating…" : "Confirm leg"}
                              </button>
                              <button
                                type="button"
                                className="crpv-council-action-ignore"
                                onClick={() => { setDraftRecId(null); setDraftTitle(""); setDraftParentRouteId(null); }}
                                disabled={confirmingLeg}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Ignored items — collapsed by default */}
          {ignoredHierarchyRecs.length > 0 && (
            <div style={{ marginTop: 24, borderTop: `1px solid ${D.hairline}`, paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowIgnored((v) => !v)}
                style={{ fontFamily: "monospace", fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: D.inkSoft, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                {showIgnored ? "Hide ignored ↑" : `Show ${ignoredHierarchyRecs.length} ignored ↓`}
              </button>
              {showIgnored && (
                <div className="crpv-council-recs" style={{ marginTop: 12, opacity: 0.55 }}>
                  {ignoredHierarchyRecs.map((rec) => (
                    <article key={rec.id} className="crpv-council-rec crpv-council-rec-ignored">
                      <div className="crpv-council-rec-hd">
                        <span className="crpv-council-rec-title" style={{ textDecoration: "line-through" }}>{rec.title}</span>
                        <span className="crpv-council-badge crpv-council-status-ignored cap">Set aside</span>
                      </div>
                      <p className="crpv-council-rec-body" style={{ textDecoration: "line-through" }}>{rec.recommendation}</p>
                      <div className="crpv-council-rec-footer">
                        <span className="crpv-council-rec-date cap">{councilFmtDate(rec.created_at)}</span>
                        <div className="crpv-council-rec-actions">
                          <button
                            type="button"
                            className="crpv-council-action-accept"
                            onClick={() => decide(rec.id, "accepted")}
                            disabled={!!decisionId}
                          >
                            {decisionId === `${rec.id}:accepted` ? "Saving…" : "Restore"}
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </HierarchyPageShell>
    );
  }

  // ── Legacy layout ──────────────────────────────────────────────────────────
  return (
    <div className="crpv-ws-section crpv-ws-section-wide">

      {/* ── STRATEGIC PRESSURE ─────────────────────────────────────────── */}
      {/* Tensions lead — most structurally important signal */}
      {highCriticalTensions.length > 0 && (
        <div style={{ marginBottom: 32, paddingBottom: 28, borderBottom: "1px solid #e8ecea" }}>
          <p style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#b06a3c", margin: "0 0 12px" }}>
            Strategic pressure
          </p>
          <TensionBlock tensions={highCriticalTensions} context="council" showBlockerCallout={highCriticalTensions.some((t) => t.is_commitment_blocker)} />
        </div>
      )}

      {/* ── ADVISORY INTERPRETATION ────────────────────────────────────── */}
      <div className="crpv-council-editorial">
        <p className="crpv-council-editorial-eyebrow">
          {scopedRuns.length > 1 ? "Interpretation evolving" : "Outside the current interpretation"}
          {latestRun ? ` · ${meta.label} · ${councilFmtDate(latestRun.created_at)}` : ` · ${meta.label} · No session yet`}
          {scopedRuns.length > 1 ? ` · ${scopedRuns.length} sessions` : ""}
        </p>
        <h2 className="crpv-council-editorial-headline">{editorialHeadline}</h2>
        {editorialContext && (
          <p className="crpv-council-editorial-context">{editorialContext}</p>
        )}
        {scopedRecs.length > 0 && (
          <div className="crpv-council-editorial-badges">
            {counts.pending > 0 && (
              <span className="crpv-council-editorial-badge crpv-council-editorial-badge-pending">{counts.pending} unresolved</span>
            )}
            {counts.confirmed > 0 && (
              <span className="crpv-council-editorial-badge crpv-council-editorial-badge-accepted">{counts.confirmed} integrated</span>
            )}
            {counts.ignored > 0 && (
              <span className="crpv-council-editorial-badge">{counts.ignored} set aside</span>
            )}
          </div>
        )}
        {topPendingHighPriority && (
          <div className="crpv-council-editorial-featured">
            <p className="crpv-council-editorial-featured-label">Tension requiring a position</p>
            <p className="crpv-council-editorial-featured-title">{topPendingHighPriority.title}</p>
            <p className="crpv-council-editorial-featured-body">{topPendingHighPriority.recommendation}</p>
          </div>
        )}
      </div>

      {/* Council selector */}
      <div className="crpv-ws-field">
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
            {latestRun.recommendation_count} interpretation{latestRun.recommendation_count === 1 ? "" : "s"}
          </span>
        )}
        <button type="button" className="btn ghost" onClick={load} disabled={loading || running}>
          Refresh
        </button>
      </div>

      {error && <p className="crpv-ws-hint" style={{ color: "var(--crpv-hot)" }}>{error}</p>}

      {/* Latest run summary — skip first para when used as editorial headline */}
      {latestRun?.summary && (() => {
        const paras = latestRun.summary.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
        const firstUsedAsHeadline = paras[0] && paras[0].length < 280;
        const displayParas = firstUsedAsHeadline ? paras.slice(1) : paras;
        if (displayParas.length === 0) return null;
        return (
          <div className="crpv-ws-field">
            <div className="crpv-council-summary-body">
              {displayParas.map((para, i) => (
                <p key={i} className="crpv-council-summary-para">{para}</p>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Panel discussion — broken into readable sections */}
      {discussion && (
        <div className="crpv-ws-field">
          <details className="crpv-council-discussion">
            <summary className="crpv-ws-label" style={{ cursor: "pointer", listStyle: "none" }}>
              Advisory Dialogue ▸
            </summary>
            <div className="crpv-council-discussion-sections">
              {discussion.split(/\n{2,}/).map((para, i) => (
                para.trim() ? (
                  <p key={i} className="crpv-council-discussion-para">{para.trim()}</p>
                ) : null
              ))}
            </div>
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
          <div className="crpv-ws-placeholder cap">Loading advisory interpretations…</div>
        ) : filtered.length === 0 ? (
          <div className="crpv-ws-placeholder">
            {scopedRecs.length === 0
              ? `No advisory session run for ${meta.label} yet.`
              : "No interpretations in this filter."}
          </div>
        ) : (
          <div className="crpv-council-recs">
            {groupedRecs.map((group, gi) => (
              <div key={group.decision?.id ?? `unlinked-${gi}`}>
                {group.decision && (
                  <div style={{
                    borderLeft: `2px solid ${decisionStateBorderColor(group.decision.decision_state)}`,
                    paddingLeft: 10,
                    marginBottom: 8,
                    marginTop: gi > 0 ? 16 : 0,
                  }}>
                    <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: decisionStateColor(group.decision.decision_state), marginBottom: 2 }}>
                      {DECISION_STATE_LABELS[group.decision.decision_state as keyof typeof DECISION_STATE_LABELS] ?? group.decision.decision_state}
                    </p>
                    <p style={{ fontFamily: "sans-serif", fontSize: 13, fontWeight: 500, color: "#233C4B", lineHeight: 1.35 }}>
                      {group.decision.title}
                    </p>
                    {group.decision.decision_question && (
                      <p style={{ fontFamily: "sans-serif", fontSize: 11, color: "#6E847F", marginTop: 2, fontStyle: "italic", lineHeight: 1.4 }}>
                        {group.decision.decision_question}
                      </p>
                    )}
                  </div>
                )}
                {group.recs.map((rec) => {
                  const daysPending = !rec.decided_at && rec.status === "pending"
                    ? Math.floor((Date.now() - new Date(rec.created_at).getTime()) / 86400000)
                    : 0;
                  const isPersistent = daysPending >= 7;
                  return (
                    <article key={rec.id} className={`crpv-council-rec crpv-council-rec-${rec.status}${isPersistent ? " crpv-council-rec-persistent" : ""}`}>
                      <div className="crpv-council-rec-hd">
                        <span className="crpv-council-rec-title">{rec.title}</span>
                        <div className="crpv-council-rec-badges">
                          <span className={`crpv-council-badge crpv-council-priority-${rec.priority} cap`}>{rec.priority}</span>
                          <span className={`crpv-council-badge crpv-council-status-${rec.status} cap`}>{recBadgeLabel(rec)}</span>
                        </div>
                      </div>
                      <p className="crpv-council-rec-meta cap">{rec.category} · {rec.confidence}% confidence</p>
                      <p className="crpv-council-rec-body">{rec.recommendation}</p>
                      {rec.rationale && (
                        <div className="crpv-council-rationale">
                          <p className="crpv-ws-label">Advisory pressure point</p>
                          <p className="crpv-council-rationale-body">{rec.rationale}</p>
                        </div>
                      )}
                      <div className="crpv-council-rec-footer">
                        <span className="crpv-council-rec-date cap">
                          {isPersistent ? `${daysPending}d unresolved · ` : ""}{councilFmtDate(rec.created_at)}
                        </span>
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
                          {rec.status === "accepted" && isExecutionCategory(rec.category) && parseLegId(rec.decision_note) === null && draftRecId !== rec.id && (
                            <button
                              type="button"
                              className="crpv-council-action-accept"
                              onClick={() => { setDraftRecId(rec.id); setDraftTitle(rec.title); setDraftParentRouteId(null); void loadTopLevelRoutes(rec); }}
                              disabled={!!decisionId || confirmingLeg}
                            >
                              Create leg
                            </button>
                          )}
                        </div>
                      </div>
                      {draftRecId === rec.id && (
                        <div style={{ marginTop: 12, padding: "12px 14px", background: "rgba(0,0,0,0.03)", borderRadius: 6, borderTop: "1px solid #e8ecea" }}>
                          <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#6E847F", margin: "0 0 10px" }}>
                            Draft execution leg
                          </p>
                          <div style={{ marginBottom: 8 }}>
                            <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#6E847F", margin: "0 0 4px" }}>Leg title</p>
                            <input
                              type="text"
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              style={{ width: "100%", fontFamily: "sans-serif", fontSize: 13, padding: "6px 8px", border: "1px solid #d4dbd8", borderRadius: 4, background: "#fff", boxSizing: "border-box" as const }}
                              placeholder="Leg title"
                            />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <p style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "#6E847F", margin: "0 0 4px" }}>Parent route</p>
                            {routesLoading ? (
                              <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#6E847F", margin: 0 }}>Loading routes…</p>
                            ) : topLevelRoutes.length === 0 ? (
                              <p style={{ fontFamily: "sans-serif", fontSize: 12, color: "#6E847F", margin: 0 }}>No top-level routes found.</p>
                            ) : (
                              <select
                                value={draftParentRouteId ?? ""}
                                onChange={(e) => setDraftParentRouteId(e.target.value || null)}
                                style={{ width: "100%", fontFamily: "sans-serif", fontSize: 13, padding: "6px 8px", border: "1px solid #d4dbd8", borderRadius: 4, background: "#fff" }}
                              >
                                <option value="">Pick a route…</option>
                                {topLevelRoutes.map((r) => (
                                  <option key={r.id} value={r.id}>{r.title ?? r.id}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              className="crpv-council-action-accept"
                              onClick={confirmLeg}
                              disabled={confirmingLeg || !draftParentRouteId || !draftTitle.trim()}
                            >
                              {confirmingLeg ? "Creating…" : "Confirm leg"}
                            </button>
                            <button
                              type="button"
                              className="crpv-council-action-ignore"
                              onClick={() => { setDraftRecId(null); setDraftTitle(""); setDraftParentRouteId(null); }}
                              disabled={confirmingLeg}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
