// ── Public-read INPUT POOL (operator ruling 5, 2026-09-18; shared with the bet writer per the 2026-09-18 wall brief)
//
// The ONE gather of what a public synthesis may read. Moved here from generate-public-read/index.ts byte-for-byte
// (queries, caps, selectors); generate-public-read and frontierFinding import it — never copy it. Every query's
// predicate selects public provenance ONLY; the selectors (publicReadSelection.ts) admit, dedupe, order and cap.
//   S  signals: outside band ∧ PUBLIC_SIGNAL_VOICES ∧ live (superseded_at/held_at NULL) ∧ page-shaped ∧ not junk ∧ not listing
//   O  own_words_candidates with an ACTIVE own_words claim, one per identity
//   F  findings: register public_inferred ∧ status open ∧ recurrence-backed (opts.excludeFindingKinds drops e.g. 'frontier')
//   D  claim_deltas public_vs_public echoed|divergent ∧ isPairAdmissible ∧ every claim active
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { declaredEligibleFor, parseOwnWordsKind } from "./ownWordsKinds.ts";
import { selectDeltas, selectFindings, selectOwnWords, selectSignals, signalText, type Dropped, type SelClaim, type SelDelta, type SelFinding, type SelOwnWord, type SelSignal } from "./publicReadSelection.ts";

export const PUBLIC_SIGNAL_VOICES = ["outside_voice_about_client", "client_voice", "market_context", "competitor_voice"];

export type InputRow = {
  id: string; kind: string; provenance: string; text: string;
  // Source metadata — used ONLY to DERIVE the offering read's seen_on / source_count / date range in
  // code (the model never claims these). source_url → domain; event_date → the item's date range;
  // own_site is true for own-words (the company's own public site by construction) or when the domain
  // matches the company's own host. Absent (findings/deltas are syntheses with no single source).
  source_url?: string | null; event_date?: string | null; own_site?: boolean;
};

// Per-kind read caps. A 3-sentence public read needs a tractable, prioritized catalogue — a model
// cannot reliably cite from hundreds of id-tagged rows (it invents ref numbers). The input_ledger
// records EXACTLY the capped set that was read (honest — "these ids, not the whole corpus"). Findings
// (public synthesis) and own-words (the company's own voice) are the highest-signal, so they get the
// widest caps; signals/deltas are sampled. Every capped row is still 100% public-provenance.
export const READ_CAP: Record<string, number> = { finding: 25, own_word: 25, signal: 20, delta: 15 };

// ── gather PUBLIC inputs — each query's predicate selects public provenance ONLY ──────────────────
// Ruling 5 (signed 2026-09-18): the queries below are unchanged in WHAT they may read; the SELECTION of which
// rows enter (admission, dedupe, order, breadth, caps) is the ONE helper selectPublicInputs, built on the
// preview's own authorities (publicReadSelection.ts). The ledger records the selection version.
export type Gathered = { inputs: InputRow[]; dropped: Dropped[] };

export async function selectPublicInputs(supabase: SupabaseClient, companyId: string, opts: { excludeFindingKinds?: readonly string[] } = {}): Promise<Gathered> {
  const rows: InputRow[] = [];
  const dropped: Dropped[] = [];

  // 1. outside signals — outside band AND a PUBLIC web voice (analysis/NULL voice = our own read, excluded).
  //    LIVE-ONLY (Gate 6a, 2026-08-26): superseded_at IS NULL AND held_at IS NULL — a hypothesis must not
  //    rest on evidence that is terminally gone (fabricated / redesigned-away / source_gone) OR merely
  //    held/recrawl-pending (unverified). Generation is STRICTER than the render overlay by design: the
  //    render marks provisional citations, but the "Our read" seeds posits ONLY from live public evidence.
  //    Ruling 5: then page-shaped ∧ not junk ∧ not listing; dedupe; the preview's beat-2 order; breadth per host.
  const { data: sig } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, source_title, source_url, event_date, topic, created_at, confidence_to_use, evidence_class, voice_class, raw_payload")
    .eq("company_id", companyId).eq("signal_band", "outside")
    .in("voice_class", PUBLIC_SIGNAL_VOICES).is("superseded_at", null).is("held_at", null)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  // R4 strength — recurrence-confirmed signal ids, the SAME query the preview's beat 2 runs (accepted verdicts).
  const confirmed = new Set<string>();
  for (let from = 0;; from += 1000) {
    const { data: rv } = await supabase.from("signal_recurrence_verdicts").select("signal_a_id, signal_b_id").eq("company_id", companyId).eq("verdict", "accepted").order("id", { ascending: true }).range(from, from + 999);
    for (const r of (rv ?? []) as Array<{ signal_a_id: string; signal_b_id: string }>) { confirmed.add(r.signal_a_id); confirmed.add(r.signal_b_id); }
    if (!rv || rv.length < 1000) break;
  }
  const sigSel = selectSignals((sig ?? []) as SelSignal[], READ_CAP.signal, confirmed);
  dropped.push(...sigSel.dropped);
  for (const s of sigSel.kept) {
    const text = signalText(s);
    rows.push({ id: s.id, kind: "signal", provenance: "public_observed", text: `${text}${s.source_title ? ` (${s.source_title})` : ""}`, source_url: s.source_url, event_date: s.event_date });
  }

  // 2. own-words — the company's OWN public-site voice, judge-kept only. own_site=true by construction
  //    (own-words ARE judge-kept quotes from the company's own public site — the seen_on "own site" set).
  //    Ruling 5: only identities with an ACTIVE own_words claim, one per identity, ORDER BY created_at, id.
  const { data: ow } = await supabase
    .from("own_words_candidates").select("id, quote, judge_kind, content_identity, created_at, source_url").eq("company_id", companyId).eq("judge_keep", true)
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  const { data: owClaims } = await supabase.from("claims").select("raw_payload").eq("company_id", companyId).eq("claim_type", "own_words").eq("status", "active");
  const activeIdentities = new Set(((owClaims ?? []) as Array<{ raw_payload?: { content_identity?: string } }>).map((c) => c.raw_payload?.content_identity).filter((x): x is string => !!x));
  // ADMISSION CRITERION (2026-09-03): only declared-eligible kinds seed posits (a missing kind is eligible).
  const owSel = selectOwnWords((ow ?? []) as SelOwnWord[], READ_CAP.own_word, activeIdentities, (w) => declaredEligibleFor(parseOwnWordsKind(w.judge_kind)));
  dropped.push(...owSel.dropped);
  // source_url carried so the offering's own-host test can see WHERE the words were said (a registry-hosted
  // own_word is not the company's own site — rule 2026-09-18); the own_site flag is no longer trusted downstream.
  for (const w of owSel.kept) rows.push({ id: w.id, kind: "own_word", provenance: "public_observed", text: (w.quote ?? "").trim(), source_url: (w as { source_url?: string | null }).source_url ?? null, own_site: true });

  // 3. findings — the public_inferred register, open, AND RECURRENCE-BACKED (Gate 6a, 2026-08-26):
  //    only findings with a Gate-5c finding_recurrence row (entity-anchored, IDF-coherent, judge-anchored,
  //    corroborated across ≥2 independent public sources) seed posits. Single-source open findings are
  //    unverified across the record and do NOT seed a hypothesis — the 5c coherence work IS this gate.
  //    Ruling 5: ORDER BY created_at, id.
  const { data: recRows } = await supabase
    .from("finding_recurrence").select("finding_id").eq("company_id", companyId);
  const recurrenceBacked = new Set(((recRows ?? []) as Array<{ finding_id: string }>).map((r) => r.finding_id));
  const { data: fnd } = await supabase
    .from("findings").select("id, body, created_at, kind").eq("company_id", companyId).eq("register", "public_inferred").eq("status", "open")
    .order("created_at", { ascending: true }).order("id", { ascending: true });
  // wall brief 2026-09-18: a caller may exclude finding kinds — the bet writer excludes 'frontier' so a bet never feeds itself
  const excludedKinds = new Set(opts.excludeFindingKinds ?? []);
  for (const f of ((fnd ?? []) as Array<SelFinding & { kind?: string | null }>).filter((f) => excludedKinds.has(String(f.kind ?? "")))) dropped.push({ id: f.id, kind: "finding", reason: `kind_excluded:${f.kind}` });
  const fSel = selectFindings(((fnd ?? []) as Array<SelFinding & { kind?: string | null }>).filter((f) => !excludedKinds.has(String(f.kind ?? ""))), READ_CAP.finding, recurrenceBacked);
  dropped.push(...fSel.dropped);
  for (const f of fSel.kept) rows.push({ id: f.id, kind: "finding", provenance: "public_inferred", text: (f.body ?? "").trim() });

  // 4. (REMOVED — Stage B Option-B, 2026-08-28) odi_market_definitions is a STRUCTURALLY FORBIDDEN
  //    input for this generator. Stage A proved the table holds ZERO public_research rows across the
  //    portfolio (every market is internal_declared / internal_hypothesis — the internal Where-to-Play
  //    register), so the old provenance_type='public_research' filter was a false-safety over an
  //    all-internal table. The public cascade's Where-to-Play is read from the public record itself
  //    (signals / findings / own-words / the positioning read), never from the markets table. This
  //    generator now queries NO forbidden table (proven by the source-level forbidden-input test).

  // 5. deltas — the public_vs_public pairing; echoed/divergent (public confirms or contests a public claim)
  //    Ruling 5: isPairAdmissible ∧ every claim active ∧ not rejected_pairing; the gap beat's order, then id.
  const { data: dl } = await supabase
    .from("claim_deltas").select("id, delta_type, declared_claim_id, public_claim_id, relevance_verdict, observed_own_host, operator_disposition")
    .eq("company_id", companyId).eq("pairing_kind", "public_vs_public").in("delta_type", ["echoed", "divergent"])
    .order("id", { ascending: true });
  const deltas = (dl ?? []) as SelDelta[];
  const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
  const claimById = new Map<string, SelClaim>();
  if (claimIds.length) {
    const { data: cl } = await supabase.from("claims").select("id, statement, status, confidence").in("id", claimIds);
    for (const c of (cl ?? []) as SelClaim[]) claimById.set(c.id, { ...c, statement: c.statement?.trim() ?? null });
  }
  const dSel = selectDeltas(deltas, READ_CAP.delta, claimById);
  dropped.push(...dSel.dropped);
  for (const d of dSel.kept) {
    const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id)?.statement : "";
    const pub = d.public_claim_id ? claimById.get(d.public_claim_id)?.statement : "";
    rows.push({ id: d.id, kind: "delta", provenance: "public_observed", text: `[${d.delta_type}] declared: "${decl ?? ""}" · public: "${pub ?? ""}"` });
  }

  return { inputs: rows, dropped };
}

