// GATE B-1 — pairing_kind falsification tests (operator ruling 2026-08-20, option a).
//
// Four falsification pairs, each exercising a production guard:
//   (i)   a run of one kind cannot sweep the other kind's rows (and vice versa)
//   (ii)  an internal-kind row cannot render in First Read; a public-kind row
//         cannot render in Extracts (render-level, through the real hooks)
//   (iii) the public-kind declared side rejects an internal_declared claim and
//         an analysis-backed public claim
//   (iv)  the gap integrity row is absent before the public finalize, present
//         (completed) after it, and a simulated failure writes status='failed'
//
// Shown red with each guard disabled (pre-trust runs recorded in the gate report).

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const CO = "co-1";
type Row = Record<string, unknown>;

// ── Shared in-memory supabase fake (chain + insert/delete, kind defaults) ─────
function fakeDb(seed: Record<string, Row[]>) {
  const kindDefault = (t: string, r: Row): Row =>
    (t === "claim_deltas" || t === "claim_delta_rejections") && r["pairing_kind"] === undefined
      ? { ...r, pairing_kind: "internal_vs_public" }
      : r;
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => kindDefault(t, r));
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
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => (vs as unknown[]).includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      like: () => b, not: () => b, gte: () => b, order: () => b,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      abortSignal: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(res),
      insert: (payload: Row) => {
        tables[table].push(kindDefault(table, { id: `row-${nextId++}`, ...payload }));
        return Promise.resolve({ error: null });
      },
      delete: () => ({
        in: (c: string, ids: unknown[]) => {
          tables[table] = tables[table].filter((r) => !(ids as unknown[]).includes(r[c]));
          return Promise.resolve({ error: null });
        },
      }),
    });
    return b;
  };
  // DELETE AUDIT (2026-09-03): the stale sweep deletes through delete_claim_deltas_audited (company-scoped,
  // reason required); the fake models the RPC so the kind-scoped sweep assertions below stay byte-identical.
  const rpc = (fn: string, a: { p_company_id?: string; p_ids?: string[]; p_reason?: string }) => {
    if (fn !== "delete_claim_deltas_audited") return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    if (!a.p_reason?.trim()) return Promise.resolve({ data: null, error: { message: "a reason is required" } });
    const ids = a.p_ids ?? [];
    tables["claim_deltas"] ??= [];
    tables["claim_deltas"] = tables["claim_deltas"].filter((r) => !(ids.includes(r.id as string) && r.company_id === a.p_company_id));
    return Promise.resolve({ data: ids.length, error: null });
  };
  return { tables, from, rpc };
}

// Ollama stub: no candidate ever survives the prefilter in these fixtures, so the
// model boundary must never be hit — throw loudly if it is.
function stubNoModelCalls() {
  vi.stubGlobal("fetch", async () => { throw new Error("model boundary must not be reached"); });
}

import {
  computeDeltasForCompany,
  writeGapPairsIntegrity,
  GAP_PAIRS_INTEGRITY_COMPONENT,
} from "../../supabase/functions/_shared/claimDeltaSynthesis.ts";

const internalClaim = (id: string, statement: string): Row =>
  ({ id, company_id: CO, provenance: "internal_declared", status: "active", statement, topic: null, claim_type: "observation", proof_category: null, raw_payload: null });
const publicClaim = (id: string, statement: string): Row =>
  ({ id, company_id: CO, provenance: "public_observed", status: "active", statement, topic: null, claim_type: "observation", proof_category: null, raw_payload: null });

const VOICE_FIXTURE = {
  companies: [{ id: CO, website: "https://co-1.com" }],
  signals: [
    { id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://co-1.com/a" },
    { id: "s-an", company_id: CO, voice_class: "analysis", source_url: "https://co-1.com/b" },
    { id: "s-3p", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://yelp.com/x" },
  ],
  claim_signal_refs: [
    { company_id: CO, claim_id: "pub-own", signal_id: "s-own" },
    { company_id: CO, claim_id: "pub-analysis", signal_id: "s-an" },
    { company_id: CO, claim_id: "pub-3p", signal_id: "s-3p" },
  ],
};

describe("(i) kind-scoped sweep isolation", () => {
  it("an internal finalize cannot delete a public-kind row; a public finalize cannot delete internal rows", async () => {
    stubNoModelCalls();
    const db = fakeDb({
      claims: [internalClaim("d1", "alpha beta gamma delta"), publicClaim("pub-3p", "totally different words entirely")],
      claim_deltas: [
        // Stale INTERNAL row (identity matches nothing this run) — swept by an internal run.
        { id: "int-stale", company_id: CO, content_identity: "int-stale-id", delta_type: "echoed", operator_disposition: null, pairing_kind: "internal_vs_public" },
        // PUBLIC row — must survive an internal finalize untouched.
        { id: "pub-row", company_id: CO, content_identity: "pub-id", delta_type: "echoed", operator_disposition: null, pairing_kind: "public_vs_public" },
      ],
      ...VOICE_FIXTURE,
      claim_delta_rejections: [],
    });
    const res = await computeDeltasForCompany({
      supabase: db as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: true,
    });
    expect(res.ok).toBe(true);
    const ids = db.tables.claim_deltas.map((r) => r.id);
    expect(ids).not.toContain("int-stale"); // internal stale row swept (control)
    expect(ids).toContain("pub-row"); // FALSIFICATION: public row survives the internal sweep

    // And the mirror: a public finalize leaves internal rows standing.
    const db2 = fakeDb({
      claims: [publicClaim("pub-own", "own voice statement words"), publicClaim("pub-3p", "unrelated market text entirely")],
      claim_deltas: [
        { id: "int-keep", company_id: CO, content_identity: "int-id", delta_type: "publicly_silent", operator_disposition: null, pairing_kind: "internal_vs_public" },
      ],
      ...VOICE_FIXTURE,
      claim_delta_rejections: [],
      integrity_runs: [],
    });
    const res2 = await computeDeltasForCompany({
      supabase: db2 as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: true, pairingKind: "public_vs_public",
    });
    expect(res2.ok).toBe(true);
    expect(db2.tables.claim_deltas.map((r) => r.id)).toContain("int-keep"); // FALSIFICATION
  });
});

describe("(iii) public-kind declared side", () => {
  it("rejects internal_declared and analysis-backed claims; admits the client-voice public claim", async () => {
    stubNoModelCalls();
    const db = fakeDb({
      claims: [
        internalClaim("int-1", "internal words one two"),
        publicClaim("pub-own", "own voice statement words"),
        publicClaim("pub-analysis", "our analytic reading words"),
        publicClaim("pub-3p", "market words three four"),
      ],
      ...VOICE_FIXTURE,
      claim_deltas: [], claim_delta_rejections: [],
    });
    const plan = await computeDeltasForCompany({
      supabase: db as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: false, plan: true, pairingKind: "public_vs_public",
    });
    if (!plan.ok || !("plan" in plan)) throw new Error("plan failed");
    expect(plan.declared_total).toBe(1); // FALSIFICATION: only pub-own
    expect(plan.claims.every((c) => c.declared_claim_id === "pub-own" || plan.claims.length === 0)).toBe(true);
    // The internal path is untouched: an internal plan still sees the internal claim.
    const planInt = await computeDeltasForCompany({
      supabase: db as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: false, plan: true,
    });
    if (!planInt.ok || !("plan" in planInt)) throw new Error("internal plan failed");
    expect(planInt.declared_total).toBe(1);
  });
});

describe("(iv) gap integrity record", () => {
  it("absent before the public finalize; completed row present after", async () => {
    stubNoModelCalls();
    const db = fakeDb({
      claims: [publicClaim("pub-own", "own voice statement words"), publicClaim("pub-3p", "unrelated market text entirely")],
      ...VOICE_FIXTURE,
      claim_deltas: [], claim_delta_rejections: [], integrity_runs: [],
    });
    expect(db.tables.integrity_runs.length).toBe(0); // absent BEFORE
    const res = await computeDeltasForCompany({
      supabase: db as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: true, pairingKind: "public_vs_public",
    });
    expect(res.ok).toBe(true);
    const rows = db.tables.integrity_runs;
    expect(rows.length).toBe(1); // FALSIFICATION: present AFTER, written by the finalize
    expect(rows[0].component).toBe(GAP_PAIRS_INTEGRITY_COMPONENT);
    expect(rows[0].status).toBe("completed");
  });

  it("a simulated failure writes status='failed' with the error", async () => {
    const db = fakeDb({ integrity_runs: [] });
    await writeGapPairsIntegrity(db as never, CO, {
      status: "failed", ranAtIso: "2026-08-20T00:00:00Z", error: "isolate died mid-finalize",
    });
    expect(db.tables.integrity_runs[0].status).toBe("failed");
    expect(db.tables.integrity_runs[0].error).toBe("isolate died mid-finalize");
  });

  it("an internal finalize writes NO gap integrity row (public-only record)", async () => {
    stubNoModelCalls();
    const db = fakeDb({
      claims: [internalClaim("d1", "alpha beta gamma delta"), publicClaim("pub-3p", "totally different words entirely")],
      ...VOICE_FIXTURE,
      claim_deltas: [], claim_delta_rejections: [], integrity_runs: [],
    });
    await computeDeltasForCompany({
      supabase: db as never, companyId: CO, ollamaUrl: "http://localhost:11434/v1",
      nowIso: "2026-08-20T00:00:00Z", write: true,
    });
    expect(db.tables.integrity_runs.length).toBe(0);
  });
});

// ── (ii) render-level cross-leak — through the real hooks ─────────────────────
let hookDb = fakeDb({});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => hookDb.from(t), functions: { invoke: vi.fn() } },
  HAS_SUPABASE_CREDENTIALS: true,
  RESOLVED_SUPABASE_URL: "http://localhost",
  isFrozenCompany: () => false,
}));

import { useFirstReadPreviewData } from "@/views/client/firstReadPreview/useFirstReadPreviewData";
import { useStrategicDelta } from "@/hooks/useStrategicDelta";

describe("(ii) render cross-leak", () => {
  it("First Read preview gap renders public-kind rows only", async () => {
    hookDb = fakeDb({
      companies: [{ id: CO, name: "Co", website: "https://co-1.com" }],
      claims: [
        { id: "pub-own", company_id: CO, provenance: "public_observed", status: "active", topic: null, statement: "Own voice claim.", raw_payload: {} },
        { id: "pub-3p", company_id: CO, provenance: "public_observed", status: "active", topic: null, statement: "Market claim.", raw_payload: {} },
      ],
      claim_deltas: [
        { id: "d-int", company_id: CO, delta_type: "echoed", declared_claim_id: "pub-own", public_claim_id: "pub-3p", content_identity: "ci-int", pairing_kind: "internal_vs_public" },
        { id: "d-pub", company_id: CO, delta_type: "echoed", declared_claim_id: "pub-own", public_claim_id: "pub-3p", content_identity: "ci-pub", pairing_kind: "public_vs_public" },
      ],
      claim_signal_refs: [{ company_id: CO, claim_id: "pub-own", signal_id: "s-own" }],
      signals: [{ id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://co-1.com/a", signal_band: "outside", superseded_at: null, evidence_excerpt: "x", confidence_to_use: "medium", source_title: null, source_id: null, event_date: null }],
      public_baseline_runs: [], signal_recurrence_verdicts: [], market_options: [],
      operator_primary_selection: [], first_read_featured_items: [], mojo_scores: [],
      integrity_runs: [],
    });
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // Exactly ONE pair renders — the public-kind one (identities differ; both would
    // render if the kind filter were dropped).
    expect(result.current.data.gapPairs.length).toBe(1); // FALSIFICATION: 2 with filter off
  });

  it("Extracts (useStrategicDelta) renders internal-kind rows only", async () => {
    hookDb = fakeDb({
      signals: [], delta_dispositions: [], public_baseline_runs: [],
      claim_deltas: [
        { id: "d-int", company_id: CO, delta_type: "publicly_silent", declared_claim_id: "c-int", public_claim_id: null, pairing_basis: "judge_confirmed", judge_reason: null, operator_disposition: null, pairing_kind: "internal_vs_public" },
        { id: "d-pub", company_id: CO, delta_type: "publicly_silent", declared_claim_id: "c-pub", public_claim_id: null, pairing_basis: "judge_confirmed", judge_reason: null, operator_disposition: null, pairing_kind: "public_vs_public" },
      ],
      claims: [
        { id: "c-int", company_id: CO, statement: "internal declared", provenance: "internal_declared", status: "active", struck_reason: null, struck_at: null, struck_by: null, raw_payload: null, proof_category: null },
        { id: "c-pub", company_id: CO, statement: "public own-voice", provenance: "public_observed", status: "active", struck_reason: null, struck_at: null, struck_by: null, raw_payload: null, proof_category: null },
      ],
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    const { result } = renderHook(() => useStrategicDelta(CO), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const ids = (result.current.data?.claimDeltas ?? []).map((d: { id: string }) => d.id);
    expect(ids).toContain("d-int");
    expect(ids).not.toContain("d-pub"); // FALSIFICATION: leaks with the filter off
  });
});
