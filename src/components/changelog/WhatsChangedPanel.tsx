import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const c = {
  charcoal: "#233C4B",
  secondary: "#46606D",
  muted: "#6E847F",
  line: "#DDE6D1",
  lineFaint: "#EEF3E9",
  teal: "#5F9B8C",
  amber: "#FAC846",
  coral: "#FF7D2D",
};

type ChangeEntry = {
  id: string;
  label: string;
  detail: string;
  updatedAt: string;
  section: string;
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function storageKey(companyId: string, userId: string) {
  return `whats_changed:${companyId}:${userId}`;
}

export default function WhatsChangedPanel({
  companyId,
  userId,
}: {
  companyId?: string;
  userId?: string;
}) {
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Read last visit timestamp and store current visit
  useEffect(() => {
    if (!companyId || !userId) return;
    const key = storageKey(companyId, userId);
    const stored = localStorage.getItem(key);
    setLastVisit(stored);
    // Record this visit
    localStorage.setItem(key, new Date().toISOString());
  }, [companyId, userId]);

  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;
    setLoading(true);

    void (async () => {
      // Use lastVisit as cutoff; if never visited, look back 7 days
      const since = lastVisit ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const results = await Promise.allSettled([
        supabase
          .from("opportunities")
          .select("id, outcome, updated_at")
          .eq("company_id", companyId)
          .gt("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(10),
        (supabase as any)
          .from("strategy_assumptions")
          .select("id, assumption, updated_at")
          .eq("company_id", companyId)
          .gt("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(5),
        supabase
          .from("odi_needs")
          .select("id, desired_outcome, updated_at")
          .eq("company_id", companyId)
          .gt("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(5),
        supabase
          .from("solution_ideas")
          .select("id, title, updated_at")
          .eq("company_id", companyId)
          .gt("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(5),
      ]);

      if (cancelled) return;

      const entries: ChangeEntry[] = [];

      const oppRes = results[0];
      if (oppRes.status === "fulfilled" && !oppRes.value.error) {
        for (const row of (oppRes.value.data ?? []) as any[]) {
          entries.push({
            id: `opp-${row.id}`,
            label: String(row.outcome || "Opportunity updated").slice(0, 80),
            detail: "Opportunity",
            updatedAt: row.updated_at,
            section: "Opportunities",
          });
        }
      }

      const assumptionRes = results[1];
      if (assumptionRes.status === "fulfilled" && !(assumptionRes.value as any).error) {
        for (const row of ((assumptionRes.value as any).data ?? []) as any[]) {
          entries.push({
            id: `assumption-${row.id}`,
            label: String(row.assumption || "Assumption updated").slice(0, 80),
            detail: "Assumption",
            updatedAt: row.updated_at,
            section: "Assumptions",
          });
        }
      }

      const needsRes = results[2];
      if (needsRes.status === "fulfilled" && !needsRes.value.error) {
        for (const row of (needsRes.value.data ?? []) as any[]) {
          entries.push({
            id: `need-${row.id}`,
            label: String(row.desired_outcome || "Need updated").slice(0, 80),
            detail: "Customer Need",
            updatedAt: row.updated_at,
            section: "Needs",
          });
        }
      }

      const ideasRes = results[3];
      if (ideasRes.status === "fulfilled" && !ideasRes.value.error) {
        for (const row of (ideasRes.value.data ?? []) as any[]) {
          entries.push({
            id: `idea-${row.id}`,
            label: String(row.title || "Solution idea updated").slice(0, 80),
            detail: "Solution Idea",
            updatedAt: row.updated_at,
            section: "Solutions",
          });
        }
      }

      // Sort by most recent
      entries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setChanges(entries);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, lastVisit]);

  const displayedChanges = expanded ? changes : changes.slice(0, 4);
  const sinceLabel = lastVisit
    ? `since ${timeAgo(lastVisit)}`
    : "in the last 7 days";

  if (loading) return null;
  if (changes.length === 0) return null;

  return (
    <div
      className="rounded-xl mb-4 overflow-hidden"
      style={{ border: `1px solid ${c.line}`, background: "#FFFFFF" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5"
        style={{ borderBottom: `1px solid ${c.lineFaint}`, background: c.lineFaint }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: c.teal }}
          />
          <p className="font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: c.secondary }}>
            What's Changed
          </p>
          <span
            className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[9px]"
            style={{ borderColor: c.line, background: "#FFFFFF", color: c.muted }}
          >
            {changes.length} update{changes.length !== 1 ? "s" : ""} {sinceLabel}
          </span>
        </div>
        {changes.length > 4 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-wider hover:opacity-70 transition-opacity"
            style={{ color: c.muted }}
          >
            {expanded ? "Show less" : `Show all ${changes.length}`}
          </button>
        )}
      </div>

      <div className="divide-y" style={{ borderColor: c.lineFaint }}>
        {displayedChanges.map((change) => (
          <div key={change.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="shrink-0 inline-flex items-center rounded border px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-wider"
                style={{ borderColor: c.line, color: c.muted, background: c.lineFaint }}
              >
                {change.section}
              </span>
              <p className="font-sans text-[12px] truncate" style={{ color: c.charcoal }}>
                {change.label}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[10px]" style={{ color: c.muted }}>
              {timeAgo(change.updatedAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
