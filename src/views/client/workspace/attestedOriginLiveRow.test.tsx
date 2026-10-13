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
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { attestedOrigin, AttestedOriginChip } from "./InterviewOrigin";

const LIVE_CLAIM = {
  provenance: "client_attested",
  statement: "Level 14 is retired terminology; the current California designation is STRTP (AB 403).",
  raw_payload: {
    origin: "interview_correction",
    attested_at: "2026-09-22T00:00:00+00:00",
    person_name: null,
    speaker_label: "Lynn Dolce",
    item_raw_words: "And that's not even true. We're no longer level 14. The level system went away like seven years ago. In California. In California. So, like, that's not, yeah, there's no level 14 anywhere.",
    interview_item_id: "61dac18a-50fe-4a3a-82c3-56e5c9cc441e",
    interview_record_id: "ed055835-1025-4494-97ca-da2c1d3c3006",
  },
};

describe("the live Edgewood correction claim", () => {
  it("renders the signed chip: name from speaker_label (person_name is null), date from interviewed_at", () => {
    const o = attestedOrigin(LIVE_CLAIM)!;
    expect(o.chip).toBe("You told us · Lynn Dolce · Sep 22");
    expect(o.attribution).toBe("Lynn Dolce");
  });

  it("the date is the record's interviewed_at, so clearing it drops the date and keeps the name", () => {
    const noDate = { ...LIVE_CLAIM, raw_payload: { ...LIVE_CLAIM.raw_payload, attested_at: null } };
    expect(attestedOrigin(noDate)!.chip).toBe("You told us · Lynn Dolce");
  });

  it("the expand shows the CLIENT'S own words, not the operator's wording", () => {
    const { getByTestId } = render(<AttestedOriginChip claim={LIVE_CLAIM} />);
    expect(getByTestId("claim-origin-chip").textContent).toBe("You told us · Lynn Dolce · Sep 22");
    expect(getByTestId("claim-origin-quote").textContent).toContain("We're no longer level 14");
    expect(getByTestId("claim-origin-quote").textContent).not.toContain("STRTP");
    expect(getByTestId("claim-origin-quote").textContent).toContain("Lynn Dolce");
  });

  it("the DOM carries the provenance as its origin attribute", () => {
    const { container } = render(<AttestedOriginChip claim={LIVE_CLAIM} />);
    expect(container.querySelector("[data-fr-origin]")!.getAttribute("data-fr-origin")).toBe("client_attested");
  });
});
