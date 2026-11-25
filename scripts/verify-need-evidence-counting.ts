// SP-429 step 5 — recompute SP-406 counting for N1–N15 from STORED need_evidence rows and compare
// with charter-needs-status-v3.md, the file-generated table it must reproduce.
import { tallyNeed, type EvidenceRow } from "../src/lib/needEvidenceCounting.ts";
import { loadNeedKeys } from "./needKeys.ts";

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

// stored rows: the label plus the signal's own date and url. SP-565: grouped by need ID and matched to
// the published table on its N-key through the key file — never on the need's sentence, which the
// table prints as it read on the day it was published and the database may since have edited.
const needKeys = await loadNeedKeys(COMPANY);
const rows = await psql(`
  select e.need_id, e.bears, coalesce(e.polarity,''), e.brand,
         coalesce(to_char(s.event_date,'YYYY-MM-DD'),''), coalesce(s.source_url,'')
  from public.need_evidence e
  join public.signals s on s.id = e.signal_id
  where e.company_id = '${COMPANY}'`);

const byNeed = new Map<string, EvidenceRow[]>();
for (const [needId, bears, polarity, brand, eventDate, sourceUrl] of rows) {
  (byNeed.get(needId) ?? byNeed.set(needId, []).get(needId)!).push({
    bears: bears === "t", polarity: polarity || null, brand,
    eventDate: eventDate || null, sourceUrl: sourceUrl || null,
  });
}

// the published table: "| N1 <outcome> | sp | cox | u | under | 8 / 4 | **yes** |"
const md = await Deno.readTextFile(STATUS_MD);
const expected = new Map<string, { counted: number; sites: number; meets: boolean; outcome: string }>();
for (const line of md.split("\n")) {
  const m = line.match(/^\| (N\d+) (.+?) \| [^|]+ \| [^|]+ \| [^|]+ \| [^|]+ \| (\d+) \/ (\d+) \| (.+?) \|$/);
  if (!m) continue;
  expected.set(m[1], { outcome: m[2].trim(), counted: Number(m[3]), sites: Number(m[4]), meets: /yes/.test(m[5]) });
}

console.log(`parsed ${expected.size} N-rows from charter-needs-status-v3.md\n`);
console.log("need | stored counted/sites meets | published counted/sites meets | match");
let ok = 0, bad = 0;
for (const [key, exp] of [...expected.entries()].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))) {
  const rs = byNeed.get(needKeys.idOf(key) ?? "");
  if (!rs) { console.log(`${key}\tNO STORED ROWS for ${key} ("${exp.outcome.slice(0, 40)}…")`); bad++; continue; }
  const t = tallyNeed(rs);
  const same = t.counted === exp.counted && t.sites.length === exp.sites && t.meets === exp.meets;
  if (same) ok++; else bad++;
  console.log(`${key}\t${t.counted}/${t.sites.length} ${t.meets ? "yes" : "no "}\t|\t${exp.counted}/${exp.sites} ${exp.meets ? "yes" : "no "}\t| ${same ? "OK" : "*** MISMATCH"}`);
}
console.log(`\nmatched: ${ok} of ${expected.size}   mismatched: ${bad}`);
if (bad > 0) Deno.exit(1);
console.log("STEP 5: stored need_evidence rows reproduce charter-needs-status-v3.md EXACTLY for N1–N15.");
