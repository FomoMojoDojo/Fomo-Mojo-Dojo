// The parser rules, pinned verbatim (PR1–PR6, signed 2026-09-22). A rule's wording is the contract the
// judge and the pointer are built against, and every row the parser writes stamps the version — so a
// change to either must be deliberate and must move the version with it.
import { describe, it, expect } from "vitest";
import { MATCH_TOLERANCE, PARSER_RULES, PARSER_RULES_VERSION, POINTER_IS_CODE_COMPUTED, SIDE_CHANGED_REASON, STRICTNESS, supersededReason } from "../../../supabase/functions/interview-parser/rules.ts";

describe("interview parser rules — signed 2026-09-22, version moved by 4a R6, 4c R10, 4d R7 and 4e", () => {
  it("the version is stamped and is the one the migration writes", () => {
    // R6 (operator ruling, 2026-09-23): the version is no longer only a stamp. Parsing a record whose
    // live items carry an OLDER version now retracts them first, so moving this string re-parses every
    // record it touches. It moves only with a signed ruling.
    expect(PARSER_RULES_VERSION).toBe("2026-09-24.4");   // 4e-4: R1, R2, N21, signed 2026-09-24
  });

  it("R6: the supersession reason names the version, and the side reason is distinct from it", () => {
    expect(supersededReason()).toBe(`superseded by rules ${PARSER_RULES_VERSION}`);
    expect(supersededReason("2026-12-01.1")).toBe("superseded by rules 2026-12-01.1");
    expect(SIDE_CHANGED_REASON).toBe("speaker side changed");
    expect(SIDE_CHANGED_REASON).not.toBe(supersededReason()); // the audit must tell the two apart
  });

  it("all five rules, verbatim, in order", () => {
    expect(PARSER_RULES).toHaveLength(5);
    expect(PARSER_RULES[0]).toBe("Breadth, never drop: every candidate item lands; the judge annotates with a reason on pass and on reject; a rejected item lands marked, never missing.");
    expect(PARSER_RULES[1]).toBe("Pointer over wording: a passage pointer is computed by the code (turn index, line range, passage sha256) against the record's stored text sha; the model never asserts offsets; trace verifies the pointer, not the words.");
    expect(PARSER_RULES[2]).toBe("The executor's words: raw words are stored verbatim with their speaker label; the framework statement is derived and judged under the current criterion (job statements under solution-agnostic v3 with the deterministic means layer; needs under the ODI canonical form); no hand-authored statement ever enters a row.");
    expect(PARSER_RULES[3]).toBe("Unvalidated and unreviewed on landing; \"Mark reviewed\" never sets validated; public-register and external writers never read items; local generators may.");
    expect(PARSER_RULES[4]).toBe("One landing per item, keyed by content identity so a re-parse is idempotent; retiring the record withdraws every item it produced.");
  });

  it("rule 2 is asserted structurally too — the model never supplies a pointer", () => {
    expect(POINTER_IS_CODE_COMPUTED).toBe(true);
  });

  it("the per-record settings match the CHECK constraints the migration wrote", () => {
    expect([...STRICTNESS]).toEqual(["keep_and_mark", "located_only"]);
    expect([...MATCH_TOLERANCE]).toEqual(["exact", "ws", "fuzzy_0_85"]);
  });
});
