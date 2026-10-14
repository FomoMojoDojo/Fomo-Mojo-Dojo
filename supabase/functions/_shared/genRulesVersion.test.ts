// ── P3 (operator ruling, 2026-10-13): the stamp is present, and it is not SELECTION_VERSION ─────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { GEN_RULES_VERSION } from "./genRulesVersion.ts";
import { SELECTION_VERSION } from "./publicReadSelection.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("P3-a. every stored READ carries gen_rules_version in its ledger", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes('import { GEN_RULES_VERSION } from "../_shared/genRulesVersion.ts";'),
    "the read writer imports the one module");
  assert(gen.includes("gen_rules_version: GEN_RULES_VERSION,"),
    "ledgerOf stamps it — so EVERY stored read carries it, staged or written");
  // the stamp sits in the ONE ledger builder, so no write path can miss it
  const ledgerBlock = gen.slice(gen.indexOf("selection_version: SELECTION_VERSION,"));
  assert(ledgerBlock.slice(0, 600).includes("gen_rules_version: GEN_RULES_VERSION,"),
    "stamped beside selection_version, in the same ledger object");
});

Deno.test("P3-b. every stored SLOT carries the stamp in criterion_version", async () => {
  const slots = await read("../generate-read-slots/index.ts");
  assert(slots.includes('import { GEN_RULES_VERSION } from "../_shared/genRulesVersion.ts";'),
    "the slot writer imports the same module");
  assert(slots.includes("criterion_version: GEN_RULES_VERSION,"), "the slot insert stamps it");
  // and it is inside the insert, not somewhere decorative. Bounded by the insert's own closing
  // brace rather than a character count — VS1's comment above the stamp pushed it past a 700-char
  // window, which would have read as the stamp going missing when it had only moved down the object.
  const from = slots.indexOf('from("first_read_slots").insert({');
  const ins = slots.slice(from, slots.indexOf("}).select(", from));
  assert(ins.length > 0 && ins.includes("criterion_version: GEN_RULES_VERSION,"),
    "stamped in the staging insert itself");
});

Deno.test("P3-c. the two stamps are independent — a prompt change never moves SELECTION_VERSION", () => {
  // P3's point stands and is what this guards: GEN_RULES_VERSION and SELECTION_VERSION record two
  // different facts, and a prompt-only change must move only the first. The literal pinned here was
  // bumped by R1 (2026-10-14), which DID change the selection: a signal's pool text is now
  // rowTextOf's assembly with the source title carried beside it instead of appended. That is a
  // change to what the selection hands the model, so stamping it is correct — the case P3 forbids
  // is a bump with NO selection change, which pinning the literal still catches.
  assertEquals(SELECTION_VERSION, "gpr-select-2026-10-14.1",
    "pinned so a bump is always deliberate; R1 changed the pool's text, so this one is");
  assert(GEN_RULES_VERSION !== SELECTION_VERSION as string, "two different stamps, two different facts");
});

Deno.test("P3-d. the version lives in ONE module and is a dated string", () => {
  assertEquals(GEN_RULES_VERSION, "2026-10-13.2");   // Q1/Q2/Q3 bumped it
  assert(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(GEN_RULES_VERSION),
    "dated like PARSER_RULES_VERSION, so a reader sees WHEN the rules changed");
});

Deno.test("P3-e. ATTRIBUTION ONLY — nothing retracts or gates on this stamp", async () => {
  for (const f of ["../generate-public-read/index.ts", "../generate-read-slots/index.ts", "./genRulesVersion.ts"]) {
    const src = await read(f);
    // the parser's retraction idiom must NOT appear around this constant
    const bad = /GEN_RULES_VERSION[\s\S]{0,200}(retract|neq\(|<>\s*GEN_RULES|!==\s*GEN_RULES)/i.test(src);
    assert(!bad, `${f} must not retract or compare rows on GEN_RULES_VERSION — the stamp is attribution only`);
  }
});
