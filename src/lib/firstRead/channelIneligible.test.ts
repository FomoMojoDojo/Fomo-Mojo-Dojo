// RF apply (operator ruling 2026-09-04): a channel claim marked declared_eligible=false (an inference claim the
// RF admission FAILED) never reaches the "Your channels, as we read them" render set. The filter lives in the
// SINGLE structural predicate (channelReadClaimIds) so the hook and the RF dry-run script share it. RED before
// the predicate reads declared_eligible; GREEN after. Ids are reported by the caller (channelIneligibleIds).
import { describe, expect, it } from "vitest";
import { channelReadClaimIds } from "../../../supabase/functions/_shared/firstReadProvenance";

const CLAIMS = [
  { id: "pass", claim_type: "inference", statement: "Dedicated partnerships page signals active B2B wholesale.", declared_eligible: true },
  { id: "fail", claim_type: "inference", statement: "Just add hot water.", declared_eligible: false },
  { id: "untyped", claim_type: "inference", statement: "Come find us in Los Angeles.", declared_eligible: null },
];
const OWN_VOICE = new Set(["pass", "fail", "untyped"]);

describe("channel read membership honours declared_eligible", () => {
  it("an ineligible inference claim is excluded; eligible and untyped (null → eligible) stay", () => {
    const ids = channelReadClaimIds(CLAIMS, OWN_VOICE, new Set(), new Set());
    expect(ids.has("fail")).toBe(false);
    expect(ids.has("pass")).toBe(true);
    expect(ids.has("untyped")).toBe(true);
  });
});
