// S0 (2026-11-16): a file that could not be read says why, in the signed words, rendered from its code.
//   - the six strings are verbatim as signed (operator, 2026-11-16)
//   - only these codes render a reason: every other failure code still renders none (SP-212 holds there)
//   - ONE code list: the database CHECK, analyze-file's admit-list and the parser's codes all equal it
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { UNREADABLE_STRINGS, unreadableReason } from "./ingestStrings";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const CODES = Object.keys(UNREADABLE_STRINGS).sort();

describe("the unreadable reasons are verbatim as signed", () => {
  it.each([
    ["unreadable_password", "This file is password-protected. Remove the password and upload it again."],
    ["unreadable_corrupt", "This file appears to be damaged and could not be opened."],
    ["unreadable_empty", "This file opened but contains no text."],
    ["unreadable_no_text_after_ocr", "This file is an image, and no text could be recognized in it."],
    ["unreadable_format", "MojoMap™ cannot read this kind of file yet."],
    ["ocr_unavailable", "Text recognition is not available right now."],
  ])("%s", (code, text) => expect(unreadableReason(code)).toBe(text));

  it("there are exactly six", () => expect(CODES).toHaveLength(6));
});

describe("only the unreadable codes render a reason (SP-212 holds for every other code)", () => {
  it.each(["voice_not_classified", "no_text_extracted", "enqueue_attempts_exhausted", "", "toString", "__proto__"])(
    "%s → none", (code) => expect(unreadableReason(code)).toBeNull());
  it("null and undefined → none", () => {
    expect(unreadableReason(null)).toBeNull();
    expect(unreadableReason(undefined)).toBeNull();
  });
});

describe("one code list everywhere", () => {
  const quoted = (src: string) => [...src.matchAll(/"((?:unreadable|ocr)_[a-z_]+)"|'((?:unreadable|ocr)_[a-z_]+)'/g)].map((m) => m[1] ?? m[2]);
  it("the migration's CHECK constraint admits exactly these codes", () => {
    const sql = read("supabase/migrations/20261116100000_unreadable_failure_codes.sql");
    const check = sql.slice(sql.indexOf("add constraint input_files_extraction_error_code_check"), sql.indexOf("create or replace function public.unread_file_close_code"));
    expect([...new Set(quoted(check))].sort()).toEqual(CODES);
  });
  it("analyze-file admits exactly these codes", () => {
    const src = read("supabase/functions/analyze-file/index.ts");
    const list = src.slice(src.indexOf("const EXTRACTION_ERROR_CODES"), src.indexOf("]);", src.indexOf("const EXTRACTION_ERROR_CODES")));
    expect([...new Set(quoted(list))].sort()).toEqual(CODES);
  });
  it("every code the parser can return is one of them", () => {
    const parser = read("scripts/local-parser-server.mjs");
    const emitted = new Set(quoted(parser));
    expect(emitted.size).toBeGreaterThan(0);
    for (const c of emitted) expect(CODES, c).toContain(c);
  });
});
