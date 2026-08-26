// PUBLIC-ONLY GATE (operator ruling 2026-08-20) — per-site falsification tests.
//
// First Read renders PUBLIC content only. The planted fixture here is a CLEAN
// internal_declared claim — no doc refs, no canvas payload, nothing the R1 upload
// gate would catch — backed by a real client-voice signal. Only its provenance is
// wrong, so every exclusion below proves the PUBLIC-ONLY rule itself.
// Act-1 voice tests: client-voice public renders; legacy NULL-voice own-domain
// renders (shared own-domain rule); NULL-voice third-party does not.

import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const CO = "co-1";
const INTERNAL = "claim-internal-clean"; // clean internal_declared → excluded ONLY by provenance
const PUBVOICE = "claim-public-voice"; // public + client_voice-backed → Act 1 renders
const PUBNULL_OWN = "claim-public-nullvoice-own"; // public + NULL voice on own domain → renders
const PUBNULL_3P = "claim-public-nullvoice-3p"; // public + NULL voice on third-party → hidden
const PUB = "claim-public-record";

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
import {
  gateCheckRailDeltas,
  featuredEligibleDeltas,
  firstReadExcludedClaimIds,
  clientVoiceClaimIds,
  channelReadClaimIds,
  isOwnDomainUrl,
} from "../../supabase/functions/_shared/firstReadProvenance.ts";

const claims: Row[] = [
  { id: INTERNAL, company_id: CO, provenance: "internal_declared", status: "active", topic: "positioning", statement: "Clean internal statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
  { id: PUBVOICE, company_id: CO, provenance: "public_observed", status: "active", topic: "positioning", statement: "Own public voice statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
  { id: PUBNULL_OWN, company_id: CO, provenance: "public_observed", status: "active", topic: "market", statement: "Legacy own-domain statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
  { id: PUBNULL_3P, company_id: CO, provenance: "public_observed", status: "active", topic: null, statement: "Third-party derived statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
  { id: PUB, company_id: CO, provenance: "public_observed", status: "active", topic: null, statement: "Record side statement.", raw_payload: {}, created_at: "2026-08-01T00:00:00Z" },
];
const refs: Row[] = [
  { claim_id: INTERNAL, signal_id: "s-own1" },
  { claim_id: PUBVOICE, signal_id: "s-own1" },
  { claim_id: PUBNULL_OWN, signal_id: "s-null-own" },
  { claim_id: PUBNULL_3P, signal_id: "s-null-3p" },
];
const signals: Row[] = [
  { id: "s-own1", company_id: CO, voice_class: "client_voice", source_type: "public_baseline_run", source_url: "https://www.co-1.com/about/", source_title: null, source_id: null, event_date: "2026-08-01", evidence_excerpt: "x", confidence_to_use: "medium", signal_band: "outside", superseded_at: null },
  { id: "s-null-own", company_id: CO, voice_class: null, source_type: "public_baseline_run", source_url: "https://shop.co-1.com/page", source_title: null, source_id: null, event_date: null, evidence_excerpt: "y", confidence_to_use: "medium", signal_band: "outside", superseded_at: null },
  { id: "s-null-3p", company_id: CO, voice_class: null, source_type: "public_baseline_run", source_url: "https://yelp.com/biz/co-1", source_title: null, source_id: null, event_date: null, evidence_excerpt: "z", confidence_to_use: "medium", signal_band: "outside", superseded_at: null },
];

function previewFixture() {
  return fakeSupabase({
    companies: [{ id: CO, name: "Co", website: "https://co-1.com" }],
    claims,
    claim_signal_refs: refs,
    signals,
    claim_deltas: [
      { id: "d-int", company_id: CO, delta_type: "echoed", declared_claim_id: INTERNAL, public_claim_id: PUB, content_identity: "ci-int", pairing_kind: "public_vs_public" },
      { id: "d-pub", company_id: CO, delta_type: "echoed", declared_claim_id: PUBVOICE, public_claim_id: PUB, content_identity: "ci-pub", pairing_kind: "public_vs_public" },
    ],
    public_baseline_runs: [],
    signal_recurrence_verdicts: [],
    market_options: [],
    operator_primary_selection: [],
    first_read_featured_items: [],
    mojo_scores: [],
    positioning_canvases: [],
  });
}

describe("PUBLIC-ONLY site: useFirstReadPreviewData (Act 1 + gap)", () => {
  it("Act 1: clean internal_declared claim is excluded; voice classes route correctly", async () => {
    db = previewFixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const statements = result.current.data.declared.map((c) => c.statement);
    expect(statements).not.toContain("Clean internal statement."); // FALSIFICATION (provenance only)
    expect(statements).toContain("Own public voice statement."); // client_voice renders
    expect(statements).toContain("Legacy own-domain statement."); // NULL voice + own subdomain renders
    expect(statements).not.toContain("Third-party derived statement."); // NULL voice + third-party hidden
    // Every rendered Act-1 row carries a page tag (public branch).
    for (const row of result.current.data.declared) {
      expect(row.sourceTag?.label ?? "").toMatch(/co-1\.com/);
    }
  });

  it("gap: a pair whose declared side is internal never renders; public-declared pair does", async () => {
    db = previewFixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const declaredSides = result.current.data.gapPairs.map((p) => p.declared);
    expect(declaredSides).not.toContain("Clean internal statement."); // FALSIFICATION
    expect(declaredSides).toContain("Own public voice statement.");
  });
});

describe("PUBLIC-ONLY site: check rail (gateCheckRailDeltas)", () => {
  it("delta anchored on a clean internal claim is dropped; public-anchored stays", () => {
    const dRows = [
      { id: "d1", declared_claim_id: INTERNAL, public_claim_id: PUB },
      { id: "d2", declared_claim_id: PUBVOICE, public_claim_id: PUB },
      { id: "d3", declared_claim_id: null, public_claim_id: PUB },
    ];
    const out = gateCheckRailDeltas(dRows, [], new Map(), [
      { id: INTERNAL, raw_payload: {}, provenance: "internal_declared" },
      { id: PUBVOICE, raw_payload: {}, provenance: "public_observed" },
      { id: PUB, raw_payload: {}, provenance: "public_observed" },
    ]);
    expect(out.map((d) => d.id)).toEqual(["d2", "d3"]); // FALSIFICATION: d1 gone
  });
});

describe("PUBLIC-ONLY site: useFirstReadOpenQuestions", () => {
  it("silent_delta question anchored on an internal claim is excluded; public anchor passes", async () => {
    db = fakeSupabase({
      first_read_open_questions: [
        { company_id: CO, status: "live", question_text: "Internal-anchored question?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anch-int" },
        { company_id: CO, status: "live", question_text: "Public-anchored question?", source_kind: "silent_delta", finding_identity: null, anchor_identity: "anch-pub" },
      ],
      claim_deltas: [
        { company_id: CO, content_identity: "anch-int", declared_claim_id: INTERNAL, public_claim_id: null, pairing_kind: "public_vs_public" },
        { company_id: CO, content_identity: "anch-pub", declared_claim_id: PUBVOICE, public_claim_id: null, pairing_kind: "public_vs_public" },
      ],
      claim_signal_refs: [],
      signals: [],
      claims,
    });
    const { result } = renderHook(() => useFirstReadOpenQuestions(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.questions).toContain("Public-anchored question?");
    expect(result.current.questions).not.toContain("Internal-anchored question?"); // FALSIFICATION
  });
});

describe("PUBLIC-ONLY site: featured defaults (featuredEligibleDeltas)", () => {
  it("delta with an internal declared side is ineligible; public stays", () => {
    const deltas = [
      { content_identity: "ci-int", declared_claim_id: INTERNAL },
      { content_identity: "ci-pub", declared_claim_id: PUBVOICE },
    ];
    const out = featuredEligibleDeltas(deltas, [], new Map(), [
      { id: INTERNAL, raw_payload: {}, provenance: "internal_declared" },
      { id: PUBVOICE, raw_payload: {}, provenance: "public_observed" },
    ]);
    expect(out.map((d) => d.content_identity)).toEqual(["ci-pub"]); // FALSIFICATION
  });
});

describe("PUBLIC-ONLY primitives", () => {
  it("firstReadExcludedClaimIds excludes every non-public provenance; public passes", () => {
    const rows = [
      { id: "a", raw_payload: {}, provenance: "internal_declared" },
      { id: "b", raw_payload: {}, provenance: "client_attested" },
      { id: "c", raw_payload: {}, provenance: "analytic" },
      { id: "d", raw_payload: {}, provenance: "public_observed" },
    ];
    const excluded = firstReadExcludedClaimIds([], new Map(), rows);
    expect([...excluded].sort()).toEqual(["a", "b", "c"]);
  });
  it("own-domain rule: www-stripped, subdomain-inclusive; clientVoiceClaimIds honors NULL-voice fallback", () => {
    expect(isOwnDomainUrl("https://www.co-1.com/x", "co-1.com")).toBe(true);
    expect(isOwnDomainUrl("https://shop.co-1.com/x", "www.co-1.com")).toBe(true);
    expect(isOwnDomainUrl("https://co-1.com.evil.com/x", "co-1.com")).toBe(false);
    expect(isOwnDomainUrl("https://yelp.com/biz/co-1", "co-1.com")).toBe(false);
    const ids = clientVoiceClaimIds(
      refs as Array<{ claim_id: string; signal_id: string }>,
      new Map(signals.map((s) => [s.id as string, s as { voice_class?: string | null; source_url?: string | null }])),
      "co-1.com",
    );
    expect(ids.has(PUBVOICE)).toBe(true);
    expect(ids.has(PUBNULL_OWN)).toBe(true);
    expect(ids.has(PUBNULL_3P)).toBe(false);
  });
});

// CHANNEL-READ OWN-WORDS EXCLUSION (2026-08-27) — a statement rendered as the client's own words must
// never also render as our read of their channels. Tests 1 & 5 fail without the claim_type exclusion.
describe("channelReadClaimIds — own_words excluded from the channel-read set", () => {
  const ov = (ids: string[]) => new Set(ids);
  const none = new Set<string>();

  it("1. an own_words claim (in ownVoiceIds via client_voice backing) is EXCLUDED — fails without the fix", () => {
    const claims = [{ id: "ow", claim_type: "own_words" }, { id: "inf", claim_type: "inference" }];
    const ids = channelReadClaimIds(claims, ov(["ow", "inf"]), none); // both own-voice qualified
    expect(ids.has("ow")).toBe(false); // own_words render in their own block, never as a channel read
    expect(ids.has("inf")).toBe(true); // inference stays
  });

  it("2. non-own_words channel rows (inference / customer_outcome / unmet_need) are unaffected", () => {
    const claims = [
      { id: "a", claim_type: "inference" },
      { id: "b", claim_type: "customer_outcome" },
      { id: "c", claim_type: "unmet_need" },
    ];
    expect([...channelReadClaimIds(claims, ov(["a", "b", "c"]), none)].sort()).toEqual(["a", "b", "c"]);
  });

  it("3. upload-derived claims stay excluded (docExcluded), alongside own_words", () => {
    const claims = [{ id: "doc", claim_type: "inference" }, { id: "keep", claim_type: "inference" }];
    const ids = channelReadClaimIds(claims, ov(["doc", "keep"]), new Set(["doc"]));
    expect(ids.has("doc")).toBe(false);
    expect(ids.has("keep")).toBe(true);
  });

  it("4. CB2-shape: own_words NOT in ownVoiceIds (null-voice refs) → exclusion is a no-op (unchanged)", () => {
    const claims = [{ id: "ow", claim_type: "own_words" }, { id: "inf", claim_type: "inference" }];
    const ids = channelReadClaimIds(claims, ov(["inf"]), none); // ownVoiceIds EXCLUDES ow
    expect([...ids]).toEqual(["inf"]); // identical to pre-fix — ow was never a channel read anyway
  });

  it("5. Edgewood-shape: 30 own_words all own-voice-qualified → 30 → 0 in channel-reads (fails without the fix)", () => {
    const claims = Array.from({ length: 30 }, (_, i) => ({ id: `ow${i}`, claim_type: "own_words" }));
    const ids = channelReadClaimIds(claims, ov(claims.map((c) => c.id)), none);
    expect(ids.size).toBe(0);
  });
});
