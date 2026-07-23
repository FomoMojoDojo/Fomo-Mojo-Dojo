// OC-2 — the observed-contest feed derivation. PURE and DETERMINISTIC: no model
// calls, no network, no DB, no clock. Given the meeting's frozen responses, the
// company's observed claims indexed by content identity, and the contests that
// already exist for the session, it decides exactly which claim_contests rows to
// birth. The edge function (feed-first-read-corrections) does the SELECTs and the
// INSERTs; this module owns the LAW so it can be unit-tested with zero residue.
//
// Laws encoded here (OC-2 brief + OC-1 schema):
//   * reject → contest_kind='disputed'; not_important → contest_kind='immaterial'.
//     No other verdict produces a contest (confirm/correct never do).
//   * ANCHORED ONLY: a response contests a claim only when its item_identity
//     resolves to an observed claim by CONTENT IDENTITY (the same map the
//     corrections feed uses). An unanchored response is counted as render-only and
//     births NOTHING — an anchor is never fabricated.
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
  considered: number; // reject/not_important responses seen
}

function isContestVerdict(v: string): v is ContestVerdict {
  return v === "rejected" || v === "not_important";
}

export function deriveContests(args: {
  responses: FeedResponse[];
  publicByIdentity: Map<string, ObservedClaim>;
  existingClaimIds: Iterable<string>;
}): ContestPlan {
  const claimed = new Set<string>(args.existingClaimIds); // claim_ids already contested this session
  const births: ContestBirth[] = [];
  let disputed = 0, immaterial = 0, skipped_existing = 0, unanchored = 0, considered = 0;

  for (const r of args.responses) {
    if (!isContestVerdict(r.verdict)) continue; // confirm/correct/anything else → no contest
    considered++;

    const anchor = args.publicByIdentity.get(r.item_identity);
    if (!anchor) {
      unanchored++; // render-only, counted elsewhere; never fabricate an anchor
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

  return { births, disputed, immaterial, skipped_existing, unanchored, considered };
}
