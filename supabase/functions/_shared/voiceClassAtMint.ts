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
  type AuthorshipJudge, type AuthorshipJudgment, type AuthorshipStamp,
} from "./aggregatorAuthorship.ts";
import { registryStamp, type RegistryClassification } from "./registryClassifier.ts";

export const VOICE_CLASSES: ReadonlyArray<string> = ["client_voice", "outside_voice_about_client", "competitor_voice", "market_context"];

export type JudgeFailurePolicy = "keep_label" | "refuse_mint";
/** Which URL shapes reach the judge. `profile`: aggregator company profiles only (the ingest path, unchanged).
 *  `profile_wire_boilerplate`: profiles, press wires and release pages with the subject's boilerplate close
 *  (the restamp's gate, and the regen path's). */
export type JudgeGate = "profile" | "profile_wire_boilerplate";
export type VoiceAuthority = "analysis_label" | "own_domain" | "registry" | "authorship_judge" | "extractor_label";

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
  judge: ((input: { subjectName: string; subjectHost: string; url: string; text: string }) => Promise<AuthorshipJudgment | null>) | null;
  gate: JudgeGate;
  onJudgeFailure: JudgeFailurePolicy;
  now?: () => string;
};

export type GateHit = { host: string; via: "profile" | "wire" | "boilerplate" };

export type VoiceClassDecision =
  | {
    ok: true;
    voice_class: string | null;
    evidence_class: "filing" | "prose";
    authority: VoiceAuthority;
    detail: string;
    gate: GateHit | null;
    /** present when the judge answered (or failed) for this item */
    authorship_judge?: AuthorshipStamp;
  }
  | {
    ok: false;
    refused: true;
    authority: "authorship_judge";
    reason: string;
    gate: GateHit;
    authorship_judge?: AuthorshipStamp;
  };

function labelOf(labeledClass: string | null): string | null {
  const l = String(labeledClass ?? "").trim();
  return VOICE_CLASSES.includes(l) ? l : null;
}

function gateFor(input: VoiceClassInput): GateHit | null {
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
export function decideVoiceClassBeforeJudge(input: VoiceClassInput):
  | VoiceClassDecision
  | { needs_judge: true; gate: GateHit; label: string | null } {
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
  const gate = gateFor(input);
  if (gate) return { needs_judge: true, gate, label };
  return { ok: true, voice_class: label, evidence_class: "prose", authority: "extractor_label", detail: label ? "no authority fires; the extractor's label" : "no authority fires and the label is not a known class", gate: null };
}

/** THE decision. Async only because stage 4 may call the judge. */
export async function voiceClassForMintedExcerpt(input: VoiceClassInput): Promise<VoiceClassDecision> {
  const pre = decideVoiceClassBeforeJudge(input);
  if (!("needs_judge" in pre)) return pre;
  const { gate, label } = pre;
  const nowIso = input.now ?? (() => new Date().toISOString());
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
  const j = await input.judge({ subjectName: input.company.name, subjectHost: input.company.host ?? "", url: input.url, text });
  if (j === null) {
    return input.onJudgeFailure === "keep_label" ? keep(`gated (${gate.via} ${gate.host}); judge unavailable for this item; the label stands`) : refuse(`gated (${gate.via} ${gate.host}) and the judge was unavailable — not minted; retry next run`);
  }
  const stampOf = (applied: AuthorshipStamp["applied"]): AuthorshipStamp => ({ ...j, applied, url_rule: gate.host, judged_at: nowIso() });
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
