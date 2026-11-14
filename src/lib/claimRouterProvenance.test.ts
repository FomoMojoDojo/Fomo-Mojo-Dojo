// SP-349: a claim is public to the router only when every signal it rests on is public BY SOURCE and
// its stored marking is public. The stored marking may narrow, never widen.
import { describe, expect, it } from "vitest";
import {
  CLAIM_NOT_PUBLIC_BY_SOURCE,
  claimRouterProvenance,
  decideClaimRouterProvenance,
} from "../../supabase/functions/_shared/claimRouterProvenance.ts";

const PUB = "public_baseline_run";

describe("SP-349 decideClaimRouterProvenance — the pure rule", () => {
  it("a public_observed claim on public-source signals stays public_observed", () => {
    expect(decideClaimRouterProvenance("public_observed", [PUB, "outside_recrawl_regen"])).toBe("public_observed");
  });

  it("a public_observed claim resting on ONE uploaded-file signal is private (the 43)", () => {
    expect(decideClaimRouterProvenance("public_observed", ["uploaded_file"])).toBeNull();
    expect(decideClaimRouterProvenance("public_observed", [PUB, "uploaded_file"])).toBeNull();
    for (const src of ["file", "file_proposal", "intake", "interview"]) {
      expect(decideClaimRouterProvenance("public_observed", [PUB, src])).toBeNull();
    }
  });

  it("a claim with no resolvable signals is private", () => {
    expect(decideClaimRouterProvenance("public_observed", [])).toBeNull();
    expect(decideClaimRouterProvenance("public_observed", [undefined])).toBeNull(); // ref to a missing signal row
    expect(decideClaimRouterProvenance("public_observed", [null])).toBeNull();
    expect(decideClaimRouterProvenance("public_observed", ["some_new_lane"])).toBeNull();
  });

  it("the stored marking narrows but never widens", () => {
    for (const stored of ["internal_declared", "client_attested", "analytic", "market_read", null, undefined]) {
      expect(decideClaimRouterProvenance(stored, [PUB])).toBeNull();
    }
    expect(decideClaimRouterProvenance("publicly_declared", [PUB])).toBe("publicly_declared");
  });

  it("names the public-read drop reason", () => {
    expect(CLAIM_NOT_PUBLIC_BY_SOURCE).toBe("claim_not_public_by_source");
  });
});

// A minimal fake of the three reads the loader makes.
type Rows = { claims: Array<Record<string, unknown>>; claim_signal_refs: Array<Record<string, unknown>>; signals: Array<Record<string, unknown>> };
function fakeSb(rows: Rows, failOn?: keyof Rows) {
  return {
    from(t: keyof Rows) {
      let ids: string[] = [];
      let col = "id";
      const q = {
        select() { return q; },
        in(c: string, v: string[]) { col = c; ids = v; return q; },
        order() { return q; },
        range(a: number, b: number) {
          return Promise.resolve(result().then((r) => ({ ...r, data: r.data ? r.data.slice(a, b + 1) : r.data })));
        },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return result().then(res, rej); },
      };
      const result = () => Promise.resolve(
        failOn === t
          ? { data: null, error: { message: "boom" } }
          : { data: rows[t].filter((r) => ids.includes(String(r[col]))), error: null },
      );
      return q;
    },
  };
}

describe("SP-349 claimRouterProvenance — the loader", () => {
  const rows: Rows = {
    claims: [
      { id: "c-pub", provenance: "public_observed" },
      { id: "c-upl", provenance: "public_observed" },
      { id: "c-noref", provenance: "public_observed" },
      { id: "c-gone", provenance: "public_observed" },
      { id: "c-int", provenance: "internal_declared" },
    ],
    claim_signal_refs: [
      { claim_id: "c-pub", signal_id: "s-pub" },
      { claim_id: "c-upl", signal_id: "s-upl" },
      { claim_id: "c-gone", signal_id: "s-missing" },
      { claim_id: "c-int", signal_id: "s-pub" },
    ],
    signals: [
      { id: "s-pub", source_type: PUB },
      { id: "s-upl", source_type: "uploaded_file" },
    ],
  };

  it("derives every requested id from its signals' source", async () => {
    const m = await claimRouterProvenance(fakeSb(rows), ["c-pub", "c-upl", "c-noref", "c-gone", "c-int", "c-unknown"]);
    expect(m.get("c-pub")).toBe("public_observed");
    expect(m.get("c-upl")).toBeNull();
    expect(m.get("c-noref")).toBeNull();
    expect(m.get("c-gone")).toBeNull();
    expect(m.get("c-int")).toBeNull();
    expect(m.get("c-unknown")).toBeNull(); // no claim row → private
    expect(m.size).toBe(6);
  });

  it("fails closed: a query error makes every requested claim private", async () => {
    for (const t of ["claims", "claim_signal_refs", "signals"] as const) {
      const m = await claimRouterProvenance(fakeSb(rows, t), ["c-pub"]);
      expect(m.get("c-pub")).toBeNull();
    }
  });
});
