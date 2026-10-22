// ── PAGE-WORDS PAIRING (operator brief 2026-10-22): the say-and-see comparison on page-word claims only ────────────
//
// R5 says only verified page words source a specific; claim_text may be our summary; held and struck rows never count.
// The public_vs_public gap paired claims by their refs' VOICE and HOST, never by whether the rows behind them carry the
// page's words — so a claim backed only by a model summary (Spectrum's run-81 rows, basis none, now blanked) or by a held
// page could be the record side of an echo. With page_words_only, both sides are admitted only on page words:
//
//   YOU side    an active, declared-eligible own_words claim, verbatim (raw_payload.fidelity), read from an OWN host (seed or
//               a confirmed related entity, isOwnDomainUrl), with a judge-kept own_words_candidates row of the same content
//               identity (the crawl slice) — and no backing signal (its refs, or the candidate's page signal) held or
//               superseded.
//   RECORD side every backing signal (claim_signal_refs) is live (not held, not superseded), carries a non-empty excerpt,
//               and that excerpt is verified page words (R5: excerptIsVerifiedPageWords, incl. a passed verification of
//               the current excerpt). One summary-only or held backing row is enough to refuse the claim: its statement
//               may be drawn from that row.
//
// OPT-IN, not the default: a default flip changes what every company's next public finalize produces, and its stale sweep
// would delete their existing pairs. That is a ruling of its own. Pure decision + one loader, so a test can call it.
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import type { OwnHostSet } from "./ownHosts.ts";
import { annotateVerifiedExcerpts, excerptIsVerifiedPageWords, ROW_TEXT_COLUMNS } from "./classSourcingScope.ts";

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export type PageWordsSignal = {
  id: string; held: boolean; superseded: boolean; excerpt: string; verified: boolean;
};
export type PageWordsOwnWordsRow = { content_identity: string; judge_keep: boolean | null; signal_id: string | null };
export type PageWordsDeclared = { id: string; page_url?: string | null; content_identity?: string | null; fidelity?: string | null };

export type PageWordsDecision = {
  declaredOk: Set<string>;
  observedOk: Set<string>;
  /** per-claim refusal reason (first rule that refused it) */
  reasons: Map<string, string>;
  counts: { declared_admitted: number; declared_refused: Record<string, number>; observed_admitted: number; observed_refused: Record<string, number> };
};

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

/** Pure: which declared (own-words) and observed claims carry page words. */
export function decidePageWords(args: {
  declared: readonly PageWordsDeclared[];
  observed: readonly { id: string }[];
  refsByClaim: ReadonlyMap<string, readonly string[]>;
  signals: ReadonlyMap<string, PageWordsSignal>;
  ownWordsByIdentity: ReadonlyMap<string, PageWordsOwnWordsRow>;
  ownHosts: string | OwnHostSet | null;
}): PageWordsDecision {
  const declaredOk = new Set<string>(), observedOk = new Set<string>(), reasons = new Map<string, string>();
  const counts = { declared_admitted: 0, declared_refused: {} as Record<string, number>, observed_admitted: 0, observed_refused: {} as Record<string, number> };
  const liveSig = (id: string | null | undefined) => {
    if (!id) return true;
    const s = args.signals.get(id);
    return !s || (!s.held && !s.superseded);   // an unknown id is not a held row; it simply adds no page words
  };
  for (const d of args.declared) {
    let why = "";
    const ow = d.content_identity ? args.ownWordsByIdentity.get(d.content_identity) : undefined;
    if (d.fidelity !== "verbatim") why = "not_verbatim";
    else if (!d.page_url || !args.ownHosts || !isOwnDomainUrl(d.page_url, args.ownHosts)) why = "not_own_host";
    else if (!ow || ow.judge_keep !== true) why = "no_kept_own_words_row";
    else if (!(args.refsByClaim.get(d.id) ?? []).every(liveSig) || !liveSig(ow.signal_id)) why = "backing_held";
    if (why) { reasons.set(d.id, why); bump(counts.declared_refused, why); } else { declaredOk.add(d.id); counts.declared_admitted++; }
  }
  for (const p of args.observed) {
    let why = "";
    const refs = args.refsByClaim.get(p.id) ?? [];
    const sigs = refs.map((r) => args.signals.get(r));
    if (refs.length === 0 || sigs.some((s) => !s)) why = "unbacked";
    else if (sigs.some((s) => s!.held || s!.superseded)) why = "backing_held";
    else if (sigs.some((s) => !s!.excerpt.trim())) why = "backing_blank";
    else if (sigs.some((s) => !s!.verified)) why = "backing_unverified";
    if (why) { reasons.set(p.id, why); bump(counts.observed_refused, why); } else { observedOk.add(p.id); counts.observed_admitted++; }
  }
  return { declaredOk, observedOk, reasons, counts };
}

/** Live: load the company's signals (R5-annotated) and own-words rows, then decide. */
export async function loadPageWordsDecision(supabase: AnySupabase, args: {
  companyId: string;
  declared: readonly PageWordsDeclared[];
  observed: readonly { id: string }[];
  refs: readonly { claim_id: string; signal_id: string }[];
  ownHosts: string | OwnHostSet | null;
}): Promise<PageWordsDecision> {
  const col = ROW_TEXT_COLUMNS.signal[0];
  const { data: sRows, error: sErr } = await supabase.from("signals")
    .select(`id, held_at, superseded_at, ${col}, raw_payload`).eq("company_id", args.companyId);
  if (sErr) throw new Error(`page-words: signals read failed: ${sErr.message}`);
  const rows = (sRows ?? []) as Array<Record<string, unknown>>;
  await annotateVerifiedExcerpts(supabase, rows);
  const signals = new Map<string, PageWordsSignal>(rows.map((r) => [String(r.id), {
    id: String(r.id), held: r.held_at != null, superseded: r.superseded_at != null,
    excerpt: String(r[col] ?? ""), verified: excerptIsVerifiedPageWords(r),
  }]));
  const { data: oRows, error: oErr } = await supabase.from("own_words_candidates")
    .select("content_identity, judge_keep, signal_id").eq("company_id", args.companyId);
  if (oErr) throw new Error(`page-words: own_words_candidates read failed: ${oErr.message}`);
  const ownWordsByIdentity = new Map<string, PageWordsOwnWordsRow>();
  for (const o of (oRows ?? []) as PageWordsOwnWordsRow[]) {
    const prev = ownWordsByIdentity.get(o.content_identity);
    if (!prev || (o.judge_keep === true && prev.judge_keep !== true)) ownWordsByIdentity.set(o.content_identity, o);
  }
  const refsByClaim = new Map<string, string[]>();
  for (const r of args.refs) { const l = refsByClaim.get(r.claim_id); if (l) l.push(r.signal_id); else refsByClaim.set(r.claim_id, [r.signal_id]); }
  return decidePageWords({ declared: args.declared, observed: args.observed, refsByClaim, signals, ownWordsByIdentity, ownHosts: args.ownHosts });
}
