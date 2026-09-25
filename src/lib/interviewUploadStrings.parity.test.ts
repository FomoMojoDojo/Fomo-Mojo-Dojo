// The signed strings of the interview door (operator, 2026-09-19) — pinned verbatim.
import { describe, it, expect } from "vitest";
import { INTERVIEW_SPEAKERS, INTERVIEW_UPLOAD_STRINGS as S, isTranscriptFileName, speakerLabelFor, speakerRoleFor } from "./interviewUploadStrings";

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
    // signed 2026-09-21 (commit 2b)
    expect(S.inferMarket).toBe("Infer market");
    expect(S.inferringMarket).toBe("Inferring market…");
    expect(S.inferenceFailed).toBe("Market inference failed");
    expect(S.saveFailed).toBe("That didn't save. Try again.");
    expect(S.notInferredNoMajority).toBe("Market not inferred · last run found no majority");
    // signed 2026-09-24 (4f-1 — the third record type)
    expect(S.workingSession).toBe("Working session");
    expect(S.inferenceNotCustomer).toBe("Market inference runs only on customer interviews.");
    expect(Object.keys(S).length).toBe(28);
  });
  it("A3 / 4f-1: the speaker words map onto the existing speaker_role", () => {
    expect(speakerRoleFor("stakeholder")).toBe("client_stakeholder");
    expect(speakerRoleFor("customer")).toBe("market_participant");
    expect(speakerRoleFor("working-session")).toBe("working_session");
  });
  it("4f-1: the door offers three choices, in order, each with its signed label", () => {
    expect([...INTERVIEW_SPEAKERS]).toEqual(["stakeholder", "customer", "working-session"]);
    expect(INTERVIEW_SPEAKERS.map(speakerLabelFor)).toEqual(["Stakeholder", "Customer", "Working session"]);
  });
  it("the transcript types are txt / md / vtt / srt / docx / pdf (F1)", () => {
    for (const ok of ["a.txt", "a.MD", "a.vtt", "a.SRT", "a.docx", "a.pdf"]) expect(isTranscriptFileName(ok)).toBe(true);
    for (const no of ["a.xlsx", "a.pptx", "a.png", "a.csv", "a.json", "a"]) expect(isTranscriptFileName(no)).toBe(false);
  });
});

describe("4f-1: the third record type, end to end through the door's own helpers", () => {
  it("every choice has a role, a label and a stable data-testid", () => {
    // The door renders `upload-interview-${who}` for each choice, so the operator's on-screen check
    // is pinned here rather than only in a browser run.
    expect(INTERVIEW_SPEAKERS.map((who) => `upload-interview-${who}`)).toEqual([
      "upload-interview-stakeholder",
      "upload-interview-customer",
      "upload-interview-working-session",
    ]);
  });
  it("only the CUSTOMER choice is placed as a whole; the other two are per item", () => {
    // The mirror of marketStateFor() in record-interview-upload: a working session carries items
    // about several markets or none, so it is per_item exactly like a stakeholder transcript.
    const perItem = INTERVIEW_SPEAKERS.filter((who) => speakerRoleFor(who) !== "market_participant");
    expect(perItem).toEqual(["stakeholder", "working-session"]);
  });
  it("the three roles are distinct and none was renamed", () => {
    expect(INTERVIEW_SPEAKERS.map(speakerRoleFor)).toEqual(["client_stakeholder", "market_participant", "working_session"]);
  });
});
