// ── The 4e-4 rulings R1, R2, N21 (operator, signed 2026-09-24) ─────────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FINDER_SYSTEM } from "./convert.ts";
import { N21_MIN_TURN_WORDS, N21_REASON, N21_ROUTES, N21_RUNG, PARSER_RULES_VERSION, PARSER_RULINGS_4E4, READ_OVERLAP_WORDS } from "./rules.ts";
import { buildReadIndex, n21Route, turnWordCount } from "./readFeedback.ts";

const READ = [{ how_to_win: "a kinship programme with high family-placement retention and strong payer relationships" }];
const idx = buildReadIndex(READ, READ_OVERLAP_WORDS);

Deno.test("4e-4: the version moved and the three rulings are exported verbatim", () => {
  assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");
  assertEquals(PARSER_RULINGS_4E4.length, 3);
  for (const [i, p] of ["R1 ", "R2 ", "N21 "].entries()) assert(PARSER_RULINGS_4E4[i].startsWith(p));
});

Deno.test("R1/R2: the two blocks the ablation convicted are gone; N18 stays", () => {
  assert(!FINDER_SYSTEM.includes("A TURN THAT LISTS SEVERAL GOALS YIELDS ONE ITEM PER GOAL"), "R1");
  assert(!FINDER_SYSTEM.includes("THIS MEETING INCLUDED AN ON-SCREEN WALKTHROUGH"), "R2");
  assert(!FINDER_SYSTEM.includes("the thing they are reacting to is in OUR preceding turn"), "R2, fully");
  assert(FINDER_SYSTEM.includes("MEETING LOGISTICS ARE NOT ITEMS"), "N18 earned its place and stays");
  // the N7 enumeration N14 restored is untouched by either removal
  assert(FINDER_SYSTEM.includes("STEP ONE: go through EVERY SLOT BELOW, IN ORDER"));
});

Deno.test("N21: route (a) — the turn itself quotes the read", () => {
  assertEquals([...N21_ROUTES], ["a_turn_quotes_read", "b_preceded_by_our_read_turn"]);
  assertEquals(N21_REASON, "read reaction captured by code");
  assertEquals(N21_RUNG, "code_capture");
  assertEquals(n21Route({ turnText: "High family placement retention is not a thing for us anymore.", index: idx, precedingOurTurnQuotesRead: false, overlapWords: READ_OVERLAP_WORDS }), "a_turn_quotes_read");
});

Deno.test("N21: route (b) — our preceding turn quoted it and theirs shares nothing", () => {
  assertEquals(n21Route({ turnText: "That framing lands wrong and is not where the work sits now.", index: idx, precedingOurTurnQuotesRead: true, overlapWords: READ_OVERLAP_WORDS }), "b_preceded_by_our_read_turn");
  // route (a) wins when both hold, so the run row can tell them apart
  assertEquals(n21Route({ timeless: undefined as never, turnText: "High family placement retention, and that lands wrong for us.", index: idx, precedingOurTurnQuotesRead: true, overlapWords: READ_OVERLAP_WORDS } as never), "a_turn_quotes_read");
});

Deno.test("N21: the six-word floor keeps back-channel out", () => {
  assertEquals(N21_MIN_TURN_WORDS, 6);
  // an acknowledgement after our read-quoting turn is NOT a reaction
  for (const short of ["Yeah.", "Right, okay.", "Okay sure that is fine"]) {
    const under = turnWordCount(short) < N21_MIN_TURN_WORDS;
    assertEquals(n21Route({ turnText: short, index: idx, precedingOurTurnQuotesRead: true, overlapWords: READ_OVERLAP_WORDS }), under ? null : "b_preceded_by_our_read_turn", short);
  }
  assertEquals(turnWordCount("Okay sure that is fine"), 5);
  assertEquals(n21Route({ turnText: "Okay sure that is fine", index: idx, precedingOurTurnQuotesRead: true, overlapWords: READ_OVERLAP_WORDS }), null, "five words is under the floor");
  assertEquals(n21Route({ turnText: "Okay sure that is fine by me", index: idx, precedingOurTurnQuotesRead: true, overlapWords: READ_OVERLAP_WORDS }), "b_preceded_by_our_read_turn", "seven words clears it");
});

Deno.test("N21: neither route means no capture", () => {
  assertEquals(n21Route({ turnText: "Reconciling the intake spreadsheet by hand costs whole days.", index: idx, precedingOurTurnQuotesRead: false, overlapWords: READ_OVERLAP_WORDS }), null);
  // an empty index cannot fire either route
  assertEquals(n21Route({ turnText: "High family placement retention is not a thing anymore.", index: buildReadIndex([]), precedingOurTurnQuotesRead: false, overlapWords: READ_OVERLAP_WORDS }), null);
});
