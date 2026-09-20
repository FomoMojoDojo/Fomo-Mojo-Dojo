// Gate B census-gap guard (2026-09-19): a company clone copies input_files rows — the copy must carry
// is_interview so the transcript stays fenced in the new company (its record is not copied). Also: the
// local mirror script never pulls a transcript to disk. Plant: the flag dropped from the clone insert.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("interview fence — company clone and the local mirror", () => {
  it("companyCollision's input_files clone insert carries is_interview", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "./companyCollision.ts"), "utf8");
    const insertAt = src.indexOf('.from("input_files").insert({');
    const flagAt = src.indexOf("is_interview: file.is_interview === true");
    expect(insertAt).toBeGreaterThan(0);
    expect(flagAt).toBeGreaterThan(insertAt);
    expect(flagAt - insertAt).toBeLessThan(400);
  });
  it("pull-supabase-files-to-local selects the flag and skips interview files before any download", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../scripts/pull-supabase-files-to-local.mjs"), "utf8");
    const sel = src.indexOf("select('id,input_id,file_name,file_path,uploaded_at,is_interview')");
    const filt = src.indexOf(".filter((f) => f?.is_interview !== true)");
    const dl = src.indexOf(".download(item.filePath)");
    expect(sel).toBeGreaterThan(0); expect(filt).toBeGreaterThan(sel); expect(dl).toBeGreaterThan(filt);
  });
});
