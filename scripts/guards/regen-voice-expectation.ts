#!/usr/bin/env -S deno run --allow-all
// R17 guard v3 — the PER-URL expectation of the regen voice authority over the b3 plan's in-scope URLs.
//
//   deno run --allow-all scripts/guards/regen-voice-expectation.ts --plan=<b3plan-r10.tsv>            compare to the fixture; exit 1 on any difference
//   deno run --allow-all scripts/guards/regen-voice-expectation.ts --plan=<b3plan-r10.tsv> --update   rewrite the fixture (an operator act — review the diff)
//
// For every non-excluded plan row: the newest ok snapshot and the company's name/website are read (docker psql,
// read-only), and planVoiceFor — the SAME function the handler's plan reports — decides (class, authority) with
// no judge: a gated URL is expected as "gated". The fixture is scripts/guards/fixtures/regen-voice-expected.tsv.
// No write, no model, no network.
import { planVoiceFor } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { classifyRegistryRow } from "../../supabase/functions/_shared/registryClassifier.ts";
import { normalizeHost } from "../../supabase/functions/_shared/firstReadProvenance.ts";

const arg = (k: string) => Deno.args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const planPath = arg("plan"); const update = Deno.args.includes("--update");
if (!planPath) { console.error("required: --plan=<tsv>"); Deno.exit(2); }
const FIXTURE = new URL("./fixtures/regen-voice-expected.tsv", import.meta.url);
const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
async function psql(sql: string): Promise<string> {
  const c = new Deno.Command("docker", { args: ["exec", "-i", DB, "psql", "-U", "postgres", "-d", "postgres", "-At"], stdin: "piped", stdout: "piped", stderr: "piped" });
  const p = c.spawn(); const w = p.stdin.getWriter(); await w.write(new TextEncoder().encode(sql)); await w.close();
  const out = await p.output(); if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
  return new TextDecoder().decode(out.stdout).trim();
}

const lines = (await Deno.readTextFile(planPath)).split("\n").filter((l) => l.includes("\t"));
const hdr = lines[0].split("\t"); const col = (n: string) => hdr.indexOf(n);
const rows = lines.slice(1).map((l) => l.split("\t")).filter((f) => !(f[col("exclude")] ?? "")).map((f) => ({ company: f[col("company")], url: f[col("url")] }));
const cos = JSON.parse(await psql("select coalesce(json_agg(json_build_object('id', id, 'name', name, 'website', website)),'[]') from companies;")) as Array<{ id: string; name: string; website: string | null }>;
const coByName = new Map(cos.map((c) => [c.name, c]));
const out: string[] = [];
for (const r of rows) {
  const co = coByName.get(r.company); if (!co) { out.push([r.company, r.url, "(no company)", "(none)"].join("\t")); continue; }
  const host = (() => { try { return normalizeHost(new URL(co.website ?? "").hostname) || null; } catch { return null; } })();
  const snap = JSON.parse(await psql(`select coalesce(row_to_json(t)::text,'null') from (select clean_text, text_sha256, structured from outside_page_snapshots where company_id='${co.id}' and source_url='${r.url.replace(/'/g, "''")}' and fetch_status='ok' and clean_text is not null and length(clean_text)>0 order by crawled_at desc limit 1) t;`)) as { clean_text: string; text_sha256: string; structured: unknown } | null;
  if (!snap) { out.push([r.company, r.url, "(no snapshot)", "(none)"].join("\t")); continue; }
  const reg = classifyRegistryRow({ url: r.url, text: "", snapshot: snap });
  const v = planVoiceFor(r.url, snap.clean_text, { name: co.name, host }, reg);
  const cls = v.authority === "authorship_judge" ? "gated" : v.class;
  out.push([r.company, r.url, cls, v.authority].join("\t"));
}
const text = "company\turl\tclass\tauthority\n" + out.join("\n") + "\n";
if (update) { await Deno.writeTextFile(FIXTURE, text); console.log(`fixture written: ${out.length} rows`); Deno.exit(0); }
const expected = (await Deno.readTextFile(FIXTURE)).split("\n").filter((l) => l.includes("\t")).slice(1);
const exp = new Map(expected.map((l) => { const f = l.split("\t"); return [f[1], `${f[2]}\t${f[3]}`]; }));
const got = new Map(out.map((l) => { const f = l.split("\t"); return [f[1], `${f[2]}\t${f[3]}`]; }));
const diffs: string[] = [];
for (const [u, e] of exp) { const g = got.get(u); if (g === undefined) diffs.push(`missing now: ${u} (expected ${e})`); else if (g !== e) diffs.push(`${u}: expected ${e} got ${g}`); }
for (const u of got.keys()) if (!exp.has(u)) diffs.push(`new, not in fixture: ${u} (${got.get(u)})`);
const tally: Record<string, number> = {}; for (const v of got.values()) tally[v.split("\t")[0]] = (tally[v.split("\t")[0]] ?? 0) + 1;
console.log(`compared ${got.size} url(s) to ${exp.size} expected · ${JSON.stringify(tally)} · differences: ${diffs.length}`);
for (const d of diffs) console.log("  " + d);
Deno.exit(diffs.length ? 1 : 0);
