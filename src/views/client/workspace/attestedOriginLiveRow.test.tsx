// The chip, rendered from the ACTUAL claim record-interview-correction minted for Edgewood item
// 61dac18a (claim b24d11c5, audit 9534). The row is inlined verbatim rather than read from the DB so
// the test is hermetic; it is the payload the writer wrote, copied from the row.
//
// WHY THIS TEST EXISTS: the extracts surface renders claim_deltas, and this claim has no delta yet,
// so the chip cannot be captured in a screenshot — screenshot acceptance is owed at Act 3 (operator
// ruling R-A6). This asserts what that surface WILL render the moment a delta pairs it.
//
// The date arrives through R-A3: set_interview_date filled record ed055835 with 2026-09-22 (audit
// 9532), and the claim was then re-minted (audits 9533 reversal, 9534 write) so its raw_payload
// snapshot matches the corrected record rather than being patched in place.
//
// U6-20 / U6-27 (2026-11-10): THE PAYLOAD BELOW IS THE POST-DATA-ACT ROW. It used to carry
// person_name, speaker_label and item_raw_words; `claims` has a company_members arm, so those three
// made a real meeting utterance and the speaker's name readable by every member of Edgewood. The
// data act removed all three keys in one audited UPDATE, and record-interview-correction no longer
// writes them. The words and the speaker come from interview_item_text now, so THIS test — which
// passes no `text` — is the no-capability render, and it must show neither.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { attestedOrigin, AttestedOriginChip, type InterviewItemText } from "./InterviewOrigin";

const LIVE_CLAIM = {
  provenance: "client_attested",
  statement: "Level 14 is retired terminology; the current California designation is STRTP (AB 403).",
  raw_payload: {
    origin: "interview_correction",
    attested_at: "2026-09-22T00:00:00+00:00",
    interview_item_id: "61dac18a-50fe-4a3a-82c3-56e5c9cc441e",
    interview_record_id: "ed055835-1025-4494-97ca-da2c1d3c3006",
  },
};

/** What interview_item_text returns for item 61dac18a to a holder of interview.readText. */
const LIVE_TEXT: InterviewItemText = {
  raw_words: "And that's not even true. We're no longer level 14. The level system went away like seven years ago. In California. In California. So, like, that's not, yeah, there's no level 14 anywhere.",
  speaker: "Lynn Dolce",
};

describe("the live Edgewood correction claim", () => {
  it("the stored payload carries no words and no name at all", () => {
    const keys = Object.keys(LIVE_CLAIM.raw_payload).sort();
    expect(keys).toEqual(["attested_at", "interview_item_id", "interview_record_id", "origin"]);
    const blob = JSON.stringify(LIVE_CLAIM.raw_payload);
    expect(blob).not.toContain("Lynn");
    expect(blob).not.toContain("level 14");
  });

  it("with the capability → the signed chip: the speaker from the door, the date from interviewed_at", () => {
    const o = attestedOrigin(LIVE_CLAIM, LIVE_TEXT)!;
    expect(o.chip).toBe("You told us · Lynn Dolce · Sep 22");
    expect(o.attribution).toBe("Lynn Dolce");
  });

  it("without the capability → S-U6-4: the date alone, no name", () => {
    const o = attestedOrigin(LIVE_CLAIM, null)!;
    expect(o.chip).toBe("You told us · Sep 22");
    expect(o.chip).not.toContain("Lynn");
    expect(o.attribution).toBe("");
  });

  it("the date is the record's interviewed_at, so clearing it drops the date and keeps the name", () => {
    const noDate = { ...LIVE_CLAIM, raw_payload: { ...LIVE_CLAIM.raw_payload, attested_at: null } };
    expect(attestedOrigin(noDate, LIVE_TEXT)!.chip).toBe("You told us · Lynn Dolce");
  });

  it("with the capability the expand shows the CLIENT'S own words, not the operator's wording", () => {
    const o = attestedOrigin(LIVE_CLAIM, LIVE_TEXT)!;
    expect(o.verbatim).toContain("We're no longer level 14");
    expect(o.verbatim).not.toContain("STRTP");
  });

  // The rendered component makes the tier-2 call itself. In this environment the door is unreachable,
  // which the hook treats as a refusal — so this render IS the no-capability render, and the
  // assertion is that no name and no utterance reach the DOM.
  it("the rendered chip without the door shows the statement and leaks no name or words", async () => {
    const { getByTestId } = render(<AttestedOriginChip claim={LIVE_CLAIM} />);
    expect(getByTestId("claim-origin-chip").textContent).toBe("You told us · Sep 22");
    const quote = getByTestId("claim-origin-quote").textContent ?? "";
    expect(quote).toContain("STRTP");
    expect(quote).not.toContain("Lynn");
    expect(quote).not.toContain("no longer level 14");
  });

  it("the DOM carries the provenance as its origin attribute", () => {
    const { container } = render(<AttestedOriginChip claim={LIVE_CLAIM} />);
    expect(container.querySelector("[data-fr-origin]")!.getAttribute("data-fr-origin")).toBe("client_attested");
  });
});
