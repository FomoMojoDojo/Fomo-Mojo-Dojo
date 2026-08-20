// R1 OUTSIDE-ONLY GATE (2026-08-20) — per-site falsification tests.
//
// The planted fixture is the exact shape of the CB2 leak: a declared claim with ZERO
// signal refs whose birth record (raw_payload.basis) cites "planted.pdf". Under the
// retired infer-by-absence rule it rendered; under R1 every First Read read path must
// exclude it. One test per call site (not just the helper), plus a clean no-ref claim
// that must PASS at every site (intake/told-us claims stay included — R2).

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ── Fixture ids ────────────────────────────────────────────────────────────────
const CO = "co-1";
const PLANTED = "claim-planted"; // no refs; basis cites planted.pdf → must be excluded EVERYWHERE
const CLEAN = "claim-clean"; // no refs; empty birth record → must pass everywhere
const PUB = "claim-public"; // public_observed record side
const PLANTED_PAYLOAD = { basis: "verbatim sentences, planted.pdf p.3", source: "manual_remint_test" };

// ── Minimal supabase chain fake ───────────────────────────────────────────────
// Supports the query shapes these hooks use: select/eq/in/is/like/not/order/limit/
// gte/abortSignal chain into a thenable resolving {data, error}; maybeSingle → first row.
type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const builder: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => {
      rows = fn(rows);
      return builder;
    };
    Object.assign(builder, {
      select: () => builder,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => (vs as unknown[]).includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      like: (c: string, pat: string) =>
        chain((r) => r.filter((x) => new RegExp("^" + pat.replace(/%/g, ".*") + "$").test(String(x[c] ?? "")))),
      not: () => builder,
      gte: () => builder,
      order: () => builder,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      abortSignal: () => builder,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve),
    });
    return builder;
  };
  return { from, functions: { invoke: vi.fn() } };
}

let db = fakeSupabase({});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => db.from(t), functions: { invoke: vi.fn() } },
  HAS_SUPABASE_CREDENTIALS: true,
  RESOLVED_SUPABASE_URL: "http://localhost",
}));

import { useFirstReadPreviewData } from "@/views/client/firstReadPreview/useFirstReadPreviewData";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { useCuratedTensions } from "@/hooks/useCuratedTensions";
import {
  gateCheckRailDeltas,
  featuredEligibleDeltas,
  uploadDerivedClaimIds,
  citedDocumentName,
  UPLOADED_DOC_NAME_RE,
} from "../../supabase/functions/_shared/firstReadProvenance.ts";
import { deriveSourceTag } from "@/views/client/firstReadPreview/deriveSourceTag";

const claimsFixture: Row[] = [
  { id: PLANTED, company_id: CO, provenance: "internal_declared", status: "active", topic: "positioning", statement: "Planted doc statement.", raw_payload: PLANTED_PAYLOAD, created_at: "2026-08-01T00:00:00Z" },
  { id: CLEAN, company_id: CO, provenance: "internal_declared", status: "active", topic: "positioning", statement: "Clean declared statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
  { id: PUB, company_id: CO, provenance: "public_observed", status: "active", topic: null, statement: "Public record statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
];

// ── SITE 1+2: preview declared (Act 1) + preview gap (beat 4) ─────────────────
describe("R1 site: useFirstReadPreviewData", () => {
  it("declared: planted no-ref claim is excluded; clean no-ref claim passes", async () => {
    db = fakeSupabase({
      companies: [{ id: CO, name: "Co", website: null }],
      claims: claimsFixture,
      claim_deltas: [
        { id: "d1", company_id: CO, delta_type: "echoed", declared_claim_id: PLANTED, public_claim_id: PUB, content_identity: "ci-1" },
        { id: "d2", company_id: CO, delta_type: "echoed", declared_claim_id: CLEAN, public_claim_id: PUB, content_identity: "ci-2" },
      ],
      claim_signal_refs: [],
      signals: [],
      public_baseline_runs: [],
      signal_recurrence_verdicts: [],
      market_options: [],
      operator_primary_selection: [],
      first_read_featured_items: [],
      mojo_scores: [],
      positioning_canvases: [],
    });
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const statements = result.current.data.declared.map((c) => c.statement);
    expect(statements).toContain("Clean declared statement.");
    expect(statements).not.toContain("Planted doc statement."); // FALSIFICATION
    // gap site: only the clean pair renders
    const declaredSides = result.current.data.gapPairs.map((p) => p.declared);
    expect(declaredSides).toContain("Clean declared statement.");
    expect(declaredSides).not.toContain("Planted doc statement."); // FALSIFICATION
  });
});

// ── SITE 3: /first-read Check rail (useFirstReadCapture's gate) ───────────────
describe("R1 site: check rail (gateCheckRailDeltas — the exact production filter)", () => {
  const dRows = [
    { id: "d1", declared_claim_id: PLANTED, public_claim_id: null },
    { id: "d2", declared_claim_id: CLEAN, public_claim_id: null },
    { id: "d3", declared_claim_id: null, public_claim_id: PUB },
  ];
  it("planted no-ref declared claim's delta is dropped; clean stays", () => {
    const out = gateCheckRailDeltas(dRows, [], new Map(), [
      { id: PLANTED, raw_payload: PLANTED_PAYLOAD },
      { id: CLEAN, raw_payload: {} },
      { id: PUB, raw_payload: {} },
    ]);
    expect(out.map((d) => d.id)).toEqual(["d2", "d3"]); // FALSIFICATION: d1 gone
  });
  it("tier a still applies: upload-ref'd public claim drops its delta", () => {
    const out = gateCheckRailDeltas(
      dRows,
      [{ claim_id: PUB, signal_id: "s-up" }],
      new Map([["s-up", "uploaded_file"]]),
      [{ id: PLANTED, raw_payload: PLANTED_PAYLOAD }, { id: CLEAN, raw_payload: {} }, { id: PUB, raw_payload: {} }],
    );
    expect(out.map((d) => d.id)).toEqual(["d2"]);
  });
});

// ── SITE 4: open questions ────────────────────────────────────────────────────
describe("R1 site: useFirstReadOpenQuestions", () => {
  it("silent_delta question anchored on the planted claim is excluded; clean anchor passes", async () => {
    db = fakeSupabase({
      first_read_open_questions: [
        { company_id: CO, status: "live", question_text: "Planted question?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anch-planted" },
        { company_id: CO, status: "live", question_text: "Clean question?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anch-clean" },
      ],
      claim_deltas: [
        { company_id: CO, content_identity: "anch-planted", declared_claim_id: PLANTED, public_claim_id: null },
        { company_id: CO, content_identity: "anch-clean", declared_claim_id: CLEAN, public_claim_id: null },
      ],
      claim_signal_refs: [],
      signals: [],
      claims: claimsFixture,
    });
    const { result } = renderHook(() => useFirstReadOpenQuestions(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions).toContain("Clean question?");
    expect(result.current.questions).not.toContain("Planted question?"); // FALSIFICATION
  });
});

// ── SITE 5: curated tension (promise claim gate — previously ungated) ─────────
describe("R1 site: useCuratedTensions", () => {
  const base = {
    curated_tensions: [{ company_id: CO, promise_claim_id: PLANTED, difficulty_claim_id: PUB, removed_at: null }],
    claims: claimsFixture,
    claim_signal_refs: [],
    signals: [],
  };
  it("planted no-ref promise claim → honest absence (null render)", async () => {
    db = fakeSupabase(base);
    const { result } = renderHook(() => useCuratedTensions(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.render).toBeNull(); // FALSIFICATION
  });
  it("clean promise claim renders", async () => {
    db = fakeSupabase({
      ...base,
      curated_tensions: [{ company_id: CO, promise_claim_id: CLEAN, difficulty_claim_id: PUB, removed_at: null }],
    });
    const { result } = renderHook(() => useCuratedTensions(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.render?.promiseText).toBe("Clean declared statement.");
  });
});

// ── SITE 6: compute-featured-defaults (featuredEligibleDeltas — its filter) ───
describe("R1 site: featured defaults (featuredEligibleDeltas)", () => {
  it("planted declared claim's delta is ineligible; clean stays", () => {
    const deltas = [
      { content_identity: "ci-1", declared_claim_id: PLANTED },
      { content_identity: "ci-2", declared_claim_id: CLEAN },
      { content_identity: "ci-3", declared_claim_id: null },
    ];
    const out = featuredEligibleDeltas(deltas, [], new Map(), [
      { id: PLANTED, raw_payload: PLANTED_PAYLOAD },
      { id: CLEAN, raw_payload: {} },
    ]);
    expect(out.map((d) => d.content_identity)).toEqual(["ci-2", "ci-3"]); // FALSIFICATION
  });
});

// ── ONE REGEX: gate and source tag can never disagree ─────────────────────────
describe("R1: shared document-filename authority", () => {
  it("the gate excludes exactly when the tag would name a document", () => {
    for (const payload of [PLANTED_PAYLOAD, { basis: "no docs here" }, {}, { source: "canvas mint" }]) {
      const gateExcludes = uploadDerivedClaimIds([], new Map(), [{ id: "x", raw_payload: payload }]).has("x");
      const tag = deriveSourceTag({
        kind: "declared_claim", rawPayload: payload, refUpload: null,
        canvasUpdatedAt: null, intakeSubmittedAt: null, claimCreatedAt: null,
      });
      const tagNamesDoc = tag !== null && UPLOADED_DOC_NAME_RE.test(tag.label);
      expect(gateExcludes).toBe(tagNamesDoc);
      expect(gateExcludes).toBe(citedDocumentName(payload) !== null);
    }
  });
});
