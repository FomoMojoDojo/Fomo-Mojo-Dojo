// The client side of the size refusal (2026-09-12): the signed sentence, the typed-body parse, and the
// FunctionsHttpError path supabase.functions.invoke uses for a 413.
import { describe, it, expect } from "vitest";
import { FILE_TOO_LARGE_CAP_BYTES, FileTooLargeError, fileTooLargeMessage, formatMiB, parseFileTooLarge, refusalFromInvoke } from "./fileTooLarge";

describe("fileTooLarge", () => {
  it("the signed sentence, with a measured size and the whole-number cap", () => {
    expect(fileTooLargeMessage({ size: 25522684, cap: FILE_TOO_LARGE_CAP_BYTES })).toBe("File too large to analyse — 24.3 MiB exceeds the 25 MiB limit");
    expect(fileTooLargeMessage({ size: 26 * 1024 * 1024, cap: FILE_TOO_LARGE_CAP_BYTES })).toBe("File too large to analyse — 26 MiB exceeds the 25 MiB limit");
    expect(formatMiB(27271107)).toBe("26.0 MiB");
  });
  it("parses only the typed body", () => {
    expect(parseFileTooLarge({ error: "file_too_large", size: 1, cap: 2 })).toEqual({ size: 1, cap: 2 });
    expect(parseFileTooLarge({ error: "file_too_large", size: "1", cap: 2 })).toBeNull();
    expect(parseFileTooLarge({ error: "Could not download file from storage." })).toBeNull();
    expect(parseFileTooLarge(null)).toBeNull();
  });
  it("reads the refusal from the FunctionsHttpError's Response context (and from data when it is 2xx)", async () => {
    const ctx = new Response(JSON.stringify({ error: "file_too_large", size: 3, cap: 4 }), { status: 413, headers: { "content-type": "application/json" } });
    expect(await refusalFromInvoke(null, { name: "FunctionsHttpError", context: ctx })).toEqual({ size: 3, cap: 4 });
    expect(await refusalFromInvoke({ error: "file_too_large", size: 5, cap: 6 }, null)).toEqual({ size: 5, cap: 6 });
    expect(await refusalFromInvoke(null, { name: "FunctionsFetchError" })).toBeNull();
    const other = new Response(JSON.stringify({ code: "WORKER_LIMIT" }), { status: 546 });
    expect(await refusalFromInvoke(null, { context: other })).toBeNull();
  });
  it("FileTooLargeError carries the refusal and the sentence", () => {
    const e = new FileTooLargeError({ size: 26 * 1024 * 1024, cap: FILE_TOO_LARGE_CAP_BYTES });
    expect(e.name).toBe("FileTooLargeError");
    expect(e.message).toBe("File too large to analyse — 26 MiB exceeds the 25 MiB limit");
    expect(e.refusal.cap).toBe(26214400);
  });
});
