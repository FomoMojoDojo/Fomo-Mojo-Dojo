// MPD-D — derive the Diagnose say/see model from a surface:'diagnose' portfolio.
//
// Pure, no I/O. The resolver already produced ResolvedMarket rows with pairwise
// cross_register_pairs (OOD-3: discrete public↔internal say/see twins, fan-out
// intact, never transitively chained). This turns that into the four blocks the
// Diagnose act renders — classified by the INTERNAL side's register, because the
// framing is register-driven (declared = "you've told us"; inferred = "our
// internal read"). Judge reasons are deliberately NOT surfaced here — they never
// render client-facing.

import { isPublicRegister, type ResolvedMarket } from "./resolveMarketPortfolio";

export type DiagnosePair = {
  // The internal ("say") side and public ("see") side of one banked twin.
  internal: ResolvedMarket;
  publicSide: ResolvedMarket;
};

export type FanOutFinding = {
  // One market that pairs with N>1 counterparts of the opposite register —
  // the granularity story ("neither cut is wrong; which should strategy run on?").
  anchor: ResolvedMarket;
  anchorClass: "public" | "internal";
  counterparts: ResolvedMarket[];
};

export type DiagnoseModel = {
  ready: boolean; // false when one register is entirely absent — nothing to compare
  declaredPairs: DiagnosePair[]; // internal side register === internal_declared
  inferredPairs: DiagnosePair[]; // internal side any other internal register
  internalOnly: ResolvedMarket[]; // internal markets with no public twin ("said, not shown")
  publicOnly: ResolvedMarket[]; // public markets with no internal twin ("shown, not said")
  fanOut: FanOutFinding[]; // N-to-1 granularity findings, both directions
};

const isInternalDeclared = (m: ResolvedMarket) => m.register === "internal_declared";

export function deriveDiagnoseModel(active: ResolvedMarket[], deferred: ResolvedMarket[]): DiagnoseModel {
  // Deferred is a capacity concept for Act A; for say/see we treat every
  // resolved market uniformly — a deferred market still carries banked twins.
  const all = [...active, ...deferred];
  const byKey = new Map(all.map((m) => [m.journey_key, m]));

  const internals = all.filter((m) => !isPublicRegister(m.register));
  const publics = all.filter((m) => isPublicRegister(m.register));

  // Enumerate every internal→public twin exactly once from the internal side.
  // (A public market's own cross_register_pairs mirror these; iterating one side
  // avoids double counting. Defensive isPublic filter guards a malformed link.)
  const pairs: DiagnosePair[] = [];
  for (const m of internals) {
    for (const link of m.cross_register_pairs) {
      const publicSide = byKey.get(link.journey_key);
      if (publicSide && isPublicRegister(publicSide.register)) pairs.push({ internal: m, publicSide });
    }
  }

  const declaredPairs = pairs.filter((p) => isInternalDeclared(p.internal));
  const inferredPairs = pairs.filter((p) => !isInternalDeclared(p.internal));

  const pairedInternalKeys = new Set(pairs.map((p) => p.internal.journey_key));
  const pairedPublicKeys = new Set(pairs.map((p) => p.publicSide.journey_key));
  const internalOnly = internals.filter((m) => !pairedInternalKeys.has(m.journey_key));
  const publicOnly = publics.filter((m) => !pairedPublicKeys.has(m.journey_key));

  // Fan-out (granularity finding): a market linked to more than one counterpart.
  // Both directions — 1 public ↔ N internal, and 1 internal ↔ N public.
  const fanOut: FanOutFinding[] = [];
  const groupBy = (keyFn: (p: DiagnosePair) => ResolvedMarket, cpFn: (p: DiagnosePair) => ResolvedMarket, cls: "public" | "internal") => {
    const groups = new Map<string, { anchor: ResolvedMarket; counterparts: ResolvedMarket[] }>();
    for (const p of pairs) {
      const anchor = keyFn(p);
      const g = groups.get(anchor.journey_key) ?? { anchor, counterparts: [] };
      g.counterparts.push(cpFn(p));
      groups.set(anchor.journey_key, g);
    }
    for (const g of groups.values()) if (g.counterparts.length > 1) fanOut.push({ anchor: g.anchor, anchorClass: cls, counterparts: g.counterparts });
  };
  groupBy((p) => p.publicSide, (p) => p.internal, "public"); // N internal ↔ 1 public
  groupBy((p) => p.internal, (p) => p.publicSide, "internal"); // 1 internal ↔ N public

  // Deterministic ordering so the render is stable run-to-run.
  const byExec = (a: ResolvedMarket, b: ResolvedMarket) => a.job_executor.localeCompare(b.job_executor);
  declaredPairs.sort((a, b) => byExec(a.internal, b.internal));
  inferredPairs.sort((a, b) => byExec(a.internal, b.internal));
  internalOnly.sort(byExec);
  publicOnly.sort(byExec);
  fanOut.sort((a, b) => a.anchorClass.localeCompare(b.anchorClass) || byExec(a.anchor, b.anchor));
  for (const f of fanOut) f.counterparts.sort(byExec);

  // Ready only when BOTH registers have content — otherwise there is nothing to
  // compare (undiscovered public, or a company with no internal spine). Never a
  // false "aligned/quiet" claim; the act shows the honest not-ready state.
  const ready = internals.length > 0 && publics.length > 0;

  return { ready, declaredPairs, inferredPairs, internalOnly, publicOnly, fanOut };
}
