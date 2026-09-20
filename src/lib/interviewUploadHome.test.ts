// Gate B guard (w) — R17 (2026-09-19): an interview file is never keyword-mapped; its home is the company's
// customer-research input for both speaker roles; a company without it → null (the dialog refuses before any
// upload). Plant: keyword match restored → a file named "customer…" lands on target-aud.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { INTERVIEW_HOME_INPUT_KEY, resolveInterviewHome } from "./interviewUploadStrings";

const INPUTS = [
  { id: "i-ta", input_key: "target-aud", input_label: "Target Audience" },
  { id: "i-cr", input_key: "customer-research", input_label: "Customer Research" },
  { id: "i-cs", input_key: "channel-strat", input_label: "Channel Strategy" },
];

describe("interview home (R17)", () => {
  it("an interview named 'customer…' lands on customer-research, never target-aud, for both roles", () => {
    expect(INTERVIEW_HOME_INPUT_KEY).toBe("customer-research");
    for (const name of ["TEST-customer-interview-krisp.txt", "audience-persona-interview.vtt", "channel notes.srt", "x.txt"]) {
      expect(resolveInterviewHome(INPUTS, name)?.id).toBe("i-cr");
    }
  });
  it("a company without customer-research → null (refused, nothing uploaded)", () => {
    expect(resolveInterviewHome(INPUTS.filter((i) => i.input_key !== "customer-research"), "TEST-customer-interview-krisp.txt")).toBeNull();
    expect(resolveInterviewHome([], "x.txt")).toBeNull();
  });
  it("the dialog's interview branch uses the home resolver, refuses BEFORE the storage upload, and never calls the keyword mapper", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../components/FileUploadDialog.tsx"), "utf8");
    const branch = src.indexOf("if (isInterview && interviewSpeaker) {");
    const end = src.indexOf("continue;\n      }\n\n      const initialAnalysis", branch);
    expect(branch).toBeGreaterThan(0); expect(end).toBeGreaterThan(branch);
    const body = src.slice(branch, end);
    expect(body).toContain("resolveInterviewHome(eligibleInputs, file.name)");
    expect(body).not.toContain("resolveAssignedInput(");
    expect(body).not.toContain("tryFilenameMatch(");
    expect(body).not.toContain("initialAnalysis");
    const refuse = body.indexOf("if (!assigned.input) { finish(");
    const upload = body.indexOf("uploadMutation.mutateAsync(");
    expect(refuse).toBeGreaterThan(0); expect(refuse).toBeLessThan(upload);
    // (a) H1 (2026-09-20): the refusal line is the signed interview string, not the generic one
    const refusal = body.slice(refuse, body.indexOf("continue;", refuse));
    expect(refusal).toContain("error: INTERVIEW_UPLOAD_STRINGS.noCustomerResearchInput");
    expect(refusal).not.toContain("'No matching input area.'");
    // the result line: no input name, no mapping word
    expect(body).toMatch(/status: 'uploaded', tags: \[\], reasoning: INTERVIEW_UPLOAD_STRINGS\.savedNotParsed, source: 'none'/);
    expect(body).not.toContain("inputLabel: assigned.input.input_label");
  });
});
