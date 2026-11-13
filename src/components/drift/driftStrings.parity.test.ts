// S-DRIFT-1 / S-DRIFT-2 parity (2026-11-12). Same contract as the landing and /login strings:
// verbatim here, rendered from here, and no reader spelling the state or the copy itself.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DRIFT_STRINGS, DRIFT_STATE_WITHHELD, WITHHELD_REASON, isWithheld } from "./driftStrings";

const SRC = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("the withheld strings are verbatim as signed", () => {
  it("S-DRIFT-1", () => expect(DRIFT_STRINGS.withheldLabel).toBe("Not assessed"));
  it("S-DRIFT-2 (revised and re-signed 2026-11-12, SP-124)", () => expect(DRIFT_STRINGS.withheldDetail).toBe(
    "Not assessed. Some of this evidence is not cleared to send to an outside model."));

  it("S-DRIFT-2 no longer claims the evidence is a private document", () => {
    // SP-124: signalProvenance returns null for an upload-derived row AND for an outside-band row
    // whose voice is analysis/NULL. Only the first is a private document, so the copy must not say so.
    for (const word of ["private document", "private documents"]) {
      expect(DRIFT_STRINGS.withheldDetail.toLowerCase()).not.toContain(word);
    }
  });
});

describe("neither line claims a failure", () => {
  it("no error vocabulary — the system declined by design", () => {
    for (const line of [DRIFT_STRINGS.withheldLabel, DRIFT_STRINGS.withheldDetail]) {
      for (const bad of ["error", "failed", "failure", "unavailable", "try again"]) {
        expect(line.toLowerCase()).not.toContain(bad);
      }
    }
  });
});

describe("the withheld reason codes (SP-124)", () => {
  it("are the two the function writes, and are never shown to a reader", () => {
    expect(WITHHELD_REASON.privateEvidence).toBe("private_evidence");
    expect(WITHHELD_REASON.unlabelledEvidence).toBe("unlabelled_evidence");
    // the copy is the same in both cases on purpose: the distinction is for the ledger, not the surface
    for (const code of Object.values(WITHHELD_REASON)) {
      expect(DRIFT_STRINGS.withheldDetail).not.toContain(code);
      expect(DRIFT_STRINGS.withheldLabel).not.toContain(code);
    }
  });
});

describe("the state name has one spelling", () => {
  it("DRIFT_STATE_WITHHELD matches the CHECK constraint's value", () =>
    expect(DRIFT_STATE_WITHHELD).toBe("withheld"));
  it("isWithheld is true only for it", () => {
    expect(isWithheld("withheld")).toBe(true);
    for (const s of ["aligned", "slight_drift", "material_drift", "", null, undefined]) {
      expect(isWithheld(s as string | null | undefined)).toBe(false);
    }
  });
});

describe("the three readers render them from this file", () => {
  const readers = [
    "components/drift/DriftBadge.tsx",
    "components/drift/DriftDetailPanel.tsx",
    "views/client/DriftInboxView.tsx",
  ];

  it("each imports driftStrings rather than carrying its own literal", () => {
    for (const r of readers) {
      const src = read(r);
      expect(src, `${r} must import the strings`).toMatch(/driftStrings/);
      // the signed copy appears in no reader as a literal
      expect(src, `${r} must not inline S-DRIFT-1`).not.toContain('"Not assessed"');
      expect(src, `${r} must not inline S-DRIFT-2`).not.toContain(DRIFT_STRINGS.withheldDetail);
    }
  });

  it("no reader tests the drift STATE by spelling it — isWithheld is the one test", () => {
    // The InboxFilter key is also the word "withheld" (`filter === "withheld"` on the chip), which is
    // a filter value, not a state read. What must never appear is a reader deciding the STATE by
    // string comparison, because that is the ternary-fallthrough defect this whole file exists for.
    for (const r of readers) {
      const src = read(r);
      expect(src, `${r} must not compare drift_state to a literal`).not.toMatch(
        /(drift_state|driftState|\bstate)\s*===\s*["']withheld["']/,
      );
    }
  });
});
