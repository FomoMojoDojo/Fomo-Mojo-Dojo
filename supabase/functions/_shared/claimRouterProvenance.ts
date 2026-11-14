// SP-349 (signed 2026-11-14): A CLAIM'S PUBLICNESS IS DERIVED FROM ITS SIGNALS' SOURCE, AT CALL TIME.
//
// Why. A claim's stored `provenance` is a marking written once, at mint. A claim minted from an
// uploaded document the voice gate classed third party is stored `public_observed`, and every path
// that routed by that marking — claim pairing, conflict explanation, the relevance backstop, the
// public-read delta lane, open-question delta anchors — would have sent it to an outside model.
// Measured at signing: 43 active public_observed claims rest wholly on uploaded-file signals
// (Charter 7, CB1 36); none had reached an outside model.
//
// The rule. A claim is public to the router ONLY if ALL of:
//   1. it has at least one claim_signal_refs row (a claim with no resolvable signals is private);
//   2. every signal it rests on has a source_type on the public allowlist — isPublicSignalSourceType,
//      the SAME predicate signalProvenance applies (SP-346) and the W1 public-read wall applies; a
//      ref whose signal row cannot be loaded counts as non-public;
//   3. its stored marking is itself public (isPublicProvenance).
// The stored marking may NARROW the answer (an internal_declared claim on public signals stays
// private) but never WIDEN it. The answer is the stored marking when public, else null.
//
// Read-only. Nothing here writes a claim, a delta or any marking. A query error fails CLOSED: every
// requested id resolves null (private) and the error is logged — a lookup that could not prove a
// claim public never lets it travel.
import { isPublicSignalSourceType } from "./clientMaterial.ts";
import { isPublicProvenance } from "./publicReadGuards.ts";

/** The selection_dropped reason the public-read delta lane records for a delta it withholds. */
export const CLAIM_NOT_PUBLIC_BY_SOURCE = "claim_not_public_by_source";

/**
 * The pure decision. `signalSourceTypes` is the source_type of every signal the claim rests on
 * (undefined for a ref whose signal row is missing). Returns the provenance the router may see:
 * the stored marking when the claim is public by source, else null.
 */
export function decideClaimRouterProvenance(
  storedProvenance: string | null | undefined,
  signalSourceTypes: ReadonlyArray<unknown>,
): string | null {
  if (!isPublicProvenance(storedProvenance)) return null; // the marking narrows, never widens
  if (signalSourceTypes.length === 0) return null; // no resolvable signals → private
  if (!signalSourceTypes.every((s) => isPublicSignalSourceType(s))) return null; // any non-public source → private
  return String(storedProvenance);
}

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

const CHUNK = 200;
const PAGE = 1000;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/**
 * The loader: for each claim id, the provenance the router may see (see the rule above). Every
 * requested id is present in the result. Fails closed on any query error.
 */
export async function claimRouterProvenance(
  sb: AnySupabase,
  claimIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const ids = [...new Set(claimIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const out = new Map<string, string | null>(ids.map((id) => [id, null]));
  if (ids.length === 0) return out;
  try {
    const stored = new Map<string, string | null>();
    const refs = new Map<string, string[]>();
    for (const part of chunks(ids, CHUNK)) {
      const { data: cl, error: cErr } = await sb.from("claims").select("id, provenance").in("id", part);
      if (cErr) throw new Error(`claims: ${cErr.message ?? cErr}`);
      for (const c of (cl ?? []) as Array<{ id: string; provenance: string | null }>) stored.set(c.id, c.provenance);
      for (let from = 0;; from += PAGE) {
        const { data: rr, error: rErr } = await sb.from("claim_signal_refs").select("claim_id, signal_id")
          .in("claim_id", part).order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (rErr) throw new Error(`claim_signal_refs: ${rErr.message ?? rErr}`);
        const rows = (rr ?? []) as Array<{ claim_id: string; signal_id: string }>;
        for (const r of rows) refs.set(r.claim_id, [...(refs.get(r.claim_id) ?? []), r.signal_id]);
        if (rows.length < PAGE) break;
      }
    }
    const signalIds = [...new Set([...refs.values()].flat())];
    const sourceBySignal = new Map<string, unknown>();
    for (const part of chunks(signalIds, CHUNK)) {
      const { data: ss, error: sErr } = await sb.from("signals").select("id, source_type").in("id", part);
      if (sErr) throw new Error(`signals: ${sErr.message ?? sErr}`);
      for (const s of (ss ?? []) as Array<{ id: string; source_type: unknown }>) sourceBySignal.set(s.id, s.source_type);
    }
    for (const id of ids) {
      const sources = (refs.get(id) ?? []).map((sid) => sourceBySignal.get(sid)); // a missing row → undefined → non-public
      out.set(id, decideClaimRouterProvenance(stored.get(id), sources));
    }
  } catch (e) {
    console.warn(`[claimRouterProvenance] lookup failed — every requested claim resolves private (fail closed): ${e instanceof Error ? e.message : e}`);
    for (const id of ids) out.set(id, null);
  }
  return out;
}
