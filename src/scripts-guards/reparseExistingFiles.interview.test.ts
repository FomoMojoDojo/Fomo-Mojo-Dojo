// Gate B guard (l) — ruling R6 (2026-09-19): scripts/reparse-existing-files.mjs skips is_interview files.
// Plant: the queue filter removed → the wiring assertion fails.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isInterviewFile } from "../../scripts/reparse-existing-files.mjs";

describe("reparse-existing-files — interview files are skipped (R6)", () => {
  it("the predicate keys on input_files.is_interview", () => {
    expect(isInterviewFile({ id: "f", is_interview: true })).toBe(true);
    expect(isInterviewFile({ id: "f", is_interview: false })).toBe(false);
    expect(isInterviewFile({ id: "f" })).toBe(false);
  });
  it("the queue selects is_interview and filters with the predicate before analyze-file is called", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../scripts/reparse-existing-files.mjs"), "utf8");
    expect(src).toMatch(/select\("id,input_id,file_name,file_type,file_path,uploaded_at,is_interview"\)/);
    const filterAt = src.indexOf(".filter((file) => !isInterviewFile(file))");
    const endpointAt = src.indexOf("/functions/v1/analyze-file");
    expect(filterAt).toBeGreaterThan(0);
    expect(filterAt).toBeLessThan(endpointAt);
    const files = [{ id: "a", is_interview: false }, { id: "b", is_interview: true }, { id: "c" }];
    expect(files.filter((f) => !isInterviewFile(f)).map((f) => f.id)).toEqual(["a", "c"]);
  });
});
