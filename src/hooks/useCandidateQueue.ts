// ── THE PENDING CANDIDATE QUEUE, FOR THE WORKSPACE (SP-441 / SP-443, 2026-11-19) ──────────────────
//
// One reader for the cards the operator reviews on /preview/client-refine/workspace/inputs. It reads
// the SAME rows the admin queue reads — `surface_proposals`, status 'pending', the five candidate
// surface types — and it reuses that module's own definitions of what a candidate is and how a card
// is named (CANDIDATE_TYPES / ACCEPTABLE_TYPES / candidateHeadline). Importing them keeps ONE
// definition; the admin component itself is not touched (SP-440 forbids changing /admin/*).
//
// On top of the card it loads what the card RESTS ON, so the count the operator presses is derived
// from stored rows and never from a number written on the card (SP-447):
//   - the cited signals' VERIFIED QUOTE, page and date (`signals.quote`, SP-452 — never
//     `evidence_excerpt`, which is the page fragment and carries the byline and the page furniture);
//   - the brand `need_evidence` recorded for each of those signals. Brand is a property of the
//     SIGNAL, not of the pairing — measured 2026-11-19: 0 signals fleet-wide carry two brands.
// The SP-406 tally then comes from `tallyNeed`, the one counting authority, so a card's "3 counted
// quotes · 2 sites" is computed by the same code the Brief and the status file use.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ACCEPTABLE_TYPES, CANDIDATE_TYPES, candidateHeadline } from "@/components/admin/CandidateReviewQueue";
import { isOutsideVoiceCard } from "@/lib/outsideVoiceMark";
import { tallyNeed, type EvidenceRow, type NeedTally } from "@/lib/needEvidenceCounting";
import type { QuoteRow } from "@/lib/reviewQuote";

export type CandidateCard = {
  id: string;
  surfaceType: string;
  /** SP-433: read out of customers' own public words rather than an uploaded file. */
  outsideVoice: boolean;
  headline: string;
  voice: string;
  signalIds: string[];
  /** The cited quotes' stored rows, in the card's own order. */
  quotes: QuoteRow[];
  /** SP-406 counting over those quotes — every cited quote is a bearing quote by construction. */
  tally: NeedTally;
  canAccept: boolean;
  createdAt: string;
};

type ProposalRow = {
  id: string;
  surface_type: string;
  proposed_state: { item?: Record<string, unknown>; evidence_signal_ids?: unknown; evidence_voice?: string; origin?: string } | null;
  created_at: string;
};

const asIds = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** SP-458 / SP-467: take the materialised need out of the Brief when its card is rejected.
 *
 *  The builder is narrowed to this shape on purpose. `odi_needs` has 47 columns, and inside this file
 *  the inferred Update union pushed tsc to TS2589 ("type instantiation is excessively deep") — the
 *  same error ClientRefinePreviewWorkshopView already carries twice on this table. The column names
 *  are therefore checked by the DATABASE and by proposed-need-isolation-guard (p3), not by tsc, and
 *  the narrowing is confined to this one statement rather than loosening the client anywhere else. */
type NeedUpdate = {
  update: (patch: Record<string, unknown>) => {
    eq: (col: string, val: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
    };
  };
};
async function retractProposedNeed(proposalId: string): Promise<string | null> {
  const { error } = await (supabase.from("odi_needs") as unknown as NeedUpdate)
    .update({ status: "retracted", superseded_reason: "proposal_rejected", updated_at: new Date().toISOString() })
    .eq("source_proposal_id", proposalId)
    .eq("status", "proposed");
  return error ? error.message : null;
}

export function useCandidateQueue(companyId?: string | null) {
  const [cards, setCards] = useState<CandidateCard[]>([]);
  /** The brand values need_evidence recorded on the cited quotes (SP-455c). */
  const [storedBrands, setStoredBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) { setCards([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: e } = await supabase
      .from("surface_proposals")
      .select("id, surface_type, proposed_state, created_at")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .in("surface_type", CANDIDATE_TYPES)
      .order("created_at", { ascending: true });
    if (e) { setError(e.message); setCards([]); setLoading(false); return; }
    const rows = ((data ?? []) as unknown as ProposalRow[]);
    const ids = [...new Set(rows.flatMap((r) => asIds(r.proposed_state?.evidence_signal_ids)))];

    const byId = new Map<string, { quote: string | null; sourceUrl: string | null; eventDate: string | null }>();
    const brandBySignal = new Map<string, string>();
    if (ids.length) {
      const [{ data: sigs, error: se }, { data: ev, error: ee }] = await Promise.all([
        supabase.from("signals").select("id, quote, source_url, event_date").in("id", ids),
        supabase.from("need_evidence").select("signal_id, brand").eq("company_id", companyId).in("signal_id", ids),
      ]);
      if (se || ee) setError((se ?? ee)!.message);
      for (const s of ((sigs ?? []) as Array<{ id: string; quote: string | null; source_url: string | null; event_date: string | null }>)) {
        byId.set(s.id, {
          quote: s.quote,
          sourceUrl: s.source_url,
          // event_date is a date column; keep the 'YYYY-MM-DD' head only, so the counting rule
          // compares like with like.
          eventDate: s.event_date ? String(s.event_date).slice(0, 10) : null,
        });
      }
      for (const r of ((ev ?? []) as Array<{ signal_id: string; brand: string }>)) brandBySignal.set(r.signal_id, r.brand);
      setStoredBrands([...new Set(brandBySignal.values())]);
    } else {
      setError(null);
      setStoredBrands([]);
    }

    setCards(rows.map((r) => {
      const signalIds = asIds(r.proposed_state?.evidence_signal_ids);
      const quotes: QuoteRow[] = signalIds.map((sid) => {
        const s = byId.get(sid);
        return {
          signalId: sid,
          quote: s?.quote ?? null,
          brand: brandBySignal.get(sid) ?? "brand_not_recorded",
          sourceUrl: s?.sourceUrl ?? null,
          eventDate: s?.eventDate ?? null,
        };
      });
      const evidence: EvidenceRow[] = quotes.map((q) => ({
        bears: true, polarity: null, brand: q.brand, eventDate: q.eventDate, sourceUrl: q.sourceUrl,
      }));
      return {
        id: r.id,
        surfaceType: r.surface_type,
        outsideVoice: isOutsideVoiceCard(r.proposed_state),
        headline: candidateHeadline({ surface_type: r.surface_type, proposed_state: r.proposed_state as never }),
        voice: String(r.proposed_state?.evidence_voice ?? "unlabeled"),
        signalIds,
        quotes,
        tally: tallyNeed(evidence),
        canAccept: ACCEPTABLE_TYPES.has(r.surface_type),
        createdAt: r.created_at,
      };
    }));
    setLoading(false);
  }, [companyId]);

  useEffect(() => { void load(); }, [load]);

  /** The one accept path (SP-327): public.accept_candidate_proposal(), admin-only, one row per click. */
  const accept = useCallback(async (id: string) => {
    const { error: e } = await supabase.rpc("accept_candidate_proposal" as never, { p_proposal_id: id } as never);
    if (e) throw new Error(e.message);
    await load();
  }, [load]);

  /** SP-444: Reject MARKS the proposal rejected and keeps the row. Nothing is deleted; the card
   *  leaves the pending group because the group reads status='pending'.
   *
   *  SP-458 / SP-467 (2026-11-20): when the card's evidence met the bar, the standing loader rule has
   *  already materialised an odi_needs row for it, and that row is what the Brief counts. Rejecting
   *  the card must therefore take the need out of the Brief as well — otherwise the only surface that
   *  shows it is the one surface a Reject cannot reach. The row is RETRACTED, not deleted: SP-444's
   *  rule is that the record of what was proposed survives the decision, and `superseded_reason`
   *  names the decision that moved it. Only a 'proposed' row is touched, so an ACCEPTED need (already
   *  promoted to 'active') can never be retracted by a later click on its old card. */
  const reject = useCallback(async (id: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase
      .from("surface_proposals")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: auth?.user?.id ?? null })
      .eq("id", id)
      .eq("status", "pending");
    if (e) throw new Error(e.message);
    const ne = await retractProposedNeed(id);
    if (ne) throw new Error(ne);
    await load();
  }, [load]);

  return { cards, loading, error, storedBrands, reload: load, accept, reject };
}
