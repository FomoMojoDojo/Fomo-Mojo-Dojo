// LISTING CORROBORATION PREDICATE — pure (no Deno, no DB). Operator ruling 2026-09-04, shape (c): a listing
// (third-party product listing) may corroborate ONLY a declared claim about wholesale / retail placement:
// statement_kind ∈ {offer, audience, positioning} AND the text carries a placement token. It can never corroborate
// anything else. Own-host refusal is NOT here — it stays at pairing (isOwnDomainUrl) and in the override RPC.
// WIDENED (operator ruling 2026-09-04, ruling 2): positioning joins offer / audience; the placement token stays required.
export const LISTING_ELIGIBLE_KINDS: ReadonlySet<string> = new Set(["offer", "audience", "positioning"]);
export const PLACEMENT_TOKEN_RE = /\b(wholesale|retail(?:er|ers)?|stockists?|partners?(?:hips?)?|available at)\b/i;
export type ListingCorroborationVerdict = { ok: true } | { ok: false; reason: "kind_not_eligible" | "no_placement_token" };

export function listingMayCorroborate(declared: { statement_kind?: string | null; statement: string | null | undefined }): ListingCorroborationVerdict {
  const kind = (declared.statement_kind ?? "").trim().toLowerCase();
  if (!LISTING_ELIGIBLE_KINDS.has(kind)) return { ok: false, reason: "kind_not_eligible" };
  if (!PLACEMENT_TOKEN_RE.test(declared.statement ?? "")) return { ok: false, reason: "no_placement_token" };
  return { ok: true };
}
