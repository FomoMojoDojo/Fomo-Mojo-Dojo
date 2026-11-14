// ── ONE WINDOW'S EXTRACTION (SP-235, SP-237, SP-239 — 2026-11-13) ───────────────────────────────
//
// Pure. No I/O, no model, no clock. It builds the prompt a window is asked, and it reads the answer
// back — including the part that matters most, which is REFUSING an excerpt the window does not
// contain.
//
// RULE 2, "POINTER OVER WORDING", APPLIES HERE UNCHANGED. segment.ts carries the measurement that
// made it a rule: the P6 probe asked a local model for character offsets over a 12,000-character
// window and got 116 spans, 34 of them outside the window or inverted. So the model is never asked
// for an offset. It returns TEXT; locateExcerpt finds that text in the window and the CODE computes
// char_start/char_end. An excerpt the code cannot find is DISCARDED, with the reason recorded —
// never stored with a guessed pointer, and never silently dropped.
//
// WHAT "FIND" MEANS. An excerpt is matched first byte-for-byte, then under the whitespace collapse
// normalizeForHash already performs, because a model reliably re-spaces what it quotes and a quote
// that differs only in whitespace is the same sentence. Any looser match would be the code inventing
// provenance. When the normalized match succeeds, the pointer spans the ORIGINAL characters, so
// text.slice(char_start, char_end) is the document's own wording rather than the model's.
//
// SP-258: A WINDOW'S EXTRACT MAY NOT EXCEED HALF THE WINDOW'S CHARACTERS. Two caps meet that, and the
// second one is the enforcement rather than the arithmetic:
//
//   · the per-kind caps below — 6 items of at most 300 characters, over 3 kinds, is 5,400 characters,
//     45% of a 12,000-character window. Six short items beat four long ones here, because SP-256's
//     round-robin takes the FIRST item of every window before any window gets a second: density per
//     window is what makes a section representable at all.
//   · HALF_WINDOW_FRACTION, checked against the ACTUAL window as items accumulate. The arithmetic
//     above holds only for a full-size window; an oversize window (one block longer than the cap,
//     SP-232) is larger and a short final window is smaller, and the rule is about the window in hand.
//
// SP-239 IS NOT MET BY THESE CAPS AND WAS NEVER GOING TO BE. Extraction stays FULL DENSITY and every
// item it finds is STORED (SP-257); what is bounded is the HAND-OFF to the framework pass, by the
// character budget in mergeExtracts.ts. The two are different questions and conflating them was the
// error in the first sizing: a cap tight enough to bound the hand-off by construction would have had
// to throw away extraction on every document to protect against one document at the 400,000-character
// cap.
import { contentIdentity, normalizeForHash } from "./contentIdentity.ts";

export const EXTRACT_KINDS = ["evidence", "claim", "need"] as const;
export type ExtractKind = typeof EXTRACT_KINDS[number];

/** Per kind, per window (SP-258). */
export const MAX_ITEMS_PER_KIND = 6;
/** A passage longer than this is a page, not a passage; it is cut back to a sentence end. */
export const MAX_EXCERPT_CHARS = 300;
/** SP-258, enforced against the window actually in hand, not against the nominal window size. */
export const HALF_WINDOW_FRACTION = 0.5;

// ── SP-268: THE OUTPUT CAP MUST COVER THE ITEM CAPS, WITH MARGIN ─────────────────────────────────
//
// It did not, and that cost the first acceptance run two windows. WINDOW_NUM_PREDICT was 1,200 while
// the item caps permitted 5,400 characters of text — about 1,670 tokens of JSON once keys, braces and
// escaping are counted — so a window dense enough to fill its own quota could not answer within the
// budget it was given. Both of the 10-Q's failed windows returned completion_tokens of EXACTLY 1,200
// and truncated mid-JSON. I set 1,200 when the caps were 8 x 600 and never revisited it when SP-258
// made them 6 x 300; the two numbers were never reconciled.
//
// They are reconciled here, and TIED: windowOutputTokens() derives the requirement from the item caps
// themselves, so the caps cannot move without the requirement moving with them, and
// ingest-chunking-guard asserts WINDOW_NUM_PREDICT clears it by SP-268's 25% margin.
export const NUM_PREDICT_MARGIN = 1.25;
/** Characters per JSON token, pessimistic on purpose — a cap that is too small truncates. */
const JSON_CHARS_PER_TOKEN = 3.4;

/** The tokens a full answer needs at the given caps: the text, plus the JSON around it. */
export function windowOutputTokens(
  maxItemsPerKind = MAX_ITEMS_PER_KIND,
  maxExcerptChars = MAX_EXCERPT_CHARS,
): number {
  const text = maxItemsPerKind * maxExcerptChars * EXTRACT_KINDS.length;
  //  {"text":"..."},  per item, and  "evidence":[],  per kind, plus the enclosing braces
  const scaffolding = maxItemsPerKind * EXTRACT_KINDS.length * 13 + EXTRACT_KINDS.length * 14 + 2;
  return Math.ceil((text + scaffolding) / JSON_CHARS_PER_TOKEN);
}

/** What the worker asks Ollama for. Clears windowOutputTokens() by more than SP-268's margin. */
export const WINDOW_NUM_PREDICT = 2_400;

// ── SP-269: A DETERMINISTIC FAILURE IS NEVER RETRIED IDENTICALLY ─────────────────────────────────
//
// At temperature 0 the same input returns the same answer. The 10-Q's two failed windows proved it:
// three attempts each, byte-identical prompt and completion token counts, ~105 seconds of local model
// time per window spent re-learning the same fact. A timeout or a transport error is NOT deterministic
// and keeps its two identical retries; a truncated or unparseable ANSWER gets exactly one retry, with
// the item caps HALVED so the model is asked for something it can actually fit.
export const DETERMINISTIC_FAILURE_CODES = new Set(["window_answer_unparseable", "window_answer_truncated"]);
/** The caps a deterministic failure's single retry uses. */
export function halvedCaps(): { maxItemsPerKind: number; maxExcerptChars: number } {
  return {
    maxItemsPerKind: Math.max(1, Math.floor(MAX_ITEMS_PER_KIND / 2)),
    maxExcerptChars: Math.max(80, Math.floor(MAX_EXCERPT_CHARS / 2)),
  };
}

export type WindowExtractItem = {
  kind: ExtractKind;
  /** The model's returned order within this kind, 0-based. SP-256's round-robin ranks on it, so it
   *  is stored rather than re-derived: "the model's returned order" stops existing the moment the
   *  rows come back from a database in any other order. */
  item_index: number;
  text: string;
  excerpt_sha: string;
  /** Absolute into the DOCUMENT's text, computed by this file from the window's own offset. */
  char_start: number;
  char_end: number;
};

export type WindowExtractResult = {
  items: WindowExtractItem[];
  /** Every item the model returned that the code could not place, with why. Recorded, not hidden. */
  discarded: Array<{ kind: string; text: string; reason: string }>;
};

// ── the prompt ───────────────────────────────────────────────────────────────────────────────────
//
// EXTRACTION ONLY (SP-235). It must not interpret, score, prioritise or frame: the framework pass does
// that once, over the merged extract (SP-238). The instruction says so in those terms, because a model
// asked for "findings" returns interpretation and the merge would then be merging opinions.
export function windowExtractSystem(
  maxItemsPerKind = MAX_ITEMS_PER_KIND,
  maxExcerptChars = MAX_EXCERPT_CHARS,
): string {
  return [
    "You extract from ONE SECTION of a longer document. You never interpret, score, rank or summarise.",
    "",
    "Return STRICT JSON, no prose, with exactly these keys:",
    '  {"evidence": [{"text": "..."}], "claims": [{"text": "..."}], "needs": [{"text": "..."}]}',
    "",
    "evidence — sentences COPIED VERBATIM from the section, each one a fact a reader could check.",
    "           Copy the characters exactly as they appear. Do not paraphrase, join or tidy them.",
    "claims   — statements the document ASSERTS about itself, its market or its performance, copied",
    "           verbatim from the section.",
    "needs    — a customer outcome the section implies, written as a desired outcome WITHOUT naming a",
    "           solution. This is the only key whose text need not be verbatim.",
    "",
    `At most ${maxItemsPerKind} items per key, each at most ${maxExcerptChars} characters.`,
    "Fewer is correct when the section holds fewer.",
    "An empty list is a valid answer for any key: a page of figures may hold no claim at all.",
    "",
    "Do NOT return character offsets, line numbers or positions of any kind. They are computed from",
    "your text, and any you supply are discarded.",
  ].join("\n");
}

/** The default prompt, kept as a constant so the guard and the tests can read it without arguments. */
export const WINDOW_EXTRACT_SYSTEM = windowExtractSystem();

export function buildWindowExtractUser(args: {
  fileName: string;
  windowIndex: number;
  windowCount: number;
  windowText: string;
}): string {
  const { fileName, windowIndex, windowCount, windowText } = args;
  return [
    `Document: ${fileName}`,
    `Section ${windowIndex + 1} of ${windowCount}. Extract from THIS SECTION ONLY.`,
    "",
    "--- SECTION START ---",
    windowText,
    "--- SECTION END ---",
  ].join("\n");
}

// ── placing an excerpt ───────────────────────────────────────────────────────────────────────────

/**
 * Find `needle` in `haystack` and return the ORIGINAL character range it occupies, or null.
 * Exact match first; then a whitespace-insensitive match, because a model re-spaces what it quotes.
 * Nothing looser: a fuzzy match would be the code inventing provenance.
 */
export function locateExcerpt(haystack: string, needle: string): { start: number; end: number } | null {
  const want = String(needle ?? "").trim();
  if (!want) return null;
  const exact = haystack.indexOf(want);
  if (exact >= 0) return { start: exact, end: exact + want.length };

  // Whitespace-insensitive: walk the haystack keeping a map from its collapsed form back to original
  // offsets, so the range returned always spans the document's own characters.
  const wantCollapsed = want.replace(/\s+/g, " ").trim().toLowerCase();
  if (!wantCollapsed) return null;
  let collapsed = "";
  const originalAt: number[] = []; // collapsed index -> original index
  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack[i];
    if (/\s/.test(ch)) {
      if (collapsed.length && !collapsed.endsWith(" ")) { collapsed += " "; originalAt.push(i); }
      continue;
    }
    collapsed += ch.toLowerCase();
    originalAt.push(i);
  }
  const at = collapsed.indexOf(wantCollapsed);
  if (at < 0) return null;
  const start = originalAt[at];
  const lastCollapsed = at + wantCollapsed.length - 1;
  const end = originalAt[Math.min(lastCollapsed, originalAt.length - 1)] + 1;
  return end > start ? { start, end } : null;
}

/** A passage longer than the cap is cut back to its last sentence end, else hard-cut. */
function capExcerpt(text: string, cap = MAX_EXCERPT_CHARS): string {
  const t = text.trim();
  if (t.length <= cap) return t;
  const head = t.slice(0, cap);
  const lastStop = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  return (lastStop > cap / 2 ? head.slice(0, lastStop + 1) : head).trim();
}

const KEY_FOR_KIND: Record<ExtractKind, string> = { evidence: "evidence", claim: "claims", need: "needs" };

/**
 * Read one window's model answer. `windowText` is the section as the code cut it and `windowStart` its
 * absolute offset, so every stored pointer is absolute into the document.
 *
 * `evidence` and `claim` MUST be placeable in the window or they are discarded — they are quotes, and a
 * quote that is not in the text is not a quote. `need` is a written outcome, not a quote (the prompt
 * says so), so it is stored pointing at the WHOLE window: the honest pointer for "this section implied
 * it" is the section.
 */
export async function readWindowExtract(args: {
  raw: unknown;
  windowText: string;
  windowStart: number;
  /** SP-269: a deterministic failure's single retry passes HALVED caps here. */
  maxItemsPerKind?: number;
  maxExcerptChars?: number;
}): Promise<WindowExtractResult> {
  const { raw, windowText, windowStart } = args;
  const maxItems = args.maxItemsPerKind ?? MAX_ITEMS_PER_KIND;
  const maxChars = args.maxExcerptChars ?? MAX_EXCERPT_CHARS;
  const obj = (typeof raw === "string" ? safeJson(raw) : raw) as Record<string, unknown> | null;
  const items: WindowExtractItem[] = [];
  const discarded: WindowExtractResult["discarded"] = [];
  if (!obj || typeof obj !== "object") {
    return { items, discarded: [{ kind: "*", text: "", reason: "answer was not JSON" }] };
  }

  // SP-258: the allowance is half of THIS window, so an oversize window gets proportionally more and
  // a short tail window less. Counted over the stored text of every kind together, because the rule is
  // about how much of the window the extract reproduces, not about any one kind.
  const halfWindow = Math.floor(windowText.length * HALF_WINDOW_FRACTION);
  let takenChars = 0;

  for (const kind of EXTRACT_KINDS) {
    const list = obj[KEY_FOR_KIND[kind]];
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    let kept = 0;
    for (const entry of list) {
      if (kept >= maxItems) {
        discarded.push({ kind, text: "", reason: `over the ${maxItems}-item cap for this kind` });
        break;
      }
      const text = capExcerpt(String(
        (entry && typeof entry === "object" ? (entry as Record<string, unknown>).text : entry) ?? "",
      ), maxChars);
      if (!text) { discarded.push({ kind, text: "", reason: "empty text" }); continue; }
      if (takenChars + text.length > halfWindow) {
        discarded.push({ kind, text, reason: `would pass SP-258's half-window allowance (${halfWindow} chars)` });
        continue;
      }

      let start = windowStart;
      let end = windowStart + windowText.length;
      if (kind !== "need") {
        const found = locateExcerpt(windowText, text);
        if (!found) {
          // The one refusal that matters: a quote the window does not contain.
          discarded.push({ kind, text, reason: "not found verbatim in this section" });
          continue;
        }
        start = windowStart + found.start;
        end = windowStart + found.end;
      }
      const sha = await contentIdentity(text);
      if (seen.has(sha)) { discarded.push({ kind, text, reason: "duplicate within this section" }); continue; }
      seen.add(sha);
      // item_index is the position among the items KEPT for this kind, in the model's returned order.
      items.push({ kind, item_index: kept, text, excerpt_sha: sha, char_start: start, char_end: end });
      kept += 1;
      takenChars += text.length;
    }
  }
  return { items, discarded };
}

function safeJson(s: string): unknown {
  const trimmed = s.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { return null; }
}

/**
 * The largest EXTRACTION a document can produce — what is stored, not what is handed to the framework
 * pass. The hand-off is bounded separately and absolutely by MERGED_EXTRACT_BUDGET (SP-255), so this
 * number is for sizing storage and reporting `items_extracted`, never for deciding what fits a call.
 */
export function extractionCeiling(documentCharCap: number, windowChars: number): {
  windows: number; items: number; chars: number;
} {
  const windows = Math.ceil(documentCharCap / windowChars);
  const perWindowChars = Math.min(
    EXTRACT_KINDS.length * MAX_ITEMS_PER_KIND * MAX_EXCERPT_CHARS,
    Math.floor(windowChars * HALF_WINDOW_FRACTION),
  );
  return {
    windows,
    items: windows * EXTRACT_KINDS.length * MAX_ITEMS_PER_KIND,
    chars: windows * perWindowChars,
  };
}

export { normalizeForHash };
