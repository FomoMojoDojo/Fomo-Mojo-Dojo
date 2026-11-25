// ── useMojoScore ──────────────────────────────────────────────────────────────
//
// Reads the latest row(s) from mojo_scores for a company.
// Returns a parsed MojoScoreResult (current) plus history for sparklines.
// Falls back to null when no rows exist — callers handle live-compute fallback.
//
// SP-478 / SP-682 rulings 1 and 4 (2026-11-25) — THE CALLER SAYS WHICH SCORE. mojo_scores holds
// rows of TWO different calculations: the Mojo Score (methodology v…) and the outside score
// (methodology outside-…). This hook used to take the newest rows of any kind, so a surface showed
// whichever calculation happened to be written last — Charter's story card read the outside score
// (12) and Edgewood's the Mojo Score (28), and the home's sparkline drew both on one line. There is
// no default: a reader that does not name its score does not compile.
//   "outside"  the outside score — the client story's card and its export
//   "mojo"     the Mojo Score's stored history — the home's sparkline
// The Mojo Score's CURRENT value is never read from here: its authority is the live computation
// (useLiveMojoScore).

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

/** Which calculation's rows a reader wants. */
export type StoredScoreKind = "mojo" | "outside";
/** The methodology prefix that marks an outside-score row — computeOutsideScore's own constant,
 *  restated here as a literal because this hook must not import the scorer. Pinned by a test. */
export const OUTSIDE_SCORE_METHODOLOGY_PREFIX = "outside-";

export function useMojoScore(companyId: string | undefined, kind: StoredScoreKind): UseMojoScoreResult {
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
      const base = supabase
        .from("mojo_scores")
        .select(
          "id, company_id, computed_at, total_score, component_scores, explanation, methodology_version",
        )
        .eq("company_id", companyId);
      const ofKind = kind === "outside"
        ? base.like("methodology_version", `${OUTSIDE_SCORE_METHODOLOGY_PREFIX}%`)
        : base.not("methodology_version", "like", `${OUTSIDE_SCORE_METHODOLOGY_PREFIX}%`);
      const { data, error: qErr } = await ofKind
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

      // GATE 2 (2026-09-10) — SCOPE THE HISTORY TO ONE METHODOLOGY.
      // `mojo_scores` mixes families (`v1.1.0` internal, `outside-v1.0.0`, `outside-v1.1.0`), and
      // this query does not filter. The sparkline was therefore plotting different scales on one
      // line: Cafe Barra 2 rendered an internal 35 next to an outside 21 as if the company had
      // fallen 14 points. The newest row's methodology is the current one; history is the rows that
      // share it. `score` is unaffected — it was always `data[0]`, and `data[0]` is by definition in
      // its own family.
      const currentMethodology = latest.methodology_version;
      const sameFamily = (data as Row[]).filter((r) => r.methodology_version === currentMethodology);

      const parsed: MojoScoreResult = {
        company_id: latest.company_id,
        total_score: latest.total_score,
        contributors: parseContributors(latest.component_scores, latest.explanation),
        projected_raisers: parseProjectedRaisers(latest.explanation),
        engagement_state: parseEngagementState(latest.explanation),
        methodology_version: latest.methodology_version,
        computed_at: latest.computed_at,
      };

      const hist: MojoScoreHistoryPoint[] = sameFamily
        .map((r) => ({ id: r.id, computed_at: r.computed_at, total_score: r.total_score }))
        .reverse(); // chronological order for sparkline

      setScore(parsed);
      setHistory(hist);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, kind]);

  return { loading, score, history, error };
}
