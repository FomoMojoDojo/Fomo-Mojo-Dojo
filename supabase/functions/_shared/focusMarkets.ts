// FOCUS MARKETS AT ANALYSIS TIME (F-3/F-4, 2026-11-17; Proposal A, decisions 3/4/5).
//
// The operator signs an ORDERED SET of the company's live markets (operator_primary_selection, domains
// focus_market_01.., written only by public.sign_focus_markets). A file analysis reads that set ONCE,
// when its framework pass first starts, and STAMPS it on file_proposals.focus_markets — so a later
// re-sign never re-interprets an old run, and the C1/SP-278 retry of the same analysis sees the same
// focus. An empty array is the stamp of a run that ran UNFOCUSED (decision 4); NULL means the row
// predates F-3 (it also ran unfocused).
//
// The generator receives the set as a numbered list (`focus_markets`), plus `client_name`. Adjudication
// labels each customer-side card with `subject_party` (focus | company | other) and `focus_index` (the
// 1-based position in that list), and resolveFocusParty turns those into what the queue does.

type Sb = { from: (t: string) => any };

export type FocusStampEntry = {
  rank: number;
  market_definition_id: string;
  journey_key: string;
  job_executor: string;
  jtbd: string;
  signed_at: string | null;
};

export const FOCUS_INDEX_MAX = 20;

/** The `focus_markets` workflow input: one numbered line per signed market, in rank order; "" when none. */
export function focusMarketsInput(stamp: FocusStampEntry[] | null | undefined): string {
  return (stamp ?? []).map((m, i) => `${i + 1}. ${m.job_executor.trim() || m.journey_key}${m.jtbd.trim() ? ` — ${m.jtbd.trim()}` : ""}`).join("\n");
}

/** The journey the run is ABOUT: the lead focus market's, else the legacy "customer". */
export function leadJourneyKey(stamp: FocusStampEntry[] | null | undefined): string {
  return (stamp ?? [])[0]?.journey_key ?? "customer";
}

/** PURE: the signed rows + their market definitions → the stamp, in rank order. */
export function buildFocusStamp(
  rows: Array<{ domain: string; item_id: string | null; item_key: string | null; chosen_at: string | null }>,
  markets: Array<{ id: string; journey_key: string; job_executor: string | null; jtbd: string | null; retracted_at?: string | null }>,
): FocusStampEntry[] {
  const byId = new Map(markets.map((m) => [m.id, m]));
  return rows
    .filter((r) => /^focus_market_[0-9]{2}$/.test(r.domain) && r.item_id)
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .flatMap((r) => {
      const m = byId.get(String(r.item_id));
      if (!m || m.retracted_at) return []; // a market retracted since signing is not looked for
      return [{ market_definition_id: m.id, journey_key: m.journey_key, job_executor: m.job_executor ?? "", jtbd: m.jtbd ?? "", signed_at: r.chosen_at }];
    })
    .map((e, i) => ({ rank: i + 1, ...e }));
}

/** The company's SIGNED focus set as it stands now (no stamp, no write), and its name. Read failures → []. */
export async function loadSignedFocus(supabase: Sb, companyId: string): Promise<{ stamp: FocusStampEntry[]; clientName: string }> {
  let clientName = "";
  try {
    const { data: co } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
    clientName = String((co as { name?: string } | null)?.name ?? "");
  } catch { /* the name is context, not a gate */ }
  try {
    const { data: sel } = await supabase.from("operator_primary_selection")
      .select("domain, item_id, item_key, chosen_at").eq("company_id", companyId).like("domain", "focus_market_%");
    const rows = (sel ?? []) as Array<{ domain: string; item_id: string | null; item_key: string | null; chosen_at: string | null }>;
    const ids = rows.map((r) => r.item_id).filter((x): x is string => !!x);
    if (!ids.length) return { stamp: [], clientName };
    const { data: md } = await supabase.from("odi_market_definitions")
      .select("id, journey_key, job_executor, jtbd, retracted_at").eq("company_id", companyId).in("id", ids);
    return { stamp: buildFocusStamp(rows, (md ?? []) as Array<{ id: string; journey_key: string; job_executor: string | null; jtbd: string | null; retracted_at: string | null }>), clientName };
  } catch {
    return { stamp: [], clientName };
  }
}

/**
 * The run's focus: the stamp already on the row, or — on the first start — the signed set, stamped now.
 * Also the company's name for `client_name`. Never throws: a read failure is an UNFOCUSED run, said so
 * by the stamp `[]`, rather than a failed analysis.
 */
export async function focusForRun(supabase: Sb, proposalId: string, companyId: string): Promise<{ stamp: FocusStampEntry[]; clientName: string }> {
  let clientName = "";
  try {
    const { data: co } = await supabase.from("companies").select("name").eq("id", companyId).maybeSingle();
    clientName = String((co as { name?: string } | null)?.name ?? "");
  } catch { /* the name is context, not a gate */ }
  try {
    const { data: row } = await supabase.from("file_proposals").select("focus_markets").eq("id", proposalId).maybeSingle();
    const existing = (row as { focus_markets?: unknown } | null)?.focus_markets;
    if (Array.isArray(existing)) return { stamp: existing as FocusStampEntry[], clientName };
    const { data: sel } = await supabase.from("operator_primary_selection")
      .select("domain, item_id, item_key, chosen_at").eq("company_id", companyId).like("domain", "focus_market_%");
    const rows = (sel ?? []) as Array<{ domain: string; item_id: string | null; item_key: string | null; chosen_at: string | null }>;
    let markets: Array<{ id: string; journey_key: string; job_executor: string | null; jtbd: string | null; retracted_at: string | null }> = [];
    const ids = rows.map((r) => r.item_id).filter((x): x is string => !!x);
    if (ids.length) {
      const { data: md } = await supabase.from("odi_market_definitions")
        .select("id, journey_key, job_executor, jtbd, retracted_at").eq("company_id", companyId).in("id", ids);
      markets = (md ?? []) as typeof markets;
    }
    const stamp = buildFocusStamp(rows, markets);
    await supabase.from("file_proposals").update({ focus_markets: stamp }).eq("id", proposalId).is("focus_markets", null);
    return { stamp, clientName };
  } catch {
    return { stamp: [], clientName };
  }
}

export type FocusParty = "focus" | "focus_unresolved" | "company" | "other" | "unlabelled" | "unfocused";

/**
 * PURE (decisions 4/5): what the queue does with a customer-side card.
 *   unfocused run                 → "unfocused": queued as before, no party filter, no journey
 *   subject_party focus + index   → "focus" with that market's journey
 *   focus, index out of range     → "focus_unresolved": queued, no journey, flagged
 *   company                       → "company": dropped (G1's rule, now labelled)
 *   other                         → "other": counted, never queued
 *   no label at all               → "unlabelled": queued as before, flagged — a workflow version that
 *                                   does not emit subject_party (the pre-F-3 one) must never silently
 *                                   withhold every card of a focused company
 */
export function resolveFocusParty(
  stamp: FocusStampEntry[] | null | undefined,
  subjectParty: unknown,
  focusIndex: unknown,
): { party: FocusParty; journey_key: string | null } {
  const set = stamp ?? [];
  if (set.length === 0) return { party: "unfocused", journey_key: null };
  const label = String(subjectParty ?? "").trim().toLowerCase();
  if (label === "company") return { party: "company", journey_key: null };
  if (label === "focus") {
    const i = Number(focusIndex);
    if (Number.isInteger(i) && i >= 1 && i <= set.length) return { party: "focus", journey_key: set[i - 1].journey_key };
    return { party: "focus_unresolved", journey_key: null };
  }
  if (label === "other") return { party: "other", journey_key: null };
  return { party: "unlabelled", journey_key: null };
}
