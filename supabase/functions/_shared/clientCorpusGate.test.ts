// ── Q2 plants P4–P6 (ruling, 2026-11-06): buildClientCorpus excludes client-provided material and
// fails CLOSED ───────────────────────────────────────────────────────────────────────────────────
//
// WHAT WAS WRONG. The corpus select carried NO source_type filter, so a signal the client handed us
// entered the corpus whenever it looked client-authored. Fleet-wide, zero rows satisfied that test at
// the time of the ruling — the protection was an accident of how upload signals happen to be minted,
// not a rule. And its catch logged a warning and CONTINUED on only the in-memory texts, so a failed
// query silently produced a short corpus, which weakens every syndication comparison made against it.
//
// EACH TEST IS A PLANT: it constructs the row or the failure the old code admitted, and asserts the
// new code refuses it. P6's control (the last test) proves the guard is not vacuous — a healthy query
// must still build a corpus, or "fails closed" would just mean "never works".
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildClientCorpus, ClientCorpusRefused } from "./syndication.ts";
import { CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES } from "./clientMaterial.ts";

const CO = "co-q2";
const HOST = "example.org";

type Row = Record<string, unknown>;

/** A fake PostgREST chain that RECORDS the filters applied, so a test can assert the exclusion was
 *  actually sent to the database rather than applied in JS after the fact. */
function fakeDb(rows: Row[], opts: { failSelect?: boolean } = {}) {
  const calls: { notFilters: Array<[string, string, string]> } = { notFilters: [] };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    limit: () => (opts.failSelect
      ? Promise.resolve({ data: null, error: { message: "permission denied for relation signals" } })
      : Promise.resolve({ data: rows, error: null })),
    not: (col: string, op: string, val: string) => { calls.notFilters.push([col, op, val]); return chain; },
    insert: () => Promise.resolve({ error: null }),
  };
  return { db: { from: (_t: string) => chain }, calls };
}

Deno.test("P4: an uploaded_file signal stamped client_voice is EXCLUDED at the query", async () => {
  // The row the old code admitted: client-provided source, client-authored voice.
  const { db, calls } = fakeDb([]);
  await buildClientCorpus(db as never, CO, HOST);
  const notSourceType = calls.notFilters.find(([col]) => col === "source_type");
  assert(notSourceType, "the corpus query must carry a .not(\"source_type\", \"in\", …) filter");
  const [, op, val] = notSourceType!;
  assertEquals(op, "in");
  // Every client-provided source type must be named — and from the ONE authority, not a local copy.
  for (const t of CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES) {
    assert(val.includes(t), `the exclusion list must name ${t}`);
  }
});

Deno.test("P5: the exclusion list IS the wall predicate's list — no second copy to drift", () => {
  // If someone adds a client lane to clientMaterial.ts, the corpus must pick it up for free.
  assertEquals(
    [...CLIENT_PROVIDED_SIGNAL_SOURCE_TYPES].sort(),
    ["file", "file_proposal", "intake", "interview", "uploaded_file"],
  );
});

Deno.test("P6: a failed corpus query REFUSES — it never continues on the in-memory texts", async () => {
  const { db } = fakeDb([], { failSelect: true });
  // The old behaviour: resolve with a corpus built from extraClientTexts alone. The new behaviour:
  // throw, so the caller cannot proceed on a corpus that was never proven complete.
  const err = await assertRejects(
    () => buildClientCorpus(db as never, CO, HOST, ["an in-memory client text"]),
    ClientCorpusRefused,
  );
  assert(
    err.message.includes("permission denied"),
    "the refusal must carry the underlying cause, so the audit row names why",
  );
});

Deno.test("P6-control: a healthy query still builds a corpus — the guard is not vacuous", async () => {
  const { db } = fakeDb([
    // a PUBLIC client_voice row (the company's own site, re-extracted) — this one belongs
    { claim_text: "We answer every enquiry within one business day", voice_class: "client_voice", source_url: `https://${HOST}/promise` },
  ]);
  const corpus = await buildClientCorpus(db as never, CO, HOST, ["an in-memory client text"]);
  assert(corpus.texts.length >= 2, `expected the stored row AND the in-memory text, got ${corpus.texts.length}`);
  assert(corpus.shingles.size > 0, "a healthy corpus must carry shingles");
});
