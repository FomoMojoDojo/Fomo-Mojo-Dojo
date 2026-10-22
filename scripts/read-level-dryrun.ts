#!/usr/bin/env -S deno run --allow-all
// ── READ-LEVEL DRY RUN (ruling 14, 2026-10-22) — L1–L4 over every CURRENT read, fleet-wide, read-only, no model ───────
// The same pure function the stage gate and promote call (readLevel.levelHits), against each company's CURRENT offering
// read. One READ ONLY transaction; prints one TSV line per hit and a per-company summary.
//   deno run --allow-all scripts/read-level-dryrun.ts [--out=<file.tsv>]
import { PsqlSession } from "./lib/psqlBlankingStore.ts";
import { levelHits, levelItemsOfOfferingPayload, type LevelKind } from "../supabase/functions/_shared/readLevel.ts";
import { linesOfStoredPayload } from "../supabase/functions/_shared/citedLines.ts";

const out = Deno.args.find((a) => a.startsWith("--out="))?.slice(6);
const s = new PsqlSession();
await s.exec("begin read only;");
const rows = await s.query<{ company_id: string; name: string; kind: string; id: string; payload: Record<string, unknown> }>(
  `select r.company_id, c.name, r.kind, r.id, r.payload from public_reads r join companies c on c.id=r.company_id where r.is_current order by c.name, r.kind`);
await s.exec("rollback;");
await s.close();
const by = new Map<string, { name: string; reads: Record<string, { id: string; payload: Record<string, unknown> }> }>();
for (const r of rows) { const e = by.get(r.company_id) ?? { name: r.name, reads: {} }; e.reads[r.kind] = { id: r.id, payload: r.payload }; by.set(r.company_id, e); }
const lines: string[] = ["company\tkind\tread\tfield\tcheck\tmode\toffering_items\ttext"];
const summary: string[] = [];
for (const [, c] of by) {
  const items = levelItemsOfOfferingPayload(c.reads.offering?.payload ?? null);
  const counts: Record<string, number> = {};
  for (const kind of ["positioning", "promise", "strategy"] as LevelKind[]) {
    const r = c.reads[kind]; if (!r) continue;
    for (const h of levelHits(kind, linesOfStoredPayload(r.payload), items, c.name)) {
      lines.push([c.name, kind, r.id.slice(0, 8), h.field || "promise", h.check, h.refuses ? "refuse" : "log", h.items.join(" | "), h.text.replace(/\s+/g, " ").slice(0, 140)].join("\t"));
      const k = `${h.check}${h.refuses ? "r" : ""}`; counts[k] = (counts[k] ?? 0) + 1;
    }
  }
  summary.push(`${c.name}\toffering_items=${items.length}\t${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ") || "—"}`);
}
if (out) await Deno.writeTextFile(out, lines.join("\n") + "\n");
console.log(lines.join("\n")); console.log("---"); console.log(summary.join("\n"));
console.log(`companies=${by.size} reads=${rows.length} hits=${lines.length - 1}`);
