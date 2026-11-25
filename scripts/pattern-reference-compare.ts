// ── THE STORED PATTERNS BESIDE THE HAND-BUILT BRIEF'S (SP-462, 2026-11-20) ──────────────────────
//
// SP-462: the reference is the hand-built brief's NAMED patterns, and no fixture of my own reading.
// So the reference list below is TRANSCRIBED from the brief, verbatim in substance, and this script
// only lays the two side by side with the quote counts and the sites. The verdict on each
// disagreement is written by hand in the report, naming which reading the quotes support — a
// percentage would say nothing about which of the two is right.
//
//   deno run -A scripts/pattern-reference-compare.ts
import { siteOf } from "../src/lib/needEvidenceCounting.ts";
import { loadNeedKeys } from "./needKeys.ts";

const DB = Deno.env.get("MOJO_DB_CONTAINER") ?? "supabase_db_dzlgyxcvuwiulgifbmew";
const COMPANY = "dd40ce2f-ff67-4111-bd3c-67943dde6717";

/** The hand-built brief's named patterns, as the operator wrote them. */
const REFERENCE: Record<string, string[]> = {
  N15: [
    "(a) price rises with no notice, incl. removed autopay discount",
    "(b) promotions that end early or are not honored",
    "(c) fees learned about afterward (late fees after a failed payment, no warning)",
    "(d) charges for returned equipment",
  ],
  N14: [
    "one rule — full month charged after cancelling days into a cycle (at least 10 of 17)",
    "several not told before choosing a cancel date",
  ],
  N13: [
    // SP-645 (2026-11-24): the four entries the operator signed from the SP-640 run, replacing the
    // hand-written (a) to (d). Each carries the quotes the reference judge confirmed for it
    // (sp614-proposal.json, brief 18), by the first 8 characters of the signal id.
    "(a) long hold times on phone calls [237f471a 576f8971 c9084dff df1a2042]",
    "(b) receiving inconsistent information from different reps [2caafa55 7dee5010 d86d6e4c]",
    "(c) AI chatbot giving incorrect advice or failing to connect [7527c432 d1be91ad]",
    "(d) being forced to visit a store after failed remote support [c9084dff d3866c50]",
    "positives: polite, helpful agents",
    "mixed: courteous but problem stayed",
  ],
  P1: [
    "(a) repeated outages, often weekly or nightly",
    "(b) business and work-from-home loss vs $2-$5 credits",
    "(c) credits promised and not applied, or outage denied afterward",
    "(d) the app disagrees with the customer about status",
  ],
  P2: [
    "the app logs out",
    "asks for sign-in each use",
    "lost background play after an update",
  ],
};

async function psqlJson<T>(sql: string): Promise<T[]> {
  const { code, stdout, stderr } = await new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c",
      `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    stdout: "piped", stderr: "piped",
  }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr).trim());
  return JSON.parse(new TextDecoder().decode(stdout));
}

// SP-565: a stored pattern is filed under its need's KEY by the need's row id (the key file), never by
// matching the need's sentence — an edited wording would file its patterns under "—".
const needKeys = await loadNeedKeys(COMPANY);

// The SITE count comes from `siteOf`, the one host→site map, NOT from `count(distinct source_url)`.
// The first version of this script counted distinct urls and reported P1's top pattern as 15/8 where
// the app says 15/5 — two review pages on one site are one site, and a printer that disagrees with the
// page it is checking is worse than no printer.
const raw = await psqlJson<{ pattern_id: string; need_id: string; outcome: string; name: string; strength: string; cited: number; reason: string | null; bears: boolean; url: string | null }>(
  `select p.id as pattern_id, p.need_id, n.desired_outcome as outcome, p.name, p.strength,
     p.judge_reason as reason, pq.bears, s.source_url as url,
     (select count(*) from public.need_pattern_quotes x where x.pattern_id = p.id) as cited
   from public.need_patterns p
   join public.odi_needs n on n.id = p.need_id
   join public.need_pattern_quotes pq on pq.pattern_id = p.id
   join public.signals s on s.id = pq.signal_id
   where p.company_id = '${COMPANY}' and p.superseded_at is null`);

type Stored = { need_id: string; outcome: string; name: string; strength: string; supporting: number; sites: number; cited: number; reason: string | null };
const acc = new Map<string, Stored & { siteSet: Set<string> }>();
for (const r of raw) {
  const e = acc.get(r.pattern_id) ?? acc.set(r.pattern_id, {
    need_id: r.need_id, outcome: r.outcome, name: r.name, strength: r.strength,
    supporting: 0, sites: 0, cited: r.cited, reason: r.reason, siteSet: new Set<string>(),
  }).get(r.pattern_id)!;
  if (r.bears) { e.supporting++; e.siteSet.add(siteOf(r.url)); }
}
const stored: Stored[] = [...acc.values()].map((e) => ({ ...e, sites: e.siteSet.size }))
  .sort((a, b) => a.outcome.localeCompare(b.outcome) || b.supporting - a.supporting);

const byKey = new Map<string, typeof stored>();
for (const r of stored) {
  const k = needKeys.label(r.need_id);
  (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(r);
}

let coveredTotal = 0, refTotal = 0;
for (const key of ["N13", "P1", "N15", "N14", "P2"]) {
  const got = byKey.get(key) ?? [];
  const ref = REFERENCE[key] ?? [];
  refTotal += ref.length;
  coveredTotal += got.length;
  console.log(`\n═══ ${key} ═══  reference names ${ref.length} · stored patterns ${got.length}`);
  console.log("  REFERENCE:");
  for (const r of ref) console.log(`    · ${r}`);
  console.log("  STORED:");
  if (got.length === 0) console.log("    (none)");
  for (const g of got) {
    console.log(`    · [${g.strength}] ${g.supporting}/${g.sites} of ${g.cited} cited — ${g.name}`);
    if (g.reason) console.log(`        judge: ${g.reason.slice(0, 96)}`);
  }
}
console.log(`\nreference sub-patterns: ${refTotal} · stored patterns: ${coveredTotal}`);
console.log("The verdict on each disagreement is written by hand, per need, in the report (SP-462).");
