// ── Relationship-kind vocabulary — THE single authority ──────────────────────────────────────────
//
// Gate 2 (operator-signed 2026-09-10). Until now three lists disagreed and nobody owned the set:
//   • the generator's example list (marketPortfolioDiscovery.ts) — five illustrative kinds;
//   • the market_options CHECK (20260721150000) and its TS mirror KNOWN_KINDS in MarketAct.tsx —
//     six kinds, which is what the "new kind" note was measured against;
//   • RELATIONSHIP_KIND_LABELS in firstReadPreview/acts.tsx — six labels, a DIFFERENT six.
// Riverlane is what that cost: the public read says "raised $127M from 12 investors", the generator
// had no `investor` to reach for so it wrote `funder`, and the label map turned `funder` into
// "DONOR" on a quantum-computing vendor's page. Meanwhile `observer` and `user` had no label at all
// and fell through to raw capitalisation with no note, and `user` — in two of the three lists — had
// never once been generated.
//
// THE COLUMN IS STILL FREE TEXT BY LAW. odi_market_definitions.relationship_kind deliberately has NO
// CHECK (20260715120000: "the taxonomy is EMERGENT per company, never imposed by us"). This file is
// not a gate on what the model may say. It is (a) what the generator is SHOWN as examples, (b) what
// the market_options CHECK admits, and (c) the set a rendered kind is measured against — anything
// outside it still renders, verbatim and capitalised, but carries the signed note that says so.
//
// Imported directly by client code (src/components/client-view/story/movement/MarketAct.tsx and
// src/views/client/firstReadPreview/acts.tsx). That is an established pattern here — InventoryTable
// imports modelCallSites, evidenceExcerptGuard imports contentIdentity — so there is NO src/lib
// mirror and no parity test to keep in step. One file, one list, three consumers.

/** The known set, in the order the generator is shown them: what someone gets from the company, then
 *  who pays for it, then who carries it outward. Membership decides ONLY the "new kind" note and the
 *  market_options CHECK — never whether a market renders. */
export const KNOWN_RELATIONSHIP_KINDS = [
  "recipient",
  "buyer",
  "user",
  "referrer",
  "funder",
  "investor",
  "partner",
  "observer",
  "communicator",
] as const;

export type RelationshipKind = (typeof KNOWN_RELATIONSHIP_KINDS)[number];

export const KNOWN_RELATIONSHIP_KIND_SET: ReadonlySet<string> = new Set(KNOWN_RELATIONSHIP_KINDS);

/** Stored kind → on-screen label. Identity for all but `communicator`, which reads "Advocate" (the
 *  2026-08-31 signed wording, kept). `funder` reads "Funder", not "Donor": the two are different
 *  relationships and collapsing them mislabelled a VC as a charitable giver. */
export const RELATIONSHIP_KIND_LABELS: Record<string, string> = {
  recipient: "Recipient",
  buyer: "Buyer",
  user: "User",
  referrer: "Referrer",
  funder: "Funder",
  investor: "Investor",
  partner: "Partner",
  observer: "Observer",
  communicator: "Advocate",
};

/** Is this kind inside the known set? Off-vocabulary kinds are shown WITH the emergent-kind note. */
export function isKnownRelationshipKind(kind: string | null | undefined): boolean {
  return KNOWN_RELATIONSHIP_KIND_SET.has(String(kind ?? "").trim().toLowerCase());
}

/** Stored kind → display label. Unknown kinds capitalise verbatim (the surface never invents a name
 *  for something the evidence called something else); null/empty ⇒ null ⇒ NO chip, silently. */
export function relationshipKindLabel(kind: string | null | undefined): string | null {
  const k = String(kind ?? "").trim().toLowerCase();
  if (!k) return null;
  return RELATIONSHIP_KIND_LABELS[k] ?? k.charAt(0).toUpperCase() + k.slice(1);
}

/** The signed note shown beside a kind outside the known set (MarketAct's wording since MPD-3). */
export const NEW_KIND_NOTE = "a relationship kind we found in your signal";
