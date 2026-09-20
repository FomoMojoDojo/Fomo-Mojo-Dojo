// The signed strings of the interview door (operator, 2026-09-19) — pinned verbatim.
import { describe, it, expect } from "vitest";
import { INTERVIEW_UPLOAD_STRINGS as S, isTranscriptFileName, speakerRoleFor } from "./interviewUploadStrings";

describe("interview upload strings — signed 2026-09-19", () => {
  it("pins every signed string", () => {
    expect(S.isInterview).toBe("This is an interview");
    expect(S.whoIsSpeaking).toBe("Who is speaking?");
    expect(S.stakeholder).toBe("Stakeholder");
    expect(S.customer).toBe("Customer");
    expect(S.chip).toBe("Interview");
    expect(S.marketInferredPrefix).toBe("Market inferred: ");
    expect(S.changeMarket).toBe("Change market");
    expect(S.marketNotInferred).toBe("Market not inferred");
    expect(S.marketPerItem).toBe("Market: per item, after parsing");
    expect(S.savedNotParsed).toBe("Saved. Not yet parsed.");
    expect(S.unsupportedType).toBe("This file type can't be read as a transcript. Upload a text, Word or PDF file.");
    expect(S.emptyExtraction).toBe("No text could be read from this file. Nothing was recorded.");
    expect(S.hashMismatch).toBe("The saved file doesn't match the upload. Nothing was recorded. Try again.");
    expect(S.chooseMarket).toBe("Choose a market");
    // signed 2026-09-20 (commit 2a)
    expect(S.noCustomerResearchInput).toBe("This company has no Customer Research input, so an interview can't be uploaded yet.");
    expect(S.withdraw).toBe("Withdraw interview (permanent)");
    expect(S.withdrawConfirm).toBe("Withdraw this interview? This can't be undone. The file is archived and nothing from it is used.");
    expect(S.withdrawAction).toBe("Withdraw");
    expect(S.changeSpeaker).toBe("Change speaker");
    expect(S.speakerCollision).toBe("This transcript is already recorded with that speaker.");
    expect(S.chooseSpeaker).toBe("Choose the speaker");
    expect(Object.keys(S).length).toBe(21);
  });
  it("A3: the speaker words map onto the existing speaker_role", () => {
    expect(speakerRoleFor("stakeholder")).toBe("client_stakeholder");
    expect(speakerRoleFor("customer")).toBe("market_participant");
  });
  it("the transcript types are txt / md / vtt / srt / docx / pdf (F1)", () => {
    for (const ok of ["a.txt", "a.MD", "a.vtt", "a.SRT", "a.docx", "a.pdf"]) expect(isTranscriptFileName(ok)).toBe(true);
    for (const no of ["a.xlsx", "a.pptx", "a.png", "a.csv", "a.json", "a"]) expect(isTranscriptFileName(no)).toBe(false);
  });
});
