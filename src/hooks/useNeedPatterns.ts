// ── THE PATTERN LAYER, READ FOR THE BRIEF (SP-465 / SP-463 / SP-459, 2026-11-20) ─────────────────
//
// Under each need that meets the bar, the patterns the generator proposed and the judge kept, with
// the quotes that survived. Three reads, all paged (fetchAllRows), for the reason useBriefNeeds
// carries: PostgREST caps a response at max_rows = 1000 and a count on a partial read is a
// fabricated number.
//
// EVERY COUNT HERE IS DERIVED (SP-463). `need_patterns` stores no supporting count and no site count;
// this hook counts the `need_pattern_quotes` rows whose `bears` is true and the distinct sites those
// signals sat on, through `siteOf` — the one host→site map. A stored count could not have been
// trusted after a quote was retired.
//
// SP-459: a pattern renders as soon as it passes the judge, marked DRAFT. `signed_at` is NULL until a
// person signs, and signing only removes the mark — so nothing here waits on a signature.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { siteOf } from "@/lib/needEvidenceCounting";
import type { QuoteRow } from "@/lib/reviewQuote";

export type NeedPattern = {
  id: string;
  needId: string;
  /** SP-502: the CLAIM — one sentence. Stored as need_patterns.name. */
  name: string;
  /** SP-502: the 1–3 predicates the claim asserts, in the generator's own order. Empty on a pre-v3
   *  row, and the band then shows the claim alone rather than an empty list. */
  parts: string[];
  strength: string;
  /** SP-470: the one polarity this pattern carries. null on a rubric-v1 row. */
  polarity: string | null;
  /** SP-459: no signature yet, so the pattern shows with the draft mark. */
  draft: boolean;
  /** SP-469: the generator hit the ceiling on this need's run, so there may be patterns it could not
   *  return. A fact of the run, not derivable from the rows. */
  ceilingHit: boolean;
  /** Derived, never stored: the quotes the judge kept. */
  supporting: number;
  /** Derived, never stored: the distinct sites those quotes sat on. */
  sites: number;
  /** The one representative quote, read through displayQuote by the view. */
  representative: QuoteRow | null;
  /** SP-665: the words of the representative quote the judge found — need_pattern_quotes.states_span
   *  of this pattern's own row for that quote. null on a pre-v3 row, which stored no span. */
  representativeSpan: string | null;
  /** SP-674: the quotes the judge kept under this pattern — the rows `supporting` counts — most
   *  recent first, undated last. From reads this hook already makes; `brand` is empty because
   *  signals carries none, and the view fills it from the need's own counted quotes. Optional so a
   *  caller that builds a pattern by hand (a test) need not supply it. */
  quotes?: QuoteRow[];
};

type PatternRow = {
  id: string; need_id: string; name: string; strength: string; polarity: string | null;
  signed_at: string | null; representative_signal_id: string | null; run_ceiling_hit: boolean | null;
};
type PQRow = { pattern_id: string; signal_id: string; bears: boolean; states_span?: string | null };
type PartRow = { pattern_id: string; ordinal: number; predicate: string };

/** How many signal ids one `id=in.(…)` request may name — useBriefNeeds' own bound, same reason. */
const SIGNAL_ID_CHUNK = 60;

export function useNeedPatterns(companyId?: string | null) {
  const [patterns, setPatterns] = useState<NeedPattern[]>([]);
  /** SP-469 / SP-476: how many DISTINCT counted quotes sit under a surviving pattern, per need.
   *  Derived here from need_pattern_quotes — never a stored column (SP-463). The Brief shows it
   *  against the need's own counted total, so a band that reads a third of the evidence says so. */
  const [assignedByNeed, setAssignedByNeed] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setPatterns([]); setLoading(false); return; }
      setLoading(true); setError(null);
      try {
        const rows = await fetchAllRows<PatternRow>((from, to) =>
          supabase.from("need_patterns")
            .select("id, need_id, name, strength, polarity, signed_at, representative_signal_id, run_ceiling_hit")
            .eq("company_id", companyId).is("superseded_at", null).order("id").range(from, to));
        if (cancelled) return;
        if (rows.length === 0) { setPatterns([]); setAssignedByNeed({}); setLoading(false); return; }

        const pq = await fetchAllRows<PQRow>((from, to) =>
          supabase.from("need_pattern_quotes").select("pattern_id, signal_id, bears, states_span")
            .eq("company_id", companyId).order("id").range(from, to));
        if (cancelled) return;

        // SP-502: the parts, paged for the same reason as everything else here. Ordered by id for a
        // stable page boundary and sorted by ordinal below — a page break must not reorder a claim's
        // predicates, which is what ordering by `ordinal` alone across pages would risk.
        const partRows = await fetchAllRows<PartRow>((from, to) =>
          supabase.from("need_pattern_parts").select("pattern_id, ordinal, predicate")
            .eq("company_id", companyId).order("id").range(from, to));
        if (cancelled) return;
        const partsByPattern = new Map<string, PartRow[]>();
        for (const r of partRows) (partsByPattern.get(r.pattern_id) ?? partsByPattern.set(r.pattern_id, []).get(r.pattern_id)!).push(r);

        const sigIds = [...new Set([
          ...pq.map((r) => r.signal_id),
          ...rows.map((r) => r.representative_signal_id).filter((x): x is string => Boolean(x)),
        ])];
        let sigs: Array<{ id: string; quote: string | null; source_url: string | null; event_date: string | null }> = [];
        for (let i = 0; i < sigIds.length; i += SIGNAL_ID_CHUNK) {
          const chunk = sigIds.slice(i, i + SIGNAL_ID_CHUNK);
          sigs = sigs.concat(await fetchAllRows((from, to) =>
            supabase.from("signals").select("id, quote, source_url, event_date").in("id", chunk).order("id").range(from, to)));
          if (cancelled) return;
        }
        const sigById = new Map(sigs.map((s) => [s.id, s]));
        const byPattern = new Map<string, PQRow[]>();
        for (const r of pq) (byPattern.get(r.pattern_id) ?? byPattern.set(r.pattern_id, []).get(r.pattern_id)!).push(r);

        // one need may hold several patterns and one quote may support more than one of them, so the
        // covered set is a UNION per need, not a sum of the per-pattern counts.
        const needOfPattern = new Map(rows.map((p) => [p.id, p.need_id]));
        const coveredByNeed = new Map<string, Set<string>>();
        for (const r of pq) {
          if (!r.bears) continue;
          const nid = needOfPattern.get(r.pattern_id);
          if (!nid) continue;
          (coveredByNeed.get(nid) ?? coveredByNeed.set(nid, new Set()).get(nid)!).add(r.signal_id);
        }
        setAssignedByNeed(Object.fromEntries([...coveredByNeed].map(([nid, set]) => [nid, set.size])));

        setPatterns(rows.map((p) => {
          const kept = (byPattern.get(p.id) ?? []).filter((r) => r.bears);
          const sites = new Set(kept.map((r) => siteOf(sigById.get(r.signal_id)?.source_url))).size;
          const rep = p.representative_signal_id ? sigById.get(p.representative_signal_id) : undefined;
          return {
            id: p.id, needId: p.need_id, name: p.name,
            parts: (partsByPattern.get(p.id) ?? []).slice().sort((a, b) => a.ordinal - b.ordinal).map((r) => r.predicate),
            strength: p.strength,
            polarity: p.polarity,
            draft: p.signed_at == null,
            ceilingHit: p.run_ceiling_hit === true,
            supporting: kept.length,
            sites,
            representative: rep
              ? {
                  signalId: rep.id, quote: rep.quote, brand: "",
                  sourceUrl: rep.source_url,
                  eventDate: rep.event_date ? String(rep.event_date).slice(0, 10) : null,
                }
              : null,
            quotes: kept.map((r) => sigById.get(r.signal_id)).filter((x): x is NonNullable<typeof x> => Boolean(x))
              .map((sg) => ({
                signalId: sg.id, quote: sg.quote, brand: "", sourceUrl: sg.source_url,
                eventDate: sg.event_date ? String(sg.event_date).slice(0, 10) : null,
              }))
              .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? "") || a.signalId.localeCompare(b.signalId)),
            representativeSpan: rep
              ? ((byPattern.get(p.id) ?? []).find((r) => r.signal_id === rep.id)?.states_span ?? null)
              : null,
          };
        }));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e)); setPatterns([]); setAssignedByNeed({}); setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { patterns, assignedByNeed, loading, error };
}
