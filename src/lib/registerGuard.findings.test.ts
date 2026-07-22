// RG-2 TRIPWIRE — findings must pass the register guard by their OWN register.
//
// RG-1 left findings as a HOLD: they carried no register metadata, so the guard
// had nothing to test and internal-derived findings could reach the client
// Outside surface. RG-2 birth-stamps `findings.register`; this proves the guard
// now reads it, that an internal-register finding is BLOCKED, and — critically —
// that a finding is judged on register, NOT on whether it happens to have an
// origin signal (the RG-1 incidental-property trap).
//
// Falsification-validated (gate report): inverting admitForSurface turns the
// block assertions red naming the leaked register + surface. Each block can pass
// ONLY because the register guard held — a finding with no origin signal (the
// frontier orphan) still admits on register alone, so "has a signal" is not a
// hidden shield.

import { describe, expect, it } from "vitest";
import { admitForSurface } from "./registerGuard";

// Finding-shaped rows: RG-2 register lives on `register`, not `market_register`.
const PUBLIC_OBSERVATION = { register: "public_inferred", origin_signal_id: "sig-1", body: "Outside read." };
const PUBLIC_FRONTIER_ORPHAN = { register: "public_inferred", origin_signal_id: null, body: "Your bet." }; // no signal, still admits
const INTERNAL_FINDING = { register: "internal_inferred", origin_signal_id: "sig-2", body: "Internal-derived." };
const NULL_REGISTER = { register: null, origin_signal_id: null, body: "Unresolvable provenance." };
// A raw DB row that carries no register field at all. Real rows are untyped at
// this boundary; the double-cast represents exactly that (the guard defends).
const MISSING_REGISTER = { origin_signal_id: "sig-3", body: "No register field at all." } as unknown as Parameters<typeof admitForSurface>[0];

describe("RG-2 findings register guard", () => {
  it("admits a public-register finding on the outside surface", () => {
    expect(admitForSurface(PUBLIC_OBSERVATION, "outside")).toBe(true);
  });

  it("admits the frontier ORPHAN on register alone — no origin signal required", () => {
    // This is the RG-1 incidental-property fix: the guard judges register, not
    // signal presence. The orphan has origin_signal_id === null and still admits.
    expect(
      admitForSurface(PUBLIC_FRONTIER_ORPHAN, "outside"),
      "the frontier orphan (public_inferred, no origin signal) must render — its register is what admits it",
    ).toBe(true);
  });

  it("BLOCKS an internal-register finding on the outside surface", () => {
    expect(
      admitForSurface(INTERNAL_FINDING, "outside"),
      `LEAK: internal_inferred finding admitted on the client OUTSIDE surface.`,
    ).toBe(false);
  });

  it("BLOCKS a finding whose register is NULL (unresolvable provenance)", () => {
    expect(
      admitForSurface(NULL_REGISTER, "outside"),
      `LEAK: NULL-register finding admitted on the outside surface — unprovable provenance must not render.`,
    ).toBe(false);
  });

  it("BLOCKS a finding carrying no register field at all", () => {
    expect(
      admitForSurface(MISSING_REGISTER, "outside"),
      `LEAK: a finding with no register field admitted — the guard must not invent one.`,
    ).toBe(false);
  });

  it("register (findings) and market_register (options) are read by the SAME guard", () => {
    // One vocabulary, one authority. A findings row keyed on `register` and an
    // options row keyed on `market_register` reach the identical verdict.
    expect(admitForSurface({ register: "public_inferred" }, "outside")).toBe(true);
    expect(admitForSurface({ market_register: "public_inferred" }, "outside")).toBe(true);
    expect(admitForSurface({ register: "internal_inferred" }, "outside")).toBe(false);
    expect(admitForSurface({ market_register: "internal_inferred" }, "outside")).toBe(false);
  });
});
