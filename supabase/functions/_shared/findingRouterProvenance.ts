// F1 (SP-352, signed 2026-11-14): A FINDING'S PUBLICNESS IS DERIVED FROM ITS SOURCES, AT CALL TIME.
//
// Why. Every finding is stored register='public_inferred', and four paths routed by that marking or by a
// hard-coded 'public_inferred' — finding beats, the recurrence finding-join judge, the public-read
// finding lane and open-question finding anchors. Six frontier findings were mined before the
// 2026-09-18 corpus wall from every organization-band row of any source and carry no input ledger;
// two of them (Edgewood c7bfc5cc, Cafe Barra 2 ac951864) hold wording found only in that company's
// uploads, and outside prompts carried them (SP-350-review.md §2).
//
// The rule. A finding is public to the router ONLY if:
//   • it has an origin signal, and that signal's source_type is on the public allowlist
//     (isPublicSignalSourceType — the SP-346 list); a missing origin row is non-public; OR
//   • it has no origin signal, is kind='frontier', and its beats.input_ledger is a non-empty list
//     whose every id resolves public: a signal by source_type, an own-words candidate (own public
//     site), a finding with a public-source origin signal (a frontier in a ledger is NOT followed —
//     fail closed), or a delta whose claims are both public by SP-349's claimRouterProvenance; an id
//     found nowhere is non-public. A frontier with NO ledger is private.
//   Anything else (no origin, not a frontier) is private.
// The stored register may NARROW the answer (a non-public register stays private) but never WIDEN it.
//
// Read-only. Nothing here writes a finding or any marking. Any query error fails CLOSED: every
// requested id resolves private and the error is logged.
import { isPublicSignalSourceType } from "./clientMaterial.ts";
import { isPublicProvenance } from "./publicReadGuards.ts";
import { claimRouterProvenance } from "./claimRouterProvenance.ts";

/** The selection_dropped reason the public-read finding lane records for a finding it withholds. */
export const FINDING_NOT_PUBLIC_BY_SOURCE = "finding_not_public_by_source";

export type FindingSourceRow = {
  origin_signal_id?: string | null;
  kind?: string | null;
  input_ledger?: unknown;
};

/**
 * The pure source rule. `originSourceType` is the origin signal's source_type (undefined when the row is
 * missing); `ledgerIdPublic` answers for one frontier-ledger id. True only when the finding is public BY SOURCE.
 */
export function decideFindingPublicBySource(
  f: FindingSourceRow,
  originSourceType: unknown,
  ledgerIdPublic: (id: string) => boolean,
): boolean {
  if (f.origin_signal_id) return isPublicSignalSourceType(originSourceType);
  if (f.kind !== "frontier") return false;
  const ledger = f.input_ledger;
  if (!Array.isArray(ledger) || ledger.length === 0) return false; // no ledger → private
  return ledger.every((id) => typeof id === "string" && id.length > 0 && ledgerIdPublic(id));
}

/** The router's answer: the stored register when it is public AND the finding is public by source, else null. */
export function decideFindingRouterProvenance(register: string | null | undefined, publicBySource: boolean): string | null {
  if (!isPublicProvenance(register)) return null; // the register narrows, never widens
  return publicBySource ? String(register) : null;
}

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

export type FindingSourceVerdict = { register: string | null; publicBySource: boolean };

const CHUNK = 200;

function chunks<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function inChunks<R>(ids: string[], load: (part: string[]) => Promise<{ data: unknown; error: unknown }>): Promise<R[]> {
  const out: R[] = [];
  for (const part of chunks(ids, CHUNK)) {
    const { data, error } = await load(part);
    if (error) throw new Error(String((error as { message?: string }).message ?? error));
    out.push(...((data ?? []) as R[]));
  }
  return out;
}

/**
 * The loader: for each finding id, its stored register and whether it is public BY SOURCE (the rule above).
 * Every requested id is present in the result; an unknown id is { register: null, publicBySource: false }.
 * Fails closed on any query error.
 */
export async function findingSourceVerdicts(
  sb: AnySupabase,
  findingIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, FindingSourceVerdict>> {
  const ids = [...new Set(findingIds.filter((x): x is string => typeof x === "string" && x.length > 0))];
  const out = new Map<string, FindingSourceVerdict>(ids.map((id) => [id, { register: null, publicBySource: false }]));
  if (ids.length === 0) return out;
  try {
    type FRow = { id: string; register: string | null; origin_signal_id: string | null; kind: string | null; beats: { input_ledger?: unknown } | null };
    const rows = await inChunks<FRow>(ids, (p) => sb.from("findings").select("id, register, origin_signal_id, kind, beats").in("id", p));
    const ledgerOf = (r: FRow): unknown => r.beats?.input_ledger;
    const ledgerIds = [...new Set(rows.filter((r) => !r.origin_signal_id && r.kind === "frontier")
      .flatMap((r) => (Array.isArray(ledgerOf(r)) ? (ledgerOf(r) as unknown[]) : []))
      .filter((x): x is string => typeof x === "string" && x.length > 0))];

    // ledger findings: resolved by their own origin signal only (a frontier in a ledger is not followed)
    const ledgerFindings = ledgerIds.length
      ? await inChunks<{ id: string; origin_signal_id: string | null }>(ledgerIds, (p) => sb.from("findings").select("id, origin_signal_id").in("id", p))
      : [];
    const originIds = [...new Set([
      ...rows.map((r) => r.origin_signal_id),
      ...ledgerFindings.map((r) => r.origin_signal_id),
      ...ledgerIds,
    ].filter((x): x is string => typeof x === "string" && x.length > 0))];
    const sigRows = originIds.length
      ? await inChunks<{ id: string; source_type: unknown }>(originIds, (p) => sb.from("signals").select("id, source_type").in("id", p))
      : [];
    const sourceBySignal = new Map(sigRows.map((s) => [s.id, s.source_type]));

    const ownWordIds = new Set(ledgerIds.length
      ? (await inChunks<{ id: string }>(ledgerIds, (p) => sb.from("own_words_candidates").select("id").in("id", p))).map((r) => r.id)
      : []);
    const deltaRows = ledgerIds.length
      ? await inChunks<{ id: string; declared_claim_id: string | null; public_claim_id: string | null }>(ledgerIds, (p) =>
        sb.from("claim_deltas").select("id, declared_claim_id, public_claim_id").in("id", p))
      : [];
    const deltaClaimProv = await claimRouterProvenance(sb, deltaRows.flatMap((d) => [d.declared_claim_id, d.public_claim_id]));
    // claimRouterProvenance fails closed by itself (every id null), which reads here as non-public.

    const ledgerPublic = new Map<string, boolean>();
    for (const id of ledgerIds) {
      if (sourceBySignal.has(id)) { ledgerPublic.set(id, isPublicSignalSourceType(sourceBySignal.get(id))); continue; }
      if (ownWordIds.has(id)) { ledgerPublic.set(id, true); continue; } // own words: the company's own public site
      const lf = ledgerFindings.find((r) => r.id === id);
      if (lf) { ledgerPublic.set(id, !!lf.origin_signal_id && isPublicSignalSourceType(sourceBySignal.get(lf.origin_signal_id))); continue; }
      const d = deltaRows.find((r) => r.id === id);
      if (d) {
        ledgerPublic.set(id, [d.declared_claim_id, d.public_claim_id].every((c) => !!c && deltaClaimProv.get(c) != null));
        continue;
      }
      ledgerPublic.set(id, false); // found nowhere → non-public
    }

    for (const r of rows) {
      const publicBySource = decideFindingPublicBySource(
        { origin_signal_id: r.origin_signal_id, kind: r.kind, input_ledger: ledgerOf(r) },
        r.origin_signal_id ? sourceBySignal.get(r.origin_signal_id) : undefined,
        (id) => ledgerPublic.get(id) === true,
      );
      out.set(r.id, { register: r.register, publicBySource });
    }
  } catch (e) {
    console.warn(`[findingRouterProvenance] lookup failed — every requested finding resolves private (fail closed): ${e instanceof Error ? e.message : e}`);
    for (const id of ids) out.set(id, { register: null, publicBySource: false });
  }
  return out;
}

/** For each finding id, the provenance the router may see: the stored register when public by source, else null. */
export async function findingRouterProvenance(
  sb: AnySupabase,
  findingIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string | null>> {
  const v = await findingSourceVerdicts(sb, findingIds);
  return new Map([...v.entries()].map(([id, x]) => [id, decideFindingRouterProvenance(x.register, x.publicBySource)]));
}
