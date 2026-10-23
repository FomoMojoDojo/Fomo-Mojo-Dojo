// ── MODEL TRIAL (operator ruling, 2026-10-15): GENERATOR gpt-4.1, JUDGE gpt-4.1-mini ────────────
//
// WHY THIS EXISTS. The external branch of resolveModel did not split by role:
//
//     if (allPublic) return { provider: "external_openai", model: EXTERNAL_MODEL, role: opts.role };
//
// One model for both roles, with the role carried only as a label — while the LOCAL branch had
// always split (LOCAL_GENERATOR vs LOCAL_JUDGE). So on every public-provenance call the generator
// and the judge were the same model, and neither could be moved without moving the other. The
// ruling moves the generator to gpt-4.1 and keeps the judge at gpt-4.1-mini, which is only
// expressible once the branch splits.
//
// The two things this file refuses to let regress are the two the ruling named as plants: the judge
// must not follow the generator, and a stored read must carry the generator model id.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  EXTERNAL_GENERATOR, EXTERNAL_JUDGE, LOCAL_GENERATOR, LOCAL_JUDGE, resolveModel,
} from "../../../src/lib/modelRouter/resolveModel.ts";
import { GEN_RULES_VERSION } from "./genRulesVersion.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
// the real allowlist, from publicReadGuards.ts — "public_declared" is NOT in it (it is
// "publicly_declared"), and a fixture that guesses would resolve LOCAL and prove nothing
const PUBLIC = [{ provenance: "public_observed" }, { provenance: "publicly_declared" }];
const MIXED = [{ provenance: "public_observed" }, { provenance: "uploaded_document" }];

// ── 1. the two roles resolve to DIFFERENT models, and only the generator moved ───────────────────

Deno.test("MODEL. on public inputs the generator is gpt-4.1 and the judge is gpt-4.1-mini", () => {
  const gen = resolveModel({ role: "generator", inputs: PUBLIC });
  const judge = resolveModel({ role: "judge", inputs: PUBLIC });
  assertEquals(gen.provider, "external_openai");
  assertEquals(judge.provider, "external_openai");
  assertEquals(gen.model, "gpt-4.1");
  assertEquals(judge.model, "gpt-4.1-mini");
  // THE PLANT TARGET: the judge must not follow the generator. Asserted as a difference, not as
  // two literals, so a change that moves BOTH to one model fails here however it is spelled.
  assert(gen.model !== judge.model, "the judge model must not be the generator model");
  assertEquals(EXTERNAL_GENERATOR, "gpt-4.1");
  assertEquals(EXTERNAL_JUDGE, "gpt-4.1-mini");
  assert(EXTERNAL_GENERATOR !== EXTERNAL_JUDGE, "one constant per role");
});

Deno.test("MODEL. the provenance law is untouched — one non-public row still forces local", () => {
  const gen = resolveModel({ role: "generator", inputs: MIXED });
  const judge = resolveModel({ role: "judge", inputs: MIXED });
  assertEquals(gen.provider, "local_ollama");
  assertEquals(gen.model, LOCAL_GENERATOR);
  assertEquals(judge.model, LOCAL_JUDGE);
  // and an empty input set is still fail-closed to local
  const empty = resolveModel({ role: "generator", inputs: [] });
  assertEquals(empty.provider, "local_ollama");
  // the local branch also still splits by role
  assert(gen.model !== judge.model, "local roles stay distinct too");
});

Deno.test("MODEL. the split lives in the router, not at a call site", async () => {
  const router = await read("../../../src/lib/modelRouter/resolveModel.ts");
  const code = router.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  assert(/role === "judge" \? EXTERNAL_JUDGE : EXTERNAL_GENERATOR/.test(code),
    "the external branch picks by role");
  // no function chooses a model id for itself — that would be a second authority
  for (const f of ["../generate-public-read/index.ts", "../generate-read-slots/index.ts"]) {
    const src = await read(f);
    const body = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
    assert(!/["']gpt-4\.1/.test(body), `${f} must not name a model id — it asks the router`);
  }
});

// ── 2. a stored read carries the generator model id ──────────────────────────────────────────────

Deno.test("MODEL. every stored read stamps the generator model, in the ledger AND on the column", async () => {
  const src = await read("../generate-public-read/index.ts");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");

  // THE PLANT TARGET: one builder feeds both inserts, and it carries the generator model
  const b = code.indexOf("const storedLedger = (");
  assert(b > 0, "there is one stored-ledger builder");
  const builder = code.slice(b, code.indexOf("});", b));
  assert(builder.includes("generator_model: genChoice.model"), "the ledger carries the generator model id");
  assert(builder.includes("generator_provider: genChoice.provider"), "and its provider");
  assert(builder.includes("judge_model: judgeChoice.model"), "and the judge model, from the judge choice");
  assert(builder.includes("prompt_sha"), "beside the prompt that wrote it (Q4)");

  // BOTH inserts use it — a read stamped by only one path is the gap this closes
  const inserts = [...code.matchAll(/input_ledger:\s*([^,\n]+)/g)].map((m) => m[1].trim());
  const stored = inserts.filter((x) => x !== "ledger");   // the plan response echoes the raw ledger
  assertEquals(stored.length, 2, `expected the stage and write inserts, got: ${stored.join(" | ")}`);
  for (const x of stored) {
    assert(x.startsWith("storedLedger("), `an insert stamps its ledger by hand: ${x}`);
  }
  // and the sibling columns are still written, unchanged
  assertEquals((code.match(/model_provider: genChoice\.provider, model_name: genChoice\.model/g) ?? []).length, 2,
    "both inserts still stamp the columns too");
});

Deno.test("MODEL. the rules version moved with the model", () => {
  assertEquals(GEN_RULES_VERSION, "2026-10-22.5");
});

Deno.test("MODEL. the version's own log says the model changed", async () => {
  const notes = await read("./genRulesVersion.ts");
  assert(/2026-10-15\.4/.test(notes), "the bump is explained in the version's own log");
  assert(/gpt-4\.1/.test(notes), "and names the model that changed");
});
