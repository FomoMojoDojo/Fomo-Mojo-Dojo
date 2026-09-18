// ── Registry self-reported text → own words (C3b, operator ruling 2026-09-18) ──────────────────────
//
// A registry page (GuideStar/Candid profile) reproduces the organization's OWN words under "SOURCE: Self-reported
// by organization" and its Mission block. C3a persisted every such section as a byte-exact span
// (raw_payload.registry.basis.snapshot_sections, offsets into outside_page_snapshots.clean_text, keyed by the
// snapshot row's text_sha256). This module is what extract-own-words needs to mint own words from those spans:
//
//   admission     a registry URL enters the own-words corpus iff its signal's basis has spans_exact = true and
//                 ≥1 self_reported span, and the page is a PROFILE page (filing_data pages stay excluded — Form
//                 990 figures are the company's filing, never its prose). Everything else on a registry host
//                 stays out (C1, fail closed).
//   the page      read from outside_page_snapshots (the single registry store — never duplicated into
//                 own_words_page_snapshots); the stored sha must equal the basis sha or the URL is skipped
//                 as snapshot_drift (no fetch).
//   the span      clean_text.slice(start, end) — the ONLY text the generator/judge ever sees for a registry URL;
//                 provability is bounded to it (a quote from elsewhere on the page is not provable).
//   the refs      a span-minted claim supports the self_reported signals whose own text sits in that span
//                 (deterministic per-span overlap, the classifier's own arithmetic) — and its paraphrase twins
//                 (publicly_declared claims backed by those signals) retire: one statement, one row.
// Pure except loadRegistryPageForOwnWords (SELECT only).
import { scoreSections, type SectionSpan, type SectionSpanRow, MIN_SECTION_SCORE } from "./registryClassifier.ts";
import { verbatimProvable } from "./ownWordsExtract.ts";

export type RegistryOwnWordsSignal = {
  id: string;
  source_url: string | null;
  source_title?: string | null;
  claim_text?: string | null;
  evidence_excerpt?: string | null;
  raw_payload?: unknown;
};

export type RegistryAdmission =
  | { admitted: true; page_type: "profile"; snapshot_sha: string; spans: SectionSpanRow[] }
  | { admitted: false; reason: "not_profile_page" | "spans_not_exact" | "no_self_reported_span" | "no_registry_stamp" | "no_snapshot_sha" };

type Basis = { snapshot_sha?: unknown; snapshot_sections?: unknown; spans_exact?: unknown };
function basisOf(signal: RegistryOwnWordsSignal): { page_type: string | null; basis: Basis | null } {
  const rp = signal.raw_payload && typeof signal.raw_payload === "object" ? (signal.raw_payload as { registry?: { page_type?: unknown; basis?: unknown } }) : null;
  const reg = rp?.registry;
  if (!reg || typeof reg !== "object") return { page_type: null, basis: null };
  const basis = reg.basis && typeof reg.basis === "object" ? (reg.basis as Basis) : null;
  return { page_type: typeof reg.page_type === "string" ? reg.page_type : null, basis };
}

/** The admission rule, from the signal's C3a stamp alone (no I/O). */
export function admitRegistrySignal(signal: RegistryOwnWordsSignal): RegistryAdmission {
  const { page_type, basis } = basisOf(signal);
  if (!page_type || !basis) return { admitted: false, reason: "no_registry_stamp" };
  if (page_type !== "profile") return { admitted: false, reason: "not_profile_page" };
  if (basis.spans_exact !== true) return { admitted: false, reason: "spans_not_exact" };
  const sha = typeof basis.snapshot_sha === "string" && basis.snapshot_sha ? basis.snapshot_sha : null;
  if (!sha) return { admitted: false, reason: "no_snapshot_sha" };
  const rows = Array.isArray(basis.snapshot_sections) ? (basis.snapshot_sections as SectionSpanRow[]) : [];
  const spans = rows.filter((r) => r && r.section === "self_reported" && Number.isInteger(r.start) && Number.isInteger(r.end) && r.end > r.start);
  if (spans.length === 0) return { admitted: false, reason: "no_self_reported_span" };
  return { admitted: true, page_type: "profile", snapshot_sha: sha, spans };
}

export type RegistryCorpusEntry = { url: string; signals: RegistryOwnWordsSignal[]; snapshot_sha: string; spans: SectionSpanRow[] };
/**
 * Split the client-voice corpus: own-site pages (kept exactly as before), registry URLs admitted by the rule
 * (one entry per URL — the first admitted signal's stamp names the snapshot; every signal on the URL rides along
 * for span attribution), and registry URLs excluded with the reason.
 */
export function partitionOwnWordsCorpus<T extends RegistryOwnWordsSignal>(
  signals: T[],
  isRegistryUrl: (url: string | null | undefined) => boolean,
): { site: T[]; registry: RegistryCorpusEntry[]; excluded: Array<{ url: string; reason: string }> } {
  const site: T[] = [];
  const byUrl = new Map<string, T[]>();
  for (const s of signals) {
    if (!isRegistryUrl(s.source_url)) { site.push(s); continue; }
    const u = String(s.source_url);
    if (!byUrl.has(u)) byUrl.set(u, []);
    byUrl.get(u)!.push(s);
  }
  const registry: RegistryCorpusEntry[] = [];
  const excluded: Array<{ url: string; reason: string }> = [];
  for (const [url, list] of byUrl) {
    const verdicts = list.map((s) => admitRegistrySignal(s));
    const first = verdicts.find((v) => v.admitted);
    if (!first || !first.admitted) { excluded.push({ url, reason: (verdicts[0] as { reason: string }).reason }); continue; }
    registry.push({ url, signals: list, snapshot_sha: first.snapshot_sha, spans: first.spans });
  }
  return { site, registry, excluded };
}

export type RegistryPage = { id: string; source_url: string; text_sha256: string; clean_text: string; crawled_at: string | null };
/** Newest stored page for the URL (both stored URL forms), SELECT only. */
export async function loadRegistryPageForOwnWords(
  supabase: { from: (t: string) => any },
  companyId: string,
  url: string,
): Promise<RegistryPage | null> {
  const bare = url.replace(/^https?:\/\/(www\d*\.)?/i, "").replace(/\/+$/, "");
  const forms = [...new Set([url, bare, `${bare}/`])];
  const { data } = await supabase.from("outside_page_snapshots")
    .select("id, source_url, text_sha256, clean_text, crawled_at")
    .eq("company_id", companyId).in("source_url", forms)
    .not("clean_text", "is", null)
    .order("crawled_at", { ascending: false }).limit(1);
  const r = ((data ?? []) as RegistryPage[])[0];
  return r && r.clean_text ? r : null;
}

/**
 * QUESTIONNAIRE SECTIONS (C3b live proof, Edgewood 2026-09-18): two GuideStar/Candid self_reported blocks are
 * Candid's own questionnaire — "How we listen" (checkbox statements Candid wrote, the organization ticked:
 * "We demonstrated a willingness to learn more by reviewing resources about feedback practice.") and "Our
 * Sustainable Development Goals" (a selection list). The judge kept three of those checkbox lines as positioning;
 * they are Candid's words, not the organization's. A span whose heading (its first line) names one of these
 * sections is never minted — the section stays self_reported for the classifier (voice: the company answered),
 * it is just not prose the company wrote. Deterministic by heading; the other self_reported blocks (Mission,
 * What we aim to solve, Our programs, Our results' context notes, Goals & Strategy) are typed by the organization.
 */
export const REGISTRY_QUESTIONNAIRE_HEADINGS: ReadonlyArray<string> = ["How we listen", "Our Sustainable Development Goals"];
export function isQuestionnaireSpan(spanText: string): boolean {
  const head = spanText.split("\n")[0]?.trim() ?? "";
  return REGISTRY_QUESTIONNAIRE_HEADINGS.includes(head);
}

/** The span's text, or null when the offsets no longer reproduce a span of the page (fail closed). */
export function registrySpanText(cleanText: string, span: { start: number; end: number }): string | null {
  if (span.start < 0 || span.end > cleanText.length || span.end <= span.start) return null;
  const t = cleanText.slice(span.start, span.end);
  return t.trim() ? t : null;
}

/** The ONE write-time check: the quote is provable against the SPAN (normalizeForHash substring), never the page. */
export function spanQuoteVerified(quote: string, spanText: string): boolean {
  return verbatimProvable(quote, spanText);
}

/**
 * Which self_reported signals sit in which span — per-span overlap (the classifier's tokenizer, one span at a
 * time). A signal is attributed to the span it scores highest against, when that score clears
 * MIN_SECTION_SCORE; otherwise to none. Deterministic string arithmetic; no model.
 */
export function attributeSignalsToSpans(
  signals: RegistryOwnWordsSignal[],
  spans: SectionSpanRow[],
  cleanText: string,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const texts = spans.map((sp) => registrySpanText(cleanText, sp) ?? "");
  for (const s of signals) {
    const rowText = [s.claim_text, s.evidence_excerpt].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(" ");
    if (!rowText) continue;
    let best = -1, bestScore = 0;
    texts.forEach((t, i) => {
      if (!t) return;
      const span: SectionSpan = { section: "self_reported", class: "self_reported", text: t, start: spans[i].start, end: spans[i].end };
      const score = scoreSections(rowText, [span])[0]?.score ?? 0;
      if (score > bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0 && bestScore >= MIN_SECTION_SCORE) out.set(best, [...(out.get(best) ?? []), s.id]);
  }
  return out;
}

export type RegistryOrigin = {
  host: string;
  page_url: string;
  snapshot_row_id: string;
  snapshot_sha: string;
  section: "self_reported";
  start: number;
  end: number;
  span_index: number;
  /** the self_reported signals attributed to this span — the minted claim's supports refs; their twins retire */
  signal_ids: string[];
};

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\d*\./i, "").toLowerCase(); } catch { return url; }
}

/** Retirement reason on the paraphrase twin (recorded-decision law: the reason names the claim that replaced it). */
export const TWIN_RETIRE_REASON = (claimId: string) => `span_quote_minted:${claimId}`;

export type RetiredTwin = { claim_id: string; signal_id: string; replaced_by: string };
/**
 * TWIN RETIREMENT: a span-minted quote replaces its paraphrase twin — every LIVE publicly_declared claim backed
 * (claim_signal_refs) by a signal the quote now supports is struck through set_claim_status (audited in
 * claim_events; the reason names the replacing claim). By signal id only — no text comparison. Idempotent:
 * an already-struck twin is never re-struck; `already` carries ids retired earlier in the same write.
 */
export async function retireParaphraseTwins(
  supabase: { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> },
  a: { companyId: string; mintedClaimId: string; signalIds: string[]; already?: Set<string>; actor?: string },
): Promise<RetiredTwin[]> {
  const out: RetiredTwin[] = [];
  if (a.signalIds.length === 0) return out;
  const { data: twinRefs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id")
    .eq("company_id", a.companyId).in("signal_id", a.signalIds);
  const refs = (twinRefs ?? []) as Array<{ claim_id: string; signal_id: string }>;
  const twinIds = [...new Set(refs.map((r) => r.claim_id))].filter((id) => id !== a.mintedClaimId && !a.already?.has(id));
  if (twinIds.length === 0) return out;
  const { data: twins } = await supabase.from("claims").select("id, provenance, status")
    .eq("company_id", a.companyId).in("id", twinIds).eq("provenance", "publicly_declared").neq("status", "struck");
  for (const t of (twins ?? []) as Array<{ id: string }>) {
    const sid = refs.find((r) => r.claim_id === t.id)?.signal_id ?? a.signalIds[0];
    const { error } = await supabase.rpc("set_claim_status", { p_claim_id: t.id, p_status: "struck", p_reason: TWIN_RETIRE_REASON(a.mintedClaimId), p_actor: a.actor ?? "extract-own-words" });
    if (error) throw new Error(`twin retirement failed for ${t.id}: ${error.message}`);
    out.push({ claim_id: t.id, signal_id: sid, replaced_by: a.mintedClaimId });
    a.already?.add(t.id);
  }
  return out;
}
