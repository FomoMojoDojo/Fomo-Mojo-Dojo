// ── (a) HOTSPOTS, (d) THIN SPOTS AND THE AT-THE-BAR MARK, AGAINST THE PUBLISHED TABLE ────────────
// SP-445 / SP-447 acceptance: the Brief's band assignment is recomputed from STORED need_evidence
// rows with the SAME modules the page renders from (briefSections + needEvidenceCounting), and
// compared row by row with charter-needs-status-v3.md — the hand-generated table the operator has
// already read. A mismatch is a difference between what the page will show and what was published.
import { tallyNeed, type EvidenceRow } from "../src/lib/needEvidenceCounting.ts";
import { loadNeedKeys } from "./needKeys.ts";
import { hotspots, isAtTheBar, thinSpots, whatWorks, polarityTotals } from "../src/lib/briefSections.ts";

const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const COMPANY = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
// v3 (2026-11-23): v2 with N13 rebuilt from stored rows after SP-591 (wording) and SP-602 (links).
// Every other need's row is v2's. v2 is kept, unchanged, beside gen-needs-status-v2.mjs.
const STATUS_MD = "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-23/charter-needs-status-v3.md";

async function psql(sql: string): Promise<string[][]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}

const rows = await psql(`
  select e.need_id, e.bears, coalesce(e.polarity,''), e.brand,
         coalesce(to_char(s.event_date,'YYYY-MM-DD'),''), coalesce(s.source_url,'')
  from public.need_evidence e
  join public.odi_needs n on n.id = e.need_id
  join public.signals s on s.id = e.signal_id
  where e.company_id = '${COMPANY}' and n.status = 'active'`);

// SP-565: everything below is keyed by need ID. The published table is matched on its N-key through
// the key file, never on the need's sentence.
const needKeys = await loadNeedKeys(COMPANY);
const byNeed = new Map<string, EvidenceRow[]>();
for (const [needId, bears, polarity, brand, eventDate, sourceUrl] of rows) {
  (byNeed.get(needId) ?? byNeed.set(needId, []).get(needId)!).push({
    bears: bears === "t", polarity: polarity || null, brand,
    eventDate: eventDate || null, sourceUrl: sourceUrl || null,
  });
}

const tallied = [...byNeed].map(([id, ev]) => ({ need: { id }, tally: tallyNeed(ev) }));
const hot = hotspots(tallied), thin = thinSpots(tallied), works = whatWorks(tallied);

// the published table: "| N1 <outcome> | sp | cox | u | under | 8 / 4 | **yes** |"
const published = new Map<string, { id: string; counted: number; sites: number; meets: boolean }>();
for (const line of (await Deno.readTextFile(STATUS_MD)).split("\n")) {
  const m = line.match(/^\| (N\d+) (.+?) \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| (\d+) \/ (\d+) \| (.+?) \|$/);
  if (!m) continue;
  published.set(needKeys.idOf(m[1]) ?? m[1], { id: m[1], counted: Number(m[3]), sites: Number(m[4]), meets: /yes/i.test(m[5]) });
}

const band = new Map<string, string>();
for (const r of hot) band.set(r.need.id, "HOTSPOT");
for (const r of thin) band.set(r.need.id, "THIN");
const working = new Map(works.map((r) => [r.need.id, r.working]));

let ok = 0, bad = 0;
const lines: string[] = [];
for (const [needId, p] of [...published].sort((a, b) => Number(a[1].id.slice(1)) - Number(b[1].id.slice(1)))) {
  const t = byNeed.has(needId) ? tallyNeed(byNeed.get(needId)!) : null;
  if (!t) { bad++; lines.push(`${p.id.padEnd(4)} MISSING from stored rows`); continue; }
  const b = band.get(needId) ?? "—";
  const agree = t.counted === p.counted && t.sites.length === p.sites && t.meets === p.meets
    && ((b === "HOTSPOT") === p.meets) && ((b === "THIN") === !p.meets);
  if (agree) ok++; else bad++;
  const w = working.get(needId) ?? 0;
  const pol = polarityTotals(t);
  lines.push([
    p.id.padEnd(4),
    `stored ${String(t.counted).padStart(2)}/${t.sites.length}`,
    `published ${String(p.counted).padStart(2)}/${p.sites}`,
    `meets ${t.meets ? "yes" : "no "} / ${p.meets ? "yes" : "no "}`,
    `band ${b.padEnd(7)}`,
    isAtTheBar(t) ? "AT-THE-BAR" : "          ",
    `w/n/m ${pol.working}/${pol.notWorking}/${pol.mixed}`,
    w > 0 ? `WHAT-WORKS ${w}` : "",
    agree ? "OK" : "MISMATCH",
  ].join("  "));
}
console.log(lines.join("\n"));
console.log(`\nmatched ${ok} of ${published.size}, mismatched ${bad}`);
console.log(`bands: hotspots ${hot.length} · what works ${works.length} · thin spots ${thin.length} (of ${tallied.length} active needs)`);
if (bad > 0) Deno.exit(1);
