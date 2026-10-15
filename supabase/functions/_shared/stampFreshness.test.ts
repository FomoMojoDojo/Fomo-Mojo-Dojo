// ── F1 (operator ruling, 2026-10-15): ONE STAMP, AT THE HEAD OF EVERY ATTEMPT ───────────────────
//
// WHY. Wasabi's 8ef4dc7b staged a read that drops THREE still-sourced lines — the FedRAMP
// differentiator, the AI-products differentiator and best_fit — while C1 reported 6 of 6 continued.
// Nothing was wrong with C1. The lines it was shown were attempt 1's.
//
// `deps.generate` runs ONCE, before the attempt loop, and the class stamp — each citing field's
// class, refs and text (fieldClasses) plus the sourcing decision built on it (classDecisions) — was
// computed inside it. An N1c re-ask replaced the payload and nothing re-stamped, so for the rest of
// the run every gate downstream read a stamp belonging to a DIFFERENT answer:
//   C1 / C1-S  via stagedLines (generate-public-read/index.ts:968)  → compared the predecessor
//              against attempt 1's lines, which still held FedRAMP and the AI products.
//   C2         same stagedLines → softened attempt 1's our_read lines.
//   the judge  via classDecisions → was handed attempt 1's FIELD CLASSES block.
// Audit trail: 10415 (attempt 1, re-asked) → 10416 (staged) → 10417 (discarded).
//
// S1 was the one gate that had noticed, and it had been given a PRIVATE fix: its closure called
// stampFieldClasses itself. A private fix per gate is how two gates come to disagree about what was
// staged, so F1 does not add more of them. It moves the stamp to the head of the attempt loop:
//
//   THE STANDING RULE: one function stamps a payload; every gate reads that payload's stamp.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── where the stamp is taken ────────────────────────────────────────────────────────────────────

Deno.test("F1. the stamp is taken at the loop head, ABOVE runGates, INSIDE the attempt loop", async () => {
  const src = await read("./publicReadPerKind.ts");
  const loopAt = src.indexOf("for (;;) {");
  const stampAt = src.indexOf("await deps.stampPayload?.(kind, payload);");
  const gatesAt = src.indexOf("const g = await runGates(kind, payload);");
  assert(loopAt > 0 && stampAt > 0 && gatesAt > 0, "all three sites exist");
  assert(stampAt > loopAt, "the stamp is INSIDE the attempt loop — outside it, attempt 2 reuses attempt 1's");
  assert(stampAt < gatesAt, "and ABOVE runGates: it may admit sourcing rows and append citations, so it must precede the citation guards");
  // and it is the FIRST statement of the loop body — nothing may run against an unstamped payload
  const body = src.slice(loopAt + "for (;;) {".length, gatesAt);
  const stmts = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//"));
  assertEquals(stmts, ["await deps.stampPayload?.(kind, payload);"],
    "the loop head does nothing else before the stamp");
});

Deno.test("F1. the loop-head stamp is UNCONDITIONAL — nothing exempts a re-asked payload", async () => {
  const src = await read("./publicReadPerKind.ts");
  const line = src.split("\n").find((l) => l.includes("deps.stampPayload?.(kind, payload)"))!;
  assertEquals(line.trim(), "await deps.stampPayload?.(kind, payload);",
    "a condition here — `if (!reasked)` above all — is exactly how an N1c re-ask stages on a stale stamp");
  // the per-kind loop stamps once per attempt, so N kinds × 2 attempts is the ceiling, not N
  const calls = [...src.matchAll(/deps\.stampPayload\?\.\(/g)].length;
  assertEquals(calls, 1, "one call site");
});

// ── one stamping function, and only one ─────────────────────────────────────────────────────────

Deno.test("F1. exactly ONE function stamps, and the loop head is its only caller", async () => {
  const src = await read("../generate-public-read/index.ts");
  // stampFieldClasses is called from inside stampAndDecide and nowhere else
  const callers = [...src.matchAll(/stampFieldClasses\(/g)].length;
  assertEquals(callers, 2, "the declaration and the single call inside stampAndDecide");
  // and stampAndDecide is reached only through the F1 dep
  const invocations = [...src.matchAll(/await stampAndDecide\(/g)].map((m) => m.index!);
  assertEquals(invocations.length, 1, "one invocation — not one per re-ask branch");
  const stampDep = src.indexOf("stampPayload: async (kind, payload) => {");
  assert(stampDep > 0, "the dep exists");
  assert(invocations[0] > stampDep && invocations[0] < src.indexOf("\n      },", stampDep),
    "and that one invocation is inside the stampPayload dep");
});

Deno.test("F1. a fresh stamp OVERWRITES — neither map is preserved across attempts", async () => {
  const src = await read("../generate-public-read/index.ts");
  // `fieldClasses[kind] = fieldClasses[kind] ?? stamped` would keep attempt 1's lines in front of
  // C1 and C2 forever; the same shape on classDecisions would keep them in front of the judge.
  for (const map of ["fieldClasses", "classDecisions"]) {
    const assigns = [...src.matchAll(new RegExp(`${map}\\[kind\\] = ([^;]+);`, "g"))].map((m) => m[1]);
    assertEquals(assigns.length, 1, `${map} is assigned at one site`);
    assert(!assigns[0].includes("??") && !assigns[0].includes(map),
      `${map} is replaced, not merged or preserved: got "${assigns[0]}"`);
  }
});

Deno.test("F1. `generate` does not stamp — it runs once, before the loop", async () => {
  const src = await read("../generate-public-read/index.ts");
  const gen = src.slice(src.indexOf("generate: async (kind) => {"));
  const body = gen.slice(0, gen.indexOf("\n      judge: async (kind, payload) => {"));
  assert(!body.includes("stampAndDecide"), "a stamp here belongs to attempt 1 for the rest of the run");
  assert(!body.includes("stampFieldClasses("), "nor a private one");
});

Deno.test("F1. no re-ask branch stamps for itself — each returns, and the loop head stamps", async () => {
  const src = await read("../generate-public-read/index.ts");
  for (const dep of ["reaskOnSourcingRefusal: async (kind, payload, detail, because) => {",
                     "reaskOnClassRefusal: async (kind, payload, verdict) => {"]) {
    const at = src.indexOf(dep);
    assert(at > 0, `${dep.slice(0, 24)} exists`);
    const body = src.slice(at, src.indexOf("\n      },", at));
    assert(!body.includes("stampAndDecide"), `${dep.slice(0, 24)} must not stamp — the loop head does`);
    assert(!body.includes("stampFieldClasses("), `${dep.slice(0, 24)} must not take a private stamp either`);
  }
});

Deno.test("F1. S1 READS the stamp — the one gate that had a private fix no longer keeps it", async () => {
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("s1Refusal: (kind, _payload) => {");
  assert(at > 0, "the closure no longer needs the payload — it reads the stamp of it");
  const body = src.slice(at, src.indexOf("\n      validRefs,", at));
  assert(body.includes("const stamped = fieldClasses[kind as Kind] ?? [];"), "it reads fieldClasses");
  assert(!body.includes("stampFieldClasses("), "and takes no stamp of its own");
});

// ── every reader reads the stamp of the payload in front of it (the F2 census) ──────────────────

Deno.test("F2. every reader of either map sits downstream of the loop-head stamp", async () => {
  const src = await read("../generate-public-read/index.ts");
  const lines = src.split("\n");
  // the census: which enclosing site each reader belongs to. A reader inside `generate` would read
  // the stamp of a payload that may since have been replaced; everything else runs per attempt,
  // after the loop head has stamped.
  const generateAt = src.indexOf("generate: async (kind) => {");
  const generateEnd = src.indexOf("\n      judge: async (kind, payload) => {");
  const readers: number[] = [];
  lines.forEach((l, i) => {
    if (/^\s*\/\//.test(l)) return;                                  // comments are not readers
    if (!/fieldClasses\[|classDecisions\[/.test(l)) return;
    if (/fieldClasses\[kind\] = |classDecisions\[kind\] = /.test(l)) return;   // the writer
    readers.push(src.split("\n").slice(0, i).join("\n").length);
  });
  assert(readers.length >= 8, `the census found ${readers.length} readers — expected the eight known ones or more`);
  for (const at of readers) {
    assert(!(at > generateAt && at < generateEnd),
      `a reader inside \`generate\` reads a stamp that a re-ask can invalidate (offset ${at})`);
  }
});

Deno.test("F2. C1/C1-S and C2 read the SAME stamped lines, and nothing else", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("const stagedLines: CitedLine[] = (fieldClasses[kind] ?? []).map((f) => ({"),
    "stagedLines is built from the stamp");
  const fin = src.slice(src.indexOf("const stagedLines: CitedLine[]"));
  const body = fin.slice(0, fin.indexOf("const built = prepareStorage("));
  assert(/const softened = stagedLines\.flatMap/.test(body), "C2 softens the stamped lines");
  assert(/currentLines, stagedLines,/.test(body), "and C1/C1-S classify against the same ones");
  // one assembly: C2 and C1 cannot be handed different views of the staged read
  assertEquals([...body.matchAll(/stagedLines/g)].length, 3, "declared once, read by C2 and by C1");
});

Deno.test("F2. the judge's FIELD CLASSES block comes from the stamp of the payload it is judging", async () => {
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("judge: async (kind, payload) => {");
  const body = src.slice(at, src.indexOf("\n      accepts:", at));
  assert(body.includes("const decs = classDecisions[kind as Kind] ?? [];"), "it reads classDecisions");
  assert(body.includes("FIELD CLASSES (computed from each field's citations, weakest-wins)"),
    "and that is what the block is built from");
  // The judge runs inside runGates, which the loop head calls AFTER stamping. runGates is declared
  // above the loop, so textual order says nothing here — what matters is that the judge call lives
  // inside runGates and that the only call to runGates is below the stamp.
  const perKind = await read("./publicReadPerKind.ts");
  const gatesDecl = perKind.indexOf("const runGates = async (kind: string, payload:");
  const gatesEnd = perKind.indexOf("\n  for (const kind of kinds) {");
  const judgeAt = perKind.indexOf("verdict = await deps.judge(kind, payload);");
  assert(judgeAt > gatesDecl && judgeAt < gatesEnd, "the judge is called inside runGates");
  const stampAt = perKind.indexOf("await deps.stampPayload?.(kind, payload);");
  const gatesCalls = [...perKind.matchAll(/await runGates\(kind, payload\)/g)].map((m) => m.index!);
  assertEquals(gatesCalls.length, 1, "runGates has one call site");
  assert(gatesCalls[0] > stampAt, "and it is below the stamp, so the judge never sees another payload's classes");
});

Deno.test("F1. a gate that reads the stamp cannot run unstamped — the run refuses instead", async () => {
  const src = await read("./publicReadPerKind.ts");
  assert(src.includes("if (deps.s1Refusal && !deps.stampPayload) {"),
    "S1 reads fieldClasses now, so a caller without stampPayload would give it an empty stamp");
  assert(src.includes('throw new Error("runKindsIsolated: s1Refusal reads the class stamp, so stampPayload is required (F1)")'),
    "and an empty stamp means S1 finds no fields and clears everything — a vacuous gate refuses the run");
  // it is checked ONCE, before the kinds loop, not per kind
  assert(src.indexOf("if (deps.s1Refusal && !deps.stampPayload) {") < src.indexOf("for (const kind of kinds) {"),
    "checked before any kind runs");
});

// ── the two re-ask paths both return to the stamp ───────────────────────────────────────────────

Deno.test("F1. the N1c re-ask returns to the loop head, so its answer is stamped before it is gated", async () => {
  const src = await read("./publicReadPerKind.ts");
  const loop = src.slice(src.indexOf("for (;;) {"));
  const at = loop.indexOf("if (g.sourcingDetail !== undefined && !reasked");
  const branch = loop.slice(at, loop.indexOf("\n        }", at));
  assert(/payload = next; reasked = true; continue;/.test(branch), "it continues to the loop head");
  assert(!/deps\.commit/.test(branch), "it never commits its own answer");
  assert(!/runGates/.test(branch), "nor gates it directly, which would skip the stamp");
});

Deno.test("F1. the C1-R re-ask returns to the loop head too — same stamp, same gates", async () => {
  const src = await read("./publicReadPerKind.ts");
  const loop = src.slice(src.indexOf("for (;;) {"));
  const at = loop.indexOf("if (refusal?.guard === CONTINUITY_GUARD && !reasked");
  assert(at > 0, "the continuity branch exists");
  const branch = loop.slice(at, loop.indexOf("await reject(", at));
  assert(/if \(next\) \{ payload = next; reasked = true; continue; \}/.test(branch),
    "it continues to the loop head, where the stamp is taken");
  assert(!/deps\.commit/.test(branch),
    "committing here would stage the second answer with neither a fresh stamp nor a gate — the 8ef4dc7b failure, by a shorter route");
  assert(!/runGates/.test(branch), "nor may it gate directly");
});
