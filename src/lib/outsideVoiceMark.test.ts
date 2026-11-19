// SP-433 — the mark is rendered from the row's own source, never stored, so it cannot disagree with
// what the need rests on.
import { describe, expect, it } from "vitest";
import { OUTSIDE_VOICE_MARK, OUTSIDE_VOICE_SOURCE_PATH, isOutsideVoiceCard, isOutsideVoiceSourced } from "./outsideVoiceMark";
import { sourcePathLabel } from "../views/JobSteps/helpers/textUtils";
import { needRestsOnPrivateSource, isExternalAdmissibleNeed } from "../../supabase/functions/_shared/externalProvenance.ts";

describe("SP-433 — the mark follows the stored source", () => {
  it("recognises an accepted outside-voice need, and nothing else", () => {
    expect(isOutsideVoiceSourced(OUTSIDE_VOICE_SOURCE_PATH)).toBe(true);
    expect(isOutsideVoiceSourced("  outside_voice_read  ")).toBe(true);
    for (const other of ["public_research", "file_proposal:abc", "intake.quiz", "", null, undefined])
      expect(isOutsideVoiceSourced(other as never)).toBe(false);
  });
  it("recognises a PENDING card by its origin — the value accept will write", () => {
    expect(isOutsideVoiceCard({ origin: OUTSIDE_VOICE_SOURCE_PATH })).toBe(true);
    expect(isOutsideVoiceCard({ origin: "file" })).toBe(false);
    expect(isOutsideVoiceCard({})).toBe(false);
    expect(isOutsideVoiceCard(null)).toBe(false);
  });
  it("labels the need with the mark instead of calling it uploaded/company", () => {
    expect(sourcePathLabel(OUTSIDE_VOICE_SOURCE_PATH)).toBe(OUTSIDE_VOICE_MARK);
    // the regression this arm exists for
    expect(sourcePathLabel(OUTSIDE_VOICE_SOURCE_PATH)).not.toContain("Uploaded");
    // every other source keeps its old label, byte for byte
    expect(sourcePathLabel("public_research")).toBe("Public: public_research");
    expect(sourcePathLabel("intake.quiz")).toBe("Uploaded/company: intake.quiz");
    expect(sourcePathLabel("")).toBe("Unknown source");
  });
});

describe("SP-404/SP-417 — an outside-voice need is private, twice over", () => {
  const row = {
    source_path: OUTSIDE_VOICE_SOURCE_PATH, step_label: "", frameworks_used: [] as string[],
    interview_record_id: null, source_proposal_id: "11111111-1111-4111-8111-111111111111",
    provenance_type: "outside_review_derived", operator_edited_at: null,
  };
  it("rests on a private source", () => expect(needRestsOnPrivateSource(row)).toBe(true));
  it("is still private with source_proposal_id cleared — source_path alone suffices", () =>
    expect(needRestsOnPrivateSource({ ...row, source_proposal_id: null })).toBe(true));
  it("is refused by the external need gate", () => expect(isExternalAdmissibleNeed(row)).toBe(false));
  it("is refused even if its source were somehow public, because the provenance is not admissible", () => {
    // built as a variable, not spread into the call: an object literal argument would trip
    // excess-property checking against the predicate's narrower parameter type.
    const publicSourced = { ...row, source_path: "public_research", source_proposal_id: null };
    expect(isExternalAdmissibleNeed(publicSourced)).toBe(false);
  });
});
