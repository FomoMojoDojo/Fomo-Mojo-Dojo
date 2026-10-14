// ── Public-read INPUT POOL (operator ruling 5, 2026-09-18; shared with the bet writer per the 2026-09-18 wall brief)
//
// The ONE gather of what a public synthesis may read. Moved here from generate-public-read/index.ts byte-for-byte
// (queries, caps, selectors); generate-public-read and frontierFinding import it — never copy it. Every query's
// predicate selects public provenance ONLY; the selectors (publicReadSelection.ts) admit, dedupe, order and cap.
//   S  signals: outside band ∧ PUBLIC_SIGNAL_VOICES ∧ live (superseded_at/held_at NULL) ∧ page-shaped ∧ not junk ∧ not listing
//      (1a-4, 2026-10-07: 'analysis' JOINED PUBLIC_SIGNAL_VOICES — our read belongs in the base, LABELLED as ours.
//      An analysis row is never page-shaped by construction (voiceLabel.isPageShapedRow refuses it), so selectSignals
//      admits it past that ONE gate; junk, listing, dedupe, order, breadth and the cap are unchanged.)
//   O  own_words_candidates with an ACTIVE own_words claim, one per identity
//   F  findings: register public_inferred ∧ status open ∧ recurrence-backed (opts.excludeFindingKinds drops e.g. 'frontier')
//   D  claim_deltas public_vs_public echoed|divergent ∧ isPairAdmissible ∧ every claim active
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPublicSignalSourceType } from "./clientMaterial.ts";
import { declaredEligibleFor, parseOwnWordsKind } from "./ownWordsKinds.ts";
import { isAnalysisRow } from "./voiceLabel.ts";
import { selectDeltas, selectFindings, selectOwnWords, selectSignals, type Dropped, type SelClaim, type SelDelta, type SelFinding, type SelOwnWord, type SelSignal } from "./publicReadSelection.ts";
// R1: the ONE row-text assembly. Imported rather than re-stated so the pool and the drift re-read
// cannot drift apart again — that divergence IS defect A.
import { rowTextOf } from "./classSourcingScope.ts";
// P1 (2026-10-14): the predecessor's citations are read with the SAME walker C1 uses, so "what the
// current read cites" means one thing in both places.
import { linesOfStoredPayload } from "./citedLines.ts";

export const PUBLIC_SIGNAL_VOICES = ["outside_voice_about_client", "client_voice", "market_context", "competitor_voice", "analysis"];

// ── SOURCE CLASS (operator ruling 1a-4, signed 2026-10-07) ───────────────────────────────────────
// Three classes on every pool row, so a generated line can be held to what its inputs license:
//   record    the outside record — outside voices, filings, registries
//   you       the company's own site and own words
//   our_read  OUR analysis of the record — analysis rows, findings, frontier rows
// The stamp is isAnalysisRow (label OR raw_payload.source_type OR the hypothesis shape), tested
// BEFORE voice_class: the label alone under-counts (the pre-D1 rows carry the marker without it, and
// six live Cafe Barra rows are analysis by shape while stamped client_voice).
export type SourceClass = "record" | "you" | "our_read";

// WEAKEST WINS (ruling 2A-ii): a line may assert only as much as the SOFTEST class it cites. One
// record citation can therefore never launder the analysis cited beside it.
const CLASS_RANK: Record<SourceClass, number> = { our_read: 0, you: 1, record: 2 };

/** The class a generated line INHERITS from the refs it cites — the weakest among them. null when it
 *  cites nothing: an uncited field has no class and must be empty (the cited-or-omitted rule). */
export function inheritedClass(refs: readonly string[], classByRef: ReadonlyMap<string, SourceClass>): SourceClass | null {
  const cs = refs.map((r) => classByRef.get(r)).filter((c): c is SourceClass => !!c);
  if (cs.length === 0) return null;
  return cs.reduce((a, b) => (CLASS_RANK[b] < CLASS_RANK[a] ? b : a));
}

/** True when `a` asserts more than `b` allows — the slot check's comparison. */
export function classStrongerThan(a: SourceClass, b: SourceClass): boolean {
  return CLASS_RANK[a] > CLASS_RANK[b];
}

/** A signal's class: the analysis mark wins over every voice test (voiceLabel ruling S1). */
export function classOfSignal(s: { voice_class?: string | null; raw_payload?: unknown }): SourceClass {
  if (isAnalysisRow(s)) return "our_read";
  return s.voice_class === "client_voice" ? "you" : "record";
}

/** A delta's class. The pair's assertion rests on its PUBLIC side (the record speaking); the declared
 *  side is quoted, not asserted. Either side resting on an analysis-cited claim makes the pair ours. */
export function classOfDelta(
  d: { declared_claim_id?: string | null; public_claim_id?: string | null },
  analysisClaimIds: ReadonlySet<string>,
): SourceClass {
  if ((d.declared_claim_id && analysisClaimIds.has(d.declared_claim_id)) ||
      (d.public_claim_id && analysisClaimIds.has(d.public_claim_id))) return "our_read";
  return "record";
}

export type InputRow = {
  id: string; kind: string; provenance: string; text: string;
  /** 1a-4: REQUIRED, so a lane cannot forget it — the compiler refuses an unstamped row. */
  source_class: SourceClass;
  // Source metadata — used ONLY to DERIVE the offering read's seen_on / source_count / date range in
  // code (the model never claims these). source_url → domain; event_date → the item's date range;
  // own_site is true for own-words (the company's own public site by construction) or when the domain
  // matches the company's own host. Absent (findings/deltas are syntheses with no single source).
  source_url?: string | null; event_date?: string | null; own_site?: boolean;
  /** R1 (2026-10-14): WHERE the row was found, carried beside the text instead of inside it. The
   *  catalogue renders it as an attribute of the line; no span is ever cut from it. */
  source_title?: string | null;
  /** P1 (2026-10-14): `predecessor_cited` when this row was admitted because the CURRENT read cites
   *  it, ahead of the cap. Absent for every row the ordinary selection admitted. */
  admitted_by?: string;
};

// Per-kind read caps. A 3-sentence public read needs a tractable, prioritized catalogue — a model
// cannot reliably cite from hundreds of id-tagged rows (it invents ref numbers). The input_ledger
// records EXACTLY the capped set that was read (honest — "these ids, not the whole corpus"). Findings
// (public synthesis) and own-words (the company's own voice) are the highest-signal, so they get the
// widest caps; signals/deltas are sampled. Every capped row is still 100% public-provenance.
export const READ_CAP: Record<string, number> = { finding: 25, own_word: 25, signal: 20, delta: 15 };

// ── P1 (operator ruling, 2026-10-14): THE PREDECESSOR'S CITATIONS ARE ADMITTED BEFORE THE CAP ────
//
// WHY. Wasabi's regenerated positioning lost its FedRAMP and AI-product differentiators, and the
// discard (audit 10228) found the cause in the cap, not the model: READ_CAP.signal = 20 dropped 65
// of 91 eligible signals, and EVERY row carrying FedRAMP, Wasabi Fire or AiR was in that 65 —
// cc5707ad, 2242bdd1, c93c7c2d, 9373abfc, all class record, all live, all over_cap. The model could
// not continue a line whose evidence it was never shown, and C1 then licensed the loss because the
// line's sources had left the pool. The cap was silently deciding what the read may keep.
//
// WHAT. Before the cap runs, the rows the CURRENT read cites are admitted on their own budget. They
// are the evidence the read already rests on, so a regeneration that cannot see them is not a
// regeneration — it is a different read that happens to replace one.
//
// EVERY ADMISSION LAW STILL APPLIES. These rows go through selectSignals / selectOwnWords exactly as
// the rest do — W1's allowlist and the band/voice/liveness predicates upstream, then empty_text,
// page-shaped-or-analysis, channel_junk, listing, the dedupe and the order. P1 changes WHEN a cited
// row meets the cap, never WHETHER the laws apply to it. Measured over all 22 companies: 64 rows
// admitted fleet-wide, largest single growth 9 (FomoMojoDojo, ~419 prompt tokens), no company
// reaching the budget.
//
// FINDINGS STAY OUT. A finding enters the pool only when it is recurrence-backed, and that rule is
// about whether our synthesis is corroborated — it is not a cap. Admitting a cited finding here
// would route around it. 32 cited findings across the fleet stay excluded, and 16 cited deltas: a
// delta is not a row P1 admits either.
export const PREDECESSOR_CITED_CAP = 12;
export const PREDECESSOR_CITED_REASON = "predecessor_cited" as const;

// ── gather PUBLIC inputs — each query's predicate selects public provenance ONLY ──────────────────
// Ruling 5 (signed 2026-09-18): the queries below are unchanged in WHAT they may read; the SELECTION of which
// rows enter (admission, dedupe, order, breadth, caps) is the ONE helper selectPublicInputs, built on the
// preview's own authorities (publicReadSelection.ts). The ledger records the selection version.
export type Gathered = { inputs: InputRow[]; dropped: Dropped[] };

export async function selectPublicInputs(supabase: SupabaseClient, companyId: string, opts: { excludeFindingKinds?: readonly string[]; predecessorKind?: string } = {}): Promise<Gathered> {
  const rows: InputRow[] = [];
  const dropped: Dropped[] = [];

  // ── P1: what the CURRENT read of this kind cites. Read with linesOfStoredPayload — the same walker
  //    C1 uses — so "cited" means the same thing to the selection and to the continuity check.
  //    `predecessorKind` is optional: a caller with no kind (the bet writer) gets today's behaviour
  //    exactly, because there is no predecessor to protect.
  const predecessorCited = new Set<string>();
  if (opts.predecessorKind) {
    const { data: predRow } = await supabase.from("public_reads")
      .select("payload").eq("company_id", companyId).eq("kind", opts.predecessorKind).eq("is_current", true).maybeSingle();
    for (const l of linesOfStoredPayload((predRow as { payload?: Record<string, unknown> } | null)?.payload ?? null)) {
      for (const r of l.refs) predecessorCited.add(r);
    }
  }
  /** P1's shared budget across signals and own_words, spent signals-first: the cap is what starves
   *  signals (65 of 91 on Wasabi), and own_words are capped at 25 against far fewer rows. */
  let p1Budget = predecessorCited.size > 0 ? PREDECESSOR_CITED_CAP : 0;

  // 1. outside signals — outside band AND a PUBLIC web voice (analysis/NULL voice = our own read, excluded).
  //    LIVE-ONLY (Gate 6a, 2026-08-26): superseded_at IS NULL AND held_at IS NULL — a hypothesis must not
  //    rest on evidence that is terminally gone (fabricated / redesigned-away / source_gone) OR merely
  //    held/recrawl-pending (unverified). Generation is STRICTER than the render overlay by design: the
  //    render marks provisional citations, but the "Our read" seeds posits ONLY from live public evidence.
  //    Ruling 5: then page-shaped ∧ not junk ∧ not listing; dedupe; the preview's beat-2 order; breadth per host.
  const { data: sig } = await supabase
    .from("signals")
    .select("id, claim_text, evidence_excerpt, source_title, source_url, event_date, topic, created_at, confidence_to_use, evidence_class, voice_class, raw_payload, source_type")
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
  // W1 (operator ruling, 2026-10-13): client-provided material never enters a public read. The one
  // predicate lives in clientMaterial.ts and liveRecordCandidates applies the SAME one — a second
  // copy here is how the two lanes would drift apart, which is how this hole opened in the first
  // place. Fails closed on an unrecognised source_type.
  const sigPublic = ((sig ?? []) as Array<{ id: string; source_type?: unknown }>).filter((r) => {
    if (isPublicSignalSourceType(r.source_type)) return true;
    dropped.push({ id: r.id, kind: "signal", reason: `not_public_source_type:${String(r.source_type ?? "null")}` });
    return false;
  });
  // P1: the cited rows go through selectSignals on their own budget — so every law, the dedupe and
  // the order apply to them identically — and the REST then meet READ_CAP as before.
  const sigAll = sigPublic as unknown as SelSignal[];
  const sigCited = sigAll.filter((r) => predecessorCited.has(r.id));
  const sigRest = sigAll.filter((r) => !predecessorCited.has(r.id));
  const p1Sig = p1Budget > 0 && sigCited.length > 0
    ? selectSignals(sigCited, p1Budget, confirmed)
    : { kept: [] as SelSignal[], dropped: [] as Dropped[] };
  // A cited row the LAWS refuse keeps its own reason; only a cap miss is relabelled, so the ledger
  // never says predecessor_cited about a row that was admitted for any other reason.
  for (const d of p1Sig.dropped) dropped.push(d.reason === "over_cap" ? { ...d, reason: "over_predecessor_cited_cap" } : d);
  p1Budget -= p1Sig.kept.length;
  const sigSel = selectSignals(sigRest, READ_CAP.signal, confirmed);
  dropped.push(...sigSel.dropped);
  // ── R1 (operator ruling, 2026-10-14): the pool's text IS rowTextOf's text ───────────────────────
  // This line used to build `(claim_text ?? evidence_excerpt) + " (" + source_title + ")"`. The drift
  // re-read asks rowTextOf (claim_text + " " + evidence_excerpt), so no re-read could ever reproduce
  // what a span had been cut from: every carried span taken from a base-selection signal failed
  // sha_drift — 20 of 20 of Wasabi's pool signals, refusal 10153 (defect A). The two assemblies are
  // now ONE: rowTextOf, the same function liveRecordCandidates already used, which is why an
  // R4-admitted carry was the only kind that ever re-verified.
  //
  // THE TITLE IS NOT WHAT THE ROW SAYS. It is where the row was found, so appending it to the text
  // put a span's offsets over words the source never asserted. It travels as its own field and
  // reaches the prompt as an attribute of the line (buildCatalogue), never as text a span can cut.
  for (const s of [...p1Sig.kept, ...sigSel.kept]) {
    rows.push({ id: s.id, kind: "signal", provenance: "public_observed", source_class: classOfSignal(s), text: rowTextOf("signal", s), source_title: s.source_title ?? null, source_url: s.source_url, event_date: s.event_date,
      admitted_by: p1Sig.kept.some((k) => k.id === s.id) ? PREDECESSOR_CITED_REASON : undefined });
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
  // P1, own_words lane: same shape as the signals lane, on whatever budget signals left.
  const owAll = (ow ?? []) as SelOwnWord[];
  const owEligible = (w: SelOwnWord) => declaredEligibleFor(parseOwnWordsKind(w.judge_kind));
  const owCited = owAll.filter((w) => predecessorCited.has(w.id));
  const owRest = owAll.filter((w) => !predecessorCited.has(w.id));
  const p1Ow = p1Budget > 0 && owCited.length > 0
    ? selectOwnWords(owCited, p1Budget, activeIdentities, owEligible)
    : { kept: [] as SelOwnWord[], dropped: [] as Dropped[] };
  for (const d of p1Ow.dropped) dropped.push(d.reason === "over_cap" ? { ...d, reason: "over_predecessor_cited_cap" } : d);
  p1Budget -= p1Ow.kept.length;
  const owSel = selectOwnWords(owRest, READ_CAP.own_word, activeIdentities, owEligible);
  dropped.push(...owSel.dropped);
  // source_url carried so the offering's own-host test can see WHERE the words were said (a registry-hosted
  // own_word is not the company's own site — rule 2026-09-18); the own_site flag is no longer trusted downstream.
  // 1a-4: own words are the company speaking — class `you`, unconditionally.
  for (const w of [...p1Ow.kept, ...owSel.kept]) rows.push({ id: w.id, kind: "own_word", provenance: "public_observed", source_class: "you", text: (w.quote ?? "").trim(), source_url: (w as { source_url?: string | null }).source_url ?? null, own_site: true,
    admitted_by: p1Ow.kept.some((k) => k.id === w.id) ? PREDECESSOR_CITED_REASON : undefined });

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
  // 1a-4 (ruling 1A-i): EVERY finding is our read — its body is our synthesis whatever it rests on,
  // which is what the findings beat already says of it ("the finding BODY is OUR reading, not a
  // quote"). A frontier row (origin_signal_id NULL, basis in beats.input_ledger) arrives through this
  // same lane and is classed the same way.
  for (const f of fSel.kept) rows.push({ id: f.id, kind: "finding", provenance: "public_inferred", source_class: "our_read", text: (f.body ?? "").trim() });

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
  // 1a-4: which claims rest on an analysis signal — the claim_signal_refs → isAnalysisRow join, the
  // same shape claimDeltaSynthesis.ts:609-616 runs for its self-voice exclusion. A pair with an
  // analysis-cited claim on either side is OUR read, not the record speaking.
  const analysisClaimIds = new Set<string>();
  if (claimIds.length) {
    const { data: aSigRows } = await supabase
      .from("signals").select("id, voice_class, raw_payload").eq("company_id", companyId);
    const analysisSigIds = new Set(
      ((aSigRows ?? []) as Array<{ id: string; voice_class: string | null; raw_payload?: unknown }>)
        .filter((s) => isAnalysisRow(s)).map((s) => s.id),
    );
    if (analysisSigIds.size > 0) {
      const { data: aRefRows } = await supabase
        .from("claim_signal_refs").select("claim_id, signal_id").eq("company_id", companyId);
      for (const r of ((aRefRows ?? []) as Array<{ claim_id: string; signal_id: string }>)) {
        if (analysisSigIds.has(r.signal_id)) analysisClaimIds.add(r.claim_id);
      }
    }
  }
  const dSel = selectDeltas(deltas, READ_CAP.delta, claimById);
  dropped.push(...dSel.dropped);
  for (const d of dSel.kept) {
    const decl = d.declared_claim_id ? claimById.get(d.declared_claim_id)?.statement : "";
    const pub = d.public_claim_id ? claimById.get(d.public_claim_id)?.statement : "";
    rows.push({ id: d.id, kind: "delta", provenance: "public_observed", source_class: classOfDelta(d, analysisClaimIds), text: `[${d.delta_type}] declared: "${decl ?? ""}" · public: "${pub ?? ""}"` });
  }

  return { inputs: rows, dropped };
}

