// OC-2 — the observed-contest feed derivation. PURE and DETERMINISTIC: no model
// calls, no network, no DB, no clock. Given the meeting's frozen responses, the
// company's observed claims indexed by content identity, and the contests that
// already exist for the session, it decides exactly which claim_contests rows to
// birth. The edge function (feed-first-read-corrections) does the SELECTs and the
// INSERTs; this module owns the LAW so it can be unit-tested with zero residue.
//
// Laws encoded here (OC-2 brief + OC-1 schema; OC-2d anchor extension):
//   * reject → contest_kind='disputed'; not_important → contest_kind='immaterial'.
//     No other verdict produces a contest (confirm/correct never do).
//   * ANCHORED ONLY, by item KIND (OC-2d): a response contests a claim only when it
//     resolves to a live observed claim.
//       - kind='delta'  → resolve via the delta row's STORED public-claim reference
//         (deltaAnchorByRef, keyed by the delta id in item_ref) — NEVER by identity
//         reconstruction. A delta with no live public claim (publicly_silent has none,
//         or the row is gone) has no entry → births nothing (honest, counted).
//       - kind='market' → NO claim contest exists for a market item; excluded by
//         design and counted separately (scope signal, never silently dropped).
//       - otherwise (finding / differentiator / legacy) → resolve by CONTENT IDENTITY
//         via publicByIdentity, exactly as before (untouched).
//     An unanchored response is counted as render-only and births NOTHING — an anchor
//     is never fabricated.
//   * IDEMPOTENT by SKIP-BEFORE-INSERT: a (session, claim) that already has a
//     contest — or that a prior response in this same run already claimed — is
//     skipped here, so the caller never attempts a duplicate insert. The unique
//     (session_id, claim_id) constraint is only the backstop, never the mechanism.
//   * NO claim writes: a contest births a claim_contests row only. This module
//     cannot express a claims/claims.status write — its output is contest rows.

export type ContestVerdict = "rejected" | "not_important";
export type ContestKind = "disputed" | "immaterial";

// The verdicts that can produce a contest, mapped to their kind. Confirm/correct
// are absent by construction — they can never yield a contest.
export const CONTEST_VERDICT_KIND: Record<ContestVerdict, ContestKind> = {
  rejected: "disputed",
  not_important: "immaterial",
};

export interface FeedResponse {
  id: string;
  verdict: string; // any first_read_responses verdict; non-contest verdicts are ignored
  item_identity: string;
  // OC-2d: optional so the existing identity-path fixtures/callers are unchanged. When
  // absent or not 'delta'/'market', the finding/identity path runs exactly as before.
  item_kind?: string; // 'delta' | 'market' | 'finding' | 'differentiator' | undefined
  item_ref?: string | null; // the source row id — for kind='delta', the claim_delta id
}

export interface ObservedClaim {
  id: string;
  identity: string; // contentIdentity(claim.statement)
}

// A row ready to insert into claim_contests. source/resolution are fixed by the
// OC-1 schema contract: source is the client-attested provenance origin;
// resolution is NULL (born unresolved — resolution is OC-3).
export interface ContestBirth {
  claim_id: string;
  claim_identity: string;
  contest_kind: ContestKind;
  response_id: string; // provenance of which response produced this contest
}

export interface ContestPlan {
  births: ContestBirth[];
  disputed: number;
  immaterial: number;
  skipped_existing: number; // resolved to a claim that already has a contest this session
  unanchored: number; // reject/not_important with no observed-claim anchor (render-only)
  market: number; // OC-2d: reject/not_important on a MARKET item — no claim contest by design
  considered: number; // reject/not_important responses seen
}

function isContestVerdict(v: string): v is ContestVerdict {
  return v === "rejected" || v === "not_important";
}

export function deriveContests(args: {
  responses: FeedResponse[];
  publicByIdentity: Map<string, ObservedClaim>;
  /** OC-2d: delta row id → the live public claim it references (from claim_deltas.public_claim_id).
   *  Absent (default empty) preserves the pre-OC-2d identity-only behavior. */
  deltaAnchorByRef?: Map<string, ObservedClaim>;
  existingClaimIds: Iterable<string>;
}): ContestPlan {
  const deltaAnchor = args.deltaAnchorByRef ?? new Map<string, ObservedClaim>();
  const claimed = new Set<string>(args.existingClaimIds); // claim_ids already contested this session
  const births: ContestBirth[] = [];
  let disputed = 0, immaterial = 0, skipped_existing = 0, unanchored = 0, market = 0, considered = 0;

  for (const r of args.responses) {
    if (!isContestVerdict(r.verdict)) continue; // confirm/correct/anything else → no contest
    considered++;

    // MARKET: no claim contest exists for a market item — excluded by design, counted
    // honestly (scope signal for shrink/pricing), NEVER silently dropped.
    if (r.item_kind === "market") {
      market++;
      continue;
    }

    // ANCHOR by kind. delta → the delta row's stored public-claim reference (never by
    // identity reconstruction); everything else → content identity (unchanged path).
    const anchor = r.item_kind === "delta"
      ? (r.item_ref ? deltaAnchor.get(r.item_ref) : undefined)
      : args.publicByIdentity.get(r.item_identity);

    if (!anchor) {
      unanchored++; // no live claim (publicly_silent delta / gone / non-matching) — never fabricated
      continue;
    }

    if (claimed.has(anchor.id)) {
      skipped_existing++; // skip BEFORE insert — the unique constraint is only a backstop
      continue;
    }
    claimed.add(anchor.id); // also dedupes two responses resolving to the same claim in one run

    const contest_kind = CONTEST_VERDICT_KIND[r.verdict];
    if (contest_kind === "disputed") disputed++; else immaterial++;
    births.push({
      claim_id: anchor.id,
      claim_identity: anchor.identity,
      contest_kind,
      response_id: r.id,
    });
  }

  return { births, disputed, immaterial, skipped_existing, unanchored, market, considered };
}
