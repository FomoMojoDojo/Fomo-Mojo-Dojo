// LISTING CORROBORATION (operator ruling 2026-09-04, shape (c)): a listing may corroborate ONLY a declared
// claim whose statement_kind ∈ {offer, audience} AND whose text carries a placement token
// (wholesale / retail / stockist / partner / "available at"). Everything else is refused with a reason.
import { describe, expect, it } from "vitest";
import { listingMayCorroborate } from "../../../supabase/functions/_shared/listingCorroboration";

describe("listingMayCorroborate", () => {
  it("offer + 'wholesale' → allowed", () => {
    expect(listingMayCorroborate({ statement_kind: "offer", statement: "All of our coffees are available in 12 oz. bags for wholesale partners." })).toEqual({ ok: true });
  });
  it("audience + 'available at' → allowed", () => {
    expect(listingMayCorroborate({ statement_kind: "audience", statement: "Our beans are available at select retailers across LA." })).toEqual({ ok: true });
  });
  // WIDENED (operator ruling 2026-09-04, ruling 2): positioning joins offer/audience — the token is still required.
  it("positioning + 'partnerships' token → allowed", () => {
    expect(listingMayCorroborate({ statement_kind: "positioning", statement: "At Cafe Barra, our business to business relationships are considered partnerships." })).toEqual({ ok: true });
  });
  it("positioning without a placement token → refused no_placement_token", () => {
    expect(listingMayCorroborate({ statement_kind: "positioning", statement: "We take the time to carefully extract the potential of every bean." })).toEqual({ ok: false, reason: "no_placement_token" });
  });
  it("proof with a token → still refused kind_not_eligible", () => {
    expect(listingMayCorroborate({ statement_kind: "proof", statement: "Our wholesale partners taste every batch." })).toEqual({ ok: false, reason: "kind_not_eligible" });
  });
  it("offer without a placement token → refused no_placement_token", () => {
    expect(listingMayCorroborate({ statement_kind: "offer", statement: "Our Machado Roast is crafted for pour-over." })).toEqual({ ok: false, reason: "no_placement_token" });
  });
  it("untyped (null kind) → refused kind_not_eligible (a listing never corroborates an unknown kind)", () => {
    expect(listingMayCorroborate({ statement_kind: null, statement: "wholesale partners" })).toEqual({ ok: false, reason: "kind_not_eligible" });
  });
});
