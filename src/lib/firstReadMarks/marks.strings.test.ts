// The signed strings of the first-read marks (operator, 2026-09-22, revised the same day) — pinned verbatim; nothing
// else is a string here. The retired strings ("Address in next phase", "Client reaction") are absent from src/.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { HEARD_GROUP_ORDER, MARK_STRINGS as S, REACTION_CHOICES, WITHDRAW_REASON } from "./strings";

describe("first-read mark strings — signed 2026-09-22", () => {
  it("pins every signed string and nothing else", () => {
    expect(S.interesting).toBe("Interesting");
    expect(S.important).toBe("Important");
    expect(S.notImportant).toBe("Not important");
    expect(S.stoodOut).toBe("Stood out to us");
    expect(S.close).toBe("Close");
    expect(S.withdraw).toBe("Withdraw mark (permanent)");
    expect(S.whatWeHeard).toBe("What we heard");
    expect(S.saveFailed).toBe("That didn't save. Try again.");
    expect(Object.keys(S).length).toBe(8);
  });
  it("the reaction choices in box order; the heard groups in their order; the withdraw reason is the stored constant", () => {
    expect(REACTION_CHOICES.map((c) => [c.disposition, c.label])).toEqual([["interesting", "Interesting"], ["important", "Important"], ["not_important", "Not important"]]);
    expect([...HEARD_GROUP_ORDER]).toEqual(["important", "interesting", "not_important", "our_mark"]);
    expect(WITHDRAW_REASON).toBe("operator_withdrew_mark");
  });
  it("the retired strings are absent from src/ (code, tests and styles)", () => {
    const hits = execSync(`grep -rl -e "Address in next phase" -e "Client reaction" -e "address_next_phase" src/ || true`, { encoding: "utf8" })
      .split("\n").filter(Boolean).filter((f) => !f.endsWith("marks.strings.test.ts"));
    expect(hits).toEqual([]);
  });
});
