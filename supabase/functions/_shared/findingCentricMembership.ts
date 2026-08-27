// ── Gate 5c — finding-centric coherent clustering (2026-08-26) ──────────────────
//
// Retires TRANSITIVE union-find for finding_recurrence membership. The B judge pass
// proved union-find over signal↔signal accepted verdicts collapses into giant
// components (CB2: 85 accepted → one 47-member blob, only 13 about the entity), and
// a hard-θ distinctive floor is vacuously satisfied by brand tokens (cafe/barra sit
// at ~20% DF, below θ=0.40). This module derives a finding's recurrence members
// DIRECTLY from the finding body, with no transitive chaining:
//
//   (1) TIGHT ENTITY ANCHOR — the member text names the company by name-adjacency
//       ("cafe barra" / "cafebarra") or is on the company's own domain. NEVER a bare
//       brand substring: "Barra Picaresca" (a DIFFERENT business, host
//       barrapicaresca.com) contains "barra" but not the adjacency "cafe barra", so
//       it is correctly excluded. "Brothers Coffee", "Cafe de Olla" share only
//       category tokens and are excluded outright.
//   (2) IDF BODY-COHERENCE — Σ IDF(tokens shared with the finding body) ≥ 6, IDF
//       over the company's eligible corpus. By construction the vacuous bridges
//       carry ~nothing: coffee idf≈0.49, barra idf≈1.64, cafe idf≈1.59 — a
//       cafe+barra+coffee-only overlap scores ≈3.7 < 6 and is rejected; a member
//       must share several genuinely-distinctive tokens with THIS finding's body.
//   (3) NEAR-DUP COLLAPSE — members keyed (host, normalizeForHash(text)). Same-host
//       identical text counts ONCE (e.g. an Instagram follower line scraped thrice);
//       cross-host identical text counts separately (independent corroboration).
//   (4) JUDGE-ANCHOR — a finding earns a recurrence row only if the judge already
//       verified same-fact recurrence for it (≥1 accepted finding_cluster_verdict);
//       reuses the BANKED verdicts, zero re-judging. Members come from (1)-(3); (4)
//       gates whether the finding qualifies at all (the banked fcv are sparse by the
//       Pass-2 first-accept design, so they anchor the finding, they do not enumerate
//       its members).
//
// Deterministic, ZERO model calls. IDF/threshold fixed at Gate-5c signature.
import { meaningfulTokens } from "./tokens.ts";
import { normalizeForHash } from "./contentIdentity.ts";

/** Σ-IDF floor for body-coherence membership (Gate-5c signature). */
export const IDF_COHERENCE_MIN = 6;

/** Accent- and punctuation-stripped lowercase form for entity matching. Distinct
 *  from normalizeForHash (which keeps accents/punctuation): "Café Barra" → "cafe barra",
 *  "@cafebarracoffee" → "cafebarracoffee". */
export function anchorNorm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type EntityAnchor = { phrase: string; concat: string; ownHost: string | null; multiToken: boolean };

/** Derive a company's tight entity anchor from its name + own host. Name-adjacency
 *  from the ordered meaningful name tokens ("Cafe Barra 2" → phrase "cafe barra",
 *  concat "cafebarra"). A single-token name (e.g. "Edgewood") has phrase===concat
 *  and no adjacency to require. */
export function companyEntityAnchor(name: string | null | undefined, ownHost: string | null | undefined): EntityAnchor {
  const norm = anchorNorm(name ?? "");
  const toks = norm.split(" ").filter((t) => t.length > 2); // ordered, meaningful-ish (drops "2", "of", short bits)
  const phrase = toks.join(" ");
  const concat = toks.join("");
  return { phrase, concat, ownHost: ownHost ? ownHost.toLowerCase() : null, multiToken: toks.length >= 2 };
}

/** (1) Tight entity anchor: name-adjacency phrase, concatenated handle form, or the
 *  company's own domain — never a bare single brand token when the name is multi-word
 *  (that is the Picaresca boundary: "barra picaresca" ≠ "cafe barra"). */
export function isEntityAnchored(text: string, host: string | null | undefined, anchor: EntityAnchor): boolean {
  if (anchor.ownHost && host && host.toLowerCase() === anchor.ownHost) return true;
  if (!anchor.phrase) return false;
  const n = anchorNorm(text);
  if (n.includes(anchor.phrase)) return true;              // "cafe barra"
  if (anchor.concat && n.replace(/ /g, "").includes(anchor.concat)) return true; // "cafebarra", "@cafebarracoffee"
  return false;
}

/** IDF weights over a corpus: idf(t) = ln(N / df(t)). Order-independent, pure. */
export function idfWeights(corpus: string[]): Map<string, number> {
  const N = corpus.length;
  const df = new Map<string, number>();
  for (const doc of corpus) for (const t of meaningfulTokens(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [t, c] of df) idf.set(t, Math.log(N / c));
  return idf;
}

/** (2) Σ IDF of tokens shared between a member text and the finding body. */
export function idfBodyCoherence(text: string, findingBody: string, idf: Map<string, number>): number {
  const tb = meaningfulTokens(findingBody);
  let s = 0;
  for (const t of meaningfulTokens(text)) if (tb.has(t)) s += idf.get(t) ?? 0;
  return s;
}

/** (3) Near-dup collapse key: same-host identical text collapses; cross-host identical
 *  text stays separate (independent corroboration). */
export function dedupKey(host: string | null | undefined, text: string): string {
  return `${(host ?? "").toLowerCase()}|${normalizeForHash(text)}`;
}

export type FCMember = { id: string; claim_text: string; domain: string };
export type FindingCentricRow = {
  cluster_signal_ids: string[];
  distinct_host_count: number;
  host_list: string[];
  verdict_count: number;
};

/**
 * Derive ONE finding's recurrence row under the Gate-5c rule. Returns null when the
 * finding is not judge-anchored (no accepted fcv) or fewer than 2 dedup-collapsed
 * members clear the entity anchor + IDF body-coherence floor.
 *   - `judgeAnchored`: does the finding have ≥1 accepted finding_cluster_verdict.
 *   - `acceptedFcvCount`: banked accepted fcv count → verdict_count (judge support).
 */
export function deriveFindingCentricRow(
  findingId: string,
  findingBody: string,
  members: FCMember[],
  idf: Map<string, number>,
  anchor: EntityAnchor,
  judgeAnchored: boolean,
  acceptedFcvCount: number,
): FindingCentricRow | null {
  if (!judgeAnchored) return null; // (4) finding must be judge-verified to have recurrence at all
  // (1) entity anchor ∧ (2) IDF body-coherence
  const passing = members.filter(
    (m) => isEntityAnchored(m.claim_text, m.domain, anchor) && idfBodyCoherence(m.claim_text, findingBody, idf) >= IDF_COHERENCE_MIN,
  );
  // (3) near-dup collapse — one representative per (host, normtext), deterministic by id
  const byKey = new Map<string, FCMember>();
  for (const m of passing.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    const k = dedupKey(m.domain, m.claim_text);
    if (!byKey.has(k)) byKey.set(k, m);
  }
  const kept = [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id));
  if (kept.length < 2) return null;
  const hosts = [...new Set(kept.map((m) => m.domain))].sort();
  return {
    cluster_signal_ids: kept.map((m) => m.id),
    distinct_host_count: hosts.length,
    host_list: hosts,
    verdict_count: acceptedFcvCount,
  };
}
