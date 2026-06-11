// B2.0 — Syndication gate: content-level client-voice fingerprinting.
//
// Domain-level classing cannot catch a third-party host republishing client copy
// (run-16 bouncewatch case: genuinely third-party domain, content nearly verbatim
// iaqm.com/about). This module decides whether a candidate item's TEXT is substantially
// client copy. Verdicts gate corroboration rights only — voice_class is untouched
// (no fifth class; council 2026-06-11), and the stamp lives alongside it.
//
// Detection is deterministic-first with a LOCAL-LLM uncertain band. NEVER an
// external-model call in this module — the only network call is Ollama on the
// operator's machine (OLLAMA_BASE_URL).
//
// Measure: word-shingle containment, ITEM-relative — the proportion of the candidate's
// shingles found in the client corpus. Item-relative means two quoted sentences inside
// a longer genuine article score low (quote-level overlap passes clean); a short item
// that is mostly client copy scores high.
//
// CALIBRATION INPUTS (reported, not hidden):
// - SHINGLE_N = 8 words. At n=5, category boilerplate and honest quotation start
//   colliding ("mold remediation services in Dallas Texas" class phrases); at n=8 a
//   match requires a genuinely copied prose run. Near-dup detection literature sits at
//   n 5–10; 8 favors precision (false-syndicated is the costly error: it strips rights
//   from genuine outside voice).
// - HIGH ≥ 0.5 ⇒ syndicated: half or more of the item is client prose — substantial
//   copy, not quotation.
// - LOW ≤ 0.2 ⇒ clean: up to a fifth of an item may be quoted client phrasing without
//   the item being a syndication (registry entries and reviews echo company language).
// - Between ⇒ uncertain ⇒ local LLM yes/no with both texts.
// - Items shorter than SHINGLE_N words produce zero shingles ⇒ score 0 ⇒ clean.
//   Documented limitation: a sub-8-word pure-copy fragment evades the shingle test,
//   but a fragment that short cannot substantively corroborate either.

const SHINGLE_N = 8;
const HIGH_THRESHOLD = 0.5;
const LOW_THRESHOLD = 0.2;
// Paraphrase trigger (calibrated on the run-16 known case): exact shingles score 0.0 on
// inflection-level paraphrase ("has propelled them to decontaminate" vs "we have
// decontaminated"), so the LLM band also opens on stopword-filtered VOCABULARY
// containment — the share of the item's distinctive words present in the client corpus.
// Measured: bouncewatch (paraphrased syndication) 0.48; NADCA registry entry (genuine
// outside voice echoing company facts) 0.125. 0.4 splits with margin both ways.
// First calibration attempt used stopword-filtered vocabulary containment at 0.4 — it
// over-opened against the real corpus (in-domain words like mold/remediation/IAQM are
// shared by ALL genuine items; 21 of 24 basis items banded). Replaced with a SECONDARY
// SHINGLE at n=4: short enough to survive inflection-level paraphrase, long enough to
// stay phrase-specific. Measured on the run-16 known case against the real narrative:
// bouncewatch 4-gram containment 0.184; NADCA registry control 0.0.
const BAND_SHINGLE_N = 4;
const BAND_SHINGLE_THRESHOLD = 0.1;

type SyndicationVerdict = {
  score: number;
  syndicated: boolean | null; // null = uncertain band unresolved (local LLM unavailable)
  method: "deterministic" | "local_llm" | "unresolved" | "stored";
};

function normalizeWords(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(text: string, n = SHINGLE_N): Set<string> {
  const words = normalizeWords(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= words.length; i++) {
    out.add(words.slice(i, i + n).join(" "));
  }
  return out;
}

// The client public-copy corpus: a set of shingles drawn from everything the company
// says about itself in PUBLIC data (client_voice signal text + legacy company-source
// rows + any in-memory client items from the run being processed). All inputs are
// public by construction; detection itself runs locally regardless.
export type ClientCorpus = { shingles: Set<string>; bandShingles: Set<string>; texts: string[] };

export function buildCorpusFromTexts(texts: string[]): ClientCorpus {
  const corpus: ClientCorpus = { shingles: new Set<string>(), bandShingles: new Set<string>(), texts: [...texts] };
  for (const t of texts) {
    for (const s of shingles(t)) corpus.shingles.add(s);
    for (const s of shingles(t, BAND_SHINGLE_N)) corpus.bandShingles.add(s);
  }
  return corpus;
}

// The LLM's TEXT B must be the client copy MOST SIMILAR to the candidate — handing it an
// arbitrary sample asks the right question with the wrong exhibit (the first production
// run cleared the bouncewatch syndication because TEXT B lacked the narrative it copies).
// Deterministic top-k by band-shingle overlap, per candidate.
export function mostSimilarClientTexts(itemText: string, corpus: ClientCorpus, k = 3): string {
  const itemShingles = shingles(itemText, BAND_SHINGLE_N);
  const scored = corpus.texts
    .map((t) => {
      const ts = shingles(t, BAND_SHINGLE_N);
      let hit = 0;
      for (const sh of ts) if (itemShingles.has(sh)) hit++;
      return { t, hit };
    })
    .sort((a, b) => b.hit - a.hit)
    .slice(0, k)
    .map((x) => x.t);
  return scored.join("\n---\n").slice(0, 4000);
}

function companyHostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Store-side corpus: client-classified rows plus legacy rows that the company-source
// heuristic identifies (company-domain URL, profile_or_company_page, company_claim
// bucket in raw_payload) — the same provenance authority the judges use.
export async function buildClientCorpus(
  supabase: { from: (t: string) => any },
  companyId: string,
  companyHost: string,
  extraClientTexts: string[] = [],
): Promise<ClientCorpus> {
  const texts: string[] = [...extraClientTexts];
  try {
    const { data } = await supabase
      .from("signals")
      .select("claim_text, evidence_excerpt, source_url, voice_class, raw_payload")
      .eq("company_id", companyId)
      .limit(1000);
    for (const row of (Array.isArray(data) ? data : [])) {
      const r = row as {
        claim_text?: string; evidence_excerpt?: string; source_url?: string;
        voice_class?: string | null; raw_payload?: { bucket?: string; source_type?: string } | null;
      };
      const host = companyHostOf(String(r.source_url || ""));
      const isClient =
        r.voice_class === "client_voice" ||
        (r.voice_class == null && (
          (host && companyHost && (host === companyHost || host.endsWith(`.${companyHost}`))) ||
          String(r.raw_payload?.source_type || "") === "profile_or_company_page" ||
          String(r.raw_payload?.bucket || "") === "company_claim"
        ));
      if (isClient) {
        if (r.claim_text) texts.push(r.claim_text);
        if (r.evidence_excerpt && r.evidence_excerpt !== r.claim_text) texts.push(r.evidence_excerpt);
      }
    }
  } catch (error) {
    console.warn("[syndication] corpus fetch failed — corpus limited to in-memory client texts", {
      message: String(error instanceof Error ? error.message : error),
    });
  }
  return buildCorpusFromTexts(texts);
}

export function deterministicSyndicationScore(itemText: string, corpus: ClientCorpus): number {
  const itemShingles = shingles(itemText);
  if (itemShingles.size === 0 || corpus.shingles.size === 0) return 0;
  let hit = 0;
  for (const s of itemShingles) if (corpus.shingles.has(s)) hit++;
  return hit / itemShingles.size;
}

export function bandShingleContainment(itemText: string, corpus: ClientCorpus): number {
  const itemShingles = shingles(itemText, BAND_SHINGLE_N);
  if (itemShingles.size === 0 || corpus.bandShingles.size === 0) return 0;
  let hit = 0;
  for (const s of itemShingles) if (corpus.bandShingles.has(s)) hit++;
  return hit / itemShingles.size;
}

// Local-LLM uncertain band. Ollama only (operator's machine). Returns null when the
// local model is unavailable — callers treat null as "exclude from corroboration this
// call, do NOT persist a verdict" (rights-conservative, loudly logged, never silent).
async function localLlmSyndicationCheck(itemText: string, clientSample: string): Promise<boolean | null> {
  // OLLAMA_SYNDICATION_BASE_URL deliberately bypasses [edge_runtime.secrets], which maps
  // OLLAMA_BASE_URL = env(OLLAMA_BASE_URL) and clobbers the .env.local value with the
  // (empty) shell env at stack start. Vars NOT in that mapping pass through (Dify pattern).
  const base = (globalThis as any).Deno?.env?.get?.("OLLAMA_SYNDICATION_BASE_URL") ||
    (globalThis as any).Deno?.env?.get?.("OLLAMA_BASE_URL");
  // B2.0.1: band judge upgraded to llama3:70b (council; forcing data = within-run flip on
  // bouncewatch + ZoomInfo PPP false positive). 70b judges the band DIRECTLY — no 8b first
  // pass: a confirm-by-70b design runs 70b on every band item anyway, so the 8b pass adds
  // latency plus a second flip surface and saves nothing. Measured ~18s cold / a few s warm
  // per item; band items are rare (2-3 per run).
  const model = (globalThis as any).Deno?.env?.get?.("OLLAMA_SYNDICATION_MODEL") || "llama3:70b";
  if (!base) { console.warn("[syndication] local LLM: no base URL in runtime env (OLLAMA_SYNDICATION_BASE_URL / OLLAMA_BASE_URL both unset)"); return null; }
  try {
    // OLLAMA_BASE_URL in this stack ends in /v1 (OpenAI-compat path); the native
    // generate API lives at the root — strip a trailing /v1 before appending.
    const root = String(base).replace(/\/+$/, "").replace(/\/v1$/, "");
    const res = await fetch(`${root}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        prompt:
          `You compare two texts. Answer with exactly one word: YES or NO.\n` +
          `Is TEXT A substantially a republication of the company's own copy shown in TEXT B ` +
          `(same narrative restated, not merely quoting a phrase or two)?\n\n` +
          `TEXT A (candidate):\n${itemText.slice(0, 2000)}\n\n` +
          `TEXT B (company's own copy):\n${clientSample.slice(0, 4000)}\n\nAnswer:`,
      }),
    });
    if (!res.ok) { console.warn("[syndication] local LLM HTTP error", { status: res.status }); return null; }
    const data = await res.json();
    const answer = String((data as any)?.response || "").trim().toUpperCase();
    if (answer.startsWith("YES")) return true;
    if (answer.startsWith("NO")) return false;
    return null;
  } catch (error) {
    console.warn("[syndication] local LLM fetch failed", { message: String(error instanceof Error ? error.message : error).slice(0, 200) });
    return null;
  }
}

export async function resolveSyndication(
  itemText: string,
  corpus: ClientCorpus,
  clientSampleForLlm: string,
): Promise<SyndicationVerdict> {
  const score = deterministicSyndicationScore(itemText, corpus);
  if (score >= HIGH_THRESHOLD) return { score, syndicated: true, method: "deterministic" };
  const bandScore = bandShingleContainment(itemText, corpus);
  // Clean only when BOTH measures are low: 8-gram share under LOW and 4-gram share under
  // the paraphrase trigger. Otherwise the local LLM decides.
  if (score <= LOW_THRESHOLD && bandScore < BAND_SHINGLE_THRESHOLD) {
    return { score, syndicated: false, method: "deterministic" };
  }
  const targetedSample = mostSimilarClientTexts(itemText, corpus) || clientSampleForLlm;
  const llm = await localLlmSyndicationCheck(itemText, targetedSample);
  if (llm === null) {
    console.warn("[syndication] uncertain band UNRESOLVED — local LLM unavailable; item excluded from corroboration this call, verdict NOT persisted", { score });
    return { score, syndicated: null, method: "unresolved" };
  }
  return { score, syndicated: llm, method: "local_llm" };
}

// ── B2.0.1: durable verdict store — one content identity, one verdict ─────────────
// Verdicts are keyed by (company_id, source_url, hash of NORMALIZED judged text), so the
// same evidence item gets the same verdict in every consumer (claim judge, attribute
// judge, ingest stamping) within a run and across runs. First resolved verdict wins
// (insert-ignore). Unresolved (local model unavailable) is never persisted: the item is
// excluded this call and the question stays open — fail-safe is exclusion, not a verdict.
// Normalizing before hashing makes the identity robust to whitespace/punctuation drift
// between a ledger snippet and a signals claim_text carrying the same content.

export async function syndicationTextHash(text: string): Promise<string> {
  const normalized = normalizeWords(text).join(" ");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function resolveSyndicationDurable(opts: {
  supabase: { from: (t: string) => any };
  companyId: string;
  sourceUrl: string;
  itemText: string;
  corpus: ClientCorpus;
  clientSampleForLlm: string;
  label: string;
}): Promise<SyndicationVerdict> {
  const hash = await syndicationTextHash(opts.itemText);
  try {
    const { data } = await opts.supabase
      .from("syndication_verdicts")
      .select("syndicated, syndication_score, method")
      .eq("company_id", opts.companyId)
      .eq("source_url", opts.sourceUrl)
      .eq("text_hash", hash)
      .maybeSingle();
    if (data && typeof (data as any).syndicated === "boolean") {
      console.log(`[syndication] ${opts.label} stored verdict read`, {
        url: opts.sourceUrl,
        syndicated: (data as any).syndicated,
        score: Number((data as any).syndication_score),
        original_method: String((data as any).method),
      });
      return { score: Number((data as any).syndication_score), syndicated: (data as any).syndicated, method: "stored" };
    }
  } catch (error) {
    console.warn(`[syndication] ${opts.label} verdict store read failed — resolving live`, {
      message: String(error instanceof Error ? error.message : error).slice(0, 200),
    });
  }
  const verdict = await resolveSyndication(opts.itemText, opts.corpus, opts.clientSampleForLlm);
  if (verdict.syndicated !== null) {
    try {
      await opts.supabase
        .from("syndication_verdicts")
        .upsert(
          {
            company_id: opts.companyId,
            source_url: opts.sourceUrl,
            text_hash: hash,
            syndicated: verdict.syndicated,
            syndication_score: Number(verdict.score.toFixed(4)),
            method: verdict.method,
          },
          { onConflict: "company_id,source_url,text_hash", ignoreDuplicates: true },
        );
    } catch (error) {
      console.warn(`[syndication] ${opts.label} verdict store write failed — in-memory verdict still applied this call`, {
        message: String(error instanceof Error ? error.message : error).slice(0, 200),
      });
    }
  }
  return verdict;
}

export const SYNDICATION_PARAMS = { SHINGLE_N, HIGH_THRESHOLD, LOW_THRESHOLD, BAND_SHINGLE_N, BAND_SHINGLE_THRESHOLD };
