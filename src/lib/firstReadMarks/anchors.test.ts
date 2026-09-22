// First-read marks — the anchor helper (FM12 / FM14 / FM15, 2026-09-21). Pure; no store, no page.
// Plants: (1) matchAnchor ignoring the hash → wording_changed never returned; (2) buildAnchor keying a market by
// its row id instead of journey_key → the FM14 assertion fails; (3) the hash rule diverging from normalizeForHash
// (e.g. no lowercase) → the parity assertion fails.
import { describe, it, expect } from "vitest";
import { buildAnchor, hashAnchorText, matchAnchor, type CurrentRow } from "./anchors";
import { contentIdentity } from "../../../supabase/functions/_shared/contentIdentity.ts";

describe("hashAnchorText — the one hash rule", () => {
  it("equals the content-identity authority (lowercase, collapsed whitespace, trimmed)", async () => {
    const text = "  Families and   Caregivers of at-risk YOUTH ";
    expect(await hashAnchorText(text)).toBe(await contentIdentity(text));
    expect(await hashAnchorText(text)).toBe(await hashAnchorText("families and caregivers of at-risk youth"));
    expect(await hashAnchorText("a")).not.toBe(await hashAnchorText("b"));
    expect(await hashAnchorText("x")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildAnchor — every markable kind keys durably", () => {
  it("row kinds carry their stable ids", async () => {
    expect((await buildAnchor({ kind: "signal", id: "s1", text: "t" }))!.anchor_key).toBe("s1");
    expect((await buildAnchor({ kind: "own_words", id: "c1", text: "t" }))!.anchor_key).toBe("c1");
    expect((await buildAnchor({ kind: "channel_claim", id: "c2", text: "t" }))!.anchor_key).toBe("c2");
    expect((await buildAnchor({ kind: "gap_statement", statementId: "c3", text: "t" }))!.anchor_key).toBe("c3");
    expect((await buildAnchor({ kind: "gap_pair", contentIdentity: "ci-1", text: "t" }))!.anchor_key).toBe("ci-1");
    expect(await buildAnchor({ kind: "gap_pair", contentIdentity: null, text: "t" })).toBeNull(); // a legacy pair without identity: not markable
    expect((await buildAnchor({ kind: "reverse_row", id: "d1", text: "t" }))!.anchor_key).toBe("d1");
    expect((await buildAnchor({ kind: "finding", id: "f1", text: "t" }))!.anchor_key).toBe("f1");
    expect((await buildAnchor({ kind: "finding_quote", findingId: "f1", signalId: "s9", text: "t" }))!.anchor_key).toBe("f1:s9");
    expect((await buildAnchor({ kind: "cold_open_pointer", contentIdentity: "ci-2", text: "t" }))!.anchor_key).toBe("ci-2");
    expect((await buildAnchor({ kind: "cold_open_line", rung: "echo_gap", text: "t" }))!.anchor_key).toBe("echo_gap");
    expect((await buildAnchor({ kind: "status_conflict", questionIdentity: "q-9", text: "t" }))!.anchor_key).toBe("q-9");
  });
  it("FM14: a market keys by journey_key, a candidate group by original_identity — never a row id; missing → null", async () => {
    const m = await buildAnchor({ kind: "market", journeyKey: "mkt-schools", text: "Schools" });
    expect(m).toMatchObject({ anchor_kind: "market", anchor_key: "mkt-schools", anchor_text: "Schools" });
    expect(await buildAnchor({ kind: "market", journeyKey: null, text: "Schools" })).toBeNull();
    const g = await buildAnchor({ kind: "candidate_group", originalIdentity: "oi-1", text: "Funders" });
    expect(g!.anchor_key).toBe("oi-1");
    expect(await buildAnchor({ kind: "candidate_group", originalIdentity: null, text: "Funders" })).toBeNull();
  });
  it("FM15: a question keys by question_identity; an offering question by the hash of its text", async () => {
    expect((await buildAnchor({ kind: "question", questionIdentity: "qi-1", text: "Why?" }))!.anchor_key).toBe("qi-1");
    const oq = await buildAnchor({ kind: "offering_question", text: "  Why  this? " });
    expect(oq!.anchor_key).toBe(`offering:${await hashAnchorText("why this?")}`);
  });
  it("FM12: a read field keys by read + field (+ index) with the text hash beside it", async () => {
    const a = await buildAnchor({ kind: "read_field", read: "positioning", field: "differentiators", index: 1, text: "Fast" });
    expect(a).toMatchObject({ anchor_kind: "read_field", anchor_key: "positioning:differentiators:1", anchor_text: "Fast" });
    expect(a!.sha).toBe(await hashAnchorText("Fast"));
    expect((await buildAnchor({ kind: "read_field", read: "promise", field: "promise", text: "P" }))!.anchor_key).toBe("promise:promise");
    expect((await buildAnchor({ kind: "read_field", read: "offering", field: "items", index: 3, text: "Label" }))!.anchor_key).toBe("offering:items:3");
    expect(await buildAnchor({ kind: "read_field", read: "strategy", field: " ", text: "x" })).toBeNull();
  });
  it("FM15: exactly three groups anchor (yousay:channels, gap:reverse, serve:unstated); the ruled-out and sort-derived groups, Base elements and score bands are not markable", async () => {
    for (const [beat, block] of [["yousay", "channels"], ["gap", "reverse"], ["serve", "unstated"]]) {
      expect((await buildAnchor({ kind: "group", beat, block, text: `${beat} ${block}` }))!.anchor_key).toBe(`${beat}:${block}`);
    }
    // ruled out by FM15 (ownership groups, not row-bearing blocks)
    for (const [beat, block] of [["offer", "named"], ["offer", "seen_outside"], ["offer", "not_read"], ["yousay", "own_words:verbatim"], ["yousay", "own_words:paraphrased"], ["serve", "observed"]]) {
      expect(await buildAnchor({ kind: "group", beat, block, text: `${beat} ${block}` })).toBeNull();
    }
    expect(await buildAnchor({ kind: "group", beat: "record", block: "strong", text: "tier" })).toBeNull();
    expect(await buildAnchor({ kind: "group", beat: "gap", block: "contradicted", text: "run" })).toBeNull();
    expect(await buildAnchor({ kind: "group", beat: "questions", block: "half:0", text: "half" })).toBeNull();
    expect(await buildAnchor({ kind: "base_element", text: "What you're doing" })).toBeNull();
    expect(await buildAnchor({ kind: "score_band", text: "80–100" })).toBeNull();
    expect(await buildAnchor({ kind: "derived_group", text: "strong" })).toBeNull();
    expect(await buildAnchor({ kind: "signal", id: "s1", text: "   " })).toBeNull(); // no text → nothing to anchor to
  });
});

describe("matchAnchor — match / wording_changed / row_gone", () => {
  it("returns all three results", async () => {
    const anchor = (await buildAnchor({ kind: "finding", id: "f1", text: "The old wording" }))!;
    const same: CurrentRow = { anchor_kind: "finding", anchor_key: "f1", sha: await hashAnchorText("the OLD   wording") };
    const changed: CurrentRow = { anchor_kind: "finding", anchor_key: "f1", sha: await hashAnchorText("a new wording") };
    const other: CurrentRow = { anchor_kind: "finding", anchor_key: "f2", sha: anchor.sha };
    const otherKind: CurrentRow = { anchor_kind: "signal", anchor_key: "f1", sha: anchor.sha };
    expect(matchAnchor(anchor, [same, other])).toBe("match");
    expect(matchAnchor(anchor, [changed, other])).toBe("wording_changed");
    expect(matchAnchor(anchor, [other, otherKind])).toBe("row_gone"); // same key under another kind is not this row
    expect(matchAnchor(anchor, [])).toBe("row_gone");
    expect(matchAnchor(anchor, [changed, same])).toBe("match"); // any hash-equal row of the key wins
  });
});

describe("sections and the score value (FM14)", () => {
  it("a section anchors by its beat key with the headline as text — every beat except the static screens", async () => {
    for (const beat of ["record", "yousay", "gap", "findings", "promise", "positioning", "strategy", "serve", "offer", "questions"]) {
      const a = await buildAnchor({ kind: "section", beat, text: `Headline of ${beat}` });
      expect(a).toMatchObject({ anchor_kind: "section", anchor_key: beat, anchor_text: `Headline of ${beat}` });
    }
    for (const beat of ["arc", "cold", "siesta1", "siesta2", "next", "base", "score"]) {
      expect(await buildAnchor({ kind: "section", beat, text: "static" })).toBeNull();
    }
    expect(await buildAnchor({ kind: "section", beat: " ", text: "x" })).toBeNull();
  });
  it("the score value anchors as score_value:score with the rendered value as text; bands stay non-markable", async () => {
    const a = await buildAnchor({ kind: "score_value", text: "62" });
    expect(a).toMatchObject({ anchor_kind: "score_value", anchor_key: "score", anchor_text: "62" });
    expect(a!.sha).toBe(await hashAnchorText("62"));
    expect(await buildAnchor({ kind: "score_band", text: "60–80" })).toBeNull();
    expect(matchAnchor(a!, [{ anchor_kind: "score_value", anchor_key: "score", sha: await hashAnchorText("63") }])).toBe("wording_changed"); // the value moved
  });
});
