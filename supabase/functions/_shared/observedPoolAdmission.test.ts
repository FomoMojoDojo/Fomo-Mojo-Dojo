// OBSERVED-POOL ADMISSION (ruling 2026-09-18) — no own_words claim ever enters the observed pool, in either pairing
// kind, refs or not. Edgewood 04:39: two ref-less registry quotes (ebf3680d, 87860a8c) were paired as observed voice
// against four internal_declared claims because the voice test is ref-keyed and a claim with no refs is invisible to
// it. The fix is one claim-keyed predicate (isObservedAdmissible) that runs BEFORE the ref-based checks.
//
// Scenarios (in-memory fake, the judge stubbed through routedCall):
//   predicate: own_words → false; internal_declared / client_attested / publicly_declared → false; public_observed
//              inference → true; unknown provenance → false (allowlist polarity)
//   internal_vs_public: a REF-LESS own_words claim is never the observed side (no echo, no internally_silent row);
//              a REF-LESS public_observed outside claim IS observed (the internal kind's legacy no-ref pool) and pairs;
//              a client_voice-BACKED public claim is still refused by the ref-based check (self voice) after the predicate
//   public_vs_public: the same own_words claim is the DECLARED side (unchanged) and never the observed side
// NON-VACUITY (run by hand, reported): make isObservedAdmissible return provenance === "public_observed" only (the
//   pre-ruling pool) → the own_words claim pairs on the internal kind → the assertion fails.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDeltasForCompany, DECLARED_PROVENANCES, isObservedAdmissible } from "./claimDeltaSynthesis.ts";

type Row = Record<string, unknown>;
const CO = "22222222-2222-2222-2222-222222222222";

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = [...rows];
  let nextId = 1;
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      like: () => b, not: () => b, gte: () => b, order: () => b, abortSignal: () => b,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      range: (a: number, z: number) => chain((r) => r.slice(a, z + 1)),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      insert: (payload: Row) => { tables[table].push({ id: `row-${nextId++}`, ...payload }); return Promise.resolve({ data: null, error: null }); },
      delete: () => ({ in: (c: string, ids: unknown[]) => { tables[table] = tables[table].filter((r) => !ids.includes(r[c])); return Promise.resolve({ error: null }); } }),
    });
    return b;
  };
  const rpc = (fn: string, a: { p_company_id?: string; p_ids?: string[] }) => {
    if (fn !== "delete_claim_deltas_audited") return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    const ids = a.p_ids ?? [];
    tables.claim_deltas = tables.claim_deltas.filter((r) => !(ids.includes(r.id as string) && r.company_id === a.p_company_id));
    return Promise.resolve({ data: ids.length, error: null });
  };
  return { tables, from, rpc };
}

const claim = (id: string, statement: string, extra: Row = {}): Row =>
  ({ id, company_id: CO, provenance: "public_observed", status: "active", statement, topic: null, claim_type: "inference", proof_category: null, raw_payload: null, ...extra });
// everything echoes everything: the judge is not what is under test
const routedCall = (a: { role: "generator" | "judge"; user: string }) => {
  const observed = a.user.match(/OBSERVED \(public\)[^:]*: ([\s\S]*?)\nAre these/)?.[1]?.trim() ?? "";
  return Promise.resolve(a.role === "generator"
    ? { content: JSON.stringify({ same_subject: true, relation: "echo", reason: "same" }), provider: "t", model: "g" }
    : { content: JSON.stringify({ same_subject: true, relation: "echo", confident: true, span: observed, reason: "echo" }), provider: "t", model: "j" });
};
function seed() {
  return {
    companies: [{ id: CO, website: "https://co.example" }],
    claims: [
      claim("decl", "crisis stabilization for bay area youth families", { provenance: "internal_declared" }),
      // the leak: a registry own-words quote with NO refs (its span attributed no signal) — the company's words by claim_type
      claim("own-quote", "crisis stabilization for bay area youth families we provide", { claim_type: "own_words", declared_eligible: true, raw_payload: { page_url: "https://www.guidestar.org/profile/1", registry_origin: {} } }),
      // a ref-less OUTSIDE claim: admitted on the internal kind (legacy no-ref pool)
      claim("outside-noref", "crisis stabilization for bay area youth families reviewed"),
      // a client_voice-backed public claim: refused by the ref-based self-voice check
      claim("self-backed", "crisis stabilization for bay area youth families stated"),
      // an own-words claim WITH a client_voice ref: the public kind's declared side
      claim("own-site", "crisis stabilization for bay area youth families on our site", { claim_type: "own_words", declared_eligible: true, raw_payload: { page_url: "https://co.example/about" } }),
    ],
    signals: [{ id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://co.example/about", evidence_class: "prose" }],
    claim_signal_refs: [{ company_id: CO, claim_id: "self-backed", signal_id: "s-own" }, { company_id: CO, claim_id: "own-site", signal_id: "s-own" }],
    claim_deltas: [], claim_delta_rejections: [], claim_delta_looks: [], claim_delta_relevance_overrides: [], integrity_runs: [],
  };
}
const observedIds = (db: ReturnType<typeof fakeDb>, kind: string) => new Set(db.tables.claim_deltas.filter((r) => r.pairing_kind === kind && r.public_claim_id).map((r) => r.public_claim_id));

Deno.test("predicate: own_words and every declared provenance are never observed; only public_observed non-own-words is (allowlist)", () => {
  assertEquals(isObservedAdmissible({ provenance: "public_observed", claim_type: "own_words" }), false);
  for (const p of DECLARED_PROVENANCES) assertEquals(isObservedAdmissible({ provenance: p, claim_type: "inference" }), false, p);
  assertEquals(isObservedAdmissible({ provenance: "public_observed", claim_type: "inference" }), true);
  assertEquals(isObservedAdmissible({ provenance: "public_observed", claim_type: null }), true);
  assertEquals(isObservedAdmissible({ provenance: "analytic", claim_type: "observation" }), false);
  assertEquals(isObservedAdmissible({ provenance: null }), false);
  assertEquals([...DECLARED_PROVENANCES].sort(), ["client_attested", "internal_declared", "publicly_declared"]);
});

Deno.test("internal_vs_public: a ref-less own_words claim is never observed; a ref-less outside claim is; a self-backed claim is still refused by refs", async () => {
  const db = fakeDb(seed());
  const r = await computeDeltasForCompany({ supabase: db as never, companyId: CO, ollamaUrl: "http://x", nowIso: "2026-09-18T05:00:00Z", write: true, pairingKind: "internal_vs_public", routedCall: routedCall as never });
  if (!r.ok) throw new Error("expected ok");
  const obs = observedIds(db, "internal_vs_public");
  assert(!obs.has("own-quote"), "the ref-less own_words claim never sits on the observed side");
  assert(!obs.has("own-site"), "an own_words claim with refs never sits on the observed side either");
  assert(obs.has("outside-noref"), "the ref-less outside claim is observed on the internal kind (legacy no-ref pool)");
  assert(!obs.has("self-backed"), "the ref-based self-voice check still refuses a client_voice-backed claim");
  assertEquals(db.tables.claim_deltas.filter((x) => x.delta_type === "internally_silent" && x.public_claim_id === "own-quote").length, 0, "no silence row for the own_words claim either");
  assertEquals((r as { totals: Record<string, number> }).totals.own_words_observed_excluded, 2);
});

Deno.test("public_vs_public: the own_words claims are the DECLARED side and never the observed side", async () => {
  const db = fakeDb(seed());
  const r = await computeDeltasForCompany({ supabase: db as never, companyId: CO, ollamaUrl: "http://x", nowIso: "2026-09-18T05:00:00Z", write: true, pairingKind: "public_vs_public", routedCall: routedCall as never });
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  const obs = observedIds(db, "public_vs_public");
  assert(!obs.has("own-quote") && !obs.has("own-site"), "own words are never observed on the public kind");
  const declared = new Set(db.tables.claim_deltas.filter((x) => x.pairing_kind === "public_vs_public" && x.declared_claim_id).map((x) => x.declared_claim_id));
  assert(declared.has("own-site"), "the client_voice-backed own-words claim is the declared side");
  assert(obs.has("outside-noref") === false, "a ref-less claim stays unbacked on the public kind (unchanged)");
});
