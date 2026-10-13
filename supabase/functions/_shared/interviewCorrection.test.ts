// Act 1 — the correction writer's refusals and its one row. Pure: no DB, no network, no model.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AUDIT_COMPONENT, CORRECTION_STATEMENT, correctionClaimFor, existingClaimIdFor, reversalSqlFor,
} from "./interviewCorrection.ts";
import { INTERVIEW_ITEM_KIND_OVERRIDES_TABLE, INTERVIEW_ITEMS_TABLE, loadCorrectionItem } from "./interviewItems.ts";

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const OTHER = "11111111-1111-4111-8111-111111111111";
const ITEM = "61dac18a-50fe-4a3a-82c3-56e5c9cc441e";

/** A fake client over TWO tables: the item row, and the override rows the resolver reads (R-A1). */
const clientReturning = (row: unknown, overrides: Array<Record<string, unknown>> = []) => ({
  from: (table: string) => {
    if (table === INTERVIEW_ITEM_KIND_OVERRIDES_TABLE) {
      let rows = [...overrides];
      const b: Record<string, unknown> = {};
      Object.assign(b, {
        select: () => b,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return b; },
        order: () => b,
        limit: (n: number) => Promise.resolve({ data: rows.slice(0, n), error: null }),
      });
      return b;
    }
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row }) }) }) };
  },
});
const IDENT = "e".repeat(64);
/** The PARSER's row: kind 'ask', exactly as it landed. R-A1 never edits this. */
const parserRow = {
  id: ITEM, company_id: CO, interview_record_id: "rec-1", kind: "ask", content_identity: IDENT,
  raw_words: "We're no longer level 14.", speaker_label: "Lynn", retracted_at: null,
};
/** The operator's override that makes it a correction for THIS landing. */
const theOverride = {
  id: "o-1", interview_item_id: ITEM, content_identity: IDENT,
  from_kind: "ask", to_kind: "correction", reason: "client correction", decided_by: "operator",
  decided_at: "2026-10-12T19:00:00Z",
};
/** The shape the writer accepts: parser row + override in force. */
const goodRow = parserRow;
const goodOverrides = [theOverride];

Deno.test("refuses an item that does not exist — before any write", async () => {
  const r = await loadCorrectionItem(clientReturning(null, goodOverrides), CO, ITEM);
  assert(!r.ok); assertEquals(r.refusal, "item_not_found");
});

Deno.test("refuses an item belonging to another company", async () => {
  const r = await loadCorrectionItem(clientReturning({ ...goodRow, company_id: OTHER }, goodOverrides), CO, ITEM);
  assert(!r.ok); assertEquals(r.refusal, "wrong_company");
});

Deno.test("refuses a parser 'ask' with NO override — and the refusal says so", async () => {
  const r = await loadCorrectionItem(clientReturning(parserRow, []), CO, ITEM);
  assert(!r.ok); assertEquals(r.refusal, "not_a_correction");
  assert(r.detail.includes("'ask'"), "the refusal names the kind it was handed");
  assert(r.detail.includes("no operator override is in force"), "and says the override is what is missing");
});

Deno.test("refuses when the override was decided against a DIFFERENT landing", async () => {
  const stale = [{ ...theOverride, content_identity: "f".repeat(64) }];
  const r = await loadCorrectionItem(clientReturning(parserRow, stale), CO, ITEM);
  assert(!r.ok); assertEquals(r.refusal, "not_a_correction");
});

Deno.test("refuses a retracted item", async () => {
  const r = await loadCorrectionItem(clientReturning({ ...goodRow, retracted_at: "2026-10-01T00:00:00Z" }, goodOverrides), CO, ITEM);
  assert(!r.ok); assertEquals(r.refusal, "retracted");
});

Deno.test("accepts a parser 'ask' WITH an override in force — the override is what admits it", async () => {
  const r = await loadCorrectionItem(clientReturning(parserRow, goodOverrides), CO, ITEM);
  assert(r.ok);
  assertEquals(r.item.id, ITEM);
  assertEquals(r.item.kind, "ask", "the PARSER's kind is returned untouched");
  assertEquals(r.effective.kind, "correction", "the EFFECTIVE kind is what the writer acted on");
  assertEquals(r.effective.overridden, true);
  assertEquals(r.effective.override?.decided_by, "operator");
});

Deno.test("the minted claim is client_attested, carries BOTH ids, and the operator's wording verbatim", () => {
  const c = correctionClaimFor({
    companyId: CO, item: goodRow, attestedAt: "2026-09-24T17:00:00Z", personName: "Lynn",
  });
  assertEquals(c.provenance, "client_attested");
  assertEquals(c.statement, CORRECTION_STATEMENT);
  assertEquals(c.statement, "Level 14 is retired terminology; the current California designation is STRTP (AB 403).");
  assertEquals(c.raw_payload.interview_item_id, ITEM);
  assertEquals(c.raw_payload.interview_record_id, "rec-1");
  // the client's own words are kept BESIDE the operator's wording, never instead of it
  assertEquals(c.raw_payload.item_raw_words, "We're no longer level 14.");
  assertEquals(c.raw_payload.origin, "interview_correction");
  assertEquals(c.raw_payload.person_name, "Lynn");
});

Deno.test("the statement is NEVER taken from the item's raw words", () => {
  const c = correctionClaimFor({
    companyId: CO,
    item: { ...goodRow, raw_words: "something else entirely" },
    attestedAt: null, personName: null,
  });
  assertEquals(c.statement, CORRECTION_STATEMENT);
});

Deno.test("idempotent on the ITEM id, not on the statement", () => {
  const rows = [
    { id: "claim-a", raw_payload: { origin: "interview_correction", interview_item_id: ITEM } },
    { id: "claim-b", raw_payload: { origin: "interview_correction", interview_item_id: "other-item" } },
    { id: "claim-c", raw_payload: null },
  ];
  assertEquals(existingClaimIdFor(rows, ITEM), "claim-a");
  assertEquals(existingClaimIdFor(rows, "other-item"), "claim-b");
  assertEquals(existingClaimIdFor(rows, "never-seen"), null);
  assertEquals(existingClaimIdFor([], ITEM), null);
});

Deno.test("the audit row's reversal deletes exactly the claim it minted", () => {
  assertEquals(reversalSqlFor("abc-123"), "delete from public.claims where id = 'abc-123';");
  assertEquals(AUDIT_COMPONENT, "interview_correction_claim");
});

Deno.test("the writer source makes NO model call and the write flag is write:true", async () => {
  const src = await Deno.readTextFile(new URL("../record-interview-correction/index.ts", import.meta.url));
  for (const forbidden of ["api.openai.com", "api.anthropic.com", "callOpenAIJson", "resolveModel", "OLLAMA", "ollama", "/api/chat"]) {
    assert(!src.includes(forbidden), `record-interview-correction must make no model call — found "${forbidden}"`);
  }
  assert(src.includes("const doWrite = body?.write === true;"), "the write flag is write:true and nothing else");
  // The census wall stays narrow: the writer never spells the items table. The name is taken from
  // the walled module's own constant so THIS file does not spell it either (the census counts test
  // files too — it caught this assertion the first time it was written as a literal).
  assert(!src.includes(INTERVIEW_ITEMS_TABLE), `the writer must not name the item store — the read goes through _shared/interviewItems.ts (${INTERVIEW_ITEMS_TABLE})`);
});
