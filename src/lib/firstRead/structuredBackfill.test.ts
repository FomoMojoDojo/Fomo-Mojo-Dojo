// STRUCTURED BACKFILL (operator ruling 2026-09-04, ruling 1): when an ok fetch mints zero snapshot rows (identical
// hash already stored), the captured structured block is backfilled onto the existing identical-hash rows whose
// structured IS NULL — never onto a row that already carries one, never onto a different hash. RED before the module.
import { describe, expect, it } from "vitest";
import { structuredBackfillTargets } from "../../../supabase/functions/_shared/structuredBackfill";

const rows = [
  { id: "a", text_sha256: "7a42", structured: null },
  { id: "b", text_sha256: "7a42", structured: { ld_json: [{}], og: {}, vendor: "Cafe Barra" } },
  { id: "c", text_sha256: "0b5d", structured: null },
];
describe("structuredBackfillTargets", () => {
  it("identical hash + null structured → targeted; a row already carrying structured is never overwritten; other hashes untouched", () => {
    expect(structuredBackfillTargets(rows, "7a42", { ld_json: [], og: { type: "product" }, vendor: null })).toEqual(["a"]);
  });
  it("no structured captured → nothing to backfill", () => {
    expect(structuredBackfillTargets(rows, "7a42", null)).toEqual([]);
  });
  it("hash not stored at all → nothing (a new row would have been minted instead)", () => {
    expect(structuredBackfillTargets(rows, "ffff", { ld_json: [], og: {}, vendor: null })).toEqual([]);
  });
});
