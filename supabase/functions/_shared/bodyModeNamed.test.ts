// ── WD (operator ruling, 2026-10-15): THE MODE IS NAMED, OR THE CALL IS REFUSED ─────────────────
//
// WHY THIS EXISTS. generate-public-read derived its mode as
//
//     const doWrite = body.write !== false && !doPlan && !doStage && !doPromote;
//
// so WRITE was the default for every body that named no mode — including a body that named one and
// got the key wrong. A re-stage of Wasabi's strategy was sent as {mode:"stage"}. `mode` is not a key
// the function reads; nothing was true; the default wrote a CURRENT read (04a3d69c, audits
// 10777 -> 10778, both stamped mode:"write") over de1efd3f, which is a promote. It was discarded as
// 10779 and de1efd3f flipped back in the same transaction. Neither the request nor the response said
// a promote had happened — the only evidence was the mode stamp on the audit row afterwards.
//
// THE RULE: exactly one of plan|stage|promote|write|dry_run is true, every body key is one the
// function reads, and anything else is a 400 with an audited refusal row naming the keys. No default.
//
// dry_run is in the set because it is a REAL mode — stamped mode:"dry_run" on the integrity row —
// and it was reachable only as `write:false`, a body that sets nothing to true. The ruling as
// written refuses that body, which would have deleted the mode; it is named positively instead.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { classifyBodyMode, KNOWN_BODY_KEYS, MODE_FLAGS } from "./bodyMode.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// ── 1. THE RULE, on the one function. These are the three the plants target: a permissive gate
//      reached over HTTP would run a generation and write a current read, so the rule is proven
//      here, where it costs nothing, and the wiring is proven over HTTP below. ──────────────────

Deno.test("WD. a body naming NO mode is refused — there is no default mode", () => {
  for (const body of [
    { company_id: "co", kinds: ["strategy"] },           // the bare body that used to WRITE
    { company_id: "co" },
    { company_id: "co", write: false },                  // the old dry-run spelling: nothing is true
    { company_id: "co", stage: false, write: false },
  ]) {
    const v = classifyBodyMode(body as Record<string, unknown>);
    assertEquals(v.ok, false, `${JSON.stringify(body)} must be refused`);
    if (v.ok) continue;
    assert(/no mode flag set to true/.test(v.detail), v.detail);
    assertEquals(v.modes_named, []);
  }
  // and every mode, named, is accepted — the rule refuses ambiguity, not work
  for (const f of MODE_FLAGS) {
    const v = classifyBodyMode({ company_id: "co", [f]: true });
    assertEquals(v.ok, true, `${f}:true must be accepted`);
    if (v.ok) assertEquals(v.mode, f);
  }
});

Deno.test("WD. {mode:'stage'} — the body that promoted — is refused, and the KEY is named", () => {
  const v = classifyBodyMode({ company_id: "co", kinds: ["strategy"], mode: "stage" });
  assertEquals(v.ok, false, "this exact body wrote a current read over de1efd3f");
  if (v.ok) return;
  assertEquals(v.unknown_keys, ["mode"], "the unknown key is named, not ignored");
  assert(/unknown body key\(s\): mode/.test(v.detail), v.detail);
  assert(/no mode flag set to true/.test(v.detail), "and so is the missing mode");
  // a near-miss spelling of a REAL flag is caught the same way
  const v2 = classifyBodyMode({ company_id: "co", staged: true });
  assertEquals(v2.ok, false);
  if (!v2.ok) assertEquals(v2.unknown_keys, ["staged"]);
});

Deno.test("WD. TWO mode flags at once are refused, and both are named", () => {
  for (const [a, b] of [["stage", "write"], ["plan", "promote"], ["write", "dry_run"]]) {
    const v = classifyBodyMode({ company_id: "co", [a]: true, [b]: true });
    assertEquals(v.ok, false, `${a}+${b} must be refused, not resolved by precedence`);
    if (v.ok) continue;
    assert(/2 mode flags set to true/.test(v.detail), v.detail);
    assert(v.detail.includes(a) && v.detail.includes(b), `both named: ${v.detail}`);
  }
  // all five at once is still one refusal, naming all five
  const all = classifyBodyMode(Object.fromEntries([["company_id", "co"], ...MODE_FLAGS.map((f) => [f, true])]));
  assertEquals(all.ok, false);
  if (!all.ok) assertEquals(all.modes_named.length, MODE_FLAGS.length);
});

Deno.test("WD. the known-keys list covers exactly what the function reads", async () => {
  const src = await read("../generate-public-read/index.ts");
  const readKeys = new Set([...src.matchAll(/body(?:\s+as\s+Record<string,\s*unknown>)?\.([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((m) => m[1]));
  for (const k of readKeys) {
    assert(KNOWN_BODY_KEYS.includes(k), `body.${k} is read but not known — a caller passing it would be refused`);
  }
  // and nothing is listed that is read nowhere, which would be a key we accept and never use
  for (const k of KNOWN_BODY_KEYS) {
    if ((MODE_FLAGS as readonly string[]).includes(k)) continue;   // modes are read via the flag list
    assert(readKeys.has(k), `${k} is accepted but never read`);
  }
});

// ── 2. the same rule, over HTTP: proof the handler actually calls it ─────────────────────────────

Deno.test({
  name: "WD. {mode:'stage'} — the exact body that promoted — is REFUSED, and nothing is written",
  ignore: URL_ === "" || KEY === "",
  fn: async () => {
    const db = createClient(URL_, KEY);
    const { data: co } = await db.from("companies").select("id").ilike("name", "%Wasabi%").maybeSingle();
    const company_id = (co as { id: string } | null)?.id;
    assert(company_id, "resolved by query, never typed");

    const countReads = async () => {
      const { count } = await db.from("public_reads").select("id", { count: "exact", head: true });
      return count ?? -1;
    };
    const before = await countReads();
    const lastAudit = async () => {
      const { data } = await db.from("integrity_runs").select("id").order("id", { ascending: false }).limit(1).maybeSingle();
      return (data as { id: number } | null)?.id ?? 0;
    };
    const auditBefore = await lastAudit();

    const resp = await fetch(`${URL_}/functions/v1/generate-public-read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company_id, kinds: ["strategy"], mode: "stage" }),
    });
    assertEquals(resp.status, 400, "the call that silently wrote a current read is now refused");
    const body = await resp.json() as { error?: string; guard?: string; keys_known?: string[] };
    assertEquals(body.guard, "body_mode_unnamed");
    assert(/no mode flag set to true/.test(body.error ?? ""), `names the fault: ${body.error}`);
    assert(/unknown body key\(s\): mode/.test(body.error ?? ""), `and names the bad key: ${body.error}`);
    assert((body.keys_known ?? []).includes("stage"), "and tells the caller the keys it reads");

    assertEquals(await countReads(), before, "NO read was written");
    // the refusal is on the record, with the keys
    const { data: row } = await db.from("integrity_runs")
      .select("id, status, error, excluded_by_rule").gt("id", auditBefore)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    const r = row as { status: string; error: string; excluded_by_rule: Record<string, unknown> } | null;
    assert(r, "the refusal wrote an audit row");
    assertEquals(r.status, "rejected");
    assertEquals((r.excluded_by_rule as { guard: string }).guard, "body_mode_unnamed");
    assertEquals((r.excluded_by_rule as { unknown_keys: string[] }).unknown_keys, ["mode"]);
    assertEquals((r.excluded_by_rule as { modes_named: string[] }).modes_named, []);
    assertEquals((r.excluded_by_rule as { mode: unknown }).mode, null, "no mode ran");
  },
});

// ── 3. the rule, in source: no mode derived by elimination ───────────────────────────────────────

Deno.test("WD. no mode is derived by elimination any more", async () => {
  const src = await read("../generate-public-read/index.ts");
  const code = src.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
  // the exact shape that made write the default
  assert(!/body\.write\s*!==\s*false/.test(code), "`body.write !== false` is the default write path");
  assert(!/!doPlan\s*&&\s*!doStage/.test(code), "and no mode is what's left when the others are false");
  // each mode is named positively, from one list
  for (const f of ["plan", "stage", "promote", "write"]) {
    assert(new RegExp(`do${f[0].toUpperCase()}${f.slice(1)} = verdict.mode === "${f}"`).test(code),
      `${f} is named, not inferred`);
  }
  // one implementation: the handler decides nothing itself
  assert(/classifyBodyMode\(body/.test(code), "the handler calls the one function");
  assert(!/MODE_FLAGS\s*=/.test(code), "and does not keep its own copy of the mode list");
  // the refusal is audited through A1's one writer, before any mode runs
  const i = code.indexOf("if (!verdict.ok)");
  assert(i > 0, "the check exists");
  assert(code.indexOf("await insertIntegrityRun(", i) > 0, "and audits through the one writer");
  assert(i < code.indexOf("if (doPromote) {"), "and runs before any mode does");
});

Deno.test("WD. every caller of this function names its mode", async () => {
  // the census, as an assertion: any fetch/invoke of generate-public-read must carry a mode flag.
  const files = [
    "../first-read-fill/index.ts",
    "../../../scripts/first-read-fill.ts",
    "./stageContinuity.test.ts",
  ];
  const FLAG = /\b(plan|stage|promote|write|dry_run)\s*:\s*true\b/;
  for (const f of files) {
    const src = await read(f);
    let from = 0;
    for (;;) {
      const i = src.indexOf("generate-public-read", from);
      if (i < 0) break;
      from = i + 1;
      const call = src.slice(i, i + 700);
      if (!/body:|invokeFn\(/.test(call.slice(0, 300))) continue;   // a comment or an import, not a call
      assert(FLAG.test(call), `a call in ${f} near offset ${i} names no mode flag`);
    }
  }
});
