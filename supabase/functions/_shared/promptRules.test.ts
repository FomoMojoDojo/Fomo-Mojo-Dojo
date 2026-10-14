// ── Q1 / Q2 / Q3 (operator rulings, 2026-10-13): the prompt stops contradicting itself ──────────
//
// The diagnostic on runs 9941 and 9976: clause (7) said "keep every differentiator the company's
// CURRENT read carries", and the current read is not in the prompt. Measured against run 9976's own
// 79-row ledger, none of the three current differentiators appears verbatim in any row the model
// saw. So clause (7) had exactly ONE available referent — the ALREADY WRITTEN notice, the two lines
// it is forbidden to write — and a model obeying clause (7) must write them back. Both runs did.
// Clause (2) made it easier still: its worked example quoted the carried kinship sentence and told
// the model to write that and cite the row.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { furtherDifferentiatorCount } from "./carriedSpan.ts";
import { DIFFERENTIATORS_MIN } from "./readSlots.ts";
import { GEN_RULES_VERSION } from "./genRulesVersion.ts";

const SRC = await Deno.readTextFile(new URL("../generate-public-read/index.ts", import.meta.url));
const rule = (() => {
  const i = SRC.indexOf("const SPECIFICS_RULE");
  return SRC.slice(i, SRC.indexOf("`;", i));
})();
const clause = (n: number) => {
  const i = rule.indexOf(`(${n}) `);
  const j = rule.indexOf(`(${n + 1}) `, i);
  return rule.slice(i, j === -1 ? rule.indexOf("EXAMPLE.", i) : j);
};

Deno.test("Q1. clause (7) names NO document outside this prompt", () => {
  const c7 = clause(7);
  assert(c7.includes("ALREADY WRITTEN"), "it refers to the notice, which the prompt does contain");
  for (const phrase of ["CURRENT read", "current read", "previous read", "prior read", "existing read", "the read it replaces"]) {
    assert(!c7.includes(phrase), `clause (7) still names "${phrase}" — a document the model never sees`);
  }
  assert(/keep every differentiator you can source from the ledger/i.test(c7), "and it points at the ledger, which is in the prompt");
});

Deno.test("Q1. no OTHER clause reaches outside the prompt either", () => {
  // the whole rule, not just the clause that was wrong — the same mistake elsewhere is the same bug
  for (const phrase of ["CURRENT read", "current read", "previous read"]) {
    assert(!rule.includes(phrase), `SPECIFICS_RULE still names "${phrase}"`);
  }
});

Deno.test("Q2. the notice states a count", () => {
  const i = SRC.indexOf("// ── Q2 (operator ruling");
  const block = SRC.slice(i, SRC.indexOf("const p = await run(genChoice", i));
  assert(block.includes("Write ${furtherWanted} further differentiators."), "the sentence is in the notice");
  assert(block.includes("furtherDifferentiatorCount(currentDiffCount, carries.length)"), "and N comes from the one function");
  assert(block.indexOf("ALREADY WRITTEN") < block.indexOf("Write ${furtherWanted}"), "the count comes AFTER the carried lines, as the last thing the notice says");
});

Deno.test("Q2. N arithmetic: 3 current, 2 carried ⇒ 1", () => {
  assertEquals(furtherDifferentiatorCount(3, 2), 1, "the Edgewood case — one line the carries do not cover");
  assertEquals(furtherDifferentiatorCount(3, 0), 3);
  assertEquals(furtherDifferentiatorCount(3, 3), 0, "the carries cover the whole read ⇒ ask for none");
  assertEquals(furtherDifferentiatorCount(2, 3), 0, "never negative");
});

Deno.test("Q2. no current read ⇒ DIFFERENTIATORS_MIN, not zero", () => {
  assertEquals(DIFFERENTIATORS_MIN, 2, "the slot path's own floor");
  assertEquals(furtherDifferentiatorCount(0, 0), DIFFERENTIATORS_MIN);
  assertEquals(furtherDifferentiatorCount(0, 2), DIFFERENTIATORS_MIN, "a company with no current read has nothing to lose, so the floor stands");
});

Deno.test("Q3. clause (2)'s worked example no longer quotes the kinship sentence", () => {
  const c2 = clause(2);
  assert(c2.includes("STATED AS THAT ROW STATES IT"), "the rule itself is unchanged");
  for (const quoted of ["kinship", "nationally pioneering", "first kinship program"]) {
    assert(!c2.toLowerCase().includes(quoted.toLowerCase()), `clause (2) still quotes "${quoted}" — the carried line, handed back to the model`);
  }
  assert(c2.includes("longest-running apprenticeship in the state"), "a neutral example stands in its place");
});

Deno.test("Q3. the example's subject appears nowhere in this generator's prompts", () => {
  // the point is that it cannot be mistaken for something the company's record says
  const all = SRC.slice(SRC.indexOf("const CITE_RULE"), SRC.indexOf("const GEN_STRATEGY"));
  assertEquals((all.match(/apprenticeship/g) ?? []).length, 2, "named twice, in clause (2) alone");
});

Deno.test("P3. the version is bumped — these rules can change what the model writes", () => {
  // C1-S (2026-10-14) bumped it: the generation PROMPT changed — it now shows the model the
  // current read's still-sourced lines. The invariant is unchanged: the stamp moves when the
  // rules that shape what the model writes move, and the module explains each bump.
  assertEquals(GEN_RULES_VERSION, "2026-10-14.1");
  const notes = Deno.readTextFileSync(new URL("./genRulesVersion.ts", import.meta.url));
  assert(notes.includes("2026-10-14.1"), "and the bump is explained in the version's own log");
  assert(notes.includes("C1-S"), "the log names the ruling that moved it");
});

// LIVE: clause (2)'s example must match nothing in the company's record, or it is the old mistake
// wearing a different sentence. Gated on the stack's env, house pattern; read-only.
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
Deno.test({
  name: "Q3. LIVE: clause (2)'s example matches no live Edgewood row",
  ignore: URL_ === "" || KEY === "",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const db = createClient(URL_, KEY);
    // the company comes from a lookup: the one holding a current positioning read with a classes map
    // NO AMBIGUOUS PICK. Three companies hold a classed current positioning read, and an unordered
    // .find() among them chose the wrong one on the first run of this leg — the same mistake as the
    // `ILIKE 'Edgewood%' LIMIT 1` that produced void audit 9942. The Edgewood anchor is the
    // operator-named company_id, asserted; and the new example phrase is then checked against EVERY
    // classed company's live record, so the leg does not depend on the pick at all.
    const EDGEWOOD = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
    const { data: reads } = await db.from("public_reads")
      .select("company_id, input_ledger").eq("kind", "positioning").eq("is_current", true);
    const classed = [...new Set(((reads ?? []) as Array<{ company_id: string; input_ledger: { classes?: unknown } | null }>)
      .filter((r) => r.input_ledger?.classes).map((r) => r.company_id))];
    assert(classed.includes(EDGEWOOD), "the operator-named company holds a classed current positioning read");

    const corpusOf = async (co: string) => {
      const parts: string[] = [];
      for (const [table, cols] of [["signals", "claim_text, evidence_excerpt"], ["findings", "body"], ["own_words_candidates", "quote"]] as const) {
        const { data } = await db.from(table).select(cols).eq("company_id", co);
        for (const r of ((data ?? []) as Array<Record<string, unknown>>)) parts.push(Object.values(r).map((v) => String(v ?? "")).join(" "));
      }
      return parts.join("\n").toLowerCase();
    };

    const edgewood = await corpusOf(EDGEWOOD);
    assert(edgewood.length > 1000, "a real corpus, not an empty one — this leg must not pass vacuously");
    for (const phrase of ["apprenticeship", "longest-running"]) {
      assert(!edgewood.includes(phrase), `clause (2)'s example phrase "${phrase}" IS in Edgewood's record`);
      // and in no other classed company's record either
      for (const co of classed) {
        assert(!(await corpusOf(co)).includes(phrase), `"${phrase}" is in the record of ${co.slice(0, 8)}`);
      }
    }
    // and the sentence it replaced really is in there — the reason Q3 exists
    assert(edgewood.includes("first kinship program in the country"), "the old example quoted a live row, as the diagnostic found");
  },
});

// ── Q4 (operator ruling, 2026-10-13): the prompt is STAMPED; its text is NOT stored ─────────────
//
// THE WALL CHECK DECIDED THIS. The ruling said to store the prompt text unless it can carry
// client-provided material. It can, in two places, and both were measured before anything was built:
//
//   the LEDGER BODY — selectPublicInputs filters signals on signal_band, voice_class and liveness
//   and NEVER on source_type, so a signal the client uploaded can satisfy every predicate it
//   applies. 13 Edgewood signals (source_type='uploaded_file', band outside, voice market_context,
//   live) do exactly that, out of 233 client-provided signals the company holds.
//
//   the ALREADY WRITTEN notice — a carry comes through liveRecordCandidates, which applies the same
//   predicates minus source_type, so a carried span can be lifted from one of those same 13 rows
//   and printed into the notice verbatim.
//
// Run 9976's own 79-row ledger held none of them, and its provenances were 62 public_observed + 17
// public_inferred — but that is the cap and the selection order, not a wall. So the text is not
// stored and generation_prompts is NOT created. The sha still answers the question Q4 was asked:
// two reads with the same prompt_sha were written to the same prompt.
Deno.test("Q4. the sha is computed over the WHOLE prompt, system and user", () => {
  const i = SRC.indexOf("const systemText = genSys[kind as Kind];");
  assert(i > 0, "the prompt halves are named before the call");
  const block = SRC.slice(i, SRC.indexOf("const p = await run(", i) + 60);
  assert(block.includes("promptSha[kind as Kind] = await sha256Hex(`${systemText}\\n\\n${userText}`);"),
    "sha256 of system + user, the ledger body included — it identifies the prompt, it does not summarise it");
  assert(block.includes("const p = await run(genChoice, systemText, userText, 0);"),
    "and the model is sent exactly the text that was hashed, not a rebuild of it");
});

Deno.test("Q4. EVERY stored read is stamped — staged and direct write alike", () => {
  assert(SRC.includes("prompt_sha: promptSha[kind] ?? null,     // Q4: WHICH prompt wrote this read"), "the staged insert");
  assert(SRC.includes("input_ledger: { ...ledger, prompt_sha: promptSha[kind] ?? null },"), "the direct write");
  assertEquals((SRC.match(/prompt_sha: promptSha\[kind\]/g) ?? []).length, 2, "both insert paths, and only those");
});

Deno.test("Q4. NO prompt text is stored anywhere — the wall check forbade it", async () => {
  assert(!SRC.includes("generation_prompts"), "the table is not created and not written");
  for (const field of ["system_text", "user_text", "prompt_text"]) {
    assert(!SRC.includes(field), `the generator stores no ${field}`);
  }
  // and no migration creates it either
  const dir = new URL("../../migrations/", import.meta.url);
  for await (const e of Deno.readDir(dir)) {
    if (!e.isFile || !e.name.endsWith(".sql")) continue;
    assert(!(await Deno.readTextFile(new URL(e.name, dir))).includes("generation_prompts"), `${e.name} creates it`);
  }
});

Deno.test({
  name: "Q4. LIVE WALL LEG: a client-provided signal satisfies every predicate the selector applies",
  ignore: URL_ === "" || KEY === "",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
    const { PUBLIC_SIGNAL_VOICES } = await import("./publicReadInputs.ts");
    const { CLIENT_PROVIDED_SOURCE_KINDS } = await import("./clientMaterial.ts");
    const db = createClient(URL_, KEY);
    const CLIENT_TYPES = ["uploaded_file", "file", "file_proposal", "intake", "interview"];
    // the kinds list is the authority on what counts as client-provided; keep this leg tied to it
    assert(CLIENT_PROVIDED_SOURCE_KINDS.some((k) => k.kind === "upload_signal"), "the signals lane is still a client-material kind");

    const { data, count } = await db.from("signals")
      .select("id, company_id, source_type, voice_class", { count: "exact" })
      .in("source_type", CLIENT_TYPES).eq("signal_band", "outside")
      .in("voice_class", PUBLIC_SIGNAL_VOICES).is("superseded_at", null).is("held_at", null);
    const rows = (data ?? []) as Array<{ source_type: string; voice_class: string }>;
    assert((count ?? 0) > 0,
      "NOTHING breaches the wall today — if this leg ever passes vacuously the ruling's other branch " +
      "(store the prompt text) becomes available again, and Q4 should be revisited rather than left here");
    // this is the finding, pinned: the selector cannot tell these apart from public rows
    assert(rows.every((r) => CLIENT_TYPES.includes(r.source_type)));
    assert(rows.some((r) => PUBLIC_SIGNAL_VOICES.includes(r.voice_class)));
  },
});
