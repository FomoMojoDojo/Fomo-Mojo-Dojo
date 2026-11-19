// SP-433 step 6 — create PENDING outside-voice need cards on Charter. Accepts nothing.
//
// One card per proposed need that MEETS the SP-406 bar (3 counted reviews from 2 sites), carrying the
// signal ids of its COUNTED quotes only — undated Cox and pre-merger Cox are excluded by the same
// module the brief's counting uses, not by a second rule here.
//
// P4, P5 and P7 are NOT created: P4 fell below the bar under SP-406 (2 quotes / 2 sites), and P5 and
// P7 never met it. Nothing is accepted — accept is the operator's one click.
//
//   deno run -A scripts/create-outside-voice-need-cards.ts            # dry run
//   deno run -A scripts/create-outside-voice-need-cards.ts --apply
import { siteOf, tallyNeed, isCounted, type EvidenceRow } from "../src/lib/needEvidenceCounting.ts";
import { OUTSIDE_VOICE_SOURCE_PATH } from "../src/lib/outsideVoiceMark.ts";

const CORPUS = "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json";
const CORPUS_MD5 = "01c0997695d538d0c6d1613310ebbbbe";
const COMPANY = "dd40ce2f-ff67-4111-bd3c-67943dde6717";
const CREATE = ["P1", "P2", "P3", "P6", "P8"];           // the five that meet the bar
const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const APPLY = Deno.args.includes("--apply");

async function sh(cmd: string, args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout);
}
async function psql(sql: string) {
  const out = await sh("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql]);
  return out.split("\n").filter((l) => l.trim()).map((l) => l.split("\t"));
}
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";

const md5 = (await sh("md5", ["-q", CORPUS])).trim();
if (md5 !== CORPUS_MD5) { console.error(`REFUSED: corpus md5 ${md5} != ${CORPUS_MD5}`); Deno.exit(1); }
console.log(`corpus md5 ${md5} — matches`);

const corpus = JSON.parse(await Deno.readTextFile(CORPUS));
const needs: Record<string, string> = corpus.needs;
const labels: Array<{ signal_id: string; need: string; bears: boolean; polarity: string | null }> = corpus.labels;

// the signals' own date and url — the counting reads these, never a stored verdict
const sigRows = await psql(`select id, coalesce(to_char(event_date,'YYYY-MM-DD'),''), coalesce(source_url,''),
                                   (superseded_at is null and held_at is null)
                            from public.signals where company_id = ${q(COMPANY)}`);
const sig = new Map(sigRows.map(([id, d, u, live]) => [id, { eventDate: d || null, sourceUrl: u || null, live: live === "t" }]));

let created = 0;
for (const key of CREATE) {
  const outcome = needs[key];
  if (!outcome) { console.error(`REFUSED: ${key} is not in the corpus`); Deno.exit(1); }
  const bearing = labels.filter((l) => l.need === key && l.bears);
  const rows: Array<EvidenceRow & { id: string }> = bearing.map((l) => {
    const s = sig.get(l.signal_id);
    if (!s) { console.error(`REFUSED: ${key} cites signal ${l.signal_id}, which is not a Charter signal`); Deno.exit(1); }
    if (!s.live) { console.error(`REFUSED: ${key} cites ${l.signal_id}, which is superseded or held`); Deno.exit(1); }
    return { id: l.signal_id, bears: true, polarity: l.polarity, brand: corpus.quotes[l.signal_id]?.brand ?? "brand_not_recorded", eventDate: s.eventDate, sourceUrl: s.sourceUrl };
  });
  const t = tallyNeed(rows);
  if (!t.meets) { console.error(`REFUSED: ${key} does not meet the bar (${t.counted} quotes / ${t.sites.length} sites) — it must not become a card`); Deno.exit(1); }
  const countedIds = rows.filter(isCounted).map((r) => r.id);
  console.log(`\n${key} — ${t.counted} counted quotes · ${t.sites.length} sites: ${t.sites.join(", ")}`);
  console.log(`   "${outcome}"`);
  console.log(`   not counted: ${t.coxUndated} undated Cox, ${t.coxPreMerger} pre-merger Cox`);
  if (!APPLY) continue;
  const state = {
    item: { desired_outcome: outcome, importance: 0, satisfaction: 0, customer_validated: false },
    evidence_signal_ids: countedIds,
    evidence_voice: "outside",
    origin: OUTSIDE_VOICE_SOURCE_PATH,
  };
  const payload = {
    candidate_list: "outside_voice_read",
    proposed_need_key: key,
    counted_quotes: t.counted,
    sites: t.sites,
    rubric: "need-match-rubric-v4",
    counting: "SP-406",
    source_document: "charter-needs-status-v2.md",
    corpus_md5: CORPUS_MD5,
  };
  const [[id]] = await psql(`insert into public.surface_proposals (company_id, surface_type, proposed_state, status, reason, raw_payload)
    values (${q(COMPANY)}, 'candidate_need', ${q(JSON.stringify(state))}::jsonb, 'pending',
            ${q(`outside-voice read of ${t.counted} counted customer quotes on ${t.sites.length} sites (SP-433)`)},
            ${q(JSON.stringify(payload))}::jsonb)
    returning id`);
  console.log(`   CARD ${id}`);
  created++;
}
console.log(APPLY ? `\nAPPLIED: ${created} pending cards created. NONE accepted.` : "\nDRY RUN — nothing written.");
