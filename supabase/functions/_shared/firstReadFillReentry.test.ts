// OWN-WORDS-WRITE RE-ENTRY GATE (2026-09-18) — causeway 09-17: the fill's re-entry on an own-words WRITE
// terminal (e817cefc) fired a second fill at the same instant as the chain's own gap-pairs step; both
// called generate-claim-deltas; the trailing run 500'd on the unique key. The re-entry exists for the
// out-of-band write paths only, so it is gated on whether THIS chain schedules public_gap_pairs.
//
// The harness runs the real runChainKinds with the production recordChainLedger shape (re-enter = run
// the full chain again, as the fill does), counting generate-claim-deltas invocations:
//   chain WITH in-chain gap pairs + own-words write  → exactly ONE generate-claim-deltas, no re-entry
//   chain WITHOUT gap pairs + own-words write          → the re-entry still fires; the re-entered (full)
//                                                        chain computes gap pairs once
//   own-words already present (the re-entered chain)   → no re-entry (depth 1, cannot recur)
// Source guard: the fill gates on ownWordsWriteReentry with the chain's scheduled kinds, filled before launch.
// NON-VACUITY (run by hand, reported): make ownWordsWriteReentry ignore chainKinds (the pre-fix gate) →
//   the first scenario counts TWO invocations → the assertion fails.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ownWordsWriteReentry, runChainKinds, type ChainKindStep, type ChainKindTerminal } from "./firstReadFill.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

/** A fill: the production shape of recordChainLedger (re-enter ⇒ run the FULL chain again) over a scripted world. */
function makeWorld() {
  const world = { ownWordsPresent: false, deltasPresent: false, generateClaimDeltasCalls: 0, reentries: 0, ledger: [] as string[] };
  const ownWordsStep: ChainKindStep = {
    kind: "own_words",
    alreadyPresent: () => Promise.resolve(world.ownWordsPresent),
    run: () => { world.ownWordsPresent = true; return Promise.resolve({ status: "completed" as ChainKindTerminal, note: "plan 1 · wrote 1" }); },
  };
  const gapPairsStep: ChainKindStep = {
    kind: "public_gap_pairs",
    alreadyPresent: () => Promise.resolve(world.deltasPresent),
    run: () => { world.generateClaimDeltasCalls++; world.deltasPresent = true; return Promise.resolve({ status: "completed" as ChainKindTerminal, note: "public deltas computed" }); },
  };
  const FULL_CHAIN = [ownWordsStep, gapPairsStep];
  const fill = async (chain: ChainKindStep[]): Promise<void> => {
    const scheduledChainKinds: string[] = [];
    const pending: Promise<void>[] = [];
    const recordChainLedger = (kind: string, status: ChainKindTerminal, note?: string) => {
      world.ledger.push(`fr_${kind}:${status}:${note ?? ""}`);
      // the fill's re-entry: fire-and-forget first-read-fill with NO stage → the full chain
      if (ownWordsWriteReentry({ kind, note, chainKinds: scheduledChainKinds })) { world.reentries++; pending.push(fill(FULL_CHAIN)); }
      return Promise.resolve();
    };
    scheduledChainKinds.push(...chain.map((s) => s.kind));
    await runChainKinds(chain, { recordChainLedger });
    await Promise.all(pending);
  };
  return { world, fill, ownWordsStep, gapPairsStep, FULL_CHAIN };
}

Deno.test("chain WITH in-chain gap pairs + own-words write → exactly one generate-claim-deltas, no re-entry", async () => {
  const { world, fill, FULL_CHAIN } = makeWorld();
  await fill(FULL_CHAIN);
  assertEquals(world.generateClaimDeltasCalls, 1);
  assertEquals(world.reentries, 0);
  assertEquals(world.ledger, ["fr_own_words:completed:plan 1 · wrote 1", "fr_public_gap_pairs:completed:public deltas computed"]);
});

Deno.test("chain WITHOUT gap pairs + own-words write → the re-entry still fires; the re-entered chain computes gap pairs once", async () => {
  const { world, fill, ownWordsStep } = makeWorld();
  await fill([ownWordsStep]); // an out-of-band shaped chain: own-words only
  assertEquals(world.reentries, 1);
  assertEquals(world.generateClaimDeltasCalls, 1);
  // the re-entered chain's own-words is the already-present path → no second re-entry (depth 1)
  assertEquals(world.ledger.filter((l) => l.startsWith("fr_own_words:")).length, 2);
  assert(world.ledger.some((l) => l === "fr_own_words:completed_empty:already present — first-fill no-op"));
});

Deno.test("the gate itself: kind, write note and scheduled kinds", () => {
  assertEquals(ownWordsWriteReentry({ kind: "own_words", note: "plan 5 · wrote 4", chainKinds: ["own_words"] }), true);
  assertEquals(ownWordsWriteReentry({ kind: "own_words", note: "plan 5 · wrote 4", chainKinds: ["own_words", "public_gap_pairs", "relevance_backstop"] }), false);
  assertEquals(ownWordsWriteReentry({ kind: "own_words", note: "already present — first-fill no-op", chainKinds: [] }), false);
  assertEquals(ownWordsWriteReentry({ kind: "own_words", note: "plan 3 · wrote 0", chainKinds: [] }), true); // a write terminal (empty) still re-evaluates freshness, as before
  assertEquals(ownWordsWriteReentry({ kind: "public_gap_pairs", note: "wrote 9", chainKinds: [] }), false);
  assertEquals(ownWordsWriteReentry({ kind: "own_words", note: null, chainKinds: [] }), false);
});

Deno.test("source guard: the fill gates the re-entry on the chain's scheduled kinds, filled before the chain launches", async () => {
  const src = await read("../first-read-fill/index.ts");
  assertStringIncludes(src, "if (ownWordsWriteReentry({ kind, note, chainKinds: scheduledChainKinds })) {");
  const fillArr = src.indexOf("scheduledChainKinds.push(...chainSteps.map((s) => s.kind));");
  const launch = src.indexOf("waitUntil(runChainKinds(chainSteps, { recordChainLedger })");
  assert(fillArr > 0 && launch > 0 && fillArr < launch, "scheduled kinds are recorded before the chain runs");
  assert(!/kind === "own_words" && \(note \?\? ""\)\.includes\("wrote "\)/.test(src), "the old note-only gate is gone");
});
