// SP-429 slice 3 — load the hand/CC bearing labels into need_evidence.
//
// The corpus is a FROZEN file. The loader refuses to run unless its md5 matches the value compiled
// in below, so a changed corpus cannot be loaded silently under the same provenance.
//
// It loads EVERY need key that resolves to exactly one odi_needs row of the company — N1–N15 today,
// and a P need the moment the operator accepts its card (SP-433). A key with no row is reported as
// DEFERRED, with its label count, never skipped silently: the composite FK could not be satisfied.
//
// The corpus and its md5 are parameters so the mechanism can be proved on a throwaway company
// without touching Charter, but the GATE IS UNCHANGED: whatever corpus is named must match the md5
// named with it, so no corpus can be loaded under a provenance it does not have.
//
// Every row lands judged_by='cc_read_unchecked' (SP-429): read by CC, not checked by a person.
//
//   deno run -A scripts/load-need-evidence.ts            # dry run, writes nothing
//   deno run -A scripts/load-need-evidence.ts --apply    # writes
const arg = (name: string, dflt: string) => {
  const hit = Deno.args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const CORPUS = arg("corpus", "/Users/fomomojodojo/dev/_diagnose-shots/2026-11-18/charter-need-labels-full.json");
const CORPUS_MD5 = arg("md5", "01c0997695d538d0c6d1613310ebbbbe");   // frozen 2026-11-18
const RUBRIC_VERSION = "need-match-rubric-v4";
const RUBRIC_MD5 = "7736a27727323339ac1cb55ca74c5eab";   // from the corpus's own `rubric` field
const COMPANY = arg("company", "dd40ce2f-ff67-4111-bd3c-67943dde6717");  // Charter Communications
const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const APPLY = Deno.args.includes("--apply");

async function sh(cmd: string, args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout);
}
async function psql(sql: string): Promise<string[][]> {
  const out = await sh("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql]);
  return out.split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";

// ── GATE 1: the corpus md5 ───────────────────────────────────────────────────────────────────────
const md5 = (await sh("md5", ["-q", CORPUS])).trim();
if (md5 !== CORPUS_MD5) {
  console.error(`REFUSED: corpus md5 is ${md5}, expected ${CORPUS_MD5}.`);
  console.error("The frozen corpus changed. Re-freeze it and update CORPUS_MD5 deliberately.");
  Deno.exit(1);
}
console.log(`corpus md5 ${md5} — matches the frozen value`);

const corpus = JSON.parse(await Deno.readTextFile(CORPUS));
const needs: Record<string, string> = corpus.needs;
const quotes: Record<string, { brand: string | null; text: string }> = corpus.quotes;
const labels: Array<{ signal_id: string; need: string; bears: boolean; polarity: string | null; label_source: string }> = corpus.labels;

// ── GATE 2: map N1–N15 to odi_needs ids, by desired_outcome, exactly one each ────────────────────
const dbNeeds = await psql(`select id, desired_outcome from public.odi_needs where company_id = ${q(COMPANY)}`);
const byOutcome = new Map<string, string[]>();
for (const [id, outcome] of dbNeeds) {
  const k = outcome.trim().toLowerCase();
  byOutcome.set(k, [...(byOutcome.get(k) ?? []), id]);
}
const needIdByKey = new Map<string, string>();
const unresolved: string[] = [];
const absent: string[] = [];
for (const [key, outcome] of Object.entries(needs)) {
  const hits = byOutcome.get(outcome.trim().toLowerCase()) ?? [];
  if (hits.length === 1) needIdByKey.set(key, hits[0]);
  else if (hits.length === 0) absent.push(key);          // no row yet — deferred, reported below
  else unresolved.push(`${key} → ${hits.length} matches ("${outcome.slice(0, 60)}…")`);
}
// AMBIGUITY still refuses: two rows with the same outcome means the loader cannot know which to label.
if (unresolved.length) {
  console.error("REFUSED: these needs matched more than one odi_needs row:");
  for (const u of unresolved) console.error("  " + u);
  Deno.exit(1);
}
console.log(`mapped ${needIdByKey.size} need(s) to odi_needs rows: ${[...needIdByKey.keys()].sort().join(", ")}`);
if (absent.length) console.log(`not yet a row (deferred): ${absent.sort().join(", ")}`);

// ── GATE 3: every signal must be live and unheld ─────────────────────────────────────────────────
const sigIds = [...new Set(labels.filter((l) => needIdByKey.has(l.need)).map((l) => l.signal_id))];
const state = await psql(`select id, (superseded_at is null), (held_at is null)
                          from public.signals where company_id = ${q(COMPANY)} and id in (${sigIds.map(q).join(",")})`);
const ok = new Set(state.filter(([, live, unheld]) => live === "t" && unheld === "t").map(([id]) => id));
const bad = sigIds.filter((s) => !ok.has(s));
if (bad.length) {
  console.error(`REFUSED: ${bad.length} signal(s) are missing, superseded or held — a label must never land on a retired row.`);
  for (const b of bad.slice(0, 5)) console.error("  " + b);
  Deno.exit(1);
}
console.log(`all ${sigIds.length} quote signals are live and unheld`);

// ── the rows ─────────────────────────────────────────────────────────────────────────────────────
type Row = { need_id: string; signal_id: string; bears: boolean; polarity: string | null; brand: string; label_source: string };
const rows: Row[] = [];
const deferred: Record<string, number> = {};
for (const l of labels) {
  if (!needIdByKey.has(l.need)) { deferred[l.need] = (deferred[l.need] ?? 0) + 1; continue; }
  const brand = quotes[l.signal_id]?.brand ?? null;
  rows.push({
    need_id: needIdByKey.get(l.need)!, signal_id: l.signal_id,
    bears: l.bears, polarity: l.bears ? l.polarity : null,
    brand: brand === null || brand.trim() === "" ? "brand_not_recorded" : brand.trim(),
    label_source: l.label_source,
  });
}
const defTotal = Object.values(deferred).reduce((a, b) => a + b, 0);
console.log(`\nrows to load: ${rows.length}`);
console.log(`  bears: ${rows.filter((r) => r.bears).length} · does not bear: ${rows.filter((r) => !r.bears).length}`);
console.log(`  polarity: ${["working", "not working", "mixed"].map((p) => `${p}=${rows.filter((r) => r.polarity === p).length}`).join(" · ")}`);
console.log(`  brands: ${[...new Set(rows.map((r) => r.brand))].sort().join(", ")}`);
console.log(`DEFERRED (no odi_needs row yet; a P need loads here once its card is accepted — SP-433): ${defTotal} labels over ${Object.keys(deferred).length} need(s) — ${Object.keys(deferred).sort().join(", ")}`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); Deno.exit(0); }

let done = 0;
for (let i = 0; i < rows.length; i += 400) {
  const batch = rows.slice(i, i + 400);
  const values = batch.map((r) =>
    `(${q(COMPANY)}::uuid, ${q(r.need_id)}::uuid, ${q(r.signal_id)}::uuid, ${r.bears}, ${r.polarity === null ? "null" : q(r.polarity)},` +
    ` ${q(r.brand)}, 'cc_read_unchecked', ${q(RUBRIC_VERSION)}, ${q(RUBRIC_MD5)}, ${q(r.label_source)})`).join(",");
  await psql(`insert into public.need_evidence
    (company_id, need_id, signal_id, bears, polarity, brand, judged_by, rubric_version, rubric_md5, label_source)
    values ${values}
    on conflict (need_id, signal_id) do update set
      bears = excluded.bears, polarity = excluded.polarity, brand = excluded.brand,
      rubric_version = excluded.rubric_version, rubric_md5 = excluded.rubric_md5,
      label_source = excluded.label_source`);
  done += batch.length;
  console.log(`  wrote ${done}/${rows.length}`);
}
console.log(`\nAPPLIED: ${done} labels loaded.`);
