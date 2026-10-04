// IR6 (signed 2026-10-01) — the text-only note: where it belongs, and where it must not go.
//
// The note says what the read COVERS. It belongs beside a line that reports a silence about the
// COMPANY ("Nothing we've read so far speaks to this", "What we haven't found yet", "Scanned
// {date} — none found") — each of which was honest only while nothing could read an image. It must
// stay off lines that report OUR OWN COLLECTION STATE ("No scan yet", "No outside signals collected
// yet"): nothing was read at all there, so "text only" is not the limitation.
//
// These tests pin the shared predicate both renderers use, so the screen and the leave-behind can
// never disagree about where the note appears.
import { describe, expect, it } from "vitest";
import {
  SAY_VS_SEE_GROUPS,
  SILENT_SEE_LINE,
  TEXT_ONLY_NOTE,
  groupShowsSilence,
  rowShowsSilence,
} from "./sayVsSee";

describe("the signed note text", () => {
  it("is exactly the signed sentence", () => {
    expect(TEXT_ONLY_NOTE).toBe("We read text only. Words inside images, such as flyers, aren't read yet.");
  });

  it("says what the read covers — it is not an empty state and makes no claim about the company", () => {
    expect(TEXT_ONLY_NOTE).not.toContain("none found");
    expect(TEXT_ONLY_NOTE).not.toContain("No scan");
    expect(TEXT_ONLY_NOTE).not.toContain("Nothing we");
  });

  it("leaves every existing signed string untouched", () => {
    // IR6 is additive. If any of these moves, the note commit has changed a signed string.
    expect(SAY_VS_SEE_GROUPS.map((g) => g.heading)).toEqual([
      "Where the outside echoes you",
      "Where the outside disagrees",
      "What we haven't found yet",
    ]);
    expect(SAY_VS_SEE_GROUPS.map((g) => g.empty)).toEqual([
      "Nothing we've read so far repeats back what you've told us.",
      "Nothing we've read so far contradicts what you've told us.",
      "Everything you've told us turned up somewhere in what we've read.",
    ]);
    expect(SILENT_SEE_LINE).toBe("Nothing we've read so far speaks to this.");
  });
});

describe("groupShowsSilence — which section takes the note", () => {
  it("publicly_silent ALWAYS shows silence: its heading is a silence claim and every row is silent", () => {
    expect(groupShowsSilence("publicly_silent", [{ see: "the record says this" }])).toBe(true);
    expect(groupShowsSilence("publicly_silent", [])).toBe(true);
  });

  it("echoed / divergent show silence only when a row has no see side", () => {
    expect(groupShowsSilence("echoed", [{ see: "a" }, { see: "b" }])).toBe(false);
    expect(groupShowsSilence("divergent", [{ see: "a" }, { see: "b" }])).toBe(false);
    expect(groupShowsSilence("echoed", [{ see: "a" }, { see: null }])).toBe(true);
    expect(groupShowsSilence("divergent", [{ see: "" }])).toBe(true);
    expect(groupShowsSilence("echoed", [{ see: undefined }])).toBe(true);
  });

  it("an all-backed group takes NO note — nothing there reports a silence", () => {
    expect(groupShowsSilence("echoed", [{ see: "x" }])).toBe(false);
  });

  it("matches the row-level test the row components apply (DeltaItemRow.tsx:28)", () => {
    // silent = deltaType === "publicly_silent" || !see — the group test is that, lifted over rows.
    for (const key of ["echoed", "divergent", "publicly_silent"] as const) {
      for (const see of ["x", "", null, undefined]) {
        const rows = [{ see }];
        expect(groupShowsSilence(key, rows)).toBe(rowShowsSilence(key, rows[0]));
      }
    }
  });
});

describe("rowShowsSilence — the featured lead card shows one item, not a group", () => {
  it("is true for a publicly_silent item whatever its see side", () => {
    expect(rowShowsSilence("publicly_silent", { see: "something" })).toBe(true);
  });

  it("is true for any item with no see side", () => {
    expect(rowShowsSilence("divergent", { see: null })).toBe(true);
    expect(rowShowsSilence("echoed", { see: "" })).toBe(true);
  });

  it("is false for a backed non-silent item — that card takes no note", () => {
    expect(rowShowsSilence("echoed", { see: "the record backs this" })).toBe(false);
    expect(rowShowsSilence("divergent", { see: "the record disputes this" })).toBe(false);
  });
});
