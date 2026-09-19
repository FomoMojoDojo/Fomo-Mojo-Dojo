// Source guard (ruling M, 2026-09-19): no existing writer sets integrity_runs.system_scope — the flag is
// reserved for the company-agnostic acts the operator names (reference job maps). The DB-level guard
// (CHECK, planted by dropping it) lives in scripts/guards/integrity-system-scope-guard.sh.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function walk(dir: string, out: string[]) {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) { if (e.name !== "node_modules") await walk(p, out); continue; }
    if (/\.(ts|tsx|mjs)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p);
  }
}

Deno.test("no edge function or src writer sets system_scope; the migration declares the CHECK", async () => {
  const root = new URL("../../../", import.meta.url).pathname;
  const files: string[] = [];
  await walk(`${root}supabase/functions`, files);
  await walk(`${root}src`, files);
  const hits: string[] = [];
  for (const f of files) {
    if (f.endsWith("src/integrations/supabase/types.ts")) continue;
    const t = await Deno.readTextFile(f);
    if (/system_scope\s*:/.test(t)) hits.push(f.replace(root, ""));
  }
  assertEquals(hits, [], "writers setting system_scope");
  const mig = await Deno.readTextFile(`${root}supabase/migrations/20260919030000_integrity_runs_system_scope.sql`);
  assert(mig.includes("check (company_id is not null or system_scope)"), "the CHECK is declared by the migration");
  assert(mig.includes("alter column company_id drop not null"), "company_id nullable");
});
