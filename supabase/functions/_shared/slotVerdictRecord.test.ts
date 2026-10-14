// ── VS1 / VS2 (operator rulings, 2026-10-14): the record says what was decided, and by whom ─────
//
// A slot was signed and went live on 2026-10-14 with first-read-slots-guard s2 RED. The gate accepts
// a VERBATIM entry by construction and never asks the judge about it (readSlotsRun.ts:112), but the
// function stored the judge's RAW answer — and the judge, handed the whole slots object, had
// volunteered accept:false on a verbatim differentiator. The gate decided on one verdict and the row
// recorded another; s2 reads the row, and was right to refuse it. It had never fired before because
// that was the first slot whose differentiators ALL took the verbatim path.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { slotAccepted, storedVerdictOf, type PerSlot } from "./readSlotsRun.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// the real shapes from the 2026-10-14 run
const VERBATIM_GATE = { entailed: true, vocab_ok: true, class_ok: true, accept: true, reason: "verbatim — the slot IS the source text, so entailment and class hold by construction" };
const JUDGE_REFUSED = { accept: false, class_ok: true, entailed: true, vocab_ok: true, category_sanity_ok: true, reason: "Slot is class 'you' but states as fact without attribution, e.g. 'one of only a few' and 'only one' which are claims beyond what 'you' class allows." };
const JUDGE_OK = { accept: true, class_ok: true, entailed: true, vocab_ok: true, category_sanity_ok: true, reason: "Slot is class 'our_read' and matches the market_category field exactly." };

Deno.test("VS1. a verbatim entry stores the GATE's decision, naming the authority", () => {
  const perSlot: PerSlot[] = [{ field: "differentiators[0]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE }];
  const out = storedVerdictOf(perSlot, { slots: { "differentiators[0]": JUDGE_REFUSED } });
  const e = (out.slots as Record<string, Record<string, unknown>>)["differentiators[0]"];
  assertEquals(e.accept, true, "the gate accepted it, so the record says accepted");
  assertEquals(e.path, "verbatim", "and names the accepting authority rather than implying it");
  assert(String(e.reason).startsWith("verbatim —"), "with the verbatim rule's own reason");
});

Deno.test("VS1. the judge's answer is KEPT, beside the decision rather than in place of it", () => {
  const perSlot: PerSlot[] = [{ field: "differentiators[0]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE }];
  const out = storedVerdictOf(perSlot, { slots: { "differentiators[0]": JUDGE_REFUSED } });
  const e = (out.slots as Record<string, Record<string, unknown>>)["differentiators[0]"];
  assertEquals((e.judge_opinion as Record<string, unknown>).accept, false, "the opinion survives verbatim");
  assert(String((e.judge_opinion as Record<string, unknown>).reason).includes("without attribution"),
    "including its reason — it is how we noticed the line reads as an unattributed claim");
});

Deno.test("VS1. s2's test — every stored entry accepted — is now GREEN on that slot", () => {
  const perSlot: PerSlot[] = [
    { field: "differentiators[0]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE },
    { field: "differentiators[1]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE },
    { field: "differentiators[2]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE },
    { field: "category_context", accepted: true, path: "generated", verdict: JUDGE_OK },
  ];
  const out = storedVerdictOf(perSlot, { slots: { "differentiators[0]": JUDGE_REFUSED, "category_context": JUDGE_OK } });
  const slots = out.slots as Record<string, { accept?: unknown }>;
  // s2's rule, applied here exactly as the guard applies it to the stored row
  const refused = Object.entries(slots).filter(([, v]) => v?.accept !== true).map(([k]) => k);
  assertEquals(refused, [], "no stored entry is unaccepted — the state that made the live slot a breach");
});

Deno.test("VS1. a GENERATED entry is unchanged — the judge IS its authority", () => {
  const perSlot: PerSlot[] = [{ field: "category_context", accepted: true, path: "generated", verdict: JUDGE_OK }];
  const out = storedVerdictOf(perSlot, { slots: { category_context: JUDGE_OK } });
  const e = (out.slots as Record<string, Record<string, unknown>>)["category_context"];
  assertEquals(e.accept, true);
  assertEquals(e.path, "generated");
  assertEquals(e.judge_opinion, undefined, "its verdict IS the judge's; there is no second opinion to keep");
  assertEquals(e.reason, JUDGE_OK.reason);
});

Deno.test("VS1. a generated entry the judge REFUSED still stores accept:false", () => {
  // the relaxation is for verbatim only; nothing here lets a refused generated line through
  const perSlot: PerSlot[] = [{ field: "category_context", accepted: false, path: "generated", verdict: JUDGE_REFUSED }];
  const out = storedVerdictOf(perSlot, { slots: { category_context: JUDGE_REFUSED } });
  assertEquals((out.slots as Record<string, Record<string, unknown>>)["category_context"].accept, false);
  assertEquals(slotAccepted("positioning", "category_context", JUDGE_REFUSED), false, "and the gate refuses it too");
});

Deno.test("VS1. no judge call at all (every line verbatim) still stores an accepted record", () => {
  const perSlot: PerSlot[] = [{ field: "differentiators[0]", accepted: true, path: "verbatim", verdict: VERBATIM_GATE }];
  const out = storedVerdictOf(perSlot, null);          // judge never called — toJudge was empty
  const e = (out.slots as Record<string, Record<string, unknown>>)["differentiators[0]"];
  assertEquals(e.accept, true);
  assertEquals(e.judge_opinion, undefined, "no opinion exists to keep, and none is invented");
});

Deno.test("VS1. the function STORES this, not the judge's raw answer", async () => {
  const src = await read("../generate-read-slots/index.ts");
  assert(src.includes("judge_verdict: storedVerdictOf(perSlot, verdict),"), "the stored verdict is built from the gate's decisions");
  assert(!/judge_verdict: verdict\b/.test(src), "the raw answer is no longer what lands on the row");
});

// ── VS2: one integrity row per signature ────────────────────────────────────────────────────────
Deno.test("VS2. a signature writes its row AFTER the flip, and cannot fail it", async () => {
  const src = await read("./readSlotsPromote.ts");
  const i = src.indexOf("promote-staged-slot failed");
  const j = src.indexOf("promoted.push({ kind, staged: staged.id, superseded: priorId });", i);
  assert(i > 0 && j > i, "the flip and the push bracket the record");
  assert(src.slice(i, j).includes("await recordSignature(supabase, {"), "the row is written between them — after the flip");
  assert(src.includes('status: "completed",'), "a taken signature is completed");
  // it must be unable to fail the act
  const fn = src.slice(src.indexOf("async function recordSignature"));
  assert(fn.includes("catch { /* the record must never be able to fail the act it records */ }"), "every error swallowed");
  assert(!fn.includes("throw"), "and it throws nothing of its own");
});

Deno.test("VS2. a REFUSED signature writes a refusal row, before the throw", async () => {
  const src = await read("./readSlotsPromote.ts");
  const i = src.indexOf("const detail = `staged against read");
  const j = src.indexOf("throw new SlotPromoteRefused(staged.id, kind, detail);", i);
  assert(i > 0 && j > i, "the refusal detail is built before the throw");
  assert(src.slice(i, j).includes('status: "rejected"'), "and a rejected row is written in between");
});

Deno.test("VS2. the row carries what an auditor needs, including its own reversal", async () => {
  const src = await read("./readSlotsPromote.ts");
  const fn = src.slice(src.indexOf("async function recordSignature"));
  for (const field of ["slot_id", "source_read_id", "signed_by", "criterion_version", "superseded_slot_id", "reversal_sql", "reversal_note"]) {
    assert(fn.includes(`${field}:`), `the signature row carries ${field}`);
  }
  assert(fn.includes("first_read_slot_signed_"), "component names the kind");
  // criterion_version can only be recorded if the staged-slot read fetches it
  assert(src.includes('.select("id, source_read_id, criterion_version")'), "the staged slot is read with it");
});
