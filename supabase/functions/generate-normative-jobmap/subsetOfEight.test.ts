// ACT-C-1 — subset-of-8 validator: steps must be a SUBSET of the 8 ODI checkpoints
// in CANONICAL order (define…conclude); may omit, never reorder, never invent.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateSubsetOfEight } from "./logic.ts";

const s = (step_key: string, step_label = "Do the thing", description = "The performer advances the job.") => ({ step_key, step_label, description });

Deno.test("valid ordered subset → ok (omission allowed)", () => {
  const r = validateSubsetOfEight([s("define"), s("locate"), s("execute"), s("conclude")]);
  assert(r.ok);
});

Deno.test("full canonical 8 → ok", () => {
  const r = validateSubsetOfEight(["define", "locate", "prepare", "confirm", "execute", "monitor", "modify", "conclude"].map((k) => s(k)));
  assert(r.ok);
});

Deno.test("reordered → fail (canonical order enforced)", () => {
  const r = validateSubsetOfEight([s("locate"), s("define")]);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.issue.includes("canonical order"));
});

Deno.test("duplicate key → fail", () => {
  const r = validateSubsetOfEight([s("define"), s("define")]);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.issue.includes("duplicate"));
});

Deno.test("invented key outside the 8 → fail", () => {
  const r = validateSubsetOfEight([s("define"), s("negotiate")]);
  assertEquals(r.ok, false);
  if (!r.ok) assert(r.issue.includes("invented"));
});

Deno.test("missing label/description → fail", () => {
  const r = validateSubsetOfEight([{ step_key: "define", step_label: "", description: "x" }]);
  assertEquals(r.ok, false);
});

Deno.test("empty → fail", () => {
  assertEquals(validateSubsetOfEight([]).ok, false);
});

Deno.test("solution-prescriptive language → fail (guard reused)", () => {
  // 'software'/'platform'/'app' etc. are prescriptive; use a clearly prescriptive term.
  const r = validateSubsetOfEight([s("define", "Buy our software platform", "Purchase the software subscription.")]);
  assertEquals(r.ok, false);
});
