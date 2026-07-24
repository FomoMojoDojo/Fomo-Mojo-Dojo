// RG-1 — THE register guard at the client-view render boundary.
//
// WHY THIS EXISTS. Until now the only thing keeping internal-register text off
// rendered client copy was deriveAudienceShort's incidental 40-char noun-phrase
// limit — a formatting rule doing load-bearing safety work it was never designed
// for. It fails 8 of 11 real Edgewood rows (the [A2B TEST] row was blocked only
// because its phrase happened to be 54 chars). This is the real guard: the
// chokepoint every client-view render path routes through.
//
// ONE AUTHORITY. isPublicRegister lives here now; resolveMarketPortfolio imports
// it rather than keeping a second copy. There is exactly one place that decides
// what register may reach a client surface.
//
// POLARITY — ALLOWLIST, and NULL/UNCLASSIFIED BLOCKS. The asymmetry is the whole
// argument: a wrongly-BLOCKED public row costs an empty slot the tri-state
// already renders honestly; a wrongly-ADMITTED internal row is the exact failure
// this gate exists to prevent. Unknown register is therefore treated as unsafe,
// mirroring the voice-gate's fail-toward-blocked law at the declared seam — with
// more force here, because this seam faces the client.
//
// FAIL BEHAVIOR — boolean admit only. A blocked row renders the caller's
// EXISTING empty state. This helper never substitutes text, never invents
// "not yet available" copy, and never truncates as a safety measure. Silent
// shortening is what disguised this problem for two gates; it is not repeated.

// The registers a market row can carry (market_options CHECK + odi_market_
// definitions). Kept as a documented set, not an enum import, so this module has
// no dependency that could invert its meaning.
const PUBLIC_REGISTERS = new Set(["public_inferred", "publicly_declared"]);

/**
 * Is this register a PUBLIC one? The single predicate; resolveMarketPortfolio's
 * OOD-3 Act-A filter now reads through here.
 */
export const isPublicRegister = (r: string | null | undefined): boolean =>
  typeof r === "string" && PUBLIC_REGISTERS.has(r);

// V2-5 — claims carry `provenance` on a SEPARATE axis (public_observed vs
// internal_declared), not the register vocabulary above. Same allowlist polarity:
// only an explicit public_observed passes; internal_declared / null / unknown BLOCK
// (fail-toward-blocked at the client seam). The Act 3 "message" band (public
// perception claims) routes through here so internal/declared claims can never leak.
const PUBLIC_PROVENANCE = new Set(["public_observed"]);
export const isPublicProvenance = (p: string | null | undefined): boolean =>
  typeof p === "string" && PUBLIC_PROVENANCE.has(p);

// Client-view surface classes and the registers each admits.
//   outside  — Act A / the outside story: public register only (OOD-3).
//   decision — the Decision Command Screen (deriveAudienceShort audience copy):
//              same public-only bound; a client reads it as their outside face.
//   diagnose — the Diagnose act: ALL registers, EXPLICITLY PERMISSIVE. This
//              surface's whole job is to show the say/see split across registers,
//              so internal-register text is admitted BY DESIGN here and nowhere
//              else. Stated so a future reader does not "tighten" it by mistake.
export type RegisterSurface = "outside" | "decision" | "diagnose";

const SURFACE_ALLOWS: Record<RegisterSurface, (r: string | null | undefined) => boolean> = {
  outside: isPublicRegister,
  decision: isPublicRegister,
  diagnose: () => true, // permissive BY DESIGN — see note above
};

// A row that carries a stored register. market_options rows carry `market_register`;
// findings (RG-2) carry `register`. Both are the same vocabulary
// (public_inferred / publicly_declared / internal_inferred / internal_declared);
// whichever is present is the row's register. A row that carries NEITHER is
// unclassified and blocks — the guard never invents a register.
export type RegisterBearing = { market_register?: string | null; register?: string | null };

/**
 * May this row's text render on this client surface? Allowlist per surface;
 * NULL / unknown / non-permitted / absent register → false (block → honest empty).
 */
export function admitForSurface(row: RegisterBearing | null | undefined, surface: RegisterSurface): boolean {
  if (!row) return false;
  const register = row.market_register ?? row.register ?? null;
  return SURFACE_ALLOWS[surface](register);
}
