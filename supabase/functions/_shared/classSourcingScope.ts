// ── SOURCING SCOPE — the (b) check searches the whole live record, not only the pool ──────────────
//
// Operator ruling, signed 2026-10-08. The class fact-check sources a specific against the rows a
// field CITES, and those come from the capped pool: 20 signals of ~200 live candidates, 25 own-words
// of 280. On the 2026-10-08 Edgewood run that cost a true claim: "over 90% of kinship youth remained
// in family settings" is in the record TWICE (signals 272f25cf, dfb6da68) and "recognized nationally"
// is in the own-words corpus (1b775321) — and none of the three survived the per-host breadth and the
// cap. The gate refused a claim the record plainly carries, because the pool is not the record.
//
// So: POOL FIRST, then the live record. A row found this way is not a silent justification — it is
// ADMITTED to the read's ledger as a cited row with its class, and appended to the field's citations,
// so the stored read cites what actually sourced it and every downstream guard sees it. A miss stays
// a miss: nothing is invented, and a specific no row carries still goes to the judge.
//
// NARROWING I HAD TO CHOOSE, and why. The ruling says "the company's live signals (class record or
// you …)" with no band restriction. This module restricts to signal_band='outside' anyway, because
// an 'organization'-band row is INTERNAL provenance: admitting one to a public read's ledger would
// put a non-public id in input_ledger.provenances and citationsLivePublic (guard 4) would refuse the
// whole kind — the public-only invariant of this generator outranks a wider search. Every row this
// module can admit is therefore public_observed, exactly like a pool row.
import { extractSpecifics, specificIsSourced, type Specific } from "./classFactCheck.ts";
import { isAnalysisRow } from "./voiceLabel.ts";

export type SourcingClass = "record" | "you";
export type SourcingRow = { id: string; kind: "signal" | "own_word"; text: string; cls: SourcingClass };
export type SourcingSearch = {
  /** every candidate row considered, for the report */
  searched: { signals: number; own_words: number };
  /** the rows that carried at least one specific, in the order they were first needed */
  hits: SourcingRow[];
  /** specific token → the row that carried it */
  bySpecific: Map<string, SourcingRow>;
};

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** The class of a live signal, by the standing rule: the analysis mark FIRST, then the voice label.
 *  An analysis row is OUR read and can never be sourcing evidence, so it is dropped, not classed. */
function sourcingClassOfSignal(s: { voice_class?: string | null; raw_payload?: unknown }): SourcingClass | null {
  if (isAnalysisRow(s)) return null;
  return s.voice_class === "client_voice" ? "you" : "record";
}

/**
 * Search the company's LIVE record for rows carrying any of `specifics`.
 *
 * QUERIES (both scoped to the company, both live-only):
 *   signals  .eq(company_id).eq(signal_band,'outside').is(superseded_at,null).is(held_at,null)
 *            then isAnalysisRow dropped, class by voice_class
 *   own_words_candidates .eq(company_id).eq(judge_keep,true), kept only where the row's
 *            content_identity has an ACTIVE own_words claim — the same authority the pool's O lane
 *            uses, so a quote the pool would refuse is not admitted here by a side door.
 *
 * `alreadyCited` holds the ids the field already cites, so a row that failed to source in the pool
 * pass is never re-offered as if it were new.
 */
export async function searchLiveRecordForSpecifics(
  supabase: AnySupabase,
  companyId: string,
  specifics: readonly Specific[],
  alreadyCited: ReadonlySet<string>,
): Promise<SourcingSearch> {
  const out: SourcingSearch = { searched: { signals: 0, own_words: 0 }, hits: [], bySpecific: new Map() };
  if (specifics.length === 0) return out;

  const { data: sigRows } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, voice_class, raw_payload")
    .eq("company_id", companyId).eq("signal_band", "outside")
    .is("superseded_at", null).is("held_at", null);
  const candidates: SourcingRow[] = [];
  for (const r of ((sigRows ?? []) as Array<{ id: string; claim_text: string | null; evidence_excerpt: string | null; voice_class: string | null; raw_payload?: unknown }>)) {
    out.searched.signals++;
    const cls = sourcingClassOfSignal(r);
    if (!cls || alreadyCited.has(r.id)) continue;
    const text = `${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}`.trim();
    if (text) candidates.push({ id: r.id, kind: "signal", text, cls });
  }

  const { data: owClaims } = await supabase
    .from("claims").select("raw_payload").eq("company_id", companyId).eq("claim_type", "own_words").eq("status", "active");
  const activeIdentities = new Set(
    ((owClaims ?? []) as Array<{ raw_payload?: { content_identity?: string } }>)
      .map((c) => c.raw_payload?.content_identity).filter((x): x is string => !!x),
  );
  const { data: owRows } = await supabase
    .from("own_words_candidates").select("id, quote, content_identity").eq("company_id", companyId).eq("judge_keep", true);
  for (const r of ((owRows ?? []) as Array<{ id: string; quote: string | null; content_identity: string | null }>)) {
    out.searched.own_words++;
    if (!r.content_identity || !activeIdentities.has(r.content_identity)) continue;
    if (alreadyCited.has(r.id)) continue;
    const text = (r.quote ?? "").trim();
    if (text) candidates.push({ id: r.id, kind: "own_word", text, cls: "you" });
  }

  // first match wins, in candidate order: a deterministic pick, and at most one new row per specific
  for (const sp of specifics) {
    const hit = candidates.find((c) => specificIsSourced(sp, [c.text]));
    if (!hit) continue;
    out.bySpecific.set(sp.token, hit);
    if (!out.hits.some((h) => h.id === hit.id)) out.hits.push(hit);
  }
  return out;
}

/**
 * Does ANY of OUR OWN rows carry this specific? Analysis signals and open findings — the rows that
 * are never sourcing evidence, because our read cannot source itself. Used only to tell two very
 * different failures apart (ruling 2026-10-08):
 *   carried by one of ours  → the claim is OURS to hedge; the judge decides whether we hedged it.
 *   carried by nothing      → UNSUPPORTED. There is nothing to cite and nothing to hedge, and the
 *                             field refuses at stage without a judgment.
 */
export async function specificsCarriedByOurOwnRows(
  supabase: AnySupabase,
  companyId: string,
  specifics: readonly Specific[],
): Promise<Set<string>> {
  const out = new Set<string>();
  if (specifics.length === 0) return out;
  const [sg, fd] = await Promise.all([
    supabase.from("signals").select("id, claim_text, evidence_excerpt, voice_class, raw_payload")
      .eq("company_id", companyId).is("superseded_at", null).is("held_at", null),
    supabase.from("findings").select("id, body").eq("company_id", companyId).eq("status", "open"),
  ]);
  const texts: string[] = [];
  for (const r of ((sg.data ?? []) as Array<{ claim_text: string | null; evidence_excerpt: string | null; voice_class: string | null; raw_payload?: unknown }>)) {
    if (!isAnalysisRow(r)) continue;                       // ours ONLY — the rest is sourcing evidence
    texts.push(`${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}`.trim());
  }
  for (const r of ((fd.data ?? []) as Array<{ body: string | null }>)) texts.push(r.body ?? "");
  for (const sp of specifics) if (texts.some((t) => specificIsSourced(sp, [t]))) out.add(sp.token);
  return out;
}

/** The specifics of a field text that a decision left unsourced — the search input. */
export function unsourcedSpecificsOf(text: string, unsourcedTokens: readonly string[]): Specific[] {
  const want = new Set(unsourcedTokens);
  return extractSpecifics(text).filter((s) => want.has(s.token));
}
