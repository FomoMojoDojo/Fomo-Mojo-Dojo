// The revisit fire rule (FM12 revised, 2026-09-22) — the full matrix, pure.
//   3 states (match / wording_changed / row_gone) × 3 resolutions (unresolved / resolved-same / resolved-different)
// plus the two never-fire kinds (static copy, a text-hash key) and the not-yet-loaded guard.
// Plants: (1) revisitEntryFor ignoring revisit_resolved_against → every "resolved-same" cell is red;
//         (2) revisitEntries returning entries before the read loaded → the loaded guard is red;
//         (3) a null-text row treated as a mismatch → the static-copy cells are red.
import { describe, it, expect } from "vitest";
import { hashAnchorText } from "./anchors";
import { ROW_GONE, revisitEntries, revisitEntryFor, type HashedAnchor } from "./revisit";
import { anchorId, type LiveMark } from "./useFirstReadMarks";

const AS_MARKED = "The row as it read when it was marked";
const NOW_READS = "The row as it reads today";
const LATER = "The row as it reads after a second change";

const mark = (over: Partial<LiveMark> & { anchor_text_sha256: string }): LiveMark => ({
  id: "m1", company_id: "c1", kind: "our_mark", beat_key: "findings", anchor_kind: "finding", anchor_key: "f-1",
  anchor_text: AS_MARKED, created_at: "2026-09-22T00:00:00Z", version: 1, note: "", disposition: null, ...over,
});
const row = (text: string | null, sha: string | null): HashedAnchor =>
  ({ anchor_kind: "finding", anchor_key: "f-1", text, sha });
const index = (rows: HashedAnchor[]) => new Map(rows.map((r) => [anchorId(r.anchor_kind, r.anchor_key), r]));

describe("the revisit fire rule — the 3 × 3 matrix", () => {
  it("match × unresolved → silent", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    expect(revisitEntryFor(mark({ anchor_text_sha256: sha }), index([row(AS_MARKED, sha)]))).toBeNull();
  });
  it("match × resolved-same → silent", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    expect(revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: sha }), index([row(AS_MARKED, sha)]))).toBeNull();
  });
  it("match × resolved-different → silent (the row came back to its marked wording)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const other = await hashAnchorText(NOW_READS);
    expect(revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: other }), index([row(AS_MARKED, sha)]))).toBeNull();
  });

  it("wording_changed × unresolved → fires, carrying the current words and the sha a Keep would store", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const now = await hashAnchorText(NOW_READS);
    const e = revisitEntryFor(mark({ anchor_text_sha256: sha }), index([row(NOW_READS, now)]));
    expect(e?.state).toBe("wording_changed");
    expect(e?.currentText).toBe(NOW_READS);
    expect(e?.against).toBe(now);
  });
  it("wording_changed × resolved-same → silent (kept against exactly this wording)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const now = await hashAnchorText(NOW_READS);
    expect(revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: now }), index([row(NOW_READS, now)]))).toBeNull();
  });
  it("wording_changed × resolved-different → fires again (it changed a second time after a Keep)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const now = await hashAnchorText(NOW_READS);
    const later = await hashAnchorText(LATER);
    const e = revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: now }), index([row(LATER, later)]));
    expect(e?.state).toBe("wording_changed");
    expect(e?.currentText).toBe(LATER);
    expect(e?.against).toBe(later);
  });

  it("row_gone × unresolved → fires, with no current words and row_gone as the Keep value", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const e = revisitEntryFor(mark({ anchor_text_sha256: sha }), index([]));
    expect(e?.state).toBe("row_gone");
    expect(e?.currentText).toBeNull();
    expect(e?.against).toBe(ROW_GONE);
  });
  it("row_gone × resolved-same (row_gone) → silent", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    expect(revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: ROW_GONE }), index([]))).toBeNull();
  });
  it("row_gone × resolved-different → fires (it was kept while present, and has since left)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const now = await hashAnchorText(NOW_READS);
    const e = revisitEntryFor(mark({ anchor_text_sha256: sha, revisit_resolved_against: now }), index([]));
    expect(e?.state).toBe("row_gone");
    expect(e?.against).toBe(ROW_GONE);
  });
});

describe("the never-fire cases", () => {
  it("a row whose words are not derivable from the read (static copy) never fires, resolved or not", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const m = mark({ anchor_text_sha256: sha, anchor_kind: "section", anchor_key: "yousay" });
    const rows = new Map([[anchorId("section", "yousay"), { anchor_kind: "section", anchor_key: "yousay", text: null, sha: null } as HashedAnchor]]);
    expect(revisitEntryFor(m, rows)).toBeNull();
  });
  it("an offering question is present or gone, never wording_changed (it keys by its own text hash)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const m = mark({ anchor_text_sha256: sha, anchor_kind: "offering_question", anchor_key: "offering:abc" });
    const present = new Map([[anchorId("offering_question", "offering:abc"), { anchor_kind: "offering_question", anchor_key: "offering:abc", text: null, sha: null } as HashedAnchor]]);
    expect(revisitEntryFor(m, present)).toBeNull();
    expect(revisitEntryFor(m, index([]))?.state).toBe("row_gone"); // its key changed ⇒ the row left
  });
  it("a hash that disagrees with the normalized words does not fire — the words are the authority (R7)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    // same words, a stale/wrong stored sha: matchAnchor says wording_changed, the words say otherwise
    const e = revisitEntryFor(mark({ anchor_text_sha256: "f".repeat(64) }), index([row(AS_MARKED, sha)]));
    expect(e).toBeNull();
  });
});

describe("revisitEntries", () => {
  it("returns nothing until the read has loaded — the prompt never flashes (R7)", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const m = mark({ anchor_text_sha256: sha });
    expect(revisitEntries([m], [], false)).toEqual([]);      // not loaded: silent even though the row is absent
    expect(revisitEntries([m], [], true)).toHaveLength(1);   // loaded: the row really is gone
  });
  it("keeps the marks' order and drops the silent ones", async () => {
    const sha = await hashAnchorText(AS_MARKED);
    const now = await hashAnchorText(NOW_READS);
    const quiet = mark({ id: "quiet", anchor_text_sha256: sha, anchor_key: "f-quiet" });
    const loud = mark({ id: "loud", anchor_text_sha256: sha, anchor_key: "f-1" });
    const rows: HashedAnchor[] = [
      { anchor_kind: "finding", anchor_key: "f-quiet", text: AS_MARKED, sha },
      { anchor_kind: "finding", anchor_key: "f-1", text: NOW_READS, sha: now },
    ];
    expect(revisitEntries([quiet, loud], rows, true).map((e) => e.mark.id)).toEqual(["loud"]);
  });
});
