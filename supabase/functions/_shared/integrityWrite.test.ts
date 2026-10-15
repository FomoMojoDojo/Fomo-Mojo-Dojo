// ── A1 (operator ruling, 2026-10-15): THE AUDIT-WRITE CENSUS ────────────────────────────────────
//
// WHY. generate-read-slots wrote its stage-time audit row with status "ok", which
// integrity_runs_status_check does not allow (completed|failed|skipped_empty_input|planned|
// rejected), in a bare insert whose { error } was never read. Every ACCEPTED slot stage therefore
// failed its audit write silently, and the refusal path kept working because "rejected" IS legal —
// which is exactly what hid it. Across all time the table held 14 'rejected' slot rows and 2
// 'completed' ones, both from the SIGNING path: not one successful stage had ever been audited.
// Wasabi's stage on 2026-10-15 burned id 10533 the same way.
//
// This file is the census, kept as a test so a NEW site cannot reintroduce either fault.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { IntegrityWriteRefused, insertIntegrityRun } from "./integrityWrite.ts";

/** The statuses integrity_runs_status_check allows. Mirrored from the migration, not inferred. */
const LEGAL = new Set(["completed", "failed", "skipped_empty_input", "planned", "rejected"]);

const ROOTS = ["..", "../../../scripts"];

async function* sources(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) { yield* sources(p); continue; }
    if (!/\.(ts|mjs)$/.test(e.name) || e.name.includes(".test.")) continue;
    yield p;
  }
}

type Site = { file: string; line: number; stmt: string; window: string };

/** The insert's own argument object, by brace matching from the line it starts on. */
function statementAt(lines: readonly string[], i: number): string {
  const text = lines.slice(i, i + 60).join("\n");
  const open = text.indexOf("{");
  if (open < 0) return lines[i];
  let depth = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === "{") depth++;
    else if (text[k] === "}") { depth--; if (depth === 0) return text.slice(open, k + 1); }
  }
  return text;
}

async function auditInsertSites(): Promise<Site[]> {
  const out: Site[] = [];
  for (const root of ROOTS) {
    let exists = true;
    try { await Deno.stat(new URL(root, import.meta.url)); } catch { exists = false; }
    if (!exists) continue;
    for await (const f of sources(new URL(root, import.meta.url).pathname)) {
      const src = await Deno.readTextFile(f);
      const lines = src.split("\n");
      lines.forEach((l, i) => {
        // A site is a RAW insert or a call to the one helper — both write the row, and the census
        // must see both or converting a site would simply remove it from the count.
        const raw = /from\(["']integrity_runs["']\)/.test(l) &&
          lines.slice(i, i + 3).join("\n").includes(".insert(");
        const viaHelper = l.includes("insertIntegrityRun(") && !l.trim().startsWith("import") &&
          !l.includes("export async function");
        if (!raw && !viaHelper) return;
        out.push({
          file: f.replace(/^.*\/supabase\//, "supabase/").replace(/^.*\/scripts\//, "scripts/"),
          line: i + 1,
          stmt: lines.slice(Math.max(0, i - 1), i + 1).join("\n"),
          // THE STATEMENT ITSELF, brace-matched. A fixed line count runs past the insert into
          // whatever follows — a 30-line window read `status: "empty"` out of an HTTP response four
          // lines below one of these and called it an illegal column value.
          window: statementAt(lines, i),
        });
      });
    }
  }
  return out;
}

// ── the helper itself ───────────────────────────────────────────────────────────────────────────

Deno.test("A1. the helper reads { error } and throws a NAMED refusal", async () => {
  let got: unknown = null;
  const fake = { from: () => ({ insert: (_r: unknown) => Promise.resolve({ error: { message: "nope" } }) }) };
  try { await insertIntegrityRun(fake, { component: "c", status: "completed" }); } catch (e) { got = e; }
  assert(got instanceof IntegrityWriteRefused, "a refused insert throws IntegrityWriteRefused");
  const err = got as IntegrityWriteRefused;
  assertEquals(err.component, "c");
  assertEquals(err.status, "completed");
  assert(err.message.includes("nope"), "and carries the database's own words");
  // the happy path returns quietly
  const ok = { from: () => ({ insert: (_r: unknown) => Promise.resolve({ error: null }) }) };
  await insertIntegrityRun(ok, { component: "c", status: "completed" });
});

Deno.test("A1. a NAMED refusal is catchable on its own — a site that must survive says so", () => {
  const e = new IntegrityWriteRefused("first_read_slot_positioning", "completed", "boom");
  assert(e instanceof Error);
  assertEquals(e.name, "IntegrityWriteRefused");
  assert(!(new Error("boom") instanceof IntegrityWriteRefused),
    "an ordinary Error is NOT one, so `if (e instanceof IntegrityWriteRefused) throw e` re-throws only this");
});

// ── the census ──────────────────────────────────────────────────────────────────────────────────

Deno.test("A1. EVERY integrity_runs insert reads its error", async () => {
  const sites = await auditInsertSites();
  assert(sites.length >= 38, `the census found ${sites.length} sites — expected the ~40 known ones`);
  const ignoring = sites.filter((s) =>
    !/\{\s*[^}]*\berror\b/.test(s.stmt) &&            // const { error } / { data, error }
    !/\b\w*Err\b/.test(s.stmt) &&                      // const { error: intErr }
    !/insertIntegrityRun\(/.test(s.stmt)               // or it goes through the helper
  );
  assertEquals(ignoring.map((s) => `${s.file}:${s.line}`), [],
    "a bare insert whose error is never read is how an accepted slot stage went unaudited for weeks");
});

Deno.test("A1. no integrity_runs insert writes a status the CHECK constraint refuses", async () => {
  const sites = await auditInsertSites();
  const bad: string[] = [];
  for (const s of sites) {
    for (const m of s.window.matchAll(/status:\s*(?:[\w.]+\s*\?\s*)?["']([^"']+)["']\s*(?::\s*["']([^"']+)["'])?/g)) {
      for (const v of [m[1], m[2]]) {
        if (!v || LEGAL.has(v)) continue;
        // `status` keys inside a nested excluded_by_rule / response body are not the column
        if (!/status:\s*(?:[\w.]+\s*\?\s*)?["']/.test(m[0])) continue;
        bad.push(`${s.file}:${s.line} -> ${JSON.stringify(v)}`);
      }
    }
  }
  assertEquals(bad, [], `illegal status values: ${bad.join(", ")} (legal: ${[...LEGAL].join("|")})`);
});

Deno.test("A1. the slot stage writes 'completed' — the fault this ruling came from", async () => {
  const src = await Deno.readTextFile(new URL("../generate-read-slots/index.ts", import.meta.url));
  assert(src.includes('status: allAccepted ? "completed" : "rejected",'),
    "an accepted stage is 'completed'; 'ok' is not a status the table accepts");
  assert(!/status:\s*allAccepted\s*\?\s*"ok"/.test(src), "and 'ok' is gone");
  // and the write goes through the helper, so a future refusal is loud
  assert(src.includes("await insertIntegrityRun(supabase, {"), "through the one writer");
});

Deno.test("A1. no converted site re-silences the refusal in a bare catch", async () => {
  const sites: string[] = [];
  for await (const f of sources(new URL("..", import.meta.url).pathname)) {
    const lines = (await Deno.readTextFile(f)).split("\n");
    lines.forEach((l, i) => {
      if (!l.includes("insertIntegrityRun(") || l.trim().startsWith("import")) return;
      const back = lines.slice(Math.max(0, i - 14), i).join("\n");
      const fwd = lines.slice(i, i + 14).join("\n");
      if (!back.includes("try {")) return;
      const m = /\}\s*catch[^\n]*\{([^\n]*)\}/.exec(fwd);
      if (m && !/\bthrow\b/.test(m[1])) sites.push(`${f.replace(/^.*\/supabase\//, "supabase/")}:${i + 1}`);
    });
  }
  assertEquals(sites, [],
    "a catch that swallows IntegrityWriteRefused puts the hole straight back; re-throw it and swallow the rest");
});
