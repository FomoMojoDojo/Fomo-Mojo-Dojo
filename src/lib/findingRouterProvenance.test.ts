// F1 (SP-352): a finding is public to the router only when it is public BY SOURCE — its origin signal's
// source_type, or a frontier's full input ledger — and its stored register is public. The register may
// narrow, never widen; a frontier with no ledger is private.
import { describe, expect, it } from "vitest";
import {
  decideFindingPublicBySource,
  decideFindingRouterProvenance,
  FINDING_NOT_PUBLIC_BY_SOURCE,
  findingRouterProvenance,
  findingSourceVerdicts,
} from "../../supabase/functions/_shared/findingRouterProvenance.ts";

const PUB = "public_baseline_run";
const yes = () => true;
const no = () => false;

describe("F1 decideFindingPublicBySource — the pure source rule", () => {
  it("a finding on a public-source origin signal is public; on an upload origin it is private", () => {
    expect(decideFindingPublicBySource({ origin_signal_id: "s" }, PUB, no)).toBe(true);
    for (const src of ["uploaded_file", "file", "file_proposal", "intake", "interview", null, undefined, "some_new_lane"]) {
      expect(decideFindingPublicBySource({ origin_signal_id: "s" }, src, yes)).toBe(false);
    }
  });

  it("a frontier with NO ledger is private (the pre-wall six)", () => {
    expect(decideFindingPublicBySource({ kind: "frontier" }, undefined, yes)).toBe(false);
    expect(decideFindingPublicBySource({ kind: "frontier", input_ledger: [] }, undefined, yes)).toBe(false);
    expect(decideFindingPublicBySource({ kind: "frontier", input_ledger: "x" }, undefined, yes)).toBe(false);
  });

  it("a frontier is public only when EVERY ledger id resolves public", () => {
    expect(decideFindingPublicBySource({ kind: "frontier", input_ledger: ["a", "b"] }, undefined, yes)).toBe(true);
    expect(decideFindingPublicBySource({ kind: "frontier", input_ledger: ["a", "b"] }, undefined, (id) => id === "a")).toBe(false);
    expect(decideFindingPublicBySource({ kind: "frontier", input_ledger: ["a", 7] }, undefined, yes)).toBe(false);
  });

  it("a non-frontier finding with no origin signal is private", () => {
    expect(decideFindingPublicBySource({ kind: "observation" }, undefined, yes)).toBe(false);
    expect(decideFindingPublicBySource({ kind: "observation", input_ledger: ["a"] }, undefined, yes)).toBe(false);
  });
});

describe("F1 decideFindingRouterProvenance — the register narrows, never widens", () => {
  it("returns the public register only when public by source", () => {
    expect(decideFindingRouterProvenance("public_inferred", true)).toBe("public_inferred");
    expect(decideFindingRouterProvenance("public_inferred", false)).toBeNull();
    for (const reg of ["internal_inferred", null, undefined, "unknown"]) {
      expect(decideFindingRouterProvenance(reg, true)).toBeNull();
    }
  });
  it("names the public-read drop reason", () => {
    expect(FINDING_NOT_PUBLIC_BY_SOURCE).toBe("finding_not_public_by_source");
  });
});

// A minimal fake of the reads the loader makes: select().in(col, ids) on each table.
type Rows = Record<string, Array<Record<string, unknown>>>;
function fakeSb(rows: Rows, failOn?: string) {
  return {
    from(t: string) {
      let ids: string[] = [];
      let col = "id";
      const result = () => Promise.resolve(
        failOn === t
          ? { data: null, error: { message: "boom" } }
          : { data: (rows[t] ?? []).filter((r) => ids.includes(String(r[col]))), error: null },
      );
      const q = {
        select() { return q; },
        in(c: string, v: string[]) { col = c; ids = v; return q; },
        order() { return q; },
        range(a: number, b: number) { return result().then((r) => ({ ...r, data: r.data ? r.data.slice(a, b + 1) : r.data })); },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return result().then(res, rej); },
      };
      return q;
    },
  };
}

describe("F1 findingRouterProvenance — the loader", () => {
  const rows: Rows = {
    findings: [
      { id: "f-pub", register: "public_inferred", origin_signal_id: "s-pub", kind: "observation", beats: null },
      { id: "f-upl", register: "public_inferred", origin_signal_id: "s-upl", kind: "observation", beats: null },
      { id: "f-gone", register: "public_inferred", origin_signal_id: "s-missing", kind: "observation", beats: null },
      { id: "fr-noledger", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { observe: "x" } },
      { id: "fr-pub", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { input_ledger: ["s-pub", "ow-1", "f-pub", "d-pub"] } },
      { id: "fr-upl", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { input_ledger: ["s-pub", "s-upl"] } },
      { id: "fr-deltapriv", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { input_ledger: ["d-priv"] } },
      { id: "fr-nested", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { input_ledger: ["fr-pub"] } },
      { id: "fr-unknown", register: "public_inferred", origin_signal_id: null, kind: "frontier", beats: { input_ledger: ["nowhere"] } },
      { id: "f-int", register: "internal_inferred", origin_signal_id: "s-pub", kind: "observation", beats: null },
    ],
    signals: [
      { id: "s-pub", source_type: PUB },
      { id: "s-upl", source_type: "uploaded_file" },
    ],
    own_words_candidates: [{ id: "ow-1" }],
    claim_deltas: [
      { id: "d-pub", declared_claim_id: "c-pub", public_claim_id: "c-pub2" },
      { id: "d-priv", declared_claim_id: "c-pub", public_claim_id: "c-upl" },
    ],
    claims: [
      { id: "c-pub", provenance: "public_observed" },
      { id: "c-pub2", provenance: "public_observed" },
      { id: "c-upl", provenance: "public_observed" },
    ],
    claim_signal_refs: [
      { claim_id: "c-pub", signal_id: "s-pub" },
      { claim_id: "c-pub2", signal_id: "s-pub" },
      { claim_id: "c-upl", signal_id: "s-upl" },
    ],
  };

  it("derives every requested id from its sources", async () => {
    const ids = ["f-pub", "f-upl", "f-gone", "fr-noledger", "fr-pub", "fr-upl", "fr-deltapriv", "fr-nested", "fr-unknown", "f-int", "f-none"];
    const m = await findingRouterProvenance(fakeSb(rows), ids);
    expect(m.get("f-pub")).toBe("public_inferred");
    expect(m.get("fr-pub")).toBe("public_inferred");
    for (const id of ["f-upl", "f-gone", "fr-noledger", "fr-upl", "fr-deltapriv", "fr-nested", "fr-unknown", "f-int", "f-none"]) {
      expect([id, m.get(id)]).toEqual([id, null]);
    }
    expect(m.size).toBe(ids.length);
  });

  it("keeps the register and the source verdict apart (ruling 8 reads both)", async () => {
    const v = await findingSourceVerdicts(fakeSb(rows), ["f-int", "f-upl"]);
    expect(v.get("f-int")).toEqual({ register: "internal_inferred", publicBySource: true });
    expect(v.get("f-upl")).toEqual({ register: "public_inferred", publicBySource: false });
  });

  it("fails closed: a query error makes every requested finding private", async () => {
    for (const t of ["findings", "signals", "own_words_candidates", "claim_deltas"]) {
      const m = await findingRouterProvenance(fakeSb(rows, t), ["f-pub", "fr-pub"]);
      expect([t, m.get("f-pub"), m.get("fr-pub")]).toEqual([t, null, null]);
    }
  });
});
