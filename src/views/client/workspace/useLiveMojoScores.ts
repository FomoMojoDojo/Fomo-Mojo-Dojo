// ── THE LIVE MOJO SCORE FOR A LIST OF COMPANIES (SP-478 / SP-682 ruling 2, 2026-11-25) ───────────
//
// The company switcher prints "score N" beside each company. It used to print the cached column
// (companies.mojo_score), which is the score as of the last server snapshot: on 2026-11-25 it was
// wrong for 21 of 23 real companies. The switcher now shows the same number the home shows — the
// live computation over the one input rule — for every company in the list.
//
// THREE READS FOR THE WHOLE LIST, not three per company: the score's three inputs are read for all
// listed companies at once (paged, in id chunks small enough to be a URL), grouped, passed through
// scoreInputSet and scored by the one function. Nothing is read until the switcher is opened.
//
// WHICH COMPANIES GET A NUMBER: the ones the server writer has scored at least once. The writer
// refuses a company with no evidence (a score on zero evidence is a fabricated verdict), and such a
// company has no cached value; it shows no number here either. The cached column is read ONLY as that
// yes/no — its value is never shown.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { computeMojoScore } from "@/lib/mojoScore/computeMojoScore";
import {
  SCORE_CLAIM_COLUMNS, SCORE_INPUT_SOURCES, SCORE_NEED_COLUMNS, SCORE_ROUTE_COLUMNS, scoreInputSet,
  type ClaimInput, type NeedInput, type RouteInput,
} from "@/lib/mojoScore/types";
import { scoreComputedAt } from "./useLiveMojoScore";

/** How many company ids one `company_id=in.(…)` request may name. */
const COMPANY_ID_CHUNK = 40;

type Listed = { id: string; mojo_score: number | null };
type Keyed = { company_id: string };

async function readFor<T extends Keyed>(table: string, columns: string, ids: string[]): Promise<Map<string, T[]>> {
  const by = new Map<string, T[]>();
  for (let i = 0; i < ids.length; i += COMPANY_ID_CHUNK) {
    const chunk = ids.slice(i, i + COMPANY_ID_CHUNK);
    const rows = await fetchAllRows<T>((from, to) =>
      // deno-lint-ignore no-explicit-any
      (supabase as any).from(table).select(`company_id, ${columns}`).in("company_id", chunk).order("id").range(from, to));
    for (const r of rows) (by.get(r.company_id) ?? by.set(r.company_id, []).get(r.company_id)!).push(r);
  }
  return by;
}

/** The live score of each listed company that has ever been scored, keyed by company id. Empty until
 *  `enabled` is first true and the three reads have returned. */
export function useLiveMojoScores(companies: ReadonlyArray<Listed>, enabled: boolean): Map<string, number> {
  const ids = useMemo(() => companies.filter((c) => c.mojo_score != null).map((c) => c.id).sort(), [companies]);
  const key = ids.join(",");
  const [scores, setScores] = useState<{ key: string; map: Map<string, number> }>({ key: "", map: new Map() });

  useEffect(() => {
    if (!enabled || ids.length === 0 || scores.key === key) return;
    let cancelled = false;
    (async () => {
      try {
        const [claims, routes, needs] = await Promise.all([
          readFor<Keyed & ClaimInput & { status?: string | null }>(SCORE_INPUT_SOURCES.claims, SCORE_CLAIM_COLUMNS, ids),
          readFor<Keyed & RouteInput & { relevance_state?: string | null }>(SCORE_INPUT_SOURCES.routes, SCORE_ROUTE_COLUMNS, ids),
          readFor<Keyed & NeedInput & { status?: string | null; journey_key?: string | null }>(SCORE_INPUT_SOURCES.needs, SCORE_NEED_COLUMNS, ids),
        ]);
        if (cancelled) return;
        const computedAt = scoreComputedAt();
        const map = new Map<string, number>();
        for (const id of ids) {
          const inputs = scoreInputSet({ claims: claims.get(id) ?? [], routes: routes.get(id) ?? [], needs: needs.get(id) ?? [] });
          map.set(id, computeMojoScore({ companyId: id, claims: inputs.claims, routes: inputs.routes, needs: inputs.needs, computedAt }).total_score);
        }
        setScores({ key, map });
      } catch (e) {
        // A failed read shows no number: a missing score is honest, a stale one is not.
        console.warn("[useLiveMojoScores] read failed:", e instanceof Error ? e.message : String(e));
        if (!cancelled) setScores({ key, map: new Map() });
      }
    })();
    return () => { cancelled = true; };
    // `ids` is represented by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  return scores.key === key ? scores.map : EMPTY;
}
const EMPTY: Map<string, number> = new Map();

/** "score 8" for a company in the switcher, or null when it has no live score to show. */
export function switcherScoreLabel(scores: ReadonlyMap<string, number>, companyId: string): string | null {
  const n = scores.get(companyId);
  return typeof n === "number" ? `score ${n}` : null;
}
