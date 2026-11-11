// ── R-A2 (operator ruling, 2026-10-12): the attested chip's name and date ───────────────────────
//
// U6-21 / U6-27 (2026-11-10) moved WHERE the name comes from. It used to be read off the claim's
// raw_payload, which `claims`' company_members arm made readable by every member of the company — so
// a client who was not meant to see interview text could read a meeting utterance and the name of the
// person who said it. The name is interview text now: it arrives, with the words, from
// interview_item_text (gated on interview.readText) and is passed to attestedOrigin as `text`.
//
//   text present (the caller holds the capability) → "You told us · {name} · {date}", own words
//   text null    (the caller does not)             → S-U6-4 "You told us · {date}", claim.statement
//
// R-A2's own rulings are unchanged and still pinned below: the date is interviewed_at and never
// parsed_at, and it is formatted in UTC so an interview date cannot shift by timezone.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { attestedOrigin, attestedOriginOf, type InterviewItemText } from "./InterviewOrigin";
import { INTERVIEW_ORIGIN_STRINGS as S } from "./interviewOriginStrings";

const claim = (rp: Record<string, unknown>) => ({
  provenance: "client_attested",
  statement: "Level 14 is retired terminology; the current California designation is STRTP (AB 403).",
  raw_payload: { origin: "interview_correction", ...rp },
});
/** The payload as record-interview-correction writes it now: ids and the date, nothing else. */
const PAYLOAD = {
  interview_item_id: "item-1",
  interview_record_id: "rec-1",
  attested_at: "2026-09-22T00:00:00Z",
};
/** What interview_item_text returns to a holder of interview.readText. */
const TEXT: InterviewItemText = { raw_words: "We're no longer level 14.", speaker: "Lynn Dolce" };

describe("attestedOrigin — R-A2 + U6-27", () => {
  it("with the capability → the signed chip carries the name, and the expand the client's own words", () => {
    const o = attestedOrigin(claim(PAYLOAD), TEXT)!;
    expect(o.chip).toBe("You told us · Lynn Dolce · Sep 22");
    expect(o.attribution).toBe("Lynn Dolce");
    expect(o.verbatim).toBe("We're no longer level 14.");
  });

  it("WITHOUT the capability → S-U6-4, and the expand is the operator's statement", () => {
    const o = attestedOrigin(claim(PAYLOAD), null)!;
    expect(o.chip).toBe("You told us · Sep 22");
    expect(o.chip).toBe(S.attestedDateOnly("Sep 22"));
    // no name anywhere in what renders
    expect(o.chip).not.toContain("Lynn");
    expect(o.attribution).toBe("");
    expect(o.verbatim).toBe(claim(PAYLOAD).statement);
    expect(o.verbatim).not.toContain("no longer level 14");
  });

  it("the no-capability chip is the default: an omitted `text` behaves like a refusal", () => {
    expect(attestedOrigin(claim(PAYLOAD))!.chip).toBe("You told us · Sep 22");
  });

  it("a speaker the door returned as null still yields no name", () => {
    const o = attestedOrigin(claim(PAYLOAD), { raw_words: "We're no longer level 14.", speaker: null })!;
    expect(o.chip).toBe("You told us · Sep 22");
    expect(o.attribution).toBe("");
    // the words still show — the capability was held, only the record names nobody
    expect(o.verbatim).toBe("We're no longer level 14.");
  });

  it("interviewed_at null → the NAME renders with NO date, and no dangling separator", () => {
    const o = attestedOrigin(claim({ ...PAYLOAD, attested_at: null }), TEXT)!;
    expect(o.chip).toBe("You told us · Lynn Dolce");
    expect(o.chip).not.toMatch(/·\s*$/);
  });

  it("neither name nor date → the bare signed head", () => {
    const o = attestedOrigin(claim({ ...PAYLOAD, attested_at: null }), null)!;
    expect(o.chip).toBe("You told us");
    expect(o.chip).toBe(S.youToldUs);
  });

  it("parsed_at is NEVER used — a payload carrying only parsed_at gets no date", () => {
    const o = attestedOrigin(claim({ ...PAYLOAD, attested_at: null, parsed_at: "2026-09-25T00:16:25Z" }), TEXT)!;
    expect(o.chip).toBe("You told us · Lynn Dolce");
    expect(o.chip).not.toContain("Sep 25");
    expect(attestedOriginOf(claim({ ...PAYLOAD, parsed_at: "2026-09-25T00:16:25Z" }).raw_payload))
      .not.toHaveProperty("parsed_at");
  });

  // U6-27, the structural half: even if a legacy payload still carries the words or the name, the
  // reader does not surface them, so no render can reach them.
  it("the payload reader surfaces NO words and NO name, even when a legacy row carries them", () => {
    const legacy = attestedOriginOf({
      origin: "interview_correction",
      interview_item_id: "item-1", interview_record_id: "rec-1", attested_at: PAYLOAD.attested_at,
      item_raw_words: "We're no longer level 14.", speaker_label: "Lynn D.", person_name: "Lynn Dolce",
    })!;
    expect(Object.keys(legacy).sort()).toEqual(["attested_at", "interview_item_id", "interview_record_id", "origin"]);
    expect(JSON.stringify(legacy)).not.toContain("Lynn");
    expect(JSON.stringify(legacy)).not.toContain("level 14");
  });

  it("a legacy payload's own name cannot reach the chip either", () => {
    const o = attestedOrigin(claim({ ...PAYLOAD, person_name: "Lynn Dolce", speaker_label: "Lynn D." }), null)!;
    expect(o.chip).toBe("You told us · Sep 22");
    expect(o.chip).not.toContain("Lynn");
  });

  it("the source names interviewed_at and never reads parsed_at", () => {
    const src = readFileSync(join(__dirname, "InterviewOrigin.tsx"), "utf8");
    const fn = src.slice(src.indexOf("export function attestedOrigin("), src.indexOf("function useInterviewItemText"));
    expect(fn).not.toContain("parsed_at");
  });

  it("the date uses the existing UTC formatter, so it never shifts by timezone", () => {
    // 2026-09-22T00:00:00Z is Sep 21 in any negative offset; the UTC formatter must still say Sep 22
    expect(attestedOrigin(claim(PAYLOAD), TEXT)!.chip).toContain("Sep 22");
  });

  it("any other provenance → no frame at all", () => {
    expect(attestedOrigin({ ...claim(PAYLOAD), provenance: "public_observed" }, TEXT)).toBeNull();
    expect(attestedOrigin({ ...claim(PAYLOAD), provenance: "publicly_declared" }, TEXT)).toBeNull();
    expect(attestedOrigin(null)).toBeNull();
  });

  it("a client_attested claim that did NOT come from a correction gets no frame data", () => {
    const o = attestedOrigin({ provenance: "client_attested", raw_payload: { session_id: "s1" }, statement: "x" })!;
    expect(o.chip).toBe("You told us");
  });
});
