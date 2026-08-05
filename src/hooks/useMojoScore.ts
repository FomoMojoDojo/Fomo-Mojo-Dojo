// ── useMojoScore ──────────────────────────────────────────────────────────────
//
// Reads the latest row(s) from mojo_scores for a company.
// Returns a parsed MojoScoreResult (current) plus history for sparklines.
// Falls back to null when no rows exist — callers handle live-compute fallback.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  MojoScoreResult,
  ContributorScore,
  ProjectedRaise,
  EngagementState,
} from "@/lib/mojoScore/types";

export type MojoScoreHistoryPoint = {
  id: string;
  computed_at: string;
  total_score: number;
};

export type UseMojoScoreResult = {
  loading: boolean;
  score: MojoScoreResult | null;
  history: MojoScoreHistoryPoint[];
  error: string | null;
};

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseContributors(
  componentScores: unknown,
  explanation: unknown,
): ContributorScore[] {
  if (!componentScores || typeof componentScores !== "object") return [];
  const cs = componentScores as Record<string, unknown>;
  const ex =
    explanation && typeof explanation === "object"
      ? (explanation as Record<string, unknown>)
      : {};

  const SKIP = new Set(["projected_raisers", "engagement_state"]);

  return Object.entries(cs)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, val]) => {
      const v = (val ?? {}) as Record<string, unknown>;
      const exVal = (ex[key] ?? {}) as Record<string, unknown>;
      return {
        key,
        label: (exVal.label as string | undefined) ?? key,
        score: (v.score as number | undefined) ?? 0,
        weight: (v.weight as number | undefined) ?? 0,
        weighted: (v.weighted as number | undefined) ?? 0,
        explanation: (exVal.explanation as string | undefined) ?? "",
        sub_scores: (v.sub_scores as Record<string, number> | undefined) ?? undefined,
      } satisfies ContributorScore;
    });
}

function parseProjectedRaisers(explanation: unknown): ProjectedRaise[] {
  if (!explanation || typeof explanation !== "object") return [];
  const ex = explanation as Record<string, unknown>;
  const raw = ex["projected_raisers"];
  if (!Array.isArray(raw)) return [];
  return raw as ProjectedRaise[];
}

function parseEngagementState(explanation: unknown): EngagementState {
  if (!explanation || typeof explanation !== "object") return "forming";
  const ex = explanation as Record<string, unknown>;
  const s = ex["engagement_state"] as string | undefined;
  const VALID: EngagementState[] = [
    "forming",
    "diagnosing",
    "focusing",
    "committing",
    "accelerating",
  ];
  return VALID.includes(s as EngagementState) ? (s as EngagementState) : "forming";
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMojoScore(companyId?: string): UseMojoScoreResult {
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<MojoScoreResult | null>(null);
  const [history, setHistory] = useState<MojoScoreHistoryPoint[]>([]);
  // GATE C-2 — `error` is ADDITIVE. A returning query error is exposed (split from the old
  // conflation of error and genuine-empty), so OutsideHeroAct renders the signed error via
  // <ActData> rather than "No score has been computed yet." on a failed read. `score` /
  // `history` / `loading` are byte-identical for every existing consumer (a genuine empty
  // still yields score=null with error=null; only a real query error sets error).
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setScore(null);
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data, error: qErr } = await supabase
        .from("mojo_scores")
        .select(
          "id, company_id, computed_at, total_score, component_scores, explanation, methodology_version",
        )
        .eq("company_id", companyId)
        .order("computed_at", { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (qErr) setError(qErr.message); // a real query error (distinct from a genuine empty)
      if (qErr || !data || data.length === 0) {
        setScore(null);
        setHistory([]);
        setLoading(false);
        return;
      }

      type Row = {
        id: string;
        company_id: string;
        computed_at: string;
        total_score: number;
        component_scores: unknown;
        explanation: unknown;
        methodology_version: string;
      };

      const latest = data[0] as Row;

      const parsed: MojoScoreResult = {
        company_id: latest.company_id,
        total_score: latest.total_score,
        contributors: parseContributors(latest.component_scores, latest.explanation),
        projected_raisers: parseProjectedRaisers(latest.explanation),
        engagement_state: parseEngagementState(latest.explanation),
        methodology_version: latest.methodology_version,
        computed_at: latest.computed_at,
      };

      const hist: MojoScoreHistoryPoint[] = data
        .map((row) => {
          const r = row as Row;
          return { id: r.id, computed_at: r.computed_at, total_score: r.total_score };
        })
        .reverse(); // chronological order for sparkline

      setScore(parsed);
      setHistory(hist);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { loading, score, history, error };
}
