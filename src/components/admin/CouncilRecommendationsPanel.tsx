import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type RecommendationStatus = "pending" | "accepted" | "ignored";

type CouncilRecommendationRow = {
  id: string;
  run_id: string | null;
  title: string;
  recommendation: string;
  rationale: string;
  category: string;
  priority: "high" | "medium" | "low";
  confidence: number;
  status: RecommendationStatus;
  source_basis: string;
  source_context_json: Record<string, unknown> | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type CouncilRunRow = {
  id: string;
  model: string;
  status: "running" | "completed" | "failed";
  summary: string;
  recommendation_count: number;
  created_at: string;
  updated_at: string;
};

type Filter = "all" | RecommendationStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "ignored", label: "Ignored" },
];

async function extractInvokeErrorMessage(error: unknown, fallback: string) {
  const err = error as { message?: string; context?: { text?: () => Promise<string> } } | null;
  const base = typeof err?.message === "string" && err.message.trim() ? err.message.trim() : fallback;
  const context = err?.context;
  if (!context || typeof context.text !== "function") return base;

  try {
    const raw = (await context.text())?.trim();
    if (!raw) return base;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      if (parsed?.error && parsed.error.trim()) return parsed.error.trim();
      if (parsed?.message && parsed.message.trim()) return parsed.message.trim();
    } catch {
      // keep raw fallback
    }
    return `${base}: ${raw}`;
  } catch {
    return base;
  }
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function statusStyle(status: RecommendationStatus) {
  if (status === "accepted") return "bg-[#E8F5E9] text-[#2E7D32] border-[#CDE8CF]";
  if (status === "ignored") return "bg-[#F6F6F6] text-[#616161] border-[#E0E0E0]";
  return "bg-[#FFF8E1] text-[#8D6E63] border-[#F5E2A9]";
}

function priorityStyle(priority: CouncilRecommendationRow["priority"]) {
  if (priority === "high") return "bg-[#FFF1EB] text-[#C85000] border-[#FFD4C2]";
  if (priority === "low") return "bg-[#EEF7F1] text-[#2F7A47] border-[#CFE8D8]";
  return "bg-[#FFF6E9] text-[#A96900] border-[#F3D7A9]";
}

export default function CouncilRecommendationsPanel({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [recommendations, setRecommendations] = useState<CouncilRecommendationRow[]>([]);
  const [runs, setRuns] = useState<CouncilRunRow[]>([]);
  const [decisionBusyId, setDecisionBusyId] = useState<string | null>(null);

  const latestRun = runs[0] ?? null;

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const sb = supabase as any;
      const [recommendationResult, runResult] = await Promise.all([
        sb
          .from("council_recommendations")
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(250),
        sb
          .from("council_review_runs")
          .select("id, model, status, summary, recommendation_count, created_at, updated_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (recommendationResult.error) throw recommendationResult.error;
      if (runResult.error) throw runResult.error;

      setRecommendations((recommendationResult.data ?? []) as CouncilRecommendationRow[]);
      setRuns((runResult.data ?? []) as CouncilRunRow[]);
    } catch (err) {
      setRecommendations([]);
      setRuns([]);
      setError(err instanceof Error ? err.message : "Failed to load council recommendations");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [companyId]);

  const counts = useMemo(() => {
    const pending = recommendations.filter((item) => item.status === "pending").length;
    const accepted = recommendations.filter((item) => item.status === "accepted").length;
    const ignored = recommendations.filter((item) => item.status === "ignored").length;
    return { pending, accepted, ignored, total: recommendations.length };
  }, [recommendations]);

  const filtered = useMemo(() => {
    if (filter === "all") return recommendations;
    return recommendations.filter((item) => item.status === filter);
  }, [filter, recommendations]);

  async function runCouncilReview() {
    setRunning(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("council-review", {
        body: { company_id: companyId },
      });
      if (invokeError) {
        const msg = await extractInvokeErrorMessage(invokeError, "Council review failed");
        throw new Error(msg);
      }
      if (data?.error) throw new Error(String(data.error));
      toast.success(`Council review completed for ${companyName}`);
      await loadData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Council review failed";
      setError(message);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  async function decideRecommendation(id: string, status: RecommendationStatus) {
    const busyKey = `${id}:${status}`;
    setDecisionBusyId(busyKey);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const sb = supabase as any;
      const { error: updateError } = await sb
        .from("council_recommendations")
        .update({
          status,
          decided_at: new Date().toISOString(),
          decided_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("company_id", companyId);

      if (updateError) throw updateError;

      setRecommendations((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                decided_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update recommendation";
      setError(message);
      toast.error(message);
    } finally {
      setDecisionBusyId(null);
    }
  }

  return (
    <section className="bg-white border border-border rounded-2xl p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-sans text-[14px] font-semibold text-foreground">
            Council Recommendations
          </div>
          <div className="font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
            Review all company context and choose what to accept or ignore
          </div>
        </div>
        <button
          type="button"
          onClick={runCouncilReview}
          disabled={running}
          className="rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide transition-colors disabled:opacity-60"
        >
          {running ? "Running council review…" : "Run Council Review"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <div className="rounded-full border border-border bg-muted/20 px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Total {counts.total}
        </div>
        <div className="rounded-full border border-[#F5E2A9] bg-[#FFF8E1] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[#8D6E63]">
          Pending {counts.pending}
        </div>
        <div className="rounded-full border border-[#CDE8CF] bg-[#E8F5E9] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[#2E7D32]">
          Accepted {counts.accepted}
        </div>
        <div className="rounded-full border border-[#E0E0E0] bg-[#F6F6F6] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[#616161]">
          Ignored {counts.ignored}
        </div>
      </div>

      {latestRun ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              Latest Run
            </span>
            <span className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {latestRun.status}
            </span>
            <span className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {latestRun.recommendation_count} recommendation{latestRun.recommendation_count === 1 ? "" : "s"}
            </span>
            <span className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {formatDate(latestRun.created_at)}
            </span>
          </div>
          {latestRun.summary ? (
            <p className="mt-2 font-sans text-[13px] text-foreground">{latestRun.summary}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors"
            style={{
              borderColor: filter === item.key ? "#233C4B" : "#DDE6D1",
              color: filter === item.key ? "#233C4B" : "#6E847F",
              background: filter === item.key ? "#F3F8F5" : "#FFFFFF",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-8 text-center font-mono text-[10px] text-muted-foreground uppercase tracking-wide">
          Loading council recommendations…
        </div>
      ) : error ? (
        <div className="py-4 font-sans text-[13px] text-destructive">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-6 font-sans text-[13px] text-muted-foreground italic">
          No recommendations in this filter yet.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((item) => {
            const sourceContext = (item.source_context_json ?? {}) as Record<string, unknown>;
            const references = Array.isArray(sourceContext.references)
              ? sourceContext.references.map((value) => String(value)).filter(Boolean).slice(0, 5)
              : [];
            return (
              <article key={item.id} className="rounded-xl border border-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-sans text-[14px] font-semibold text-foreground">{item.title}</h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${priorityStyle(item.priority)}`}>
                      {item.priority}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${statusStyle(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.confidence}% confidence
                    </span>
                    <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.category}
                    </span>
                  </div>
                </div>

                <p className="mt-2 font-sans text-[13px] text-foreground">{item.recommendation}</p>
                {item.rationale ? (
                  <p className="mt-2 font-sans text-[12px] text-muted-foreground">
                    Why this matters: {item.rationale}
                  </p>
                ) : null}

                {references.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {references.map((reference) => (
                      <span
                        key={`${item.id}:${reference}`}
                        className="rounded-full border border-border bg-muted/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
                      >
                        {reference}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    Created {formatDate(item.created_at)}{item.decided_at ? ` · Decided ${formatDate(item.decided_at)}` : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decideRecommendation(item.id, "accepted")}
                      disabled={decisionBusyId === `${item.id}:accepted` || item.status === "accepted"}
                      className="rounded-full border border-[#CDE8CF] bg-[#E8F5E9] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[#2E7D32] disabled:opacity-60"
                    >
                      {decisionBusyId === `${item.id}:accepted` ? "Saving…" : "Accept"}
                    </button>
                    <button
                      type="button"
                      onClick={() => decideRecommendation(item.id, "ignored")}
                      disabled={decisionBusyId === `${item.id}:ignored` || item.status === "ignored"}
                      className="rounded-full border border-[#E0E0E0] bg-[#F6F6F6] px-3 py-1 font-mono text-[10px] uppercase tracking-wide text-[#616161] disabled:opacity-60"
                    >
                      {decisionBusyId === `${item.id}:ignored` ? "Saving…" : "Ignore"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
