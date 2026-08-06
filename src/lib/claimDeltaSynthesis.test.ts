// INT-3 — compute-core tests for claimDeltaSynthesis (the declared-vs-observed
// delta engine). The Ollama boundary is stubbed at global fetch; supabase is an
// in-memory fake. Covers: prefilter, identity stability, frozen exclusion,
// require_model loud-fail, pair verdict tri-state, tombstone respect,
// recompute idempotency (dispositions preserved), and the silence taxonomy.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeDeltasForCompany,
  pairIdentity,
  silenceIdentity,
  sharedTokenCount,
  verifyObservedSpan,
  classifyObservedSpan,
  MIN_SPAN_CHARS,
  MIN_SPAN_TOKENS,
} from "../../supabase/functions/_shared/claimDeltaSynthesis.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"; // frozen fixture
const CO = "11111111-1111-1111-1111-111111111111";

type Row = Record<string, unknown>;

// ── In-memory supabase fake (claims + claim_deltas + claim_delta_rejections) ──
// SELF-VOICE EXCLUSION also reads signals + claim_signal_refs (voice_class join).
// Both default empty, so a test that seeds neither exercises the pre-exclusion
// behaviour byte-identically (empty self-voice set → nothing excluded).
function fakeDb(seed: {
  claims: Row[]; claim_deltas?: Row[]; claim_delta_rejections?: Row[];
  signals?: Row[]; claim_signal_refs?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    claims: [...seed.claims],
    claim_deltas: [...(seed.claim_deltas ?? [])],
    claim_delta_rejections: [...(seed.claim_delta_rejections ?? [])],
    signals: [...(seed.signals ?? [])],
    claim_signal_refs: [...(seed.claim_signal_refs ?? [])],
  };
  let nextId = 1;
  const db = {
    tables,
    from(table: string) {
      const chain = {
        _filters: [] as Array<(r: Row) => boolean>,
        select() { return this; },
        eq(col: string, v: unknown) { this._filters.push((r: Row) => r[col] === v); return this; },
        order() { return this; },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          resolve({ data: (tables[table] ?? []).filter((r) => chain._filters.every((f) => f(r))), error: null });
        },
        insert(payload: Row) {
          tables[table].push({ id: `row-${nextId++}`, ...payload });
          return Promise.resolve({ error: null });
        },
        delete() {
          return {
            in(col: string, ids: unknown[]) {
              tables[table] = tables[table].filter((r) => !ids.includes(r[col]));
              return Promise.resolve({ error: null });
            },
          };
        },
      };
      return chain;
    },
  };
  return db;
}

// ── Scripted Ollama at the fetch boundary ─────────────────────────────────────
function stubOllama(script: (model: string, user: string) => unknown) {
  const calls: Array<{ model: string; user: string }> = [];
  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const user = String(body?.messages?.[1]?.content ?? "");
    calls.push({ model: body.model, user });
    const verdict = script(body.model, user);
    // Span-gate contract: the real 70b judge now returns a VERBATIM span of the
    // OBSERVED statement, structurally verified. These banking/identity/sweep
    // tests care about the verdict, not the span, so model a well-behaved judge:
    // when a judge echo/divergent verdict omits span, inject the whole observed
    // line (a guaranteed-valid substring). A test that wants to exercise the gate
    // itself sets span explicitly (see the span-gate describe block).
    if (
      body.model === "llama3:70b" && verdict && typeof verdict === "object" &&
      ((verdict as { relation?: unknown }).relation === "echo" || (verdict as { relation?: unknown }).relation === "divergent") &&
      (verdict as { span?: unknown }).span === undefined
    ) {
      const observed = user.match(/OBSERVED \(public\): ([\s\S]*?)\nAre these/)?.[1]?.trim();
      if (observed) (verdict as { span?: string }).span = observed;
    }
    if (verdict === "HTTP_FAIL") return { ok: false, status: 500, json: async () => ({}) } as Response;
    if (verdict === "GARBAGE") return { ok: true, json: async () => ({ message: { content: "not json {" } }) } as unknown as Response;
    return { ok: true, json: async () => ({ message: { content: JSON.stringify(verdict) } }) } as unknown as Response;
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const baseArgs = (db: ReturnType<typeof fakeDb>, companyId = CO, write = true) => ({
  supabase: db as never,
  companyId,
  ollamaUrl: "http://127.0.0.1:11434/v1",
  nowIso: "2026-07-07T12:00:00Z",
  write,
});

const declared = (id: string, statement: string): Row => ({ id, company_id: CO, statement, topic: null, provenance: "internal_declared" });
const publicClaim = (id: string, statement: string): Row => ({ id, company_id: CO, statement, topic: null, provenance: "public_observed" });
// A public_observed claim wired to ONE signal of a given voice, via a signal + ref row.
// voice=null models an unclassified signal (the NULL policy: NOT excluded).
const voicedPublic = (id: string, statement: string, voice: string | null): { claim: Row; signal: Row; ref: Row } => ({
  claim: publicClaim(id, statement),
  signal: { id: `sig-${id}`, company_id: CO, voice_class: voice },
  ref: { claim_id: id, signal_id: `sig-${id}`, company_id: CO },
});

// ── Stage 1 ───────────────────────────────────────────────────────────────────
describe("sharedTokenCount prefilter", () => {
  it("counts meaningful shared tokens, ignoring stop words", () => {
    expect(sharedTokenCount("The evidence-backed score is visible", "Score visible to the market")).toBeGreaterThanOrEqual(2);
    expect(sharedTokenCount("The and of to in", "The and of to in")).toBe(0);
  });
  it("unrelated statements stay below the floor", () => {
    expect(sharedTokenCount("Coffee roasting quality", "Legal billing software")).toBe(0);
  });
});

// ── Identity stability (evidence law) ────────────────────────────────────────
describe("delta identities", () => {
  it("pairIdentity is stable under the normalizeForHash contract (case + whitespace)", async () => {
    // normalizeForHash = lower → collapse whitespace → trim (punctuation is
    // load-bearing and preserved — PCT-1 parity contract).
    const a = await pairIdentity("The  Score is Visible", "market hears score");
    const b = await pairIdentity("the score is visible", "market hears score");
    expect(a).toBe(b);
    const c = await pairIdentity("the score is visible.", "market hears score");
    expect(c).not.toBe(b);
  });
  it("silenceIdentity differs by type", async () => {
    expect(await silenceIdentity("publicly_silent", "same text"))
      .not.toBe(await silenceIdentity("internally_silent", "same text"));
  });
});

// ── Span gate (structural verification) ──────────────────────────────────────
describe("verifyObservedSpan", () => {
  const OBS = "Edgewood CSU is the only crisis stabilization unit serving youth under 12.";
  it("accepts a real substring of the observed text meeting the minimum", () => {
    expect(verifyObservedSpan("crisis stabilization", OBS)).toBe(true);
    expect(verifyObservedSpan("crisis stabilization unit", OBS)).toBe(true);
  });
  it("case-folds and collapses whitespace (a re-cased/re-spaced copy still verifies)", () => {
    expect(verifyObservedSpan("Crisis   Stabilization", OBS)).toBe(true);
  });
  it("rejects a span that is not in the observed text (hallucinated grounding)", () => {
    expect(verifyObservedSpan("early detection and intervention", OBS)).toBe(false);
  });
  it("rejects a span that appears only in the DECLARED wording, not the observed", () => {
    expect(verifyObservedSpan("cohesive pathway of care", OBS)).toBe(false);
  });
  it("rejects sub-minimum spans (single generic word proves nothing)", () => {
    expect(verifyObservedSpan("only", OBS)).toBe(false); // 1 token
    expect(verifyObservedSpan("the", OBS)).toBe(false); // < MIN_SPAN_CHARS and 1 token
    expect(verifyObservedSpan(undefined, OBS)).toBe(false);
    expect(verifyObservedSpan("", OBS)).toBe(false);
  });
  it("minimum thresholds are as reported (8 chars / 2 tokens)", () => {
    expect(MIN_SPAN_CHARS).toBe(8);
    expect(MIN_SPAN_TOKENS).toBe(2);
  });
});

// The gate inside the compute flow: a judged echo whose span does NOT verify is
// rejected (falls to the silence rails), whatever the judge concluded — the
// echo-machinery's failure mode is a generic observed line confirming everything.
describe("span gate rejects an unverifiable judged echo", () => {
  it("echo verdict + bad span ⇒ no echoed pair, declared falls to publicly_silent", async () => {
    // Judge insists on echo but cites a span absent from the observed text.
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, span: "not present in observed", reason: "vibes" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db, CO, false));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.some((d) => d.delta_type === "echoed")).toBe(false);
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent" && d.declared_claim_id === "d1")).toBe(true);
  });
  it("echo verdict + a real observed span ⇒ echoed pair survives", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, span: "score visible", reason: "specific" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db, CO, false));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.some((d) => d.delta_type === "echoed" && d.declared_claim_id === "d1")).toBe(true);
  });
});

// GATE B-fix — an UNVERIFIABLE span (cited from the wrong text / absent) is a MECHANICAL
// FAILURE, not a not-an-echo verdict. classifyObservedSpan splits it from the substantive
// below-minimum case, and the compute flow records it UNJUDGED (no rejection banked) rather
// than freezing a false not-an-echo.
describe("classifyObservedSpan", () => {
  const OBS = "Kaiser Permanente lists Edgewood as an affiliated provider for residential treatment and mental health services; referral required.";
  it("a real substring meeting the minimum ⇒ valid", () => {
    expect(classifyObservedSpan("residential treatment", OBS)).toBe("valid");
  });
  it("a span cited from the DECLARED side (not in observed) ⇒ not_in_observed (mechanical)", () => {
    expect(classifyObservedSpan("integrated services", OBS)).toBe("not_in_observed");
    expect(classifyObservedSpan("youth mental health care landscape", OBS)).toBe("not_in_observed");
  });
  it("no span returned ⇒ no_span (mechanical)", () => {
    expect(classifyObservedSpan(undefined, OBS)).toBe("no_span");
    expect(classifyObservedSpan("", OBS)).toBe("no_span");
  });
  it("a real observed span below the minimum ⇒ below_minimum (substantive genericness)", () => {
    expect(classifyObservedSpan("required", OBS)).toBe("below_minimum"); // real substring, 1 token
  });
  it("verifyObservedSpan is exactly (status === valid)", () => {
    expect(verifyObservedSpan("residential treatment", OBS)).toBe(true);
    expect(verifyObservedSpan("integrated services", OBS)).toBe(false);
  });
});

describe("compute flow — unverifiable span is UNJUDGED, never banked as a rejection", () => {
  it("echo + span from the wrong text ⇒ spans_unjudged, NO rejection row, declared publicly_silent, no pair", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, span: "cited from the declared side", reason: "wrong text" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, true)); // write=true — prove NOTHING is banked
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.spans_unjudged).toBe(1);
    expect(r.totals.pairs_rejected).toBe(0);
    expect(db.tables.claim_delta_rejections.length).toBe(0); // NOT frozen — revisitable
    expect(r.deltas.some((d) => d.delta_type === "echoed")).toBe(false);
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent" && d.declared_claim_id === "d1")).toBe(true);
  });

  it("distinguishable downstream: a real-but-below-minimum span STILL banks a rejection", async () => {
    // "score" is a real substring of the observed but 1 token → below_minimum → substantive reject.
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, span: "score", reason: "too generic" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, true));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.spans_unjudged).toBe(0);
    expect(r.totals.pairs_rejected).toBe(1);
    expect(db.tables.claim_delta_rejections.length).toBe(1); // frozen not-an-echo (genericness)
  });

  it("a genuine no-echo (relation null) STILL banks a rejection — unchanged", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: null, confident: false, reason: "no specific echo" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, true));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.spans_unjudged).toBe(0);
    expect(db.tables.claim_delta_rejections.length).toBe(1);
  });
});

// ── Core flow ─────────────────────────────────────────────────────────────────
describe("computeDeltasForCompany", () => {
  it("frozen company is excluded before any model call", async () => {
    const calls = stubOllama(() => ({ same_subject: false }));
    const db = fakeDb({ claims: [] });
    const r = await computeDeltasForCompany(baseArgs(db, CB1));
    expect(r).toEqual({ ok: false, skipped: "frozen_company" });
    expect(calls.length).toBe(0);
  });

  it("require_model: HTTP failure aborts loudly", async () => {
    stubOllama(() => "HTTP_FAIL");
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    await expect(computeDeltasForCompany(baseArgs(db))).rejects.toThrow(/model call failed/);
  });

  it("require_model: unparseable output aborts loudly (no fallback verdicts)", async () => {
    stubOllama(() => "GARBAGE");
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    await expect(computeDeltasForCompany(baseArgs(db))).rejects.toThrow(/unparseable/);
  });

  it("confident judge verdict ⇒ judge_confirmed pair; unmatched public claim ⇒ internally_silent", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "both describe score visibility" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        publicClaim("p2", "consultants charge hourly rates for projects"),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    const pair = r.deltas.find((d) => d.delta_type === "echoed");
    expect(pair?.pairing_basis).toBe("judge_confirmed");
    expect(r.deltas.some((d) => d.delta_type === "internally_silent" && d.public_claim_id === "p2")).toBe(true);
    // declared claim is paired ⇒ NOT publicly_silent
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent")).toBe(false);
    expect(db.tables.claim_deltas.length).toBe(r.deltas.length);
  });

  it("uncertain judge ⇒ inferred basis (tri-state: shown AND labeled, never silently promoted)", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "divergent", confident: false, reason: "possibly the same subject" }
        : { same_subject: true, relation: "divergent", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.find((d) => d.delta_type === "divergent")?.pairing_basis).toBe("inferred");
  });

  it("declared claim with NO candidate ⇒ publicly_silent (open question, zero model calls)", async () => {
    const calls = stubOllama(() => ({ same_subject: false }));
    const db = fakeDb({ claims: [declared("d1", "become the strategy system of record")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas).toHaveLength(1);
    expect(r.deltas[0].delta_type).toBe("publicly_silent");
    expect(calls.length).toBe(0);
  });

  it("operator 'not a pair' tombstone is never re-proposed; claims fall to silence rails", async () => {
    const d1 = declared("d1", "evidence score visible always");
    const p1 = publicClaim("p1", "score visible on the site");
    const tombId = await pairIdentity(String(d1.statement), String(p1.statement));
    const calls = stubOllama(() => ({ same_subject: true, relation: "echo", confident: true, reason: "x" }));
    const db = fakeDb({
      claims: [d1, p1],
      claim_deltas: [{ id: "old-1", company_id: CO, content_identity: tombId, delta_type: "echoed", operator_disposition: "rejected_pairing" }],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0); // tombstone skipped before any model call
    expect(r.totals.tombstones_respected).toBe(1);
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent")).toBe(true);
    expect(r.deltas.some((d) => d.delta_type === "internally_silent")).toBe(true);
    // tombstone row survives the write phase
    expect(db.tables.claim_deltas.some((row) => row.id === "old-1")).toBe(true);
  });

  it("struck claims are excluded from pairing; their stale rows are deleted (Gate A)", async () => {
    const calls = stubOllama(() => ({ same_subject: true, relation: "echo", confident: true, reason: "x" }));
    const d1 = { ...declared("d1", "evidence score visible always"), status: "struck" };
    const p1 = publicClaim("p1", "score visible on the site");
    const staleId = await pairIdentity("evidence score visible always", "score visible on the site");
    const db = fakeDb({
      // d2 keeps the run alive (a company whose ONLY declared claim is struck
      // honestly short-circuits as no_declared_claims — separate assertion below).
      claims: [d1, { ...declared("d2", "unrelated retention topic entirely") }, p1],
      claim_deltas: [{ id: "old-pair", company_id: CO, content_identity: staleId, delta_type: "echoed", operator_disposition: null }],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    // struck declared claim never reaches the models (d2 shares no tokens with p1,
    // so zero candidates ⇒ zero calls)…
    expect(calls.length).toBe(0);
    // …its counterpart falls to the silence rail…
    expect(r.deltas.some((d) => d.delta_type === "internally_silent" && d.public_claim_id === "p1")).toBe(true);
    // …no publicly_silent row is minted for the struck claim itself…
    expect(r.deltas.some((d) => d.declared_claim_id === "d1")).toBe(false);
    // …and its stale pair row is deleted by the existing recompute.
    expect(db.tables.claim_deltas.some((row) => row.id === "old-pair")).toBe(false);
  });

  it("a company whose only declared claim is struck short-circuits as no_declared_claims", async () => {
    stubOllama(() => ({ same_subject: false }));
    const db = fakeDb({ claims: [{ ...declared("d1", "x y z"), status: "struck" }, publicClaim("p1", "a b c")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    expect(r).toEqual({ ok: false, skipped: "no_declared_claims" });
  });

  it("minimized claims keep participating in pairing (compute-neutral de-emphasis)", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "both describe score visibility" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({
      claims: [{ ...declared("d1", "evidence score visible always"), status: "minimized" }, publicClaim("p1", "score visible on the site")],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.some((d) => d.delta_type === "echoed" && d.declared_claim_id === "d1")).toBe(true);
  });

  it("CH-2a: a pair row is persisted INLINE at verdict time, before later candidates are even proposed", async () => {
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        declared("d2", "weekly release cadence shipping fast"),
        publicClaim("p2", "shipping weekly release cadence observed"),
      ],
    });
    // Candidates: d1×p1 and d2×p2 (disjoint token sets). Capture how many pair
    // rows are already IN THE TABLE when the SECOND pair's proposal arrives.
    let pairsInTableAtSecondPropose = -1;
    let proposeCount = 0;
    stubOllama((model, user) => {
      if (model !== "llama3:70b") {
        proposeCount++;
        if (proposeCount === 2) {
          pairsInTableAtSecondPropose = db.tables.claim_deltas.filter((r) => r.delta_type === "echoed").length;
        }
        return { same_subject: true, relation: "echo", reason: "same subject" };
      }
      return { same_subject: true, relation: "echo", confident: true, reason: JSON.stringify(user).slice(0, 8) };
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    // The first pair's row was banked before the second pair was proposed.
    expect(pairsInTableAtSecondPropose).toBe(1);
    expect(db.tables.claim_deltas.filter((row) => row.delta_type === "echoed").length).toBe(2);
  });

  it("CH-2a: a mid-loop abort leaves banked pairs persisted, NO silences, NO sweep — and the re-run skips the banked pair and finishes the rest", async () => {
    const d1 = declared("d1", "evidence score visible always");
    const p1 = publicClaim("p1", "score visible on the site");
    const d2 = declared("d2", "weekly release cadence shipping fast");
    const p2 = publicClaim("p2", "shipping weekly release cadence observed");
    // A stale row that only the end-of-run sweep would delete — it must SURVIVE
    // the aborted run (sweep never ran) to prove the sweep stayed end-of-run.
    const staleRow = { id: "stale-1", company_id: CO, content_identity: "orphaned-identity", delta_type: "echoed", operator_disposition: null };
    const db = fakeDb({ claims: [d1, p1, d2, p2], claim_deltas: [staleRow] });

    // Run 1: first pair succeeds; second pair's JUDGE dies (require_model throws).
    let judgeCount = 0;
    stubOllama((model) => {
      if (model !== "llama3:70b") return { same_subject: true, relation: "echo", reason: "same subject" };
      judgeCount++;
      if (judgeCount === 2) return "HTTP_FAIL";
      return { same_subject: true, relation: "echo", confident: true, reason: "x" };
    });
    await expect(computeDeltasForCompany(baseArgs(db))).rejects.toThrow(/model call failed/);
    // Banked: pair 1 persisted despite the abort. Valid intermediate state:
    expect(db.tables.claim_deltas.filter((row) => row.delta_type === "echoed" && row.content_identity !== "orphaned-identity").length).toBe(1);
    expect(db.tables.claim_deltas.some((row) => String(row.delta_type).includes("silent"))).toBe(false); // no silences yet
    expect(db.tables.claim_deltas.some((row) => row.id === "stale-1")).toBe(true); // sweep never ran

    // Run 2: healthy models. The banked pair must cost ZERO model calls.
    const calls2 = stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "x" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const r2 = await computeDeltasForCompany(baseArgs(db));
    if (!r2.ok) throw new Error("expected ok");
    // Only the second pair needed models: 1 propose + 1 judge.
    expect(calls2.length).toBe(2);
    expect(calls2.every((c) => c.user.includes("weekly release cadence"))).toBe(true);
    // Table converged: both pairs, no duplicates, stale row swept at end-of-run.
    expect(db.tables.claim_deltas.filter((row) => row.delta_type === "echoed").length).toBe(2);
    expect(db.tables.claim_deltas.some((row) => row.id === "stale-1")).toBe(false);
  });

  it("CH-2a: write:false still writes nothing inline", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "x" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany({ ...baseArgs(db), write: false });
    if (!r.ok) throw new Error("expected ok");
    expect(r.deltas.some((d) => d.delta_type === "echoed")).toBe(true);
    expect(db.tables.claim_deltas.length).toBe(0);
  });

  it("CH-2b-1: scoped run writes ONLY its subset's pair rows — no silences, no sweep, self-marked scoped:true", async () => {
    // d1×p1 and d2×p2 are both pairable; the scope covers only d1. A stale row
    // that a sweep WOULD delete is seeded — it must survive the scoped run.
    const stale = { id: "stale-1", company_id: CO, content_identity: "orphaned-identity", delta_type: "echoed", operator_disposition: null };
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        declared("d2", "weekly release cadence shipping fast"),
        publicClaim("p2", "shipping weekly release cadence observed"),
      ],
      claim_deltas: [stale],
    });
    const calls = stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "x" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const r = await computeDeltasForCompany({ ...baseArgs(db), declaredIds: ["d1"] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.scoped).toBe(true); // self-marked (design-gate F4)
    // Only d1×p1 reached the models (1 propose + 1 judge); d2 was never iterated.
    expect(calls.length).toBe(2);
    expect(calls.every((c) => c.user.includes("evidence score visible always"))).toBe(true);
    // Exactly one pair row written; no silence rows; stale row survived (no sweep).
    expect(db.tables.claim_deltas.filter((row) => row.delta_type === "echoed" && row.content_identity !== "orphaned-identity").length).toBe(1);
    expect(db.tables.claim_deltas.some((row) => String(row.delta_type).includes("silent"))).toBe(false);
    expect(db.tables.claim_deltas.some((row) => row.id === "stale-1")).toBe(true);
    expect(r.totals.rows_deleted).toBe(0);
    expect(r.totals.publicly_silent).toBe(0);
    expect(r.totals.internally_silent).toBe(0);
  });

  it("CH-2b-1 STRUCTURAL GUARD: declared_ids covering 100% of declared claims STILL writes no silences and sweeps nothing (presence-based, not coverage-based)", async () => {
    // ONE declared claim; the scope names it — full coverage. p2 would be
    // internally_silent and stale-1 would be swept in a FULL run; a scoped run
    // must do neither, purely because the param is PRESENT.
    const stale = { id: "stale-1", company_id: CO, content_identity: "orphaned-identity", delta_type: "echoed", operator_disposition: null };
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        publicClaim("p2", "consultants charge hourly rates for projects"),
      ],
      claim_deltas: [stale],
    });
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "x" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const r = await computeDeltasForCompany({ ...baseArgs(db), declaredIds: ["d1"] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.scoped).toBe(true);
    expect(db.tables.claim_deltas.some((row) => row.delta_type === "echoed" && row.content_identity !== "orphaned-identity")).toBe(true);
    expect(db.tables.claim_deltas.some((row) => String(row.delta_type).includes("silent"))).toBe(false); // p2 NOT marked internally_silent
    expect(db.tables.claim_deltas.some((row) => row.id === "stale-1")).toBe(true); // sweep never ran
    expect(r.totals.rows_deleted).toBe(0);
  });

  it("CH-2b-1: plan mode makes ZERO model calls, writes NOTHING, and returns the packing manifest", async () => {
    const d1s = "evidence score visible always";
    const p1s = "score visible on the site"; // cached pair
    const p2s = "score evidence rechecked yearly"; // tombstoned
    const p3s = "score dashboards shipping soon"; // fresh
    const db = fakeDb({
      claims: [
        declared("d1", d1s),
        declared("d2", "unrelated retention cohort work"), // zero candidates
        publicClaim("p1", p1s),
        publicClaim("p2", p2s),
        publicClaim("p3", p3s),
      ],
      claim_deltas: [
        { id: "cached-1", company_id: CO, content_identity: await pairIdentity(d1s, p1s), delta_type: "echoed", operator_disposition: null },
        { id: "tomb-1", company_id: CO, content_identity: await pairIdentity(d1s, p2s), delta_type: "echoed", operator_disposition: "rejected_pairing" },
      ],
    });
    const calls = stubOllama(() => {
      throw new Error("no model call expected in plan mode");
    });
    const r = await computeDeltasForCompany({ ...baseArgs(db), plan: true });
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0);
    expect(db.tables.claim_deltas.length).toBe(2); // zero writes
    expect(r.declared_total).toBe(2);
    expect(r.public_total).toBe(3);
    const m1 = r.claims.find((c) => c.declared_claim_id === "d1");
    expect(m1).toEqual({ declared_claim_id: "d1", candidates_total: 3, candidates_cached: 1, candidates_tombstoned: 1, candidates_rejected: 0, candidates_fresh: 1 });
    const m2 = r.claims.find((c) => c.declared_claim_id === "d2");
    expect(m2?.candidates_total).toBe(0);
    expect(m2?.candidates_fresh).toBe(0);
    expect(r.fresh_total).toBe(1);
    // No hash/identity leaves the core — counts and claim ids only (PCT-1).
    expect(JSON.stringify(r)).not.toContain(await pairIdentity(d1s, p1s));
  });

  it("CH-2b-1: chunked scoped runs then ONE unscoped finalize == a full run (silences computed, only genuinely-stale swept, tombstones + chunk rows spared)", async () => {
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        publicClaim("p1", "score visible on the site"),
        declared("d2", "weekly release cadence shipping fast"),
        publicClaim("p2", "shipping weekly release cadence observed"),
        declared("d3", "become the strategy system of record"), // publicly_silent
        publicClaim("p3", "consultants charge hourly rates for projects"), // internally_silent
      ],
      claim_deltas: [
        { id: "stale-1", company_id: CO, content_identity: "orphaned-identity", delta_type: "echoed", operator_disposition: null },
        { id: "tomb-1", company_id: CO, content_identity: "orphaned-tombstone", delta_type: "echoed", operator_disposition: "rejected_pairing" },
      ],
    });
    const echoScript = (model: string) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "x" }
        : { same_subject: true, relation: "echo", reason: "same subject" };
    // Chunk 1 (d1) and chunk 2 (d2): pairs land inline, nothing else happens.
    stubOllama(echoScript);
    const c1 = await computeDeltasForCompany({ ...baseArgs(db), declaredIds: ["d1"] });
    if (!c1.ok) throw new Error("expected ok");
    stubOllama(echoScript);
    const c2 = await computeDeltasForCompany({ ...baseArgs(db), declaredIds: ["d2"] });
    if (!c2.ok) throw new Error("expected ok");
    const chunkRowIds = db.tables.claim_deltas.filter((row) => row.delta_type === "echoed" && String(row.id).startsWith("row-")).map((row) => row.id);
    expect(chunkRowIds.length).toBe(2);
    expect(db.tables.claim_deltas.some((row) => String(row.delta_type).includes("silent"))).toBe(false);

    // Finalize: unscoped. Both pairs hit the kept path ⇒ ZERO model calls here
    // (this fixture has no model-rejected candidates — F1's re-propose tax
    // applies only to those). Silences computed; only stale-1 swept.
    const finalizeCalls = stubOllama(() => {
      throw new Error("no model call expected in the finalize (all pair identities cached)");
    });
    const fin = await computeDeltasForCompany(baseArgs(db));
    if (!fin.ok) throw new Error("expected ok");
    expect(fin.scoped).toBe(false);
    expect(finalizeCalls.length).toBe(0);
    // Chunk-written rows survive by IDENTITY (kept path) — same physical ids.
    for (const id of chunkRowIds) expect(db.tables.claim_deltas.some((row) => row.id === id)).toBe(true);
    expect(db.tables.claim_deltas.some((row) => row.delta_type === "publicly_silent" && row.declared_claim_id === "d3")).toBe(true);
    expect(db.tables.claim_deltas.some((row) => row.delta_type === "internally_silent" && row.public_claim_id === "p3")).toBe(true);
    expect(db.tables.claim_deltas.some((row) => row.id === "stale-1")).toBe(false); // genuinely stale ⇒ swept
    expect(db.tables.claim_deltas.some((row) => row.id === "tomb-1")).toBe(true); // tombstone spared
    expect(fin.totals.rows_deleted).toBe(1);
  });

  it("recompute is idempotent: second run inserts nothing and preserves dispositions", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: true, relation: "echo", confident: true, reason: "both describe score visibility" }
        : { same_subject: true, relation: "echo", reason: "same subject" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r1 = await computeDeltasForCompany(baseArgs(db));
    if (!r1.ok) throw new Error("expected ok");
    const countAfterFirst = db.tables.claim_deltas.length;
    // operator acts on a row between runs
    db.tables.claim_deltas[0].operator_disposition = "queued";

    const calls2 = stubOllama(() => { throw new Error("no model call expected on identical recompute"); });
    const r2 = await computeDeltasForCompany(baseArgs(db));
    if (!r2.ok) throw new Error("expected ok");
    expect(calls2.length).toBe(0);
    expect(r2.totals.rows_new).toBe(0);
    expect(r2.totals.rows_deleted).toBe(0);
    expect(db.tables.claim_deltas.length).toBe(countAfterFirst);
    expect(db.tables.claim_deltas[0].operator_disposition).toBe("queued");
  });
});

// ── NEG-CACHE: frozen model rejections (claim_delta_rejections) ───────────────
describe("negative cache (freeze-on-reject)", () => {
  const seededRejection = (identity: string, over: Row = {}): Row => ({
    id: "rej-seed-1", company_id: CO, declared_claim_id: "d1", public_claim_id: "p1",
    content_identity: identity, rejected_by: "proposer", gen_model: "qwen2.5:14b-instruct",
    judge_model: null, reject_reason: "different subjects", ...over,
  });

  it("a banked rejection skips BOTH model calls and leaves both claims on their silence rails", async () => {
    const d1 = declared("d1", "evidence score visible always");
    const p1 = publicClaim("p1", "score visible on the site");
    const rejId = await pairIdentity(String(d1.statement), String(p1.statement));
    const calls = stubOllama(() => { throw new Error("no model call may happen for a cached rejection"); });
    const db = fakeDb({ claims: [d1, p1], claim_delta_rejections: [seededRejection(rejId)] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0);
    expect(r.totals.rejections_cached).toBe(1);
    // silences unchanged: rejected pairing = unpaired claims, same as a live rejection
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent" && d.declared_claim_id === "d1")).toBe(true);
    expect(r.deltas.some((d) => d.delta_type === "internally_silent" && d.public_claim_id === "p1")).toBe(true);
    // the frozen row survives the finalize untouched
    expect(db.tables.claim_delta_rejections.some((row) => row.id === "rej-seed-1")).toBe(true);
  });

  it("proposer rejection banks inline with rejected_by='proposer', NULL judge_model, verbatim reason", async () => {
    stubOllama(() => ({ same_subject: false, relation: null, reason: "coffee is not billing software" }));
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.pairs_rejected).toBe(1);
    const row = db.tables.claim_delta_rejections[0];
    expect(row.rejected_by).toBe("proposer");
    expect(row.judge_model).toBeNull();
    expect(row.reject_reason).toBe("coffee is not billing software");
    expect(row.declared_claim_id).toBe("d1");
    expect(row.public_claim_id).toBe("p1");
  });

  it("judge rejection banks inline with rejected_by='judge', the judge model named, the JUDGE's reason", async () => {
    stubOllama((model) =>
      model === "llama3:70b"
        ? { same_subject: false, relation: null, reason: "buzzword overlap only" }
        : { same_subject: true, relation: "echo", reason: "proposer says same" },
    );
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    const row = db.tables.claim_delta_rejections[0];
    expect(row.rejected_by).toBe("judge");
    expect(row.judge_model).toBe("llama3:70b");
    expect(row.reject_reason).toBe("buzzword overlap only");
  });

  it("SCOPED run banks rejections (verdict rows law) but NEVER prunes orphans", async () => {
    stubOllama(() => ({ same_subject: false, relation: null, reason: "no" }));
    const orphan = seededRejection("orphaned-rejection-identity", { id: "rej-orphan" });
    const db = fakeDb({
      claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")],
      claim_delta_rejections: [orphan],
    });
    const r = await computeDeltasForCompany({ ...baseArgs(db), declaredIds: ["d1"] });
    if (!r.ok) throw new Error("expected ok");
    expect(r.scoped).toBe(true);
    // the live rejection banked from the scoped chunk…
    expect(db.tables.claim_delta_rejections.filter((row) => row.rejected_by === "proposer").length).toBe(2);
    // …and the orphan SURVIVED (prune is finalize-only, structurally)
    expect(db.tables.claim_delta_rejections.some((row) => row.id === "rej-orphan")).toBe(true);
    expect(r.totals.rejections_pruned).toBe(0);
  });

  it("FINALIZE prunes exactly the orphans: dead identity deleted, live rejection kept, tombstone untouched", async () => {
    const d1 = declared("d1", "evidence score visible always");
    const p1 = publicClaim("p1", "score visible on the site");
    const liveId = await pairIdentity(String(d1.statement), String(p1.statement));
    const tomb = { id: "tomb-1", company_id: CO, content_identity: "tomb-identity", delta_type: "echoed", operator_disposition: "rejected_pairing" };
    const calls = stubOllama(() => { throw new Error("cached rejection must not re-roll"); });
    const db = fakeDb({
      claims: [d1, p1],
      claim_deltas: [tomb],
      claim_delta_rejections: [
        seededRejection(liveId, { id: "rej-live" }),
        seededRejection("dead-identity-claims-gone", { id: "rej-dead" }),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0);
    expect(r.totals.rejections_pruned).toBe(1);
    expect(db.tables.claim_delta_rejections.some((row) => row.id === "rej-live")).toBe(true);
    expect(db.tables.claim_delta_rejections.some((row) => row.id === "rej-dead")).toBe(false);
    // operator tombstone (other table, other law) untouched by the prune
    expect(db.tables.claim_deltas.some((row) => row.id === "tomb-1")).toBe(true);
  });

  it("STRUCK declared claim's rejection is pruned at the next finalize (identity no longer produced)", async () => {
    const struckD = { ...declared("d1", "evidence score visible always"), status: "struck" };
    const p1 = publicClaim("p1", "score visible on the site");
    const struckPairId = await pairIdentity("evidence score visible always", "score visible on the site");
    stubOllama(() => ({ same_subject: false, relation: null, reason: "no" }));
    const db = fakeDb({
      claims: [struckD, declared("d2", "unrelated retention topic entirely"), p1],
      claim_delta_rejections: [seededRejection(struckPairId, { id: "rej-struck" })],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(db.tables.claim_delta_rejections.some((row) => row.id === "rej-struck")).toBe(false);
    expect(r.totals.rejections_pruned).toBe(1);
  });

  it("intra-run identity collision (two declared claims, identical text) banks exactly ONE rejection row", async () => {
    stubOllama(() => ({ same_subject: false, relation: null, reason: "no" }));
    const db = fakeDb({
      claims: [
        declared("d1", "evidence score visible always"),
        declared("d2", "evidence score visible always"), // identical text ⇒ same pair identity
        publicClaim("p1", "score visible on the site"),
      ],
    });
    const r = await computeDeltasForCompany(baseArgs(db));
    if (!r.ok) throw new Error("expected ok");
    expect(db.tables.claim_delta_rejections.length).toBe(1);
    // the second encounter was a cache hit, not a re-roll
    expect(r.totals.pairs_rejected).toBe(1);
    expect(r.totals.rejections_cached).toBe(1);
  });

  it("write:false banks nothing", async () => {
    stubOllama(() => ({ same_subject: false, relation: null, reason: "no" }));
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), publicClaim("p1", "score visible on the site")] });
    const r = await computeDeltasForCompany({ ...baseArgs(db), write: false });
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.pairs_rejected).toBe(1);
    expect(db.tables.claim_delta_rejections.length).toBe(0);
  });

  it("plan classifies tombstoned → cached → rejected → fresh and reports candidates_rejected + rejected_total", async () => {
    // Four publics, all sharing tokens with d1: one tombstoned, one cached pair,
    // one banked rejection, one genuinely fresh.
    const d1 = declared("d1", "evidence score visible always");
    const pTomb = publicClaim("pT", "score evidence archived yearly");
    const pCached = publicClaim("pC", "score visible on the site");
    const pRej = publicClaim("pR", "evidence dashboards always shown");
    const pFresh = publicClaim("pF", "visible score for every evidence review");
    const tombId = await pairIdentity(String(d1.statement), String(pTomb.statement));
    const cachedId = await pairIdentity(String(d1.statement), String(pCached.statement));
    const rejId = await pairIdentity(String(d1.statement), String(pRej.statement));
    const calls = stubOllama(() => { throw new Error("plan mode may not call models"); });
    const db = fakeDb({
      claims: [d1, pTomb, pCached, pRej, pFresh],
      claim_deltas: [
        { id: "t1", company_id: CO, content_identity: tombId, delta_type: "echoed", operator_disposition: "rejected_pairing" },
        { id: "c1", company_id: CO, content_identity: cachedId, delta_type: "echoed", operator_disposition: null },
      ],
      claim_delta_rejections: [seededRejection(rejId, { public_claim_id: "pR" })],
    });
    const r = await computeDeltasForCompany({ ...baseArgs(db), plan: true });
    if (!r.ok) throw new Error("expected ok");
    expect(calls.length).toBe(0);
    const c = r.claims[0];
    expect(c.candidates_total).toBe(4);
    expect(c.candidates_tombstoned).toBe(1);
    expect(c.candidates_cached).toBe(1);
    expect(c.candidates_rejected).toBe(1);
    expect(c.candidates_fresh).toBe(1);
    expect(r.fresh_total).toBe(1);
    expect(r.rejected_total).toBe(1);
  });
});

// SELF-VOICE EXCLUSION — a public_observed claim sourced from the company's OWN voice
// (signal voice_class='client_voice') must not count as the market confirming the company.
// It is removed from the observed side: no echo, no divergence, no internally_silent; the
// declared claim it would have matched lands publicly_silent ("not-found-repeated", now TRUE).
// The exclusion targets ONLY the positively-identified client_voice — NULL/unknown and other
// voices (outside/market/competitor) still participate. Nothing is deleted, pruned or
// tombstoned; the claim row and its signal/ref rows stay fully queryable.
describe("self-voice exclusion at the echo seam", () => {
  // A judge that echoes anything it is handed (valid span auto-injected by stubOllama).
  const alwaysEcho = () => stubOllama((model) =>
    model === "llama3:70b"
      ? { same_subject: true, relation: "echo", confident: true, reason: "match" }
      : { same_subject: true, relation: "echo", reason: "same subject" },
  );
  const DECL = "evidence score visible always";
  const OBS = "score visible on the site"; // shares score+visible ⇒ candidate

  it("(a) self-voice observed + would-echo ⇒ NO echo; declared lands publicly_silent, not rejection/divergence", async () => {
    alwaysEcho();
    const p = voicedPublic("p1", OBS, "client_voice");
    const db = fakeDb({ claims: [declared("d1", DECL), p.claim], signals: [p.signal], claim_signal_refs: [p.ref] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, true)); // write=true — prove nothing banked
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.self_voice_excluded).toBe(1);
    expect(r.totals.public).toBe(0); // the only observed claim was self-voice → market pool empty
    // declared → publicly_silent (not-found-repeated), NOT a rejection, NOT a divergence
    expect(r.deltas.some((d) => d.delta_type === "echoed")).toBe(false);
    expect(r.deltas.some((d) => d.delta_type === "divergent")).toBe(false);
    expect(r.deltas.some((d) => d.delta_type === "publicly_silent" && d.declared_claim_id === "d1")).toBe(true);
    expect(db.tables.claim_delta_rejections.length).toBe(0); // no freeze — revisitable
    // the self-voice claim produced NO delta of any kind (it is not the market)
    expect(r.deltas.some((d) => d.public_claim_id === "p1")).toBe(false);
  });

  it("(a-red) SAME text + SAME judge, but signal is UNCLASSIFIED (voice null) ⇒ echo IS produced", async () => {
    // Identical declared/observed/judge to (a); the ONLY difference is the source voice.
    // Proves the exclusion is the sole suppressor AND the NULL policy = include (not excluded).
    alwaysEcho();
    const p = voicedPublic("p1", OBS, null);
    const db = fakeDb({ claims: [declared("d1", DECL), p.claim], signals: [p.signal], claim_signal_refs: [p.ref] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, false));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.self_voice_excluded).toBe(0); // null is NOT self-voice
    expect(r.deltas.some((d) => d.delta_type === "echoed" && d.declared_claim_id === "d1" && d.public_claim_id === "p1")).toBe(true);
  });

  it("(b) outside_voice_about_client (Kaiser, CSU) STILL echoes — the genuine market voice is untouched", async () => {
    alwaysEcho();
    const kaiser = voicedPublic("obs-kaiser", "Kaiser Permanente lists Edgewood CSU crisis stabilization unit for youth", "outside_voice_about_client");
    const csu = voicedPublic("obs-csu", "GuideStar profile: Edgewood CSU crisis stabilization unit serving youth", "outside_voice_about_client");
    const db = fakeDb({
      claims: [declared("d1", "Edgewood runs the only youth crisis stabilization unit CSU"), kaiser.claim, csu.claim],
      signals: [kaiser.signal, csu.signal],
      claim_signal_refs: [kaiser.ref, csu.ref],
    });
    const r = await computeDeltasForCompany(baseArgs(db, CO, false));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.self_voice_excluded).toBe(0);
    expect(r.deltas.some((d) => d.delta_type === "echoed" && d.public_claim_id === "obs-kaiser")).toBe(true);
    expect(r.deltas.some((d) => d.delta_type === "echoed" && d.public_claim_id === "obs-csu")).toBe(true);
  });

  it("(c) self-voice with NO declared match is NOT surfaced as internally_silent (it is not the market speaking)", async () => {
    alwaysEcho();
    // p1 is self-voice and shares no tokens with d1 → would normally be internally_silent.
    const p = voicedPublic("p1", "our own homepage tagline about compassionate care", "client_voice");
    const db = fakeDb({ claims: [declared("d1", "evidence score visible always"), p.claim], signals: [p.signal], claim_signal_refs: [p.ref] });
    const r = await computeDeltasForCompany(baseArgs(db, CO, false));
    if (!r.ok) throw new Error("expected ok");
    expect(r.totals.self_voice_excluded).toBe(1);
    expect(r.deltas.some((d) => d.delta_type === "internally_silent" && d.public_claim_id === "p1")).toBe(false);
    expect(r.deltas.some((d) => d.public_claim_id === "p1")).toBe(false);
  });

  it("(d) NON-DELETION: the excluded self-voice claim and its signal/ref rows remain fully queryable after a write run", async () => {
    alwaysEcho();
    const p = voicedPublic("p1", OBS, "client_voice");
    const db = fakeDb({ claims: [declared("d1", DECL), p.claim], signals: [p.signal], claim_signal_refs: [p.ref] });
    await computeDeltasForCompany(baseArgs(db, CO, true)); // write=true
    // exclusion filters an in-memory array; it must never touch a stored row.
    expect(db.tables.claims.some((c) => c.id === "p1")).toBe(true);
    expect(db.tables.signals.some((s) => s.id === "sig-p1")).toBe(true);
    expect(db.tables.claim_signal_refs.some((rf) => rf.claim_id === "p1")).toBe(true);
  });
});
