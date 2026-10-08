// ── SHORT-FORM SLOTS — the pure compute (slice 1: positioning + strategy) ────────────────────────
//
// Rulings R1-R7, signed 2026-10-05. A commitment screen leads with a SHORT FORM: a set of framework
// slots, not a shortened paragraph. Slice 1 SELECTS AND SHORTENS fields that already exist and are
// already cited on the source read — it mints nothing. Promise (slice 2) and who-you-serve (slice 3)
// are not generated here; SLICE_1_KINDS is the whole surface this module admits.
//
// Pure and import-free so vitest can exercise the deterministic checks without Deno.

export const SLICE_1_KINDS = ["positioning", "strategy"] as const;
export type SlotKind = (typeof SLICE_1_KINDS)[number];

// ── SOURCE CLASS (1a-4, signed 2026-10-07) ───────────────────────────────────────────────────────
// This module is import-free on purpose (so vitest exercises the deterministic checks without Deno),
// so the class vocabulary is declared here rather than imported from publicReadInputs.ts. The two
// must agree; the census test asserts they do.
export type SlotSourceClass = "record" | "you" | "our_read";
const SLOT_CLASS_RANK: Record<SlotSourceClass, number> = { our_read: 0, you: 1, record: 2 };
/** True when `a` asserts MORE than `b` allows. A slot may never be stronger than its source field. */
export function slotClassStrongerThan(a: SlotSourceClass, b: SlotSourceClass): boolean {
  return SLOT_CLASS_RANK[a] > SLOT_CLASS_RANK[b];
}

/** A slot line: the shortened text plus the citations AND the class it INHERITS from its source field. */
export type SlotLine = { text: string; citations: string[]; path?: SlotPath; source_class?: SlotSourceClass };

export type PositioningSlots = {
  differentiators: SlotLine[];      // 2-3, ordered as the read orders unique_attributes
  category_context: SlotLine;
};
export type StrategySlots = {
  where_to_play_line: SlotLine;
  how_to_win_line: SlotLine;
};
export type Slots = PositioningSlots | StrategySlots;

// ── CHARACTER CAPS ───────────────────────────────────────────────────────────────────────────────
// statementClass (acts.tsx:1387) renders every statement at ONE size regardless of length — the
// length-based step-down was reverted by operator signature (stage 3e). So a cap is an editorial
// constraint, not a cosmetic one: an over-long "line" simply wraps at statement size and stops
// reading as a slot. Caps are set against what the source fields actually hold on Edgewood today
// (differentiators 111/133, market_category 42, where_to_play 297, how_to_win 416), so each cap is a
// real compression of its source rather than a number the current data already satisfies.
// The two strategy rungs share one cap so neither visually dominates the other on the swap screen.
// Operator ruling 2026-10-05, after the first Edgewood dry run:
//   * positioning differentiators 100 -> 110. The model converged on 102 across every run and every
//     re-ask — it was complying and the cap was two characters too tight. category_context stays 80
//     (it lands at 42, well clear).
//   * strategy stayed at 100 while the INSTRUCTION changed — name the core where / the core how and
//     drop the qualifiers. That worked: where_to_play_line went 249 -> exactly 100. how_to_win_line
//     came 159 -> 123 -> 107, so on 2026-10-05 (second ruling) both strategy lines go to 110, the
//     same number positioning carries. 110 is the ceiling for every line in slice 1.
export const SLOT_CAPS = {
  positioning: { differentiators: 110, category_context: 80 },
  strategy: { where_to_play_line: 110, how_to_win_line: 110 },
} as const;

/** A line under this is not a slot, it is a fragment. Guards against a model answering "Quality." */
export const SLOT_MIN_CHARS = 24;

// ── THE VERBATIM PATH (operator ruling 2026-10-05, fourth set) ───────────────────────────────────
// A positioning differentiator whose SOURCE is already short is copied EXACTLY — no generator call,
// no judge call. The judge rejected the one generated differentiator for merging two places the read
// keeps apart, and the fix that restored the distinction cost 21 characters and broke the cap: for a
// 133-char source there was no 110-char rewrite that stayed true. Copying the source cannot say more
// than the source, so entailment is guaranteed by construction rather than judged, and the cap for a
// copied line is this threshold rather than the generated cap.
export const VERBATIM_MAX_CHARS = 140;
export type SlotPath = "verbatim" | "generated";

export const DIFFERENTIATORS_MIN = 2;
export const DIFFERENTIATORS_MAX = 3;

export type SlotFieldPath = string;   // "differentiators[0]" | "category_context" | "where_to_play_line"

/** Every (slot field → its source field) binding for a kind. The citation check and the judge both
 *  walk this, so a new slot cannot be added without declaring where its citations must come from. */
export const SLOT_SOURCE_FIELD: Record<SlotKind, Record<string, string>> = {
  positioning: { differentiators: "unique_attributes", category_context: "market_category" },
  strategy: { where_to_play_line: "where_to_play", how_to_win_line: "how_to_win" },
};

/** The citations the source read holds for a slot's source field.
 *  - a scalar field cites via "<field>_citations" (market_category_citations, where_to_play_citations)
 *  - an object-array field cites per element (unique_attributes[i].citations)
 *  Returns null when the source field is absent — the caller treats that as a hard refusal, never as
 *  "no citations required". */
export function sourceCitationsFor(
  payload: Record<string, unknown>,
  kind: SlotKind,
  field: string,
  index?: number,
): string[] | null {
  const src = SLOT_SOURCE_FIELD[kind]?.[field];
  if (!src) return null;
  if (typeof index === "number") {
    const arr = payload[src];
    if (!Array.isArray(arr) || index >= arr.length) return null;
    const el = arr[index] as { citations?: unknown } | null;
    const c = el?.citations;
    return Array.isArray(c) ? c.map(String) : [];
  }
  if (!(src in payload)) return null;
  const c = payload[`${src}_citations`];
  return Array.isArray(c) ? c.map(String) : [];
}

/** The source TEXT a slot field was shortened from — the twin of sourceCitationsFor. Used to prove a
 *  line marked verbatim really is its source, and to decide which items take the verbatim path. */
export function sourceTextFor(
  payload: Record<string, unknown>, kind: SlotKind, field: string, index?: number,
): string | null {
  const src = SLOT_SOURCE_FIELD[kind]?.[field];
  if (!src) return null;
  if (typeof index === "number") {
    const arr = payload[src];
    if (!Array.isArray(arr) || index >= arr.length) return null;
    const t = (arr[index] as { text?: unknown } | null)?.text;
    return typeof t === "string" ? t : null;
  }
  const t = payload[src];
  return typeof t === "string" ? t : null;
}

/** The CLASS the source read holds for a slot's source field — the twin of sourceCitationsFor.
 *  Scalar fields carry "<field>_class"; an object-array element carries its own "class". Returns null
 *  when the source field or its class is absent (a read generated before 1a-4 carries none), which the
 *  caller treats as "nothing to compare" rather than as a refusal — only a slot claiming a class
 *  STRONGER than a KNOWN source class is a violation. */
export function sourceClassFor(
  payload: Record<string, unknown>, kind: SlotKind, field: string, index?: number,
): SlotSourceClass | null {
  const src = SLOT_SOURCE_FIELD[kind]?.[field];
  if (!src) return null;
  const asClass = (v: unknown): SlotSourceClass | null =>
    v === "record" || v === "you" || v === "our_read" ? v : null;
  if (typeof index === "number") {
    const arr = payload[src];
    if (!Array.isArray(arr) || index >= arr.length) return null;
    return asClass((arr[index] as { class?: unknown } | null)?.class);
  }
  return asClass(payload[`${src}_class`]);
}

/** Which positioning differentiators take the VERBATIM path: every source item at or under the
 *  threshold. Returns the render-order indices, so the caller copies exactly those. */
export function verbatimDifferentiatorIndices(payload: Record<string, unknown>): number[] {
  const arr = Array.isArray(payload.unique_attributes) ? payload.unique_attributes : [];
  const out: number[] = [];
  arr.forEach((a, i) => {
    const t = String((a as { text?: unknown })?.text ?? "").trim();
    if (t && t.length <= VERBATIM_MAX_CHARS) out.push(i);
  });
  return out;
}

export type CitationViolation = {
  field: SlotFieldPath;
  kind: "unknown_citation" | "missing_source_field" | "over_cap" | "under_floor" | "empty_text" | "count_out_of_range" | "verbatim_mismatch" | "class_stronger_than_source";
  detail: string;
};

/** THE DETERMINISTIC CHECK (R5) — run BEFORE any judge call, so a slot that invents a citation or
 *  breaks a cap never costs a model call. A slot may cite ONLY what its source field already cites;
 *  it may cite FEWER (it may say less), never more, and never a ref the source does not hold. */
export function checkSlotsDeterministic(
  kind: SlotKind,
  slots: Record<string, unknown>,
  payload: Record<string, unknown>,
): CitationViolation[] {
  const out: CitationViolation[] = [];
  const caps = SLOT_CAPS[kind] as Record<string, number>;

  const checkLine = (path: SlotFieldPath, field: string, line: unknown, index?: number): void => {
    const l = (line ?? {}) as { text?: unknown; citations?: unknown; path?: unknown; source_class?: unknown };
    const text = typeof l.text === "string" ? l.text.trim() : "";
    if (!text) { out.push({ field: path, kind: "empty_text", detail: "slot text is empty" }); return; }
    const isVerbatim = l.path === "verbatim";
    // A COPIED line is allowed up to the verbatim threshold, because the threshold is the rule that
    // selected it. It must also BE the source text — the marker alone can never buy the wider cap.
    if (isVerbatim) {
      const src = sourceTextFor(payload, kind, field, index);
      if (src === null || src.trim() !== text) {
        out.push({ field: path, kind: "verbatim_mismatch", detail: "a line marked verbatim is not byte-identical to its source item" });
      }
    }
    const cap = isVerbatim ? VERBATIM_MAX_CHARS : caps[field];
    if (typeof cap === "number" && text.length > cap) {
      out.push({ field: path, kind: "over_cap", detail: `${text.length} chars > cap ${cap}${isVerbatim ? " (verbatim)" : ""}` });
    }
    if (text.length < SLOT_MIN_CHARS) {
      out.push({ field: path, kind: "under_floor", detail: `${text.length} chars < floor ${SLOT_MIN_CHARS}` });
    }
    const allowed = sourceCitationsFor(payload, kind, field, index);
    if (allowed === null) {
      out.push({ field: path, kind: "missing_source_field", detail: `source field for ${field}${index === undefined ? "" : `[${index}]`} is absent on the read` });
      return;
    }
    const allowedSet = new Set(allowed.map(String));
    const cites = Array.isArray(l.citations) ? l.citations.map(String) : [];
    for (const c of cites) {
      if (!allowedSet.has(c)) {
        out.push({ field: path, kind: "unknown_citation", detail: `citation not held by the source field` });
      }
    }
    // 1a-4: a slot inherits its source field's class and may never claim a STRONGER one. This is the
    // class twin of the citation rule — a slot may say LESS than its source (a weaker class is fine,
    // and so is carrying none), never more. A source field with no stored class predates 1a-4: there
    // is nothing to compare, so nothing is refused.
    const srcClass = sourceClassFor(payload, kind, field, index);
    const lineClass = l.source_class === "record" || l.source_class === "you" || l.source_class === "our_read" ? l.source_class : null;
    if (srcClass && lineClass && slotClassStrongerThan(lineClass, srcClass)) {
      out.push({ field: path, kind: "class_stronger_than_source", detail: `slot class '${lineClass}' asserts more than its source field's '${srcClass}'` });
    }
  };

  if (kind === "positioning") {
    const diffs = Array.isArray(slots.differentiators) ? slots.differentiators : [];
    if (diffs.length < DIFFERENTIATORS_MIN || diffs.length > DIFFERENTIATORS_MAX) {
      out.push({ field: "differentiators", kind: "count_out_of_range", detail: `${diffs.length} differentiators, want ${DIFFERENTIATORS_MIN}-${DIFFERENTIATORS_MAX}` });
    }
    diffs.forEach((d, i) => checkLine(`differentiators[${i}]`, "differentiators", d, i));
    checkLine("category_context", "category_context", slots.category_context);
  } else {
    checkLine("where_to_play_line", "where_to_play_line", slots.where_to_play_line);
    checkLine("how_to_win_line", "how_to_win_line", slots.how_to_win_line);
  }
  return out;
}

/** 1a-4: attach each line's INHERITED class, from its source field on the read. Returns a NEW object;
 *  lines whose source field carries no stored class are left unclassed (a read written before 1a-4 has
 *  none to give, and inventing one here would be the lie the class exists to prevent). Applied to
 *  EVERY generator output — initial, gate retry and the judge re-ask's splice — so a class can never be
 *  model-set and can never go missing on a retry path. */
export function attachSourceClasses(
  kind: SlotKind, slots: Record<string, unknown>, payload: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...slots };
  for (const path of slotFieldPaths(kind, next)) {
    const m = /^(\w+)\[(\d+)\]$/.exec(path);
    const field = m ? m[1] : path;
    const idx = m ? Number(m[2]) : undefined;
    const cls = sourceClassFor(payload, kind, field, idx);
    if (!cls) continue;
    if (m) {
      const arr = Array.isArray(next[field]) ? [...(next[field] as unknown[])] : [];
      if (arr[idx!] && typeof arr[idx!] === "object") arr[idx!] = { ...(arr[idx!] as object), source_class: cls };
      next[field] = arr;
    } else if (next[field] && typeof next[field] === "object") {
      next[field] = { ...(next[field] as object), source_class: cls };
    }
  }
  return next;
}

/** The slot field paths of a kind, in render order — the unit the judge verdicts and the guard counts. */
export function slotFieldPaths(kind: SlotKind, slots: Record<string, unknown>): SlotFieldPath[] {
  if (kind === "positioning") {
    const n = Array.isArray(slots.differentiators) ? slots.differentiators.length : 0;
    return [...Array.from({ length: n }, (_, i) => `differentiators[${i}]`), "category_context"];
  }
  return ["where_to_play_line", "how_to_win_line"];
}

/** The source read fields the judge is allowed to see for a kind — its OWN fields only, never the
 *  raw S/O/F/D ledger (R5 / the brief). */
export function judgeVisibleFields(kind: SlotKind, payload: Record<string, unknown>): Record<string, unknown> {
  if (kind === "positioning") {
    return {
      market_category: payload.market_category ?? null,
      value_for_customer: payload.value_for_customer ?? null,
      best_fit_customers: payload.best_fit_customers ?? null,
      unique_attributes: Array.isArray(payload.unique_attributes)
        ? (payload.unique_attributes as Array<{ text?: unknown }>).map((a) => String(a?.text ?? ""))
        : [],
    };
  }
  return {
    winning_aspiration: payload.winning_aspiration ?? null,
    where_to_play: payload.where_to_play ?? null,
    how_to_win: payload.how_to_win ?? null,
    must_have_capabilities: Array.isArray(payload.must_have_capabilities)
      ? (payload.must_have_capabilities as Array<{ text?: unknown }>).map((c) => String(c?.text ?? ""))
      : [],
  };
}
