// MPD-1f-2 — market proof-tier resolver + cross-provenance render-collapse.
//
// PURE READ-SIDE: takes already-fetched rows, returns render-ready markets.
// Writes nothing, judges nothing, mutates nothing — the ONE clustering/judging
// authority stays the discovery/ingest pipelines; this only interprets their
// banked output. Consumed by hooks (MPD-3 render); NOT an edge function.
//
// Provenance ⊥ proof (operator-signed):
//   tier 'validated'            — provenance odi_survey (customer-band proof).
//   tier 'corroborated'         — DECLARED def twinned (accepted same_market
//                                 verdict or identical content identity) to a
//                                 GENERATED def; the twin verdict's
//                                 judge_reason rides along as the arguable
//                                 evidence line.
//   tier 'declared_not_visible' — DECLARED def with no generated twin: the
//                                 public is silent. Renders ALWAYS (the
//                                 lean-in conversation), never suppressed.
//   tier 'inferred_hypothesis'  — GENERATED def with no declared twin.
//
// COLLAPSE (render-side only): twin groups render ONCE. Declared wins
// provenance. Representative rule (deterministic): declared members first;
// among declared, positioning_canvases source beats strategy_cascades, then
// lexicographic journey_key. All declared_source_refs in the group are kept
// ("you said this — twice" stays inspectable). Suppressed twins are listed in
// collapsed_keys; their rows/lenses are untouched.
//
// Spine nuance: a group containing the customer def keeps journey_key
// 'customer' as the data anchor; only statement/provenance/tier come from the
// representative. No re-keying, ever.
//
// Lens rules: missing lens = legacy single-market state → treated 'active'
// (lensResolution law). 'deferred' members surface in the deferred list —
// discovered-and-real, awaiting the choose gate.

import { normalizeForHash, sha256Hex } from "../../../supabase/functions/_shared/contentIdentity.ts";

// Test/ops journey keys — never markets.
const NON_MARKET_KEYS = new Set(["a2b", "internal"]);

export type MarketDefRow = {
  id: string;
  journey_key: string;
  job_executor: string;
  jtbd: string;
  chooser: string | null;
  provenance_type: string;
  market_register: string; // stored, birth-immutable (OOD-1)
  relationship_kind: string | null;
  relationship_basis: string | null;
  declared_verbatim: string | null;
  declared_source_ref: string | null;
};

// OOD-3 register law: Act A (Outside) renders public-register only.
export type MarketSurface = "outside" | "diagnose";
const PUBLIC_REGISTERS = new Set(["public_inferred", "publicly_declared"]);
export const isPublicRegister = (r: string) => PUBLIC_REGISTERS.has(r);
// Register CLASS bounds collapse semantics: within-class twin groups collapse
// (the 1f-2 behavior — e.g. CB2's declared↔generated corroboration, both
// internal-class); ACROSS the public↔internal boundary there is NO union-find
// chaining (OOD-2 ruling: pmk-philanthropic fused three internal defs through
// theme-flavored pairings) — cross-class links are PAIRWISE say/see twins.
const registerClass = (r: string): "public" | "internal" => (isPublicRegister(r) ? "public" : "internal");

export type MarketLensRow = { journey_key: string; portfolio_state: string; portfolio_role: string };

export type SameMarketVerdictRow = {
  verdict_kind: string;
  verdict: string;
  market_a_identity: string;
  market_b_identity: string | null;
  judge_reason: string;
  pair_identity: string;
};

export type MarketTier = "validated" | "corroborated" | "declared_not_visible" | "inferred_hypothesis";

export type CrossRegisterPair = {
  journey_key: string; // the counterpart group's representative key
  register: string; // counterpart representative's stored register
  reason: string; // the banked same-market verdict's judge_reason
};

export type ResolvedMarket = {
  journey_key: string; // data anchor — 'customer' when the spine is in the group
  display_statement: string; // verbatim wins for declared representatives
  job_executor: string;
  jtbd: string;
  provenance: string; // representative's provenance_type
  register: string; // representative's stored market_register (OOD-3)
  tier: MarketTier;
  tier_reason?: string; // the twin verdict's judge_reason (corroborated only)
  relationship_kind: string | null;
  relationship_basis: string | null;
  portfolio_state: string;
  source_refs: string[]; // every declared source in the group
  is_collapsed_twin: boolean;
  collapsed_keys: string[]; // journey keys suppressed into this render entry
  // OOD-3: PAIRWISE say/see links across the public↔internal boundary —
  // discrete pairs, never transitive groups. All pairs kept (no best-pair
  // pruning: each is a distinct banked verdict the Diagnose surface can show
  // and argue with), ordered by counterpart journey_key.
  cross_register_pairs: CrossRegisterPair[];
};

export type ResolvedPortfolio = { active: ResolvedMarket[]; deferred: ResolvedMarket[] };

const DECLARED = new Set(["internal_declared", "manual"]);
const isDeclared = (p: string) => DECLARED.has(p);
const isValidatedProvenance = (p: string) => p === "odi_survey";

// Deterministic representative rule (documented above).
function pickRepresentative(members: Array<MarketDefRow & { identity: string }>): MarketDefRow & { identity: string } {
  const rank = (d: MarketDefRow) => {
    const declaredRank = isDeclared(d.provenance_type) ? 0 : 1;
    const sourceRank = (d.declared_source_ref ?? "").startsWith("positioning_canvases") ? 0 : 1;
    return [declaredRank, sourceRank] as const;
  };
  return members.slice().sort((a, b) => {
    const [ad, as] = rank(a);
    const [bd, bs] = rank(b);
    if (ad !== bd) return ad - bd;
    if (as !== bs) return as - bs;
    return a.journey_key.localeCompare(b.journey_key);
  })[0];
}

export async function resolveMarketPortfolio(input: {
  defs: MarketDefRow[];
  lenses: MarketLensRow[];
  verdicts: SameMarketVerdictRow[];
  // OOD-3 per-surface filter: 'outside' (Act A) = public registers ONLY;
  // 'diagnose' = all registers. Defaults to 'diagnose' (the permissive
  // internal surface) so no caller accidentally leaks by omission — Act A
  // must ask for 'outside' explicitly.
  surface?: MarketSurface;
}): Promise<ResolvedPortfolio> {
  const surface: MarketSurface = input.surface ?? "diagnose";
  const defs: Array<MarketDefRow & { identity: string }> = [];
  for (const d of input.defs) {
    if (NON_MARKET_KEYS.has(d.journey_key)) continue;
    defs.push({ ...d, identity: await sha256Hex(normalizeForHash(`${d.job_executor}|${d.jtbd}`)) });
  }
  const lensByKey = new Map(input.lenses.map((l) => [l.journey_key, l]));

  // Twin edges: accepted same_market verdicts whose BOTH identities map to
  // current defs, plus identical content identity (the exact fast path, which
  // banks no verdict row). OOD-3: edges UNION groups only WITHIN a register
  // class; across the public↔internal boundary they become PAIRWISE links.
  const byIdentity = new Map<string, Array<MarketDefRow & { identity: string }>>();
  for (const d of defs) {
    const arr = byIdentity.get(d.identity) ?? [];
    arr.push(d);
    byIdentity.set(d.identity, arr);
  }
  const identityClass = (identity: string): "public" | "internal" | "mixed" | null => {
    const members = byIdentity.get(identity);
    if (!members || members.length === 0) return null;
    const classes = new Set(members.map((m) => registerClass(m.market_register)));
    return classes.size === 1 ? [...classes][0] : "mixed";
  };
  const parent = new Map<string, string>(); // identity → root
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== c) {
      const next = parent.get(c)!;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  // Nodes are CLASS-SCOPED identities ("identity|class") so a mixed-class
  // identical identity can never fuse the two classes through a shared node.
  const nodeOf = (identity: string, cls: "public" | "internal") => `${identity}|${cls}`;
  for (const d of defs) find(nodeOf(d.identity, registerClass(d.market_register))); // seed
  const acceptedPairReason = new Map<string, string>(); // "idA|idB" sorted → reason
  // Cross-class pairwise links, collected at identity level: "idA|idB" sorted.
  const crossClassPairs = new Map<string, string>(); // pair → reason
  const classesOf = (identity: string): Array<"public" | "internal"> => {
    const members = byIdentity.get(identity) ?? [];
    return [...new Set(members.map((m) => registerClass(m.market_register)))];
  };
  for (const v of input.verdicts) {
    if (v.verdict_kind !== "same_market" || v.verdict !== "accepted" || !v.market_b_identity) continue;
    if (!byIdentity.has(v.market_a_identity) || !byIdentity.has(v.market_b_identity)) continue;
    const [x, y] = v.market_a_identity <= v.market_b_identity
      ? [v.market_a_identity, v.market_b_identity]
      : [v.market_b_identity, v.market_a_identity];
    if (!acceptedPairReason.has(`${x}|${y}`)) acceptedPairReason.set(`${x}|${y}`, v.judge_reason);
    // Same-class sides union (within-class collapse, the 1f-2 behavior);
    // cross-class sides become pairwise links (OOD-3, no chaining).
    for (const ca of classesOf(v.market_a_identity)) {
      for (const cb of classesOf(v.market_b_identity)) {
        if (ca === cb) union(nodeOf(v.market_a_identity, ca), nodeOf(v.market_b_identity, cb));
        else if (!crossClassPairs.has(`${x}|${y}`)) crossClassPairs.set(`${x}|${y}`, v.judge_reason);
      }
    }
  }
  // Identical identity across classes = an exact cross-class twin (the OOD-2
  // write path banks no verdict row for it) — a pairwise link too.
  for (const [identity, members] of byIdentity) {
    if (identityClass(identity) === "mixed") {
      const key = `${identity}|${identity}`;
      if (!crossClassPairs.has(key)) {
        crossClassPairs.set(key, "identical content identity — exact cross-register twin");
      }
    }
    void members;
  }

  // Groups: root node → member defs (same-identity same-class share a node).
  const groups = new Map<string, Array<MarketDefRow & { identity: string }>>();
  for (const d of defs) {
    const root = find(nodeOf(d.identity, registerClass(d.market_register)));
    const arr = groups.get(root) ?? [];
    arr.push(d);
    groups.set(root, arr);
  }

  const entries: Array<{ resolved: ResolvedMarket; identities: Set<string>; cls: "public" | "internal" }> = [];
  const sortedRoots = [...groups.keys()].sort();
  for (const root of sortedRoots) {
    const members = groups.get(root)!;
    const rep = pickRepresentative(members);
    const declaredMembers = members.filter((m) => isDeclared(m.provenance_type));
    const generatedMembers = members.filter((m) => !isDeclared(m.provenance_type));

    // Tier.
    let tier: MarketTier;
    let tierReason: string | undefined;
    if (members.some((m) => isValidatedProvenance(m.provenance_type))) {
      tier = "validated";
    } else if (declaredMembers.length > 0 && generatedMembers.length > 0) {
      tier = "corroborated";
      // Deterministic reason: the first declared↔generated accepted pair.
      outer:
      for (const dm of declaredMembers.slice().sort((a, b) => a.identity.localeCompare(b.identity))) {
        for (const gm of generatedMembers.slice().sort((a, b) => a.identity.localeCompare(b.identity))) {
          const [x, y] = dm.identity <= gm.identity ? [dm.identity, gm.identity] : [gm.identity, dm.identity];
          const r = acceptedPairReason.get(`${x}|${y}`);
          if (r) {
            tierReason = r;
            break outer;
          }
          if (dm.identity === gm.identity) {
            tierReason = "identical content identity — the outside read surfaced the same market verbatim";
            break outer;
          }
        }
      }
    } else if (declaredMembers.length > 0) {
      tier = "declared_not_visible";
    } else {
      tier = "inferred_hypothesis";
    }

    // Spine nuance: the customer def anchors the group's journey_key.
    const spineMember = members.find((m) => m.journey_key === "customer");
    const journeyKey = spineMember ? "customer" : rep.journey_key;

    // Lens state: representative's lens; missing lens = legacy → active.
    const lensState = lensByKey.get(rep.journey_key)?.portfolio_state ?? "active";

    const resolved: ResolvedMarket = {
      journey_key: journeyKey,
      display_statement: rep.declared_verbatim?.trim() || `${rep.job_executor}${rep.jtbd ? ` — ${rep.jtbd}` : ""}`,
      job_executor: rep.job_executor,
      jtbd: rep.jtbd,
      provenance: rep.provenance_type,
      register: rep.market_register,
      tier,
      ...(tierReason ? { tier_reason: tierReason } : {}),
      relationship_kind: rep.relationship_kind ?? null,
      relationship_basis: rep.relationship_basis ?? null,
      portfolio_state: lensState,
      source_refs: members.map((m) => m.declared_source_ref).filter((x): x is string => Boolean(x)).sort(),
      is_collapsed_twin: members.length > 1,
      collapsed_keys: members.filter((m) => m.id !== rep.id).map((m) => m.journey_key).sort(),
      cross_register_pairs: [],
    };
    entries.push({
      resolved,
      identities: new Set(members.map((m) => m.identity)),
      cls: registerClass(rep.market_register),
    });
  }

  // OOD-3: attach PAIRWISE cross-class say/see links — each accepted
  // cross-class verdict (or exact cross-class twin) links the two groups it
  // touches, as a discrete pair. No transitivity: an entry's links never
  // merge entries.
  for (const [pairKey, reason] of crossClassPairs) {
    const [idA, idB] = pairKey.split("|");
    for (const a of entries) {
      if (!a.identities.has(idA) && !a.identities.has(idB)) continue;
      for (const b of entries) {
        if (b === a || a.cls === b.cls) continue;
        const touches = (a.identities.has(idA) && b.identities.has(idB)) || (a.identities.has(idB) && b.identities.has(idA));
        if (!touches) continue;
        if (!a.resolved.cross_register_pairs.some((p) => p.journey_key === b.resolved.journey_key)) {
          a.resolved.cross_register_pairs.push({ journey_key: b.resolved.journey_key, register: b.resolved.register, reason });
        }
        if (!b.resolved.cross_register_pairs.some((p) => p.journey_key === a.resolved.journey_key)) {
          b.resolved.cross_register_pairs.push({ journey_key: a.resolved.journey_key, register: a.resolved.register, reason });
        }
      }
    }
  }
  for (const e of entries) e.resolved.cross_register_pairs.sort((a, b) => a.journey_key.localeCompare(b.journey_key));

  // Per-surface filter (OOD-3): Act A ('outside') = public registers only.
  const visible = entries.filter((e) => surface === "diagnose" || isPublicRegister(e.resolved.register));

  const active: ResolvedMarket[] = [];
  const deferred: ResolvedMarket[] = [];
  for (const e of visible) {
    (e.resolved.portfolio_state === "deferred" ? deferred : active).push(e.resolved);
  }

  // Deterministic ordering: spine first, then journey_key.
  const order = (a: ResolvedMarket, b: ResolvedMarket) => {
    if (a.journey_key === "customer") return -1;
    if (b.journey_key === "customer") return 1;
    return a.journey_key.localeCompare(b.journey_key);
  };
  active.sort(order);
  deferred.sort(order);
  return { active, deferred };
}
