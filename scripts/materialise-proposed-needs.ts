// ── SP-466 / SP-458: MATERIALISE EVERY PENDING NEED CARD WHOSE EVIDENCE MEETS THE BAR ────────────
//
// A STANDING RULE, not a one-off act. Re-running it is the normal case: it is idempotent on
// `odi_needs.source_proposal_id`, so a card already materialised is reported and skipped, and a card
// whose evidence has since crossed the bar is picked up on the next run.
//
// WHY A ROW HAS TO EXIST AT ALL. The Brief's counts come from `need_evidence`, whose foreign key is
// composite — need_evidence_need_fk (need_id, company_id) → odi_needs (id, company_id) — so a label
// cannot be stored against a card. Until the row exists the card's evidence is invisible to every
// count on the page, which is what SP-458 fixes: the two most-evidenced things customers said about
// Charter (P1, 43 counted quotes from 7 sites; P2, 11 from 6) were nowhere in the brief the operator
// takes into the room.
//
// WHAT IT WRITES. One odi_needs row per qualifying card, status 'proposed' (SP-467: the Brief is its
// only reader), source_proposal_id = the card. The row's shape is accept_candidate_proposal's own
// outside-voice arm, value for value — source_path 'outside_voice_read', provenance
// 'outside_review_derived', evidence_voice 'outside', the card's evidence_signal_ids, and NO
// service_state (SP-326). It does not write `need_evidence`: the labels are the frozen corpus's and
// `scripts/load-need-evidence.ts` is their one loader, md5-gated.
//
// THE BAR IS NOT RESTATED HERE. `tallyNeed` (src/lib/needEvidenceCounting.ts) decides, over the
// card's cited signals read from the database — their own date and source_url — so a card below the
// bar stays a card, by the same rule the Brief and the status file apply.
//
//   deno run -A scripts/materialise-proposed-needs.ts [--company=<uuid>]            # dry run
//   deno run -A scripts/materialise-proposed-needs.ts [--company=<uuid>] --apply
import { tallyNeed, type EvidenceRow } from "../src/lib/needEvidenceCounting.ts";

const arg = (n: string, d = "") => Deno.args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");
const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const APPLY = Deno.args.includes("--apply");

async function psql(sql: string): Promise<string[][]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}
const q = (s: string) => "'" + String(s).replaceAll("'", "''") + "'";

// the signals' own date, url and liveness — the counting reads these, never a stored verdict
const sigRows = await psql(`select id, coalesce(to_char(event_date,'YYYY-MM-DD'),''), coalesce(source_url,''),
  (superseded_at is null and held_at is null) from public.signals where company_id = ${q(COMPANY)}`);
const sig = new Map(sigRows.map(([id, d, u, live]) => [id, { eventDate: d || null, sourceUrl: u || null, live: live === "t" }]));
const brandRows = await psql(`select distinct signal_id, brand from public.need_evidence where company_id = ${q(COMPANY)}`);
const brandBy = new Map(brandRows.map(([s, b]) => [s, b]));

const cards = await psql(`select id, coalesce(proposed_state->'item'->>'desired_outcome',''),
  coalesce(proposed_state->>'evidence_signal_ids','[]'), coalesce(proposed_state->>'origin',''),
  coalesce(proposed_state->>'evidence_voice','unlabeled'), coalesce(proposed_state->>'journey_key','')
  from public.surface_proposals
  where company_id = ${q(COMPANY)} and status = 'pending' and surface_type = 'candidate_need'
  order by created_at`);

const already = new Map((await psql(`select source_proposal_id::text, id::text, status from public.odi_needs
  where company_id = ${q(COMPANY)} and source_proposal_id is not null`)).map(([pid, nid, st]) => [pid, { nid, st }]));

// the company's journey, by accept_candidate_proposal's own rule: its one journey_key, else 'customer'
const jrows = await psql(`select case when count(distinct journey_key) = 1 then min(journey_key) end
  from public.job_steps where company_id = ${q(COMPANY)}`);
const JKEY = (jrows[0]?.[0] || "") || "customer";

const owner = (await psql(`select created_by from public.companies where id = ${q(COMPANY)}`))[0]?.[0];
if (!owner) { console.error(`REFUSED: company ${COMPANY} has no created_by to own the row`); Deno.exit(1); }

let toWrite = 0, skipped = 0, below = 0;
const writes: string[] = [];
for (const [pid, outcome, idsJson, origin, voice, focusJourney] of cards) {
  const ids: string[] = JSON.parse(idsJson);
  const rows: EvidenceRow[] = ids.map((s) => {
    const x = sig.get(s);
    return { bears: true, polarity: null, brand: brandBy.get(s) ?? "brand_not_recorded",
             eventDate: x?.eventDate ?? null, sourceUrl: x?.sourceUrl ?? null };
  });
  const dead = ids.filter((s) => !sig.get(s)?.live);
  const t = tallyNeed(rows);
  const tag = `${pid.slice(0, 8)} ${String(t.counted).padStart(2)}/${t.sites.length}`;

  const hit = already.get(pid);
  if (hit) { skipped++; console.log(`skip   ${tag}  already materialised as ${hit.nid.slice(0, 8)} (${hit.st})  ${outcome.slice(0, 50)}`); continue; }
  if (!t.meets) { below++; console.log(`below  ${tag}  stays a card                           ${outcome.slice(0, 50)}`); continue; }
  if (dead.length) { console.error(`REFUSED: ${pid} cites ${dead.length} signal(s) that are superseded or held`); Deno.exit(1); }
  if (!outcome.trim()) { console.error(`REFUSED: ${pid} meets the bar but names no desired_outcome`); Deno.exit(1); }

  toWrite++;
  // the outside-voice arm, value for value (see the header)
  const isOutside = origin === "outside_voice_read";
  writes.push(`insert into public.odi_needs (company_id, user_id, tier, holder, journey_key, step_number,
      step_label, desired_outcome, importance, satisfaction, opportunity_score, service_state, source_path,
      provenance_type, validation_state, evidence_state, evidence_baseline_signal_ids,
      evidence_baseline_captured_at, evidence_voice, source_proposal_id, status)
    values (${q(COMPANY)}, ${q(owner)}, 'need', 'market', ${q((focusJourney || JKEY))}, 0, '',
      ${q(outcome)}, 0, 0, 0, null,
      ${isOutside ? q("outside_voice_read") : q("file_proposal:")},
      ${isOutside ? q("outside_review_derived") : q("file_derived")}::public.provenance_type_enum,
      'unvalidated', 'thin', ${q(idsJson)}::jsonb, now(),
      ${isOutside ? q("outside") : q(voice)}, ${q(pid)}, 'proposed')`);
  console.log(`WRITE  ${tag}  → odi_needs status 'proposed'                 ${outcome.slice(0, 50)}`);
}

console.log(`\n${cards.length} pending need card(s): ${toWrite} to materialise, ${skipped} already, ${below} below the bar`);
if (!APPLY) { console.log("DRY RUN — nothing written. Re-run with --apply."); Deno.exit(0); }
if (toWrite === 0) { console.log("nothing to do"); Deno.exit(0); }
await psql("begin;\n" + writes.join(";\n") + ";\ncommit;");
const after = await psql(`select count(*) from public.odi_needs where company_id = ${q(COMPANY)} and status = 'proposed'`);
console.log(`APPLIED — ${after[0][0]} odi_needs row(s) now carry status 'proposed' on this company`);
