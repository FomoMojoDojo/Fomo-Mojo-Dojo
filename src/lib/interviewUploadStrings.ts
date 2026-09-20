// Interview upload — the signed strings (operator, 2026-09-19, Gate B commit 1). Every client- or
// operator-visible word of the interview door comes from here; interviewUploadStrings.parity.test.ts pins them.
export const INTERVIEW_UPLOAD_STRINGS = {
  /** The switch in the upload dialog. */
  isInterview: "This is an interview",
  /** The one choice under the switch. */
  whoIsSpeaking: "Who is speaking?",
  stakeholder: "Stakeholder",
  customer: "Customer",
  /** The row chip. */
  chip: "Interview",
  /** The market line (commit 2 fills the title). */
  marketInferredPrefix: "Market inferred: ",
  changeMarket: "Change market",
  /** S1 — a customer transcript with no market yet (commit 1 never infers). */
  marketNotInferred: "Market not inferred",
  /** S2 — a stakeholder transcript: markets are inferred per item after parsing. */
  marketPerItem: "Market: per item, after parsing",
  /** S3 — the row's state word. */
  savedNotParsed: "Saved. Not yet parsed.",
  /** S4–S6 are emitted by record-interview-upload and rendered verbatim; mirrored here for the client-side pre-check. */
  unsupportedType: "This file type can't be read as a transcript. Upload a text, Word or PDF file.",
  emptyExtraction: "No text could be read from this file. Nothing was recorded.",
  hashMismatch: "The saved file doesn't match the upload. Nothing was recorded. Try again.",
  /** S7 — the Change market listbox. */
  chooseMarket: "Choose a market",
} as const;

/** "Stakeholder" → client_stakeholder, "Customer" → market_participant (ruling A3 — the existing speaker_role). */
export type InterviewSpeaker = "stakeholder" | "customer";
export function speakerRoleFor(speaker: InterviewSpeaker): "client_stakeholder" | "market_participant" {
  return speaker === "stakeholder" ? "client_stakeholder" : "market_participant";
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
