// ── THE PER-KIND RUN: gate order, the shared retry budget, and the judge re-ask ──────────────────
//
// Operator rulings 2026-10-05 (third set), after dry run 6:
//   1. a JUDGE-rejected slot gets one re-ask, carrying the judge's own reason back. Only the
//      rejected slot is regenerated; accepted siblings are kept BYTE-IDENTICAL, never re-rolled.
//   2. ONE retry per kind in total, SHARED between gate and judge failures — at most two generator
//      calls per kind per run. A gate retry therefore consumes the budget and no judge retry follows.
//   3. the retry output runs the FULL gate again, in order: length -> no-new-citations -> judge.
//
// Pure over injected generate/judge callbacks (no Deno, no fetch), so the three acceptance specs can
// exercise every branch deterministically — the same technique publicReadPromote.ts uses for a fake
// client. The edge function supplies the real model calls.
//
// 1a-4 (2026-10-07): the gate order is unchanged — length, then no-new-citations AND no-stronger-class
// (both deterministic and free), then the judge, which now also answers class_ok per slot.
import { attachSourceClasses, checkSlotsDeterministic, slotFieldPaths, type CitationViolation, type SlotKind } from "./readSlots.ts";

export type SlotVerdict = { entailed?: boolean; vocab_ok?: boolean; category_sanity_ok?: boolean; class_ok?: boolean; accept?: boolean; reason?: string };
export type PerSlot = { field: string; accepted: boolean; verdict: SlotVerdict | null };

/** Full regenerate (gate retry) and targeted fix (judge retry) are two different asks. */
export type GenerateFn = (mode: "initial" | "gate_retry" | "judge_retry", context: {
  violations?: CitationViolation[];
  rejected?: Array<{ field: string; reason: string }>;
}) => Promise<Record<string, unknown>>;
export type JudgeFn = (slots: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type Attempt = {
  n: number;
  kind_of_attempt: "initial" | "gate_retry" | "judge_retry";
  stage_reached: "deterministic" | "judge";
  lengths: Record<string, number | number[]>;
  violations: CitationViolation[];
  per_slot: PerSlot[];
};
export type RunOutcome = {
  ok: boolean;
  slots: Record<string, unknown>;
  verdict: Record<string, unknown> | null;
  per_slot: PerSlot[];
  violations: CitationViolation[];
  attempts: Attempt[];
  generator_calls: number;
  retry_used_by: "none" | "gate" | "judge";
  /** set when a kind failed with its retry already spent — the reason it got no second chance */
  retry_unavailable_reason?: string;
};

/** A slot is accepted iff entailment AND vocabulary AND class hold (and category sanity, where it
 *  applies). CLASS (1a-4, ruling S2): a line whose class is `our_read` must read as an openly-held
 *  reading — a judge judgment, by signature, with no deterministic phrase list behind it. Fail-closed:
 *  a verdict that omits class_ok does not clear. */
export function slotAccepted(kind: SlotKind, path: string, v: SlotVerdict | undefined | null): boolean {
  if (!v) return false;
  if (v.entailed !== true || v.vocab_ok !== true || v.class_ok !== true || v.accept !== true) return false;
  if (kind === "positioning" && path === "category_context" && v.category_sanity_ok !== true) return false;
  return true;
}

/** Read one slot line by its render path ("differentiators[0]" | "how_to_win_line"). */
export function getSlotAt(slots: Record<string, unknown>, path: string): unknown {
  const m = path.match(/^(\w+)\[(\d+)\]$/);
  if (!m) return slots[path];
  const arr = slots[m[1]];
  return Array.isArray(arr) ? arr[Number(m[2])] : undefined;
}

/** Replace ONE slot line by path, returning a NEW object. Every untouched line keeps its exact
 *  identity, which is what makes "accepted slots are byte-identical after a sibling's retry" true
 *  by construction rather than by inspection. */
export function spliceSlotAt(slots: Record<string, unknown>, path: string, line: unknown): Record<string, unknown> {
  const m = path.match(/^(\w+)\[(\d+)\]$/);
  if (!m) return { ...slots, [path]: line };
  const [, field, idxRaw] = m;
  const arr = Array.isArray(slots[field]) ? [...(slots[field] as unknown[])] : [];
  arr[Number(idxRaw)] = line;
  return { ...slots, [field]: arr };
}

export function lengthsOf(kind: SlotKind, slots: Record<string, unknown>): Record<string, number | number[]> {
  const len = (v: unknown) => String(((v ?? {}) as { text?: unknown }).text ?? "").length;
  if (kind === "positioning") {
    return {
      differentiators: (Array.isArray(slots.differentiators) ? slots.differentiators : []).map(len),
      category_context: len(slots.category_context),
    };
  }
  return { where_to_play_line: len(slots.where_to_play_line), how_to_win_line: len(slots.how_to_win_line) };
}

/** THE GATE, in the ruled order: length and no-new-citations first (deterministic, free), and only
 *  then the judge — so a capped or miscited slot never costs a judge call. */
async function runGate(
  kind: SlotKind, slots: Record<string, unknown>, payload: Record<string, unknown>, judge: JudgeFn,
  verbatimPaths: ReadonlySet<string>,
): Promise<{ violations: CitationViolation[]; verdict: Record<string, unknown> | null; perSlot: PerSlot[]; stage: "deterministic" | "judge"; ok: boolean }> {
  const violations = checkSlotsDeterministic(kind, slots, payload);
  if (violations.length > 0) return { violations, verdict: null, perSlot: [], stage: "deterministic", ok: false };

  const paths = slotFieldPaths(kind, slots);
  const toJudge = paths.filter((f) => !verbatimPaths.has(f));
  // A VERBATIM line is the source text. It cannot say more than the source, so there is nothing for a
  // containment judge to decide — and the ruling is explicit that it costs no judge call. If EVERY
  // line is verbatim the judge is never called at all.
  const verdict = toJudge.length > 0 ? await judge(slots) : null;
  const vs = ((verdict?.slots ?? {}) as Record<string, SlotVerdict>);
  const perSlot: PerSlot[] = paths.map((f) =>
    verbatimPaths.has(f)
      // 1a-4: a verbatim line INHERITS its source field's class (checkSlotsDeterministic already
      // compared them, for free, above), so it cannot assert more than the source and class_ok holds
      // by construction exactly as entailment does. The judge is still never called for it.
      ? { field: f, accepted: true, verdict: { entailed: true, vocab_ok: true, class_ok: true, accept: true, reason: "verbatim — the slot IS the source text, so entailment and class hold by construction" } }
      : { field: f, accepted: slotAccepted(kind, f, vs[f]), verdict: vs[f] ?? null });
  const ok = perSlot.length > 0 && perSlot.every((s) => s.accepted);
  return { violations: [], verdict, perSlot, stage: "judge", ok };
}

/** One kind, start to finish: generate, gate, and at most ONE retry of either flavour. */
export async function runKind(args: {
  kind: SlotKind;
  payload: Record<string, unknown>;
  generate: GenerateFn;
  judge: JudgeFn;
  /** render paths taking the VERBATIM path: accepted by construction, never judged, never re-asked */
  verbatimPaths?: readonly string[];
}): Promise<RunOutcome> {
  const { kind, payload, generate, judge } = args;
  const verbatim = new Set(args.verbatimPaths ?? []);
  const attempts: Attempt[] = [];
  let calls = 0;

  // 1a-4: the class is attached HERE, on every path, so no caller can forget it and no retry can drop it.
  let slots = attachSourceClasses(kind, await generate("initial", {}), payload); calls++;
  let g = await runGate(kind, slots, payload, judge, verbatim);
  attempts.push({ n: 1, kind_of_attempt: "initial", stage_reached: g.stage, lengths: lengthsOf(kind, slots), violations: g.violations, per_slot: g.perSlot });

  if (g.ok) {
    return { ok: true, slots, verdict: g.verdict, per_slot: g.perSlot, violations: [], attempts, generator_calls: calls, retry_used_by: "none" };
  }

  // ── the single shared retry ────────────────────────────────────────────────────────────────────
  const retryBy: "gate" | "judge" = g.stage === "deterministic" ? "gate" : "judge";
  let candidate: Record<string, unknown>;
  if (retryBy === "gate") {
    // the whole answer is regenerated: a length or citation failure is not slot-local
    candidate = attachSourceClasses(kind, await generate("gate_retry", { violations: g.violations }), payload); calls++;
  } else {
    // ONLY the rejected slots are regenerated, each carrying the judge's own reason back.
    const rejected = g.perSlot.filter((s) => !s.accepted && !verbatim.has(s.field))
      .map((s) => ({ field: s.field, reason: String(s.verdict?.reason ?? "") }));
    const fixes = await generate("judge_retry", { rejected }); calls++;
    const fixMap = (fixes?.fixes ?? fixes ?? {}) as Record<string, unknown>;
    candidate = slots;
    for (const r of rejected) {
      const line = fixMap[r.field];
      if (line !== undefined) candidate = spliceSlotAt(candidate, r.field, line);
    }
    // a spliced fix arrives from the model without a class — re-attach from the source read
    candidate = attachSourceClasses(kind, candidate, payload);
  }

  const g2 = await runGate(kind, candidate, payload, judge, verbatim);
  attempts.push({ n: 2, kind_of_attempt: retryBy === "gate" ? "gate_retry" : "judge_retry", stage_reached: g2.stage, lengths: lengthsOf(kind, candidate), violations: g2.violations, per_slot: g2.perSlot });

  if (g2.ok) {
    return { ok: true, slots: candidate, verdict: g2.verdict, per_slot: g2.perSlot, violations: [], attempts, generator_calls: calls, retry_used_by: retryBy };
  }
  // the budget is spent: a second failure stages nothing for this kind, whichever gate caught it
  return {
    ok: false, slots: candidate, verdict: g2.verdict, per_slot: g2.perSlot, violations: g2.violations,
    attempts, generator_calls: calls, retry_used_by: retryBy,
    retry_unavailable_reason: `the kind's single retry was already spent by the ${retryBy} failure on attempt 1`,
  };
}
