// ── R14 / R17 (operator rulings 2026-10-18): THE voice class of a minted excerpt, decided in ONE place ────
//
// WHY. extract-outside-evidence stamped every regenerated row `voice_class: "outside_voice_about_client"` as a
// literal. The in-memory run over the b3 set found 32 of 282 URLs the shared authorities would class otherwise:
// 8 on the company's own domain (client_voice), 3 registry pages (filing / self-reported sections are the
// company speaking), 21 aggregator profiles and wires the authorship judge decides. public-baseline carried
// the same rules in three places — the overlay closure, the registry stamp, the authorship demote — and the
// handler carried none. This module is the one implementation; both call it.
//
// ORDER (the baseline's, unchanged):
//   1. an 'analysis' label wins over everything (voiceLabel.ts, S1 2026-09-18)              → analysis
//   2. the company's own domain (ONE predicate, isOwnDomainUrl)                               → client_voice
//   3. a registry page: the excerpt's section decides (registryStamp); journalism → the label; and a registry
//      item is NEVER sent to the judge (C1 seam, 2026-09-17)                                   → filing / outside
//   4. a gated URL (the caller names the gate: the ingest path gates on aggregator PROFILES only; the regen and
//      restamp paths on profiles, wires and boilerplate closes) goes to the authorship judge; outcomeFor maps
//      the verdict; a null outcome leaves the label                                          → client_voice / competitor_voice / label
//   5. otherwise the extractor's label, or null when it is not a known class                 → label
//
// R28 (operator ruling 2026-10-18): THE FIRST-PERSON GATE, regen path only. Pilot 3 minted "We help people and
// businesses thrive…" — the company's own tagline as a directory reprints it — as outside voice, because no authority
// reads the TEXT. A caller may name text gates (`textGates`); with "first_person" named, a candidate whose
// grammatical subject is first person plural (we / our / us) and that carries no attributed outside speaker is
// client_voice by rule — deterministic, between the registry stage and the judge, no model call. The baseline's
// callers name no text gate (adoption filed), so their decisions are byte-identical to before.
//
// AMENDMENT (b): what happens when a gated URL CANNOT be judged — no judge wired, the judge unavailable, or
// judge_failed — is a REQUIRED argument, never a default:
//   "keep_label"   the label stands and the failure is stamped (public-baseline's standing behaviour);
//   "refuse_mint"  the excerpt is NOT minted — the decision says so with the reason, the caller records it and
//                  retries next run (the regen path: an unjudged aggregator row must never be born as the
//                  record speaking).
import { ANALYSIS_VOICE, isAnalysisLabelled } from "./voiceLabel.ts";
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import {
  matchAggregatorProfileUrl, matchGatedUrl, outcomeFor,
  type AuthorshipContext, type AuthorshipInput, type AuthorshipJudge, type AuthorshipJudgment, type AuthorshipStamp, type SpeakerJudge, type SpeakerJudgment,
} from "./aggregatorAuthorship.ts";
import type { AttributionHit } from "./attribution.ts";
import { registryStamp, type RegistryClassification } from "./registryClassifier.ts";
import { deterministicSyndicationVerdict, mostSimilarClientTexts, type ClientCorpus, type SyndicationJudge } from "./syndication.ts";

export const VOICE_CLASSES: ReadonlyArray<string> = ["client_voice", "outside_voice_about_client", "competitor_voice", "market_context"];

export type JudgeFailurePolicy = "keep_label" | "refuse_mint";
/** Which URL shapes reach the judge. `profile`: aggregator company profiles only (the ingest path, unchanged).
 *  `profile_wire_boilerplate`: profiles, press wires and release pages with the subject's boilerplate close
 *  (the restamp's gate, and the regen path's). */
export type JudgeGate = "profile" | "profile_wire_boilerplate";
export type VoiceAuthority = "analysis_label" | "own_domain" | "registry" | "authorship_judge" | "extractor_label" | "first_person_self_description" | "attributed_speaker_subject" | "first_person_judged" | "syndication";
/** R38: what the syndication stage measured and decided, stamped on every regen-minted row. */
export type SyndicationStamp = {
  score: number; band: number; words: number;
  verdict: "syndicated" | "clean" | "unresolved";
  method: "deterministic" | "short_item" | "local_llm" | "unresolved";
  model?: string; judged_at?: string;
  /** R58: sha256 of the exact prompt the band judge answered (absent when no judge was asked) */
  prompt_sha?: string;
};
export const FIRST_PERSON_JUDGED_RULE = "first_person_judged" as const;
/** Text gates a caller may name (R28, R32). The regen handler names ["first_person", "attributed_speech"]; the baseline names none. */
export type TextGate = "first_person" | "attributed_speech";
export const FIRST_PERSON_RULE = "first_person" as const;
export const ATTRIBUTED_SPEECH_RULE = "attributed_speech" as const;
/** R55d: the reason prefix a detected mixed candidate is recorded under (no judge call; the label stands). */
export const MIXED_CANDIDATE = "mixed_candidate" as const;
/** R32: what the speaker judge said, stamped on the row beside the decision. */
export type SpeakerStamp = SpeakerJudgment & { attribution: AttributionHit; judged_at: string };

export type VoiceClassInput = {
  url: string;
  /** The item as labelled (for the analysis test); null on the regen path. */
  item?: { voice_class?: unknown } | null;
  /** The extractor's label (ingest) or the path's default (regen: outside_voice_about_client). */
  labeledClass: string | null;
  /** The retained page text — gate (b) and the judge read it. */
  pageText?: string | null;
  /** The text the judge reads for this item (an excerpt, a snippet). Empty ⇒ nothing to judge. */
  judgedText?: string | null;
  company: { name: string; host: string | null };
  /** The registry classification the caller computed for this item (classifyRegistryRow), null when not a registry URL. */
  registry: RegistryClassification | null;
  /** Resolves null when the judge is unavailable for this call (limits, no transport). */
  judge: ((input: AuthorshipInput) => Promise<AuthorshipJudgment | null>) | null;
  /** R54: where the judged text sits on the stored page — built by authorshipContext(page, text, offset), or
   *  noPageWords(reason) when the caller holds no page. REQUIRED (no default): the URL-gate stage throws without it. */
  authorshipContext: AuthorshipContext;
  gate: JudgeGate;
  /** R28: deterministic gates on the candidate TEXT, applied after the registry stage and before the judge. Absent ⇒ none. */
  textGates?: ReadonlyArray<TextGate>;
  /** R32: the attribution the caller detected on the candidate (detectAttribution), null when none. Read only when "attributed_speech" is named. */
  attribution?: AttributionHit | null;
  /** R32: the speaker judge; null ⇒ an attributed candidate cannot be decided (refused under refuse_mint, kept under keep_label). */
  speakerJudge?: SpeakerJudge | null;
  /** R32: the paragraph around the candidate, for the speaker judge. */
  context?: string | null;
  /** R38 (operator ruling R51, 2026-10-20): the syndication stage — the client corpus (built once per write call, the run's
   *  own rows excluded), the LEDGERED band judge (null ⇒ a band candidate is refused under refuse_mint) and the client's
   *  anchors (stripped before the short-item floor). Absent ⇒ no stage (the baseline's callers). */
  syndication?: { corpus: ClientCorpus; judge: SyndicationJudge | null; anchors: readonly string[] } | null;
  onJudgeFailure: JudgeFailurePolicy;
  now?: () => string;
};

/** The input the stages BEFORE the judge read: everything but the judge's page context (R54). */
export type PreJudgeInput = Omit<VoiceClassInput, "authorshipContext">;

export type GateHit = { host: string; via: "profile" | "wire" | "boilerplate" | "first_person" };

export type VoiceClassDecision =
  | {
    ok: true;
    voice_class: string | null;
    evidence_class: "filing" | "prose";
    authority: VoiceAuthority;
    detail: string;
    gate: GateHit | null;
    /** the deterministic rule that decided (R28: "first_person"; R32: "attributed_speech"); absent for the other authorities */
    rule?: string;
    /** present when the judge answered (or failed) for this item */
    authorship_judge?: AuthorshipStamp;
    /** R32: present when the speaker judge answered for this item */
    speaker?: SpeakerStamp;
    /** R38: present when the syndication stage ran (the regen path) */
    syndication?: SyndicationStamp;
  }
  | {
    ok: false;
    refused: true;
    authority: "authorship_judge" | "speaker_judge" | "syndication";
    reason: string;
    gate: GateHit | null;
    authorship_judge?: AuthorshipStamp;
    speaker?: SpeakerStamp;
    syndication?: SyndicationStamp;
  };

// ── R28: first-person self-description ─────────────────────────────────────────────────────────────────
// A sentence whose grammatical subject is first person plural: We / We're / We've / Our / Ours. "Contact us" is
// imperative (us as object) and does not fire; "us" fires only as a subject form, which English does not have — so
// the subject test is We / Our.
// R47 (operator ruling R51, 2026-10-20): ANYWHERE IN THE CANDIDATE, not only at a sentence start. Edgewood's
// Psychology Today row — "Within our Acute Intensive Service programs, we serve youth ages 6-18." — is the provider's
// own text wearing an outside class because its first person sits mid-sentence; 27 fleet rows carried the same shape.
// Detection widened; the decision is still the speaker judge's (R45), which separates the company's copy from a
// customer's "our home" and a platform's "our analysis".
const FIRST_PERSON_SUBJECT = /\b(we|we're|we’re|we've|we’ve|we'll|we’ll|our|ours)\b/i;
const SENTENCE_START_FIRST_PERSON = /(^|[.!?;:]\s+|["“‘']\s*)(we|we're|we’re|we've|we’ve|we'll|we’ll|our|ours)\b/i;
// An attributed outside speaker exempts the line: a quotation with an attribution verb, or "according to <someone>".
const ATTRIBUTION = /\b(said|says|say|told|tells|wrote|writes|according to|explained|explains|added|adds|noted|notes|stated|states|commented|comments|recalled|recalls)\b/i;
const QUOTED = /["“”‘’']/;
export type FirstPersonVerdict = { hit: boolean; detail: string };
/** Deterministic: does this candidate speak as "we", with no attributed outside speaker? */
export function firstPersonSelfDescription(text: string | null | undefined): FirstPersonVerdict {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { hit: false, detail: "no text" };
  const m = FIRST_PERSON_SUBJECT.exec(t);
  if (!m) return { hit: false, detail: "no first-person-plural subject" };
  if (QUOTED.test(t) && ATTRIBUTION.test(t)) return { hit: false, detail: `first person inside an attributed quotation (${ATTRIBUTION.exec(t)![0]}) — an outside speaker` };
  if (ATTRIBUTION.test(t) && !/^(we|our)\b/i.test(t)) return { hit: false, detail: `an attributed speaker (${ATTRIBUTION.exec(t)![0]}) precedes the first person` };
  const position = SENTENCE_START_FIRST_PERSON.test(t) ? "at a sentence start" : "mid-sentence (R47)";
  return { hit: true, detail: `first-person-plural subject "${m[1]}" ${position} with no attributed outside speaker — who "we" is goes to the speaker judge` };
}

function labelOf(labeledClass: string | null): string | null {
  const l = String(labeledClass ?? "").trim();
  return VOICE_CLASSES.includes(l) ? l : null;
}

function gateFor(input: PreJudgeInput): GateHit | null {
  if (input.gate === "profile") {
    const m = matchAggregatorProfileUrl(input.url);
    return m ? { host: m.host, via: "profile" } : null;
  }
  const g = matchGatedUrl(input.url, { pageText: input.pageText ?? null, subjectHost: input.company.host ?? null });
  return g ? { host: g.host, via: g.via } : null;
}

/** Stages 1–3 and the gate test; no judge call. `needs_judge` means stage 4 applies. Exported for the sync
 *  overlay stage of the ingest path, which has no judge at that point; the async function below is the same
 *  decision with the judge call in the middle. */
export type SyndicationStage =
  | { kind: "none" }
  | { kind: "syndicated"; stamp: SyndicationStamp }
  | { kind: "clean"; stamp: SyndicationStamp }
  | { kind: "band"; stamp: SyndicationStamp };
/** R38: the deterministic half of the syndication stage over the judged text. No model, no I/O. */
export function syndicationStage(input: PreJudgeInput): SyndicationStage {
  if (!input.syndication) return { kind: "none" };
  const text = String(input.judgedText ?? "").trim();
  if (!text) return { kind: "none" };
  const v = deterministicSyndicationVerdict(text, input.syndication.corpus, input.syndication.anchors);
  const base = { score: +v.score.toFixed(4), band: +v.band.toFixed(4), words: v.words };
  if (v.verdict === "syndicated") return { kind: "syndicated", stamp: { ...base, verdict: "syndicated", method: "deterministic" } };
  if (v.verdict === "clean") return { kind: "clean", stamp: { ...base, verdict: "clean", method: v.method } };
  return { kind: "band", stamp: { ...base, verdict: "unresolved", method: "unresolved" } };
}
const syndicatedDecision = (stamp: SyndicationStamp): VoiceClassDecision =>
  ({ ok: true, voice_class: "client_voice", evidence_class: "prose", authority: "syndication", detail: `syndication: ${stamp.method === "local_llm" ? `the band judge (${stamp.model}) read the item as the company's own copy restated` : `8-gram containment ${stamp.score} in the client corpus — the company's own copy on a third-party host`}`, gate: null, syndication: stamp });

/** The stages BEFORE the judge — it never asks the judge, so it takes no authorshipContext (R54). */
export function decideVoiceClassBeforeJudge(input: PreJudgeInput, stage?: SyndicationStage):
  | VoiceClassDecision
  | { needs_judge: true; gate: GateHit; label: string | null }
  | { needs_speaker: true; attribution: AttributionHit; label: string | null }
  | { needs_syndication_judge: true; stamp: SyndicationStamp; label: string | null } {
  const label = labelOf(input.labeledClass);
  if (isAnalysisLabelled((input.item ?? null) as { voice_class?: string | null } | null)) {
    return { ok: true, voice_class: ANALYSIS_VOICE, evidence_class: "prose", authority: "analysis_label", detail: "the item is labelled analysis — our read, never the record", gate: null };
  }
  if (input.company.host && isOwnDomainUrl(input.url, input.company.host)) {
    return { ok: true, voice_class: "client_voice", evidence_class: "prose", authority: "own_domain", detail: `own domain: ${input.company.host}`, gate: null };
  }
  if (input.registry) {
    const stamp = registryStamp(input.registry);
    if (stamp) {
      return { ok: true, voice_class: stamp.voice_class, evidence_class: stamp.evidence_class, authority: "registry", detail: `registry ${input.registry.host_rule}: section ${input.registry.section} class ${input.registry.class}`, gate: null };
    }
    return { ok: true, voice_class: label, evidence_class: "prose", authority: "extractor_label", detail: `registry journalism (${input.registry.host_rule}): the label stands; never judged`, gate: null };
  }
  // R38 (R51): THE SYNDICATION STAGE — after the registry stamp, before the text gates. Deterministic HIGH decides
  // client_voice here; the band is handed to the ledgered band judge (voiceClassForMintedExcerpt); clean falls through.
  const synd = stage ?? syndicationStage(input);
  if (synd.kind === "syndicated") return syndicatedDecision(synd.stamp);
  if (synd.kind === "band") return { needs_syndication_judge: true, stamp: synd.stamp, label };
  return decideTextGates(input, label);
}

/** The text gates (R28/R45 first person, R32 attributed speech) and the URL gate — the stages after syndication. */
export function decideTextGates(input: PreJudgeInput, label: string | null):
  | VoiceClassDecision
  | { needs_judge: true; gate: GateHit; label: string | null }
  | { needs_speaker: true; attribution: AttributionHit; label: string | null } {
  // R28 detection, R45 decision (operator ruling 2026-10-20): a first-person candidate is DETECTED deterministically but
  // the class is JUDGED — SIAA's agent forum ("We have an affiliate who transferred from SIAA…") is a third party
  // saying "we", which the rule alone cannot see. The speaker judge decides who "we" is, with the R42 context.
  // R47: a DETECTED attribution (page-aware: quotation interiors, trailing clauses) precedes the first-person rule — the
  // attributed form names the speaker, and a quoted "our" belongs to whoever the page quotes, not to the subject.
  const attributed = !!(input.textGates?.includes(ATTRIBUTED_SPEECH_RULE) && input.attribution);
  if (input.textGates?.includes(FIRST_PERSON_RULE) && !attributed) {
    const fp = firstPersonSelfDescription(input.judgedText);
    if (fp.hit) {
      const text = String(input.judgedText ?? "").trim();
      return { needs_speaker: true, attribution: { form: "first_person", speaker_string: "", span: text, offset: -1 }, label };
    }
  }
  // R32: an attributed candidate goes to the speaker judge BEFORE the URL gate
  if (input.textGates?.includes(ATTRIBUTED_SPEECH_RULE) && input.attribution) {
    return { needs_speaker: true, attribution: input.attribution, label };
  }
  return decideUrlGate(input, label);
}
function decideUrlGate(input: PreJudgeInput, label: string | null): VoiceClassDecision | { needs_judge: true; gate: GateHit; label: string | null } {
  const gate = gateFor(input);
  if (gate) return { needs_judge: true, gate, label };
  return { ok: true, voice_class: label, evidence_class: "prose", authority: "extractor_label", detail: label ? "no authority fires; the extractor's label" : "no authority fires and the label is not a known class", gate: null };
}

/** THE decision. Async only because the speaker stage (R32) and stage 4 may call a judge. */
export async function voiceClassForMintedExcerpt(input: VoiceClassInput): Promise<VoiceClassDecision> {
  const nowIso = input.now ?? (() => new Date().toISOString());
  const stage = syndicationStage(input);
  let pre = decideVoiceClassBeforeJudge(input, stage);
  // R38: the stamp every later decision carries when the stage ran (clean, or the band judge's answer)
  let syndStamp: SyndicationStamp | undefined = stage.kind === "none" ? undefined : stage.stamp;
  if ("needs_syndication_judge" in pre) {
    const { label, stamp } = pre;
    const text = String(input.judgedText ?? "").trim();
    const refuseY = (reason: string, s: SyndicationStamp): VoiceClassDecision => ({ ok: false, refused: true, authority: "syndication", reason, gate: null, syndication: s });
    const judge = input.syndication?.judge ?? null;
    if (!judge) {
      if (input.onJudgeFailure === "refuse_mint") return refuseY(`syndication_unresolved: the item is in the uncertain band (score ${stamp.score}, band ${stamp.band}) and no band judge is wired — not minted; retry when the local judge is available`, stamp);
      syndStamp = stamp; pre = decideTextGates(input, label);
    } else {
      const sample = mostSimilarClientTexts(text, input.syndication!.corpus);
      const j = await judge({ itemText: text, clientSample: sample });
      if (j.syndicated === null) {
        const s: SyndicationStamp = { ...stamp, verdict: "unresolved", method: "unresolved", model: j.model, ...(j.prompt_sha ? { prompt_sha: j.prompt_sha } : {}), judged_at: nowIso() };
        if (input.onJudgeFailure === "refuse_mint") return refuseY(`syndication_unresolved: the band judge (${j.model}) returned no verdict for an item in the uncertain band (score ${stamp.score}, band ${stamp.band}) — not minted; retry next run`, s);
        syndStamp = s; pre = decideTextGates(input, label);
      } else if (j.syndicated) {
        return syndicatedDecision({ ...stamp, verdict: "syndicated", method: "local_llm", model: j.model, ...(j.prompt_sha ? { prompt_sha: j.prompt_sha } : {}), judged_at: nowIso() });
      } else {
        syndStamp = { ...stamp, verdict: "clean", method: "local_llm", model: j.model, ...(j.prompt_sha ? { prompt_sha: j.prompt_sha } : {}), judged_at: nowIso() };
        pre = decideTextGates(input, label);
      }
    }
  }
  const withStamp = (d: VoiceClassDecision): VoiceClassDecision => (syndStamp ? { ...d, syndication: syndStamp } : d);
  if ("needs_speaker" in pre) {
    // R32 — who is quoted or reported, and do they belong to the subject
    const { attribution, label } = pre;
    const text = String(input.judgedText ?? "").trim();
    // R45: a first-person candidate is judged under its own rule name and subject authority
    const firstPerson = attribution.form === "first_person";
    const rule = firstPerson ? FIRST_PERSON_JUDGED_RULE : ATTRIBUTED_SPEECH_RULE;
    const subjectAuthority: VoiceAuthority = firstPerson ? "first_person_judged" : "attributed_speaker_subject";
    const refuseS = (reason: string, speaker?: SpeakerStamp): VoiceClassDecision =>
      ({ ok: false, refused: true, authority: "speaker_judge", reason, gate: null, ...(speaker ? { speaker } : {}) });
    const keepS = (detail: string, speaker?: SpeakerStamp): VoiceClassDecision =>
      ({ ok: true, voice_class: label, evidence_class: "prose", authority: "extractor_label", detail, gate: null, rule, ...(speaker ? { speaker } : {}) });
    // ── R56 (operator ruling, 2026-10-21): SPEAKERLESS FIRST PERSON OFF THE SUBJECT'S DOMAIN IS A FIELD QUESTION ──────────
    // Supersedes R45's first_person_judged path for first person with NO speaker string: on a host that is not the
    // subject's own domain (own domain already decided before any judge), "we" is answered by the AUTHORSHIP judge — which
    // field this sits in and who writes that field on this host, with the PAGE BRIEF and the CONTEXT block — not by the
    // speaker judge (IAA's own site, a homeowner review, a partner's press-release boilerplate). Attributed speech (named
    // or titled speakers, quotation forms, reported speech) stays with the speaker judge.
    if (attribution.form === "first_person" && !attribution.speaker_string && !(input.company.host && isOwnDomainUrl(input.url, input.company.host))) {
      const d = await judgeStage(input, { host: hostOfUrl(input.url), via: "first_person" }, label, nowIso);
      return withStamp(d.ok ? { ...d, rule: FIRST_PERSON_RULE } : d);
    }
    // R55d: a MIXED candidate (narrator words + a quotation, detected) is never handed to the judge — unknown, the label stands
    if (attribution.form === "mixed") {
      const why = `${MIXED_CANDIDATE}: narrator words and a quotation in one candidate — not judged`;
      return withStamp(input.onJudgeFailure === "keep_label" ? keepS(`${why}; the label stands`) : refuseS(`${why} — not minted`));
    }
    if (!input.speakerJudge) {
      return withStamp(input.onJudgeFailure === "keep_label" ? keepS(`attributed speech (${attribution.form}); no speaker judge wired; the label stands`) : refuseS(`attributed speech (${attribution.form}) and no speaker judge is wired — not minted; retry when the local judge is available`));
    }
    const j = await input.speakerJudge({ subjectName: input.company.name, subjectHost: input.company.host ?? "", url: input.url, candidate: text, attributionForm: attribution.form, attributionSpan: attribution.span, speakerString: attribution.speaker_string, context: String(input.context ?? input.pageText ?? "").slice(0, 2400), pageContext: input.authorshipContext });
    if (j === null) return withStamp(input.onJudgeFailure === "keep_label" ? keepS(`attributed speech (${attribution.form}); speaker judge unavailable; the label stands`) : refuseS(`attributed speech (${attribution.form}) and the speaker judge was unavailable — not minted; retry next run`));
    const stamp: SpeakerStamp = { ...j, attribution, judged_at: nowIso() };
    // R55d: a mixed candidate (narrator words + a quotation) is undecidable as one speaker — recorded like unknown, the label stands
    if (j.speaker_class === "judge_failed" || j.speaker_class === "unknown" || j.speaker_class === "mixed") {
      const why = `speaker ${j.speaker_class}: ${j.reason}`;
      return withStamp(input.onJudgeFailure === "keep_label" ? keepS(`${why} — the label stands`, stamp) : refuseS(`${why} — not minted`, stamp));
    }
    if (j.speaker_class === "subject_company_officer" || j.speaker_class === "subject_company_text") {
      return withStamp({ ok: true, voice_class: "client_voice", evidence_class: "prose", authority: subjectAuthority, detail: `${j.speaker_class}${j.speaker_name ? `: ${j.speaker_name}` : ""}${j.speaker_role ? ` (${j.speaker_role})` : ""} — ${j.reason}`, gate: null, rule, speaker: stamp });
    }
    // third_party: the label stands with the speaker recorded; the URL gate still applies after it
    const next = decideUrlGate(input, label);
    if (!("needs_judge" in next)) {
      if (!next.ok) return withStamp({ ...next, speaker: stamp });
      return withStamp({ ...next, rule, speaker: stamp, detail: `third-party speaker${j.speaker_name ? ` ${j.speaker_name}` : ""} — ${next.detail}` });
    }
    const d = await judgeStage(input, next.gate, next.label, nowIso);
    return withStamp({ ...d, speaker: stamp });
  }
  if (!("needs_judge" in pre)) return withStamp(pre);
  return withStamp(await judgeStage(input, pre.gate, pre.label, nowIso));
}

/** Stage 4: the URL-gated authorship judge (unchanged behaviour, factored so the speaker stage can fall through to it). */
/** www-stripped host of a URL ("" when unparseable) — the gate host R56 stamps for a first-person field question. */
function hostOfUrl(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
async function judgeStage(input: VoiceClassInput, gate: GateHit, label: string | null, nowIso: () => string): Promise<VoiceClassDecision> {
  const text = String(input.judgedText ?? "").trim();
  const keep = (detail: string, stamp?: AuthorshipStamp): VoiceClassDecision =>
    ({ ok: true, voice_class: label, evidence_class: "prose", authority: "extractor_label", detail, gate, ...(stamp ? { authorship_judge: stamp } : {}) });
  const refuse = (reason: string, stamp?: AuthorshipStamp): VoiceClassDecision =>
    ({ ok: false, refused: true, authority: "authorship_judge", reason, gate, ...(stamp ? { authorship_judge: stamp } : {}) });
  if (!text) {
    // Nothing to judge. The ingest path leaves such an item as labelled (it was never gated for stats either).
    return input.onJudgeFailure === "keep_label" ? keep(`gated (${gate.via} ${gate.host}) but no text to judge; the label stands`) : refuse(`gated (${gate.via} ${gate.host}) but no text to judge`);
  }
  if (!input.judge) {
    return input.onJudgeFailure === "keep_label" ? keep(`gated (${gate.via} ${gate.host}); no judge wired; the label stands`) : refuse(`gated (${gate.via} ${gate.host}) and no judge is wired — not minted; retry when the local judge is available`);
  }
  const kind = (input as { authorshipContext?: { kind?: unknown } }).authorshipContext?.kind;
  if (kind !== "page" && kind !== "no_page") throw new Error("voiceClassForMintedExcerpt: authorshipContext is required (R54) — build it with authorshipContext() or noPageWords()");
  const j = await input.judge({ subjectName: input.company.name, subjectHost: input.company.host ?? "", url: input.url, text, context: input.authorshipContext });
  if (j === null) {
    return input.onJudgeFailure === "keep_label" ? keep(`gated (${gate.via} ${gate.host}); judge unavailable for this item; the label stands`) : refuse(`gated (${gate.via} ${gate.host}) and the judge was unavailable — not minted; retry next run`);
  }
  const stampOf = (applied: AuthorshipStamp["applied"]): AuthorshipStamp => ({ ...j, applied, url_rule: gate.host, judged_at: nowIso() });
  if (j.verdict === "no_page_words") {
    // R54: not judged — the text could not be placed on a page. The label stands (keep_label); refused under refuse_mint.
    return input.onJudgeFailure === "keep_label"
      ? keep(`gated (${gate.via} ${gate.host}); ${j.reason}`, stampOf("unchanged"))
      : refuse(`gated (${gate.via} ${gate.host}); ${j.reason} — not minted`, stampOf("unchanged"));
  }
  if (j.verdict === "judge_failed") {
    return input.onJudgeFailure === "keep_label"
      ? keep(`gated (${gate.via} ${gate.host}); judge failed: ${j.reason}; the label stands`, stampOf("unchanged"))
      : refuse(`gated (${gate.via} ${gate.host}); judge failed: ${j.reason} — not minted; retry next run`, stampOf("unchanged"));
  }
  const outcome = outcomeFor(j, input.company.name);
  if (outcome) {
    return { ok: true, voice_class: outcome, evidence_class: "prose", authority: "authorship_judge", detail: `${j.verdict}${j.entity ? `: ${j.entity}` : ""} — ${j.reason}`, gate, authorship_judge: stampOf(outcome) };
  }
  return keep(`judge: ${j.verdict}${j.entity ? `: ${j.entity}` : ""} — the label stands`, stampOf("unchanged"));
}
