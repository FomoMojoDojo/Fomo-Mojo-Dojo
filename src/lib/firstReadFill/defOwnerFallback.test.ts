// Gate 6b — a discovered def's owner falls back to the company's creator.
//
// RED ON REVERT. Before 6b the owner came ONLY from an existing def (spine 'customer' def, else any
// def with a user_id). A company with no defs yet — Heart Coffee, whispering.ai, Gotham — refused
// every write ("no owning user_id resolvable"), the accept fell through to a chunk not-ok, three
// holds and a no_progress terminal with the refusal never persisted (Heart Coffee, 2026-09-01).
import { describe, it, expect } from "vitest";
import { resolveDefOwner } from "../../../supabase/functions/_shared/marketPortfolioDiscovery.ts";

const CREATOR = "fd766480-d2ef-4794-a79a-b849a91df024";

describe("resolveDefOwner (Gate 6b)", () => {
  it("(g6b) NO def ⇒ the company creator owns the write (red on revert: refusal)", () => {
    expect(resolveDefOwner([], CREATOR)).toBe(CREATOR);
  });
  it("(g6b) a def present ⇒ the def's user_id wins over the creator", () => {
    expect(resolveDefOwner([{ journey_key: "pmk-x", user_id: "u-def" }], CREATOR)).toBe("u-def");
  });
  it("(g6b) the spine (customer) def wins over any other def", () => {
    expect(resolveDefOwner([{ journey_key: "pmk-x", user_id: "u-other" }, { journey_key: "customer", user_id: "u-spine" }], CREATOR)).toBe("u-spine");
  });
  it("(g6b) defs without a user_id are skipped; the creator still catches", () => {
    expect(resolveDefOwner([{ journey_key: "pmk-x", user_id: null }], CREATOR)).toBe(CREATOR);
  });
  it("(g6b) no def AND no creator ⇒ null — the worker still refuses rather than inventing an owner", () => {
    expect(resolveDefOwner([], null)).toBeNull();
  });
});
