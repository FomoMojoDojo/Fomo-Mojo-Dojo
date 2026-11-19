// SP-426 slice 1 — backfill signals.content_identity, IN TYPESCRIPT.
//
// The value must be byte-identical to what the mint path writes, so this script imports the one
// authority (_shared/contentIdentity.ts) rather than re-implementing the rule. A SQL backfill was
// rejected by the standing PCT-1 ruling: Postgres POSIX \s diverges from JS \s on Unicode
// whitespace, so a SQL UPDATE would write a DIFFERENT identity for any excerpt containing an NBSP.
//
// CB1 (58b2b15b, Cafe Barra) IS NEVER WRITTEN (SP-426). Its rows keep content_identity NULL, and
// every counter treats NULL as "no identity" — the row counts once, on its own id — so CB1's counts
// are byte-unchanged by this slice.
//
//   deno run -A scripts/backfill-signal-content-identity.ts            # dry run, writes nothing
//   deno run -A scripts/backfill-signal-content-identity.ts --apply    # writes
import { signalContentIdentity } from "../supabase/functions/_shared/contentIdentity.ts";

const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const APPLY = Deno.args.includes("--apply");
// --all re-stamps every non-CB1 row, not only the NULL ones (used to repair a bad run).
const ONLY_NULL = !Deno.args.includes("--all");

async function psql(sql: string): Promise<string> {
  const p = new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  });
  const { code, stdout, stderr } = await p.output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout);
}
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";

// Read every row that needs an identity. The excerpt is base64'd in SQL so tabs and newlines inside
// it cannot break the row framing of the -F '\t' output.
const raw = await psql(`
  select s.id, replace(encode(convert_to(coalesce(s.evidence_excerpt,''), 'UTF8'), 'base64'), chr(10), '')
  from public.signals s
  where s.company_id <> ${q(CB1)}${ONLY_NULL ? " and s.content_identity is null" : ""}
  order by s.id`);

const rows = raw.split("\n").filter((l) => l.trim() !== "").map((l) => {
  const parts = l.split("\t");
  if (parts.length !== 2) {
    throw new Error(`unparseable row (${parts.length} fields, expected 2) — base64 line wrapping?: ${l.slice(0, 60)}`);
  }
  const [id, b64] = parts;
  return { id, excerpt: new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))) };
});

let withIdentity = 0, blank = 0;
const updates: Array<{ id: string; ci: string }> = [];
for (const r of rows) {
  const ci = signalContentIdentity({ evidence_excerpt: r.excerpt });
  if (ci === null) { blank++; continue; }
  withIdentity++;
  updates.push({ id: r.id, ci });
}

console.log(`rows needing an identity (CB1 excluded): ${rows.length}`);
console.log(`  would write an identity: ${withIdentity}`);
console.log(`  blank excerpt, left NULL: ${blank}`);
console.log(`  distinct identities among them: ${new Set(updates.map((u) => u.ci)).size}`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); Deno.exit(0); }

// Write in batches, as one UPDATE ... FROM (values ...) per batch.
let done = 0;
for (let i = 0; i < updates.length; i += 500) {
  const batch = updates.slice(i, i + 500);
  const values = batch.map((u) => `(${q(u.id)}::uuid, ${q(u.ci)})`).join(",");
  await psql(`update public.signals s set content_identity = v.ci
              from (values ${values}) as v(id, ci)
              where s.id = v.id and s.company_id <> ${q(CB1)}`);
  done += batch.length;
  console.log(`  wrote ${done}/${updates.length}`);
}
console.log(`\nAPPLIED: ${done} rows stamped.`);
