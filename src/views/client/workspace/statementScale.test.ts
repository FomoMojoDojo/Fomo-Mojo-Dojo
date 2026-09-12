// Statement scale (accepted fix, port 2b): the one threshold in workspaceNav decides display vs lede.
import { describe, expect, it } from "vitest";
import { STATEMENT_DISPLAY_MAX_CHARS, statementScale } from "./workspaceNav";

describe("statementScale", () => {
  it("picks display up to the threshold and lede past it", () => {
    expect(STATEMENT_DISPLAY_MAX_CHARS).toBe(140);
    expect(statementScale("a".repeat(139))).toBe("display");
    expect(statementScale("a".repeat(140))).toBe("display");
    expect(statementScale("a".repeat(141))).toBe("lede");
    expect(statementScale("a".repeat(139))).not.toBe(statementScale("a".repeat(141)));
    expect(statementScale("  short  ")).toBe("display"); // trimmed
  });
});
