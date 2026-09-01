// Gate-C probe follow-up (2026-09-01) — regression fixtures for the claude_websearch synthesis
// extraction. The module lives under supabase/functions/_shared (edge-mounted, pure); this test lives
// under src/** so the vitest suite runs it against the SAME implementation the edge function imports.
// Each fixture must extract correctly OR fail loudly (null → the caller persists the raw + fails). NO
// JSON-repair is expected anywhere (explicitly rejected). Every assertion fails if its guard is reverted.
import { describe, it, expect } from "vitest";
import {
  selectFinalText,
  parseJsonObjectDefensive,
  blockCensus,
} from "../../../supabase/functions/_shared/synthesisJsonExtract.ts";

const textBlock = (text: string) => ({ type: "text", text });
const toolUse = () => ({ type: "server_tool_use", id: "srvtoolu_x", name: "web_search" });
const toolResult = () => ({ type: "web_search_tool_result", content: [] });

describe("parseJsonObjectDefensive — extract correctly or fail loudly (no repair)", () => {
  it("clean object → extracts", () => {
    expect(parseJsonObjectDefensive('{"category_archetype":"x","evidence_ledger":[]}')).toMatchObject({ category_archetype: "x" });
  });

  it("fenced ```json block with trailing brace-prose → extracts via fence-strip", () => {
    // Depends on the fence-strip: without it, the first{/last} slice would swallow the trailing
    // "{placeholder}" brace and fail. This is the fail-proof fixture (break the fence regex → FAIL).
    const fenced = 'Based on my research:\n```json\n{"category_archetype":"x"}\n```\nNote: replace {placeholder} as needed.';
    expect(parseJsonObjectDefensive(fenced)).toMatchObject({ category_archetype: "x" });
  });

  it("leading-prose preamble → extracts via first{/last} slice", () => {
    expect(parseJsonObjectDefensive('Here is the single JSON object:\n\n{"category_archetype":"x"}')).toMatchObject({ category_archetype: "x" });
  });

  it("trailing prose after the object → extracts", () => {
    expect(parseJsonObjectDefensive('{"category_archetype":"x"}\n\nThat concludes the analysis.')).toMatchObject({ category_archetype: "x" });
  });

  it("malformed JSON (unescaped quote) → FAILS LOUDLY (null), never repaired", () => {
    expect(parseJsonObjectDefensive('{"note":"he said "hi" to me","category_archetype":"x"}')).toBeNull();
  });

  it("empty / whitespace → null", () => {
    expect(parseJsonObjectDefensive("")).toBeNull();
    expect(parseJsonObjectDefensive("   \n  ")).toBeNull();
  });
});

describe("selectFinalText — the JSON answer is the FINAL text block, after the tool blocks", () => {
  it("multi-text-block → picks the LAST text block (not an interim reasoning block)", () => {
    const blocks = [
      toolUse(), toolResult(),
      textBlock("interim reasoning — deliberately not JSON"),
      toolUse(), toolResult(),
      textBlock('{"category_archetype":"x"}'),
    ];
    expect(selectFinalText(blocks)).toBe('{"category_archetype":"x"}');
    expect(parseJsonObjectDefensive(selectFinalText(blocks))).toMatchObject({ category_archetype: "x" });
  });

  it("no text block at all → empty string → parse null (fail loudly)", () => {
    expect(selectFinalText([toolUse(), toolResult()])).toBe("");
    expect(parseJsonObjectDefensive(selectFinalText([toolUse(), toolResult()]))).toBeNull();
  });

  it("non-array / nullish → empty string", () => {
    expect(selectFinalText(null)).toBe("");
    expect(selectFinalText(undefined)).toBe("");
  });
});

describe("blockCensus — the forensic summary persisted on parse failure", () => {
  it("counts total blocks, types, and text-block lengths", () => {
    const blocks = [toolUse(), toolResult(), textBlock("abc"), textBlock("defgh")];
    expect(blockCensus(blocks)).toEqual({
      total_blocks: 4,
      block_types: ["server_tool_use", "web_search_tool_result", "text", "text"],
      text_block_count: 2,
      text_block_lengths: [3, 5],
    });
  });

  it("empty content → zeroed census", () => {
    expect(blockCensus([])).toEqual({ total_blocks: 0, block_types: [], text_block_count: 0, text_block_lengths: [] });
  });
});
