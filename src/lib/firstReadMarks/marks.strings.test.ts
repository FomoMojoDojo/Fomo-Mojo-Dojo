// The signed strings of the first-read marks (operator, 2026-09-22, revised the same day) — pinned verbatim; nothing
// else is a string here. The retired strings ("Address in next phase", "Client reaction") are absent from src/.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { HEARD_GROUP_ORDER, MARK_STRINGS as S, REACTION_CHOICES, WITHDRAW_REASON, WITHDRAW_REASON_REVISIT } from "./strings";

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
    // the revisit prompt (FM12 revised, signed 2026-09-22)
    expect(S.revisitTitle).toBe("Marks that no longer match");
    expect(S.wordingChanged).toBe("The wording changed.");
    expect(S.rowGone).toBe("This row is gone.");
    expect(S.asMarked).toBe("As marked");
    expect(S.nowReads).toBe("Now reads");
    expect(S.keep).toBe("Keep");
    expect(S.remove).toBe("Remove (permanent)");
    expect(S.keepAll).toBe("Keep all");
    expect(S.removeAll).toBe("Remove all (permanent)");
    expect(Object.keys(S).length).toBe(17);
  });
  it("the reaction choices in box order; the heard groups in their order; the withdraw reason is the stored constant", () => {
    expect(REACTION_CHOICES.map((c) => [c.disposition, c.label])).toEqual([["interesting", "Interesting"], ["important", "Important"], ["not_important", "Not important"]]);
    expect([...HEARD_GROUP_ORDER]).toEqual(["important", "interesting", "not_important", "our_mark"]);
    expect(WITHDRAW_REASON).toBe("operator_withdrew_mark");
    expect(WITHDRAW_REASON_REVISIT).toBe("operator_removed_on_revisit");
    expect(WITHDRAW_REASON_REVISIT).not.toBe(WITHDRAW_REASON); // the audit must tell the two apart
  });
  it("the retired strings are absent from src/ (code, tests and styles)", () => {
    const hits = execSync(`grep -rl -e "Address in next phase" -e "Client reaction" -e "address_next_phase" src/ || true`, { encoding: "utf8" })
      .split("\n").filter(Boolean).filter((f) => !f.endsWith("marks.strings.test.ts"));
    expect(hits).toEqual([]);
  });
});
