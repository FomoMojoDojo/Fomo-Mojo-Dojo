// ── THE MERGE (SP-237, SP-238, SP-239 — 2026-11-13) ─────────────────────────────────────────────
//
// Pure. No I/O, no model, no clock. It turns the per-window extract rows into the ONE extract the
// framework pass reads (SP-238: once per document, over the merged extract, producing one
// file_proposals row as today).
//
// IDENTITY IS THE EXCERPT (SP-237). Rows group on (kind, sha256(normalizeForHash(text))) — the same
// identity authority everything else uses. The same sentence found in two windows is ONE merged row
// carrying BOTH window refs, which is strictly more than a deduplicated list: "this appears in
// sections 3 and 11" is a fact about the document, and it is only knowable because the windows were
// read separately.
//
// TRACEABILITY USES THE EXCERPT GUARD'S OWN PREDICATE, not a copy of it. verbatimOn(excerpt, sidecar)
// is imported from excerptBlanking.ts, so "traceable to the sidecar" means here exactly what it means
// to the guard that blanks untraceable excerpts. An untraceable excerpt is DROPPED from the merge and
// reported — it never reaches the framework pass, because an excerpt that cannot be traced is the one
// thing this whole pipeline exists to not produce.
//
// `need` ROWS ARE EXEMPT FROM VERBATIM TRACEABILITY, BY CONSTRUCTION AND ON PURPOSE. A need is a
// written desired outcome, not a quote: the prompt asks for one in the model's own words, and its
// pointer is the whole window that implied it. Checking it verbatim against the sidecar would reject
// every one of them, so a need is traced to its WINDOW instead — which is recorded, and is the honest
// claim. Evidence and claims are quotes and are checked.
import { verbatimOn } from "./excerptBlanking.ts";
import { EXTRACT_KINDS, type ExtractKind, MAX_EXCERPT_CHARS } from "./windowExtract.ts";

// ── THE HAND-OFF BUDGET (SP-255) ────────────────────────────────────────────────────────────────
//
// 10,000 characters, FIXED, and MEASURED rather than guessed.
//
// The number that was NOT used: ~120,000, which I had read off `normalizeText`'s old cap as
// "demonstrably carried". It never was. Dify's own record holds both failures: run 1291fccd, the
// 58,992-character whole document, was STOPPED at 1,555.6 s with Adjudication killed at its 600 s
// cap; run a56cb509, 51,483 characters, FAILED with JTBD at the 300 s read timeout.
//
// SP-255 set a starting budget of 24,000 and required it be confirmed on the 10-Q — slowest node
// under 240 s, workflow under 960 s — and LOWERED if it missed. It missed, on the node:
//
//     measured at a 23,880-character hand-off:  workflow 753.0 s  (passes, < 960)
//                                               Adjudication 364.0 s  (MISSES, > 240)
//
// Adjudication is the node that reads the whole extract, so it is the one the budget governs. Two
// observations of it — 364.0 s at 23,880 characters, and >= 600 s at 58,992 — fit t proportional to
// chars^0.553, which puts 240 s at about 11,240 characters. That exponent is a LOWER bound, because
// the 600 s point was capped rather than completed, so the real curve is steeper and a cut buys more
// than this estimate credits. 10,000 therefore has margin, and it lands where PROPOSAL.md sized the
// merged hand-off in the first place (~12,000).
//
// NO CEILING MOVED in either direction. The budget came down to meet the ceilings that exist.
export const MERGED_EXTRACT_BUDGET = 10_000;

export type ExtractRow = {
  kind: string;
  item_index: number;
  text: string;
  excerpt_sha: string;
  window_index: number;
  char_start: number;
  char_end: number;
};

export type MergedItem = {
  kind: ExtractKind;
  /** The model's returned rank within its FIRST window's kind. SP-256's round-robin orders on it. */
  item_index: number;
  text: string;
  excerpt_sha: string;
  /** Every window this excerpt was found in, ascending. Length > 1 is the repetition itself. */
  windows: number[];
  /** The FIRST occurrence's pointer, so a reader can always go to one verified place in the document. */
  char_start: number;
  char_end: number;
  occurrences: number;
};

export type MergeResult = {
  items: MergedItem[];
  /** Quotes the sidecar does not contain. Dropped, never passed on, always reported. */
  untraceable: Array<{ kind: string; text: string; windows: number[] }>;
  stats: {
    rows_in: number;
    items_out: number;
    repeated: number;
    dropped_untraceable: number;
    chars_out: number;
  };
};

export function mergeWindowExtracts(rows: readonly ExtractRow[], sidecarText: string): MergeResult {
  const byIdentity = new Map<string, MergedItem>();
  const untraceable: MergeResult["untraceable"] = [];

  // Document order is the reading order: group in ascending (window, offset) so the pointer a merged
  // item keeps is its FIRST occurrence rather than whichever row the database happened to return first.
  const ordered = [...rows].sort((a, b) =>
    a.window_index - b.window_index || a.char_start - b.char_start
  );

  for (const row of ordered) {
    if (!EXTRACT_KINDS.includes(row.kind as ExtractKind)) continue;
    const kind = row.kind as ExtractKind;
    const key = `${kind}:${row.excerpt_sha}`;
    const existing = byIdentity.get(key);
    if (existing) {
      if (!existing.windows.includes(row.window_index)) existing.windows.push(row.window_index);
      existing.occurrences += 1;
      continue;
    }
    // A quote must be in the document. A need is not a quote (see the header).
    if (kind !== "need" && !verbatimOn(row.text, sidecarText)) {
      untraceable.push({ kind, text: row.text, windows: [row.window_index] });
      continue;
    }
    byIdentity.set(key, {
      kind,
      item_index: row.item_index,
      text: row.text,
      excerpt_sha: row.excerpt_sha,
      windows: [row.window_index],
      char_start: row.char_start,
      char_end: row.char_end,
      occurrences: 1,
    });
  }

  const items = [...byIdentity.values()].sort((a, b) =>
    EXTRACT_KINDS.indexOf(a.kind) - EXTRACT_KINDS.indexOf(b.kind) ||
    a.windows[0] - b.windows[0] || a.char_start - b.char_start
  );
  const text = buildMergedExtractText(items);
  return {
    items,
    untraceable,
    stats: {
      rows_in: rows.length,
      items_out: items.length,
      repeated: items.filter((i) => i.windows.length > 1).length,
      dropped_untraceable: untraceable.length,
      chars_out: text.length,
    },
  };
}

/**
 * The text the framework pass reads. It is NOT the document: it is the merged extract, and it says so,
 * because a framework pass that believed it had the whole document would frame the gaps as absences.
 * A repeated excerpt carries its sections, since repetition across a filing is itself a signal.
 */
/** The hand-off's preamble. A const so the budget can be charged its exact size up front. */
const MERGED_HEADER = [
  "MERGED EXTRACT — this is not the document. It is the passages, claims and candidate needs that",
  "extraction found, section by section, with the sections each one was found in. Nothing here is",
  "interpretation; that is this pass's job.",
];

export function buildMergedExtractText(items: readonly MergedItem[]): string {
  if (!items.length) return "";
  const out: string[] = [...MERGED_HEADER];
  for (const kind of EXTRACT_KINDS) {
    const mine = items.filter((i) => i.kind === kind);
    if (!mine.length) continue;
    out.push("", `## ${kind.toUpperCase()} (${mine.length})`);
    for (const item of mine) {
      const where = item.windows.length > 1
        ? `sections ${item.windows.map((w) => w + 1).join(", ")}`
        : `section ${item.windows[0] + 1}`;
      out.push(`- [${where}] ${item.text}`);
    }
  }
  return out.join("\n");
}

// ── SELECTION INTO THE BUDGET (SP-256, SP-257) ──────────────────────────────────────────────────
//
// DETERMINISTIC ROUND-ROBIN, AND NEVER A TAIL CUT. The order is rank-major: every window's FIRST item
// is taken before any window's second, so a 77-page filing hands the framework pass something from
// section 77 as surely as from section 1. A tail cut — fill the budget in document order and stop —
// would have handed over the first eight sections of the Charter 10-Q and nothing else, which is the
// 30-page cap again by another name.
//
// The rank for a merged item is its position in the MODEL's returned order within its first window's
// kind (item_index), which is why that ordinal is stored on the row rather than re-derived: rows come
// back from a database in whatever order it likes, and "the model's returned order" would not survive
// the trip.
//
// WHOLE ITEMS ONLY. An item that does not fit is skipped and the round-robin continues, because a
// half-sentence handed to a framework pass is a misquote. Items are measured as the LINES they become
// in the hand-off text, header included, so the budget is the thing SP-255 names — the size of what
// is actually sent — and not an estimate of it.
//
// NOTHING IS LOST BY THIS (SP-257). Every extracted item is already stored in file_proposal_extracts.
// Selection decides what this pass INTERPRETS; the row records items_extracted beside
// items_interpreted, and a document that was fully read but not fully interpreted is NOT partial —
// partial stays for failed windows and for chars_capped.
export type SelectionResult = {
  selected: MergedItem[];
  text: string;
  /** Items merged but not handed over, because the budget filled. Stored, never discarded. */
  not_interpreted: MergedItem[];
  stats: { budget: number; chars: number; items_merged: number; items_interpreted: number; windows_represented: number };
};

export function selectForBudget(
  items: readonly MergedItem[],
  budget = MERGED_EXTRACT_BUDGET,
): SelectionResult {
  // Group by (kind, first window) so the round-robin can walk ranks across windows.
  const byKindWindow = new Map<string, MergedItem[]>();
  for (const item of items) {
    const key = `${item.kind}|${item.windows[0]}`;
    const list = byKindWindow.get(key) ?? [];
    list.push(item);
    byKindWindow.set(key, list);
  }
  for (const list of byKindWindow.values()) {
    list.sort((a, b) => a.item_index - b.item_index || a.char_start - b.char_start);
  }
  const windows = [...new Set(items.map((i) => i.windows[0]))].sort((a, b) => a - b);
  const maxRank = Math.max(0, ...[...byKindWindow.values()].map((l) => l.length));

  const selected: MergedItem[] = [];
  const taken = new Set<string>();
  // The header is paid for once, up front, so the budget covers the whole hand-off and not just its
  // body. buildMergedExtractText([]) is "" by design, so its size is charged from the const instead.
  let used = MERGED_HEADER.join("\n").length + MERGED_HEADER_SLACK;
  for (let rank = 0; rank < maxRank; rank++) {
    for (const kind of EXTRACT_KINDS) {
      for (const window of windows) {
        const list = byKindWindow.get(`${kind}|${window}`);
        const item = list?.[rank];
        if (!item) continue;
        const cost = itemLineCost(item);
        if (used + cost > budget) continue; // skip and keep going: whole items only, no tail cut
        selected.push(item);
        taken.add(`${item.kind}:${item.excerpt_sha}`);
        used += cost;
      }
    }
  }
  // Emit in reading order, not selection order: the hand-off is read by a model, and document order is
  // how a document reads. Selection order decided WHAT; it has no business deciding how it looks.
  const ordered = [...selected].sort((a, b) =>
    EXTRACT_KINDS.indexOf(a.kind) - EXTRACT_KINDS.indexOf(b.kind) ||
    a.windows[0] - b.windows[0] || a.char_start - b.char_start
  );
  const text = buildMergedExtractText(ordered);
  return {
    selected: ordered,
    text,
    not_interpreted: items.filter((i) => !taken.has(`${i.kind}:${i.excerpt_sha}`)),
    stats: {
      budget,
      chars: text.length,
      items_merged: items.length,
      items_interpreted: ordered.length,
      windows_represented: new Set(ordered.map((i) => i.windows[0])).size,
    },
  };
}

// ── SP-271: THE READ CAP IS A WINDOW COUNT, AND IT IS COMPUTED ──────────────────────────────────
//
// SP-267 tried to deliver "every window read is represented in the hand-off" with a CHARACTER cap, and
// no character cap can: window count is not a function of characters. A 6,001-character block cannot
// share a 12,000-character window, so it takes one of its own — measured, 350,000 characters is 30
// windows at the 10-Q's own page density and 59 when blocks are that size. The highest character cap
// that would bound the count for ANY shape was about 178,000, barely above the 10-Q's own 161,039.
//
// So the cap is the quantity that actually binds: HOW MANY WINDOWS a 10,000-character hand-off can
// give one excerpt each. Derived here from the budget and the item line cost, never hardcoded — the
// same tie SP-268 put between the item caps and the output cap, for the same reason: the two numbers
// drifted apart precisely because nothing connected them.
//
// A document with more windows than this is READ up to the cap and MARKED (SP-272). Beyond the cap the
// hand-off could not represent the window anyway, so reading it would produce extract rows that no
// framework pass ever sees, and a row that said `ready` over a document whose later sections were
// invisible to the analysis.
export function maxWindowsForBudget(
  budget = MERGED_EXTRACT_BUDGET,
  maxExcerptChars = MAX_EXCERPT_CHARS,
): number {
  const header = MERGED_HEADER.join("\n").length + MERGED_HEADER_SLACK;
  // The widest a single rank-0 line can be: the prefix plus a full-length excerpt.
  const perItem = `- [section 999] `.length + maxExcerptChars + 1;
  return Math.max(1, Math.floor((budget - header) / perItem));
}

/** Slack for the per-kind "## EVIDENCE (n)" headings, whose size depends on counts not yet known.
 *  Three kinds, each a blank line plus a heading of about twenty characters; 120 covers it with room. */
const MERGED_HEADER_SLACK = 120;

/** What one item costs the hand-off: its line, exactly as buildMergedExtractText writes it. */
function itemLineCost(item: MergedItem): number {
  const where = item.windows.length > 1
    ? `sections ${item.windows.map((w) => w + 1).join(", ")}`
    : `section ${item.windows[0] + 1}`;
  return `- [${where}] ${item.text}`.length + 1;
}

/**
 * The largest EXTRACTION a document can produce. NOT the hand-off: that is bounded absolutely by
 * MERGED_EXTRACT_BUDGET, whatever a document holds. Kept for sizing storage and for reporting.
 */
export function mergedExtractBound(args: {
  documentCharCap: number;
  windowChars: number;
  maxItemsPerKind: number;
}): { windows: number; items: number; chars: number } {
  const windows = Math.ceil(args.documentCharCap / args.windowChars);
  const items = windows * EXTRACT_KINDS.length * args.maxItemsPerKind;
  return { windows, items, chars: items * (MAX_EXCERPT_CHARS + 120) + 400 };
}
