// Operator rulings signed 2026-09-18 — own-words mint rules and the question-anchor rule.
//
// Guards (each with a by-hand planted failure, reported in the gate; non-empty fixtures on both sides):
//   (a) ruling 1 — a personal LinkedIn profile (/in/) and a company page (/company/) in the corpus → the corpus
//       partition and the page-signal pick hold only the /company/ URL; the /in/ URL is listed personal_profile
//   (b) ruling 2 — the judge grades a substring quote "paraphrased" → the survivor's fidelity is verbatim; a
//       non-substring quote is still rejected (not_verbatim_provable), never a paraphrased survivor
//   (c) ruling 4 — "…system" and "…system." → ONE survivor at the page site (assembleOwnWords) and ONE key at the
//       cross-page/stored site (ownWordsDedupKey equality), while identities differ and normalizeForHash is unchanged
//   (d) ruling 7 — a silent_delta question whose delta's declared claim is struck → not anchored, orphaned at
//       finalize with reason delta_claim_struck; the same question with the claim active → kept
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assembleOwnWords, isPersonalProfileUrl, ownWordsDedupKey, PERSONAL_PROFILE_REASON, pickPageSignals, type JudgeVerdict,
} from "./ownWordsExtract.ts";
import { partitionOwnWordsCorpus } from "./registryOwnWords.ts";
import { contentIdentity, normalizeForHash } from "./contentIdentity.ts";
import {
  ANCHORABLE_CLAIM_STATUS, loadQuestionAnchorsDetailed, ORPHAN_REASON_DELTA_CLAIM_STRUCK, orphanQuestionIds, orphanQuestionReasons,
} from "./openQuestionAnchors.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const IN = "https://www.linkedin.com/in/jim-magill-12164a";
const COMPANY = "https://www.linkedin.com/company/fomomojodojo/";
const sig = (id: string, url: string) => ({ id, source_url: url, source_title: null, voice_class: "client_voice", source_type: "public_baseline_run", raw_payload: { url, snippet: "x" }, superseded_at: null, created_at: "2026-07-06T00:00:00Z" });

Deno.test("(a) ruling 1: the /in/ URL leaves the corpus and the pick; the /company/ URL stays", () => {
  assert(isPersonalProfileUrl(IN) && isPersonalProfileUrl("https://linkedin.com/in/holzerd/") && isPersonalProfileUrl("https://www.linkedin.com/IN/jaesunum"));
  assert(!isPersonalProfileUrl(COMPANY) && !isPersonalProfileUrl("https://edgewood.org/in/") && !isPersonalProfileUrl(null) && !isPersonalProfileUrl("not a url"));
  const all = [sig("S-in", IN), sig("S-co", COMPANY)];
  // the extractor's corpus step: personal profiles out (listed), then the registry partition, then the pick
  const personal = [...new Set(all.filter((s) => isPersonalProfileUrl(s.source_url)).map((s) => s.source_url))];
  const corpus = partitionOwnWordsCorpus(all.filter((s) => !isPersonalProfileUrl(s.source_url)), () => false);
  for (const url of personal) corpus.excluded.push({ url, reason: PERSONAL_PROFILE_REASON });
  assertEquals(corpus.site.map((s) => s.source_url), [COMPANY]);
  assertEquals(corpus.excluded, [{ url: IN, reason: "personal_profile" }]);
  const pick = pickPageSignals(corpus.site);
  assertEquals([...pick.keys()], [COMPANY], "the pick holds only the company page");
  assertEquals(pick.get(COMPANY)?.id, "S-co");
});

const PAGE = "Jim Magill posted this\nWhat drew me in: they've created what's essentially a brand operating system. As Senior Brand Solutions Partner, I get to help.";
const verdict = (fidelity: "verbatim" | "paraphrased"): JudgeVerdict => ({ keep: true, selfAssertion: true, fidelity, kind: "claim" as never });

Deno.test("(b) ruling 2: a substring quote the judge graded paraphrased mints verbatim; a non-substring quote is rejected, never paraphrased", async () => {
  const { survivors, rejections } = await assembleOwnWords(
    [{ quote: "they've created what's essentially a brand operating system", offset: 0, length: 0 }, { quote: "they built a brand OS", offset: 0, length: 0 }],
    [verdict("paraphrased"), verdict("paraphrased")], PAGE, null,
  );
  assertEquals(survivors.map((s) => [s.quote.slice(0, 20), s.fidelity]), [["they've created what", "verbatim"]]);
  assertEquals(rejections.map((r) => r.reason), ["not_verbatim_provable"]);
  assertEquals(survivors.filter((s) => s.fidelity === "paraphrased").length, 0, "no paraphrased survivor exists under the check");
});

Deno.test("(c) ruling 4: …system and …system. are one quote at the page site and one key at the stored site; identities untouched", async () => {
  const a = "they've created what's essentially a brand operating system", b = `${a}.`;
  const { survivors, rejections } = await assembleOwnWords(
    [{ quote: b, offset: 0, length: 0 }, { quote: a, offset: 0, length: 0 }, { quote: "As Senior Brand Solutions Partner, I get to help.", offset: 0, length: 0 }],
    [verdict("verbatim"), verdict("verbatim"), verdict("verbatim")], PAGE, null,
  );
  assertEquals(survivors.map((s) => s.quote), [b, "As Senior Brand Solutions Partner, I get to help."], "one survivor for the pair, the other quote still survives");
  assertEquals(rejections, [{ quote: a, reason: "duplicate" }]);
  // the cross-page / stored site compares the same key
  assertEquals(ownWordsDedupKey(a), ownWordsDedupKey(b));
  assertEquals(ownWordsDedupKey("Finally seeing it!?…"), ownWordsDedupKey("finally   seeing it"));
  assert(ownWordsDedupKey(a) !== ownWordsDedupKey("they've created a brand operating system"), "a different sentence is a different key");
  // the identity and the normalizer are what they were
  assert((await contentIdentity(a)) !== (await contentIdentity(b)));
  assertEquals(normalizeForHash(b), "they've created what's essentially a brand operating system.");
});

type Row = Record<string, unknown>;
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = [...rows];
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      not: () => b, order: () => b, limit: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    });
    return b;
  };
  return { tables, from };
}
const CO = "dea66de5-647e-45b7-9f13-a9673f641006";
function world(declaredStatus: string) {
  return fakeDb({
    findings: [],
    claim_deltas: [
      { company_id: CO, pairing_kind: "public_vs_public", delta_type: "publicly_silent", content_identity: "delta-brand-os", declared_claim_id: "c-struck", public_claim_id: null },
      { company_id: CO, pairing_kind: "public_vs_public", delta_type: "publicly_silent", content_identity: "delta-live", declared_claim_id: "c-live", public_claim_id: null },
    ],
    claims: [
      { id: "c-struck", statement: "they've created what's essentially a brand operating system.", status: declaredStatus },
      { id: "c-live", statement: "We help teams align around evidence.", status: "active" },
    ],
    claim_signal_refs: [{ claim_id: "c-struck", signal_id: "s1" }, { claim_id: "c-live", signal_id: "s1" }],
    signals: [{ id: "s1", source_type: "public_baseline_run" }],
    first_read_open_questions: [
      { id: "Q-brand-os", company_id: CO, run_id: "9", status: "live", source_kind: "silent_delta", anchor_identity: "delta-brand-os" },
      { id: "Q-live", company_id: CO, run_id: "9", status: "live", source_kind: "silent_delta", anchor_identity: "delta-live" },
    ],
  });
}

Deno.test("(d) ruling 7: a silent_delta question on a struck claim is not anchored and is an orphan with reason delta_claim_struck; on an active claim it is kept", async () => {
  const struck = world("struck");
  const { anchors, excluded } = await loadQuestionAnchorsDetailed(struck as never, CO, "9");
  assertEquals(anchors.map((a) => a.identity), ["delta-live"]);
  assertEquals(excluded, [{ identity: "delta-brand-os", reason: ORPHAN_REASON_DELTA_CLAIM_STRUCK }]);
  const live = struck.tables.first_read_open_questions as Array<{ id: string; anchor_identity: string | null; source_kind?: string }>;
  assertEquals(orphanQuestionIds(live, anchors), ["Q-brand-os"]);
  assertEquals(orphanQuestionReasons(live, anchors, excluded), [{ id: "Q-brand-os", reason: "delta_claim_struck" }]);
  // the non-empty other side: both claims active → both anchored, no orphan
  const active = world("active");
  const r = await loadQuestionAnchorsDetailed(active as never, CO, "9");
  assertEquals(r.anchors.map((a) => a.identity).sort(), ["delta-brand-os", "delta-live"]);
  assertEquals(r.excluded, []);
  assertEquals(orphanQuestionIds(active.tables.first_read_open_questions as never, r.anchors), []);
  assertEquals(ANCHORABLE_CLAIM_STATUS, "active");
});

Deno.test("source guard: the extractor excludes personal profiles at the corpus step and dedups by the punctuation-blind key at both sites; the finalize audits with reasons", async () => {
  const ex = await read("../extract-own-words/index.ts");
  assert(ex.includes("sigsAll.filter((s) => !isPersonalProfileUrl(s.source_url) && (!isRegistryUrl(s.source_url) || !s.superseded_at))"), "corpus: personal profiles out before the registry partition");
  assert(ex.includes("corpus.excluded.push({ url, reason: PERSONAL_PROFILE_REASON })"), "listed under corpus.excluded");
  assert(ex.includes("const k = ownWordsDedupKey(s.quote); return seen.has(k)"), "cross-page dedup by key");
  assert(ex.includes("existingByKey.has(ownWordsDedupKey(s.quote))"), "stored-claims dedup by key");
  const ow = await read("./ownWordsExtract.ts");
  assert(ow.includes('const fidelity: "verbatim" | "paraphrased" = provable ? "verbatim" : "paraphrased";') && !ow.includes("fidelity: v.fidelity"), "fidelity from the check, not the judge");
  assert(ow.includes("const key = ownWordsDedupKey(c.quote);\n    if (seen.has(key))"), "page-site dedup by key");
  const oq = await read("./openQuestionAnchors.ts");
  assert(oq.includes("statusById.get(id) === ANCHORABLE_CLAIM_STATUS") && oq.includes('.select("id, statement, status")'), "anchor loader reads claim status");
  const gen = await read("../generate-open-questions/index.ts");
  assert(gen.includes('component: "open_questions_finalize"') && gen.includes("orphanQuestionReasons("), "finalize audits every orphan with its reason");
});
