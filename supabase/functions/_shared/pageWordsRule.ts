// ── THE PAGE-WORDS RULE (operator ruling 39, 2026-10-22; proposal 37) ─────────────────────────────────────────────────
//
// WHY. A line stamped `record` or `you` tells the reader "the record says this" / "you say this". Spectrum's staged reads
// carried such lines whose words no cited row contains — "homes and businesses seeking affordable, reliable connectivity
// and bundled services" over two rows that say only how many homes and states; "Bundle and cross-sell … to maximize
// customer value and retention" over a bundling page. S1 tests figures and names; nothing tested the rest of the words.
//
// THE RULE. A record or you line whose CONTENT WORDS — normalized (lowercase; curly quotes; possessive 's; "U.S." → "us";
// hyphen, dash and slash → space; non-alphanumerics stripped; a light stem), minus stopwords, the company's own name
// words and the FRAMING list — number PAGE_WORDS_THRESHOLD or more absent from its cited rows' VERIFIED page words
// (reReadRowTexts: a signal speaks only through its verified excerpt) takes class our_read.
//   stage    re-stamps, after the judge accepts and before commit — not a refusal, not a re-ask (excluded_by_rule.page_words)
//   promote  re-runs against the live re-read and FAILS CLOSED
//   R37      a predecessor line that fails joins the withheld set (never shown, never demanded, never carried)
// New reads only: no stored read is re-stamped at render time or retroactively. A V1 carry is the row's own bytes, so it
// passes by construction (pageWords.test.ts P37-7 holds every captured span to that).
// Pure: no I/O, no model. Nothing here names a company or a host.
import { citedSlotsOfStoredPayload } from "./citedLines.ts";

export const PAGE_WORDS_RULE_VERSION = "2026-10-22.1" as const;
export const PAGE_WORDS_THRESHOLD = 2;
/** Words that frame a claim rather than state its content — signed with ruling 39, exactly as proposed. */
export const PAGE_WORDS_FRAMING: ReadonlySet<string> = new Set(("promise promises promised commit commits commitment committed serve serves served serving include includes included including " +
  "leverage leverages leveraging provide provides provided providing offer offers offered offering deliver delivers delivering ensure ensures ensuring " +
  "enable enables enabling help helps helping focus focused focusing through continue continues continually maintain maintains maintaining operate operates " +
  "use uses using utilize utilizes make makes making seek seeks seeking aim aims ability able plus while both well").split(" "));
const STOP: ReadonlySet<string> = new Set(("a an the of in to and or for with within without its it is are was were be been being as at by on that this these those " +
  "we our you your their them they from has have had not no than more most other others all any each every can will would who what which whose " +
  "into across over under up via per also such like among then there here so but if when where how about").split(" "));

/** The normalization, applied to a line and to page words alike. */
export function normalizePageWords(t: string): string {
  return String(t ?? "").toLowerCase().replace(/[’‘]/g, "'").replace(/'s\b/g, "")
    .replace(/\b([a-z])\.([a-z])\.?/g, "$1$2")          // u.s. → us
    .replace(/[^a-z0-9%$\s\-–—\/]/g, " ")              // non-alphanumerics stripped (hyphen, dash and slash kept for…)
    .replace(/[-–—\/]/g, " ");                           // …this step: hyphen, dash and slash variants → space
}
export const stemPageWord = (w: string): string => w.replace(/ies$/, "y").replace(/(es|s)$/, "").replace(/(ing|ed|ly)$/, "");
const tokensOf = (t: string) => normalizePageWords(t).split(/\s+/).filter(Boolean);

/** The line's content words that its page text does not carry (in line order, each once). */
export function unsupportedContentWords(line: string, pageText: string, companyName: string): string[] {
  const name = new Set(tokensOf(companyName).map(stemPageWord));
  const page = new Set(tokensOf(pageText));
  const pageStems = new Set([...page].map(stemPageWord));
  const out: string[] = [];
  for (const w of tokensOf(line)) {
    if (w.length < 2 || STOP.has(w) || PAGE_WORDS_FRAMING.has(w)) continue;
    const s = stemPageWord(w);
    // as proposed: the word passes when its stem, or the word itself, is among the page's stems ("business" ↔ "businesses")
    if (name.has(s) || pageStems.has(s) || pageStems.has(w) || page.has(w)) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

export type PageWordsVerdict = { field: string; text: string; class_before: string | null; refs: string[]; unsupported: string[]; flips: boolean };

/** Every record/you line of a stored payload (UUID citations), judged against `rowText` (id → verified page words).
 *  `unclassed: "include"` also judges a line with no stamped class (a read written before 1a-4) unless it cites one of
 *  `ourReadIds` — used for the predecessor (R37); a new read is always classed. */
export function pageWordsVerdicts(
  payload: Record<string, unknown> | null, rowText: Readonly<Record<string, string>>, companyName: string,
  opts: { unclassed?: "skip" | "include"; ourReadIds?: ReadonlySet<string> } = {},
): PageWordsVerdict[] {
  const out: PageWordsVerdict[] = [];
  for (const { line } of citedSlotsOfStoredPayload(payload)) {
    const cls = line.cls;
    const eligible = cls === "record" || cls === "you" ||
      (cls === null && opts.unclassed === "include" && !line.refs.some((r) => opts.ourReadIds?.has(r)));
    if (!eligible || line.refs.length === 0) continue;
    const page = line.refs.map((r) => rowText[r] ?? "").join("\n");
    const unsupported = unsupportedContentWords(line.text, page, companyName);
    out.push({ field: line.field ?? "", text: line.text, class_before: cls, refs: line.refs, unsupported, flips: unsupported.length >= PAGE_WORDS_THRESHOLD });
  }
  return out;
}

/** The stage re-stamp: every slot whose line fails takes class our_read, where it lives. Returns how many flipped. */
export function applyPageWordsRestamp(payload: Record<string, unknown>, verdicts: readonly PageWordsVerdict[]): number {
  const failing = new Set(verdicts.filter((v) => v.flips).map((v) => `${v.field}\u0000${v.text}`));
  let n = 0;
  for (const { line, holder, classKey } of citedSlotsOfStoredPayload(payload)) {
    if (!failing.has(`${line.field ?? ""}\u0000${line.text}`)) continue;
    if (holder[classKey] === "record" || holder[classKey] === "you") { holder[classKey] = "our_read"; n++; }
  }
  return n;
}

/** R37: the predecessor-line keys (predecessorLineKey: field NUL text) of the lines that fail. */
export function pageWordsWithheldKeys(verdicts: readonly PageWordsVerdict[]): Set<string> {
  return new Set(verdicts.filter((v) => v.flips).map((v) => `${v.field}\u0000${v.text}`));
}

/** Promote: the refusal detail when any stored record/you line now fails, else null. */
export function pageWordsRefusalDetail(verdicts: readonly PageWordsVerdict[]): string | null {
  const f = verdicts.filter((v) => v.flips);
  return f.length ? f.map((v) => `${v.field || "(root)"}: "${v.text.slice(0, 80)}" — not in its cited rows: ${v.unsupported.join(", ")}`).join("; ") : null;
}
