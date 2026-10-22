// ── P1 / P2 / P3 (operator rulings, 2026-10-14) ─────────────────────────────────────────────────
//
// WHAT THESE GUARD. Wasabi's staged positioning read 40ca4370 was discarded (audit 10228): its three
// differentiators all restated pricing, and the current read's FedRAMP and AI-product lines were
// gone. The cause was not the model.
//
//   P1  READ_CAP.signal = 20 dropped 65 of 91 eligible signals, and EVERY row carrying FedRAMP,
//       Wasabi Fire or AiR was in that 65 — cc5707ad, 2242bdd1, c93c7c2d, 9373abfc, all class
//       record, all live, all over_cap. The model was asked to continue lines whose evidence it had
//       never been shown. So the rows the CURRENT read cites are admitted ahead of the cap, on their
//       own budget, with every admission law still applying to them.
//   P2  The continuity block reported `continued = required - missing.length`, which on Wasabi read
//       "continued: 2" when one line had continued and one — the FedRAMP line — had been LICENSED
//       away. A licensed drop is not a continuation.
//   P3  Nothing asked whether two differentiators make the same claim. The judge now asks and
//       refuses; the deterministic overlap test only logs.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PREDECESSOR_CITED_CAP, PREDECESSOR_CITED_REASON, READ_CAP } from "./publicReadInputs.ts";
import { classifyContinuity, continuityBlock, type CitedLine } from "./stageContinuity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── P1 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("P1. the cited rows are selected BEFORE the cap, and the rest meet READ_CAP as before", async () => {
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  const p1At = fn.indexOf("const p1Sig = p1Budget > 0");
  // N2 (2026-10-14): the ordinary lane now also excludes what the NAME lane took.
  const restAt = fn.indexOf("const sigSel = selectSignals(sigRest.filter((r) => !namedIds.has(r.id)), READ_CAP.signal, confirmed);");
  assert(p1At > 0, "the predecessor-cited lane exists");
  assert(restAt > 0, "the ordinary lane runs over what neither P1 nor N2 took");
  assert(p1At < restAt, "the cited rows are admitted FIRST — that is the whole of P1");
  // and the ordinary lane must no longer see them, or the cap could still drop a cited row
  assert(fn.includes("const sigRest = sigAll.filter((r) => !predecessorCited.has(r.id));"),
    "the ordinary lane is given the rows P1 did NOT take");
  assert(!fn.includes("selectSignals(sigPublic as unknown as SelSignal[], READ_CAP.signal"),
    "the old whole-set call is gone — it is what let the cap drop a cited row");
});

Deno.test("P1. every admission law still applies — the cited rows go through the SAME selectors", async () => {
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  assert(/const p1Sig = p1Budget > 0 && sigCited\.length > 0\s*\n\s*\? selectSignals\(sigCited, p1Budget, confirmed\)/.test(fn),
    "signals: through selectSignals, which applies empty_text, page-shape, junk, listing, dedupe and order");
  assert(/const p1Ow = p1Budget > 0 && owCited\.length > 0\s*\n\s*\? selectOwnWords\(owCited, p1Budget, activeIdentities, owEligible\)/.test(fn),
    "own_words: through selectOwnWords, with the same active-identity and eligible-kind tests");
  // W1 runs UPSTREAM of the split — and the split must consume the FILTERED set. Testing only the
  // ORDER of the two statements is not enough: a plant that leaves W1's filter in place and hands
  // the split the raw query rows passes an order check while routing every client-provided cited row
  // straight into P1. So the data path is pinned by name.
  assert(fn.includes("const sigAll = sigPublic as unknown as SelSignal[];"),
    "the split's input IS sigPublic — the W1-filtered set, not the raw query rows");
  assert(!/const sigAll = \(\(?sig \?\?/.test(fn), "the raw `sig` rows must never feed the split");
  const w1At = fn.indexOf("isPublicSignalSourceType(r.source_type)");
  const sigAllAt = fn.indexOf("const sigAll = sigPublic");
  const splitAt = fn.indexOf("const sigCited = sigAll.filter");
  assert(w1At > 0 && w1At < sigAllAt && sigAllAt < splitAt,
    "W1 filters, then sigAll takes the filtered set, then the split runs");
  // and the liveness/band predicates are on the query, also upstream
  const qAt = fn.indexOf('.eq("signal_band", "outside")');
  assert(qAt > 0 && qAt < splitAt, "band + voice + liveness are on the query, upstream of the split");
});

Deno.test("P1. a cited row the LAWS refuse keeps its own reason; only a cap miss is relabelled", async () => {
  const src = await read("./publicReadInputs.ts");
  assert(src.includes('for (const d of p1Sig.dropped) dropped.push(d.reason === "over_cap" ? { ...d, reason: "over_predecessor_cited_cap" } : d);'),
    "a junk/listing/duplicate reason survives — the ledger never calls it predecessor_cited");
  assert(src.includes('for (const d of p1Ow.dropped) dropped.push(d.reason === "over_cap" ? { ...d, reason: "over_predecessor_cited_cap" } : d);'));
});

Deno.test("P1. findings and deltas are NOT admitted — the recurrence rule is not a cap", async () => {
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  // the only two lanes that consult predecessorCited are the signal and own_word lanes
  // FOUR uses, and only four: the signal split (in/out) and the own_word split (in/out). A fifth
  // would mean some other lane had started consulting the predecessor.
  const uses = [...fn.matchAll(/predecessorCited\.has\(/g)].length;
  assertEquals(uses, 4, "the signal split (2) and the own_word split (2) — nothing else");
  const fAt = fn.indexOf('.from("findings")');
  const dAt = fn.indexOf('.from("claim_deltas")');
  assert(fAt > 0 && dAt > 0, "both lanes still exist");
  const fLane = fn.slice(fAt, fn.indexOf('.from("claim_deltas")'));
  assert(!fLane.includes("predecessorCited"), "the finding lane never consults the predecessor");
  const dLane = fn.slice(dAt);
  assert(!dLane.includes("predecessorCited"), "nor the delta lane");
  // the recurrence gate is untouched
  assert(fn.includes('.from("finding_recurrence")'), "findings still gate on recurrence backing");
});

Deno.test("P1. the budget is 12, is shared signals-first, and is spent not exceeded", async () => {
  assertEquals(PREDECESSOR_CITED_CAP, 12);
  assertEquals(PREDECESSOR_CITED_REASON, "predecessor_cited");
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  assert(fn.includes("let p1Budget = predecessorCited.size > 0 ? PREDECESSOR_CITED_CAP : 0;"),
    "the budget starts at the cap, and at zero when there is no predecessor");
  assert(fn.includes("p1Budget -= p1Sig.kept.length;"), "signals spend it first");
  assert(fn.includes("p1Budget -= p1Ow.kept.length;"), "own_words spend what is left");
  const sigAt = fn.indexOf("p1Budget -= p1Sig.kept.length;");
  const owAt = fn.indexOf("const p1Ow = p1Budget > 0");
  assert(sigAt < owAt, "the own_word lane sees the REDUCED budget, so the two cannot exceed 12 together");
  // the cap is passed as the budget, so selectSignals itself enforces it
  assert(fn.includes("selectSignals(sigCited, p1Budget, confirmed)"), "the budget IS the cap handed to the selector");
});

Deno.test("P1. with no predecessor kind, behaviour is exactly today's", async () => {
  const src = await read("./publicReadInputs.ts");
  const fn = src.slice(src.indexOf("export async function selectPublicInputs("));
  assert(fn.includes("if (opts.predecessorKind) {"), "the predecessor is read only when a kind is named");
  assert(fn.includes("let p1Budget = predecessorCited.size > 0 ? PREDECESSOR_CITED_CAP : 0;"),
    "no cited ids ⇒ zero budget ⇒ both p1 lanes are skipped and the ordinary lanes see every row");
  assertEquals(READ_CAP.signal, 30, "the ordinary cap (ruling 33, 2026-10-22: 20 → 30)");
  assertEquals(READ_CAP.own_word, 25);
});

Deno.test("P1. the ledger names the admitted rows", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("predecessor_cited: inputs.filter((r) => r.admitted_by === PREDECESSOR_CITED_REASON).map((r) => r.id),"),
    "the ledger records WHICH rows P1 admitted — the distinction audit 10228 could not make");
  assert(src.includes("const { inputs, dropped } = await selectPublicInputs(supabase, company_id, { predecessorKind });"),
    "and the generator tells the selection which read to protect");
});

// ── P2 ───────────────────────────────────────────────────────────────────────────────────────────

const L = (field: string, text: string, refs: string[], cls: string | null = "record"): CitedLine =>
  ({ field, text, cls, refs });

Deno.test("P2. a licensed line is NOT counted as continued", () => {
  const current = [
    L("unique_attributes[0]", "flat-rate pricing with no egress fees", ["r1"]),
    L("unique_attributes[1]", "FedRAMP Ready status for federal customers", ["gone1", "gone2"]),
  ];
  const staged = [L("unique_attributes[0]", "flat-rate pricing with no egress fees", ["r1"])];
  const split = classifyContinuity({
    currentLines: current, stagedLines: staged,
    newLedgerIds: new Set(["r1"]),
    textByRef: { r1: "flat-rate pricing with no egress fees" }, classByRef: { r1: "record" },
  });
  assertEquals(split.continued.length, 1, "one line continued");
  assertEquals(split.licensed.length, 1, "and one was licensed — NOT continued");
  assertEquals(split.dropped.length, 0);
  const block = continuityBlock(split, []);
  assertEquals(block.required, 2);
  assertEquals(block.continued, 1, "the FedRAMP case: required-minus-missing would have said 2");
  assertEquals(block.licensed_count, 1);
  assertEquals(block.dropped_count, 0);
  assertEquals(block.required, block.continued + block.licensed_count + block.dropped_count);
});

Deno.test("P2. every count is a bucket size, never arithmetic", async () => {
  const src = await read("./stageContinuity.ts");
  const fn = src.slice(src.indexOf("export function continuityBlock("));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert(!/required - /.test(body), "no subtraction may produce a count — that IS the defect");
  assert(body.includes("continued: split.continued.length"), "continued is the bucket size");
  assert(body.includes("licensed_count: split.licensed.length"));
  assert(body.includes("dropped_count: split.dropped.length"));
  assert(body.includes("const required = split.continued.length + split.licensed.length + split.dropped.length;"),
    "and required is their sum, so the three cannot disagree with it");
});

Deno.test("P2. each of the three sets carries its lines with text, citations and cause", () => {
  const current = [
    L("a", "serving 12 counties", ["gone"]),
    L("b", "flat pricing", ["r1"]),
    L("c", "no egress fees", ["r1"]),
  ];
  const staged = [L("b", "flat pricing", ["r1"])];
  const split = classifyContinuity({
    currentLines: current, stagedLines: staged, newLedgerIds: new Set(["r1"]),
    textByRef: { r1: "flat pricing and no egress fees" }, classByRef: { r1: "record" },
  });
  for (const set of [split.continued, split.licensed]) {
    for (const l of set) {
      assert(l.statement.length > 0, "the text");
      assert(Array.isArray(l.citations), "the citations");
      assert(l.reason.length > 0, "and the cause");
    }
  }
  for (const d of split.dropped) {
    assert(d.statement.length > 0 && Array.isArray(d.citations) && d.reason.startsWith("dropped:"));
  }
  assertEquals(split.licensed[0].reason.startsWith("licensed:"), true, "a licensed line says so");
  assertEquals(split.continued[0].reason.startsWith("continued"), true, "a continued line says so");
});

Deno.test("P2. the refusal is on the DROPPED set alone, not on licensed lines", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("if (split.dropped.length > 0 && c1Enforced) throw new StageRefusal(CONTINUITY_GUARD, continuityDetail(split.dropped));"),
    "a licensed line must never refuse a stage — it is licensed precisely because it cannot be required");
});

// ── P3 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("P3. the judge is ASKED the distinctness question, on positioning only", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes('const distinctActive = kind === "positioning";'), "asked of the kind with differentiators");
  assert(src.includes("(f) DISTINCTNESS — do any TWO of unique_attributes make the SAME claim?"),
    "the question is in the judge's system prompt");
  assert(src.includes('"distinctness":{"distinct_ok":true|false'), "and the verdict shape asks for the answer");
  // the question names the exact failure mode Wasabi showed
  const clause = src.slice(src.indexOf("(f) DISTINCTNESS"), src.indexOf("Set distinct_ok:false"));
  assert(clause.includes("the same fact in different words"), "the same claim in different words counts");
  assert(clause.includes("whichever rows each line cites"), "and separate citations do not make it distinct");
});

Deno.test("P3. the distinctness verdict REFUSES, and fails closed when absent", () => {
  const gate = (kind: string, verdict: Record<string, unknown>): boolean => {
    if (kind !== "positioning") return true;
    const d = verdict.distinctness as { distinct_ok?: unknown } | undefined;
    return d?.distinct_ok === true;
  };
  assertEquals(gate("positioning", { distinctness: { distinct_ok: true } }), true);
  assertEquals(gate("positioning", { distinctness: { distinct_ok: false } }), false, "false refuses");
  assertEquals(gate("positioning", {}), false, "ABSENT refuses — fail closed, as the class gate does");
  assertEquals(gate("positioning", { distinctness: {} }), false, "and a verdict with no answer refuses");
  assertEquals(gate("strategy", {}), true, "a kind that is not asked is unaffected");
  assertEquals(gate("promise", {}), true);
  assertEquals(gate("offering", {}), true);
});

Deno.test("P3. accepts() consults the distinctness gate", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("accepts: (kind, verdict) =>"));
  const body = fn.slice(0, fn.indexOf("\n      //"));
  assert(body.includes("distinctnessOk(kind, verdict)"), "the gate is in the accept expression");
  const impl = src.slice(src.indexOf("const distinctnessOk ="));
  assert(impl.includes('if (kind !== "positioning") return true;'));
  assert(impl.includes("return d?.distinct_ok === true;"), "fail-closed on absent or false");
});

Deno.test("P3. the pre-filter LOGS and never refuses", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("const distinctnessPreFilter ="), "the filter exists");
  // it must not appear in the accept expression
  const acc = src.slice(src.indexOf("accepts: (kind, verdict) =>"), src.indexOf("// ── THE BOUNDED RE-ASK"));
  assert(!acc.includes("distinctnessPreFilter"), "the filter must not gate accept");
  assert(!acc.includes("distinctnessLog"), "nor its log");
  // and it must not reach the judge, or a log-only filter would be steering the refusal
  const sysFn = src.slice(src.indexOf("const judgeSysFor = (kind: Kind): string => {"), src.indexOf("// Legacy market_read pointers"));
  assert(!sysFn.includes("distinctnessPreFilter"), "the filter is not in the judge's prompt");
  assert(!sysFn.includes("distinctLog"), "and no interpolation of its hits either");
  // it IS logged and stored
  assert(src.includes("[distinctness-prefilter]"), "it logs");
  assert(src.includes("distinctness_prefilter: distinctnessLog[kind as Kind] ?? null,"), "and the audit row keeps it");
  assert(src.includes("distinctness: (verdicts[kind as Kind]?.distinctness as unknown) ?? null,"),
    "beside the verdict that actually refuses, so the two can be compared");
});

Deno.test("P3. the pre-filter's own rule: >=2 content words, company name stripped", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("const distinctnessPreFilter ="));
  const body = fn.slice(0, fn.indexOf("\n    };"));
  assert(body.includes("!nameWords.has(w)"), "the company's own name is removed — every read names itself");
  assert(body.includes("shared.length >= 2"), "the measured threshold");
  assert(body.includes("unique_attributes"), "it compares differentiators");
});
