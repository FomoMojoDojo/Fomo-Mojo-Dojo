// SP-433 (q3f): the two TS predicates, on the row the accept path writes.
import { needRestsOnPrivateSource, isExternalAdmissibleNeed, isSubjectExternallyAdmissible } from "../../../supabase/functions/_shared/externalProvenance.ts";
const row = {
  source_path: "outside_voice_read", step_label: "", frameworks_used: [] as string[],
  interview_record_id: null, source_proposal_id: "11111111-1111-4111-8111-111111111111",
  provenance_type: "outside_review_derived", operator_edited_at: null,
};
const fails: string[] = [];
if (needRestsOnPrivateSource(row) !== true) fails.push("needRestsOnPrivateSource must be TRUE for an outside-voice need");
if (isExternalAdmissibleNeed(row) !== false) fails.push("isExternalAdmissibleNeed must REFUSE it");
if (isSubjectExternallyAdmissible("outside_review_derived", null) !== false) fails.push("isSubjectExternallyAdmissible must REFUSE outside_review_derived");
// and with source_proposal_id cleared it is STILL private, by source_path alone
if (needRestsOnPrivateSource({ ...row, source_proposal_id: null }) !== true) fails.push("still private by source_path alone");
console.log(fails.length ? "Q3F-FAIL " + fails.join(" | ") : "Q3F-OK both predicates refuse an outside-voice need, twice over");
