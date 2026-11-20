// ── THE BRIEF'S NEEDS, FROM STORED ROWS (SP-445 / SP-447 / SP-449, 2026-11-19) ────────────────────
//
// One read for the Brief's three need bands. Three queries, no derivation stored anywhere:
//   odi_needs       the need and its source_path (which decides the outside-voice mark)
//   need_evidence   does THIS quote bear on THIS need, with what polarity, from which brand
//   signals         the VERIFIED QUOTE, page and date (signals.quote, SP-452 — never evidence_excerpt)
// `tallyNeed` (src/lib/needEvidenceCounting.ts) then applies the SP-406 rules. Nothing on the page is
// read from a stored count — SP-447: every value comes from these rows.
//
// EVERY READ IS PAGED (fetchAllRows). PostgREST caps a response at max_rows = 1000, and Charter alone
// carries 4,950 need_evidence rows: the first build of this page read one page and rendered 3 hotspots
// and 12 thin spots where the stored rows say 11 and 4, with N13 at 7 counted quotes instead of 44.
// A count on a partial read is a fabricated number, which is the trap fetchAllRows was written for.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { isCounted, tallyNeed, type EvidenceRow, type NeedTally } from "@/lib/needEvidenceCounting";
import type { QuoteRow } from "@/lib/reviewQuote";

export type BriefNeed = {
  id: string;
  statement: string;
  sourcePath: string | null;
  /** SP-458 / SP-467: materialised from a card nobody has ruled on yet. Only this page reads it. */
  proposed: boolean;
  tally: NeedTally;
  /** The COUNTED bearing quotes, most recent date first, undated last. What the opener shows. */
  quotes: QuoteRow[];
  /** The counted bearing quotes whose polarity is `working` (SP-449). */
  workingQuotes: QuoteRow[];
};

/** How many signal ids one `id=in.(…)` request may name. See the comment at the read below. */
const SIGNAL_ID_CHUNK = 60;

type EvRow = { need_id: string; signal_id: string; bears: boolean; polarity: string | null; brand: string };
type NeedRow = { id: string; desired_outcome: string | null; source_path: string | null; status: string };
type SigRow = { id: string; quote: string | null; source_url: string | null; event_date: string | null };

export function useBriefNeeds(companyId?: string | null) {
  const [needs, setNeeds] = useState<BriefNeed[]>([]);
  /** The brand values need_evidence recorded for this company (SP-455c). */
  const [storedBrands, setStoredBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setNeeds([]); setLoading(false); return; }
      setLoading(true); setError(null);
      let nRows: NeedRow[];
      let ev: EvRow[];
      let sigs: SigRow[] = [];
      try {
        [nRows, ev] = await Promise.all([
          // SP-458 / SP-467 (2026-11-20): the Brief is the ONE reader that sees a materialised
          // proposed need — a card whose evidence already meets the bar, standing in the brief and in
          // its counts before anyone has clicked Accept, so the conversation is prepared from
          // everything the reviews actually support. Every other reader excludes 'proposed'
          // (20 sites, each marked SP-467), which is why the Mojo Score does not move.
          fetchAllRows<NeedRow>((from, to) =>
            supabase.from("odi_needs").select("id, desired_outcome, source_path, status")
              .eq("company_id", companyId).in("status", ["active", "proposed"]).order("id").range(from, to)),
          fetchAllRows<EvRow>((from, to) =>
            supabase.from("need_evidence").select("need_id, signal_id, bears, polarity, brand")
              .eq("company_id", companyId).order("id").range(from, to)),
        ]);
        if (cancelled) return;
        const sigIds = [...new Set(ev.map((r) => r.signal_id))];
        // In chunks, because `id=in.(…)` is a URL: 330 ids is a ~12 KB request line and the fetch
        // fails outright (measured 2026-11-19 — net::ERR_FAILED, nothing rendered). 60 ids is ~2.3 KB.
        for (let i = 0; i < sigIds.length; i += SIGNAL_ID_CHUNK) {
          const chunk = sigIds.slice(i, i + SIGNAL_ID_CHUNK);
          sigs = sigs.concat(await fetchAllRows<SigRow>((from, to) =>
            supabase.from("signals").select("id, quote, source_url, event_date").in("id", chunk).order("id").range(from, to)));
          if (cancelled) return;
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e)); setNeeds([]); setLoading(false); return;
      }
      const sigById = new Map(sigs.map((s) => [s.id, s]));
      const byNeed = new Map<string, EvRow[]>();
      for (const r of ev) (byNeed.get(r.need_id) ?? byNeed.set(r.need_id, []).get(r.need_id)!).push(r);

      const quoteOf = (r: EvRow): QuoteRow => {
        const s = sigById.get(r.signal_id);
        return {
          signalId: r.signal_id,
          quote: s?.quote ?? null,
          brand: r.brand,
          sourceUrl: s?.source_url ?? null,
          eventDate: s?.event_date ? String(s.event_date).slice(0, 10) : null,
        };
      };
      // Newest first, undated last — a stable order, so two renders read the same.
      const byDate = (a: QuoteRow, b: QuoteRow) =>
        (b.eventDate ?? "").localeCompare(a.eventDate ?? "") || a.signalId.localeCompare(b.signalId);

      const out = nRows.map((n) => {
        const rows = byNeed.get(n.id) ?? [];
        const evidence: EvidenceRow[] = rows.map((r) => {
          const q = quoteOf(r);
          return { bears: r.bears, polarity: r.polarity, brand: r.brand, eventDate: q.eventDate, sourceUrl: q.sourceUrl };
        });
        const tally = tallyNeed(evidence);
        const bearing = rows.filter((r) => r.bears);
        // `isCounted` is the counting authority — the merger rule is NOT restated here.
        const counted = bearing.filter((r) => isCounted({ brand: r.brand, eventDate: quoteOf(r).eventDate }));
        return {
          id: n.id,
          statement: String(n.desired_outcome ?? "").trim(),
          sourcePath: n.source_path,
          proposed: n.status === "proposed",
          tally,
          quotes: counted.map(quoteOf).sort(byDate),
          workingQuotes: counted.filter((r) => r.polarity === "working").map(quoteOf).sort(byDate),
        };
      });
      setNeeds(out);
      setStoredBrands([...new Set(ev.map((r) => r.brand))]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { needs, storedBrands, loading, error };
}
