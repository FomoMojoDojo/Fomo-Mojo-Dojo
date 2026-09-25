// Interview upload — the signed strings (operator, 2026-09-19, Gate B commit 1). Every client- or
// operator-visible word of the interview door comes from here; interviewUploadStrings.parity.test.ts pins them.
export const INTERVIEW_UPLOAD_STRINGS = {
  /** The switch in the upload dialog. */
  isInterview: "This is an interview",
  /** The one choice under the switch. */
  whoIsSpeaking: "Who is speaking?",
  stakeholder: "Stakeholder",
  customer: "Customer",
  /** 4f-1 (signed 2026-09-24) — the third record type: a first-read review meeting. */
  workingSession: "Working session",
  /** The row chip. */
  chip: "Interview",
  /** The market line (commit 2 fills the title). */
  marketInferredPrefix: "Market inferred: ",
  changeMarket: "Change market",
  /** S1 — a customer transcript with no market yet (commit 1 never infers). */
  marketNotInferred: "Market not inferred",
  /** S2 — a stakeholder transcript OR a working session: markets are per item, after parsing. */
  marketPerItem: "Market: per item, after parsing",
  /** 4f-1 (signed 2026-09-24) — infer-interview-market refuses any record that is not a customer
   *  interview. Mirrored from INFER_NON_CUSTOMER_REFUSAL in that function; rendered verbatim. */
  inferenceNotCustomer: "Market inference runs only on customer interviews.",
  /** S3 — the row's state word. */
  savedNotParsed: "Saved. Not yet parsed.",
  /** S4–S6 are emitted by record-interview-upload and rendered verbatim; mirrored here for the client-side pre-check. */
  unsupportedType: "This file type can't be read as a transcript. Upload a text, Word or PDF file.",
  emptyExtraction: "No text could be read from this file. Nothing was recorded.",
  hashMismatch: "The saved file doesn't match the upload. Nothing was recorded. Try again.",
  /** S7 — the Change market listbox. */
  chooseMarket: "Choose a market",
  /** H1 (signed 2026-09-20) — the company has no customer-research input; nothing is recorded. */
  noCustomerResearchInput: "This company has no Customer Research input, so an interview can't be uploaded yet.",
  /** W1–W3 (signed 2026-09-20) — withdraw an interview upload (permanent). */
  withdraw: "Withdraw interview (permanent)",
  withdrawConfirm: "Withdraw this interview? This can't be undone. The file is archived and nothing from it is used.",
  withdrawAction: "Withdraw",
  /** P1–P3 (signed 2026-09-20) — correct the speaker until the transcript is parsed. */
  changeSpeaker: "Change speaker",
  speakerCollision: "This transcript is already recorded with that speaker.",
  chooseSpeaker: "Choose the speaker",
  /** M1–M4 (signed 2026-09-21, commit 2b) — local market inference for a customer transcript. */
  inferMarket: "Infer market",
  inferringMarket: "Inferring market…",
  /** M3 is marketInferredPrefix + the market title. */
  inferenceFailed: "Market inference failed",
  /** M5 (signed 2026-09-21) — the row's last inference run ended without a strict majority; M1 is offered beside it. */
  notInferredNoMajority: "Market not inferred · last run found no majority",
  /** S6 (signed 2026-09-21) — a withdraw, speaker change or market change that did not save. */
  saveFailed: "That didn't save. Try again.",
} as const;

/** "Stakeholder" → client_stakeholder, "Customer" → market_participant (ruling A3 — the existing
 *  speaker_role), "Working session" → working_session (4f-1). */
export type InterviewSpeaker = "stakeholder" | "customer" | "working-session";
export type InterviewSpeakerRole = "client_stakeholder" | "market_participant" | "working_session";
/** The three choices, in the order the door offers them. */
export const INTERVIEW_SPEAKERS: readonly InterviewSpeaker[] = ["stakeholder", "customer", "working-session"];
export function speakerRoleFor(speaker: InterviewSpeaker): InterviewSpeakerRole {
  if (speaker === "stakeholder") return "client_stakeholder";
  if (speaker === "customer") return "market_participant";
  return "working_session";
}
/** The label for a choice, so the door and the Change-speaker list cannot drift apart. */
export function speakerLabelFor(speaker: InterviewSpeaker): string {
  if (speaker === "stakeholder") return INTERVIEW_UPLOAD_STRINGS.stakeholder;
  if (speaker === "customer") return INTERVIEW_UPLOAD_STRINGS.customer;
  return INTERVIEW_UPLOAD_STRINGS.workingSession;
}

/** R17 (2026-09-19): the fixed home of every interview upload — the company's customer-research input, for
 *  both speaker roles; never keyword-mapped. A company without this input refuses the upload (nothing recorded). */
export const INTERVIEW_HOME_INPUT_KEY = "customer-research";
/** The interview's home among the company's inputs — by key only, never by file name; null → refuse. */
export function resolveInterviewHome<T extends { input_key: string }>(inputs: readonly T[], _fileName?: string): T | null {
  return inputs.find((input) => input.input_key === INTERVIEW_HOME_INPUT_KEY) ?? null;
}

/** The transcript types the door accepts (S4 otherwise) — the same set record-interview-upload enforces
 *  (F1, 2026-09-19: text .txt .md .vtt .srt; parser .docx .pdf). */
export const INTERVIEW_TRANSCRIPT_EXTENSIONS = new Set(["txt", "md", "vtt", "srt", "docx", "pdf"]);
export function isTranscriptFileName(name: string): boolean {
  const i = name.lastIndexOf(".");
  return i >= 0 && INTERVIEW_TRANSCRIPT_EXTENSIONS.has(name.slice(i + 1).toLowerCase());
}

/** sha256 of the file bytes, hex — the value the server verifies against the stored object (R1). */
export async function sha256HexOfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
