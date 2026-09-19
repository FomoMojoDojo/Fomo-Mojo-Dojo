// ── Public-read STORED payloads (operator ruling signed 2026-09-18, Part F) ──────────────────────────
//
// "Stage stores exactly what direct write stores — the enriched storage from prepareStorage — for every kind; the
// strategy row also keeps cascade_source. Only is_current and superseded_by differ between the two paths."
//
// Before this ruling the stage path inserted the RAW translated payload for every kind but strategy, so a staged
// offering lost seen_on / source_count / source_domains / earliest_source / latest_source (Edgewood af50b807,
// 2026-09-18) while a direct-written one carried them. This module is the ONE builder both paths call:
//
//   buildStoredPayloads({ kind, payload, verdict, uuidByRef, refMeta, ownHosts })
//     → storage   : prepareStorage's result (strategy → the coherent spine; offering → items enriched with
//                   seen_on etc.; other kinds → the payload as generated)
//     → stored    : storage with citation tokens translated to ledger uuids — what DIRECT WRITE inserts
//     → staged    : stored, plus cascade_source (the raw rungs, translated) on a strategy row — what STAGE inserts
//     → cascadeItems, derivedSeenOn : the derived artifacts the response reports
//
// Everything here is pure (no I/O); the handler gathers inputs and builds refMeta, then calls this.
import { deriveCascadeSpineAndGaps, type CascadeCoherence, type CascadeGapItem, type StrategyPayload } from "./cascadeRouting.ts";
import { CASCADE_SOURCE_KEY, cascadeSourceOf } from "./publicReadPromote.ts";
import { applyOwnSiteStates, deriveOwnSiteStates, EMPTY_OWN_SITE_RECORD, type OwnSiteRecord, type OwnSiteVerdict } from "./offeringNamedOnSite.ts";

export type RefMeta = { domain: string | null; date: string | null; own_site: boolean };
export type OfferingSeenOn = {
  index: number; label: string; seen_on: "own_site" | "outside";
  source_count: number; domains: string[]; earliest: string | null; latest: string | null;
};

/** bare host of a URL (www. stripped, lowercased). null when unparseable — a synthesis row has no URL. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase() || null; }
  catch { return null; }
}

/** Per-input source metadata the offering enrichment reads. own_site is TRUE ONLY when the input's own
 *  URL is on the company's own host (rule signed 2026-09-18: registry, social and aggregator hosts never
 *  count, including own_word inputs hosted there) — an input's `own_site` flag is no longer trusted. */
export function buildRefMeta(
  inputs: Array<{ id: string; source_url?: string | null; event_date?: string | null; own_site?: boolean }>,
  ownHost: string | null,
): Map<string, RefMeta> {
  const ownHosts = new Set<string>(ownHost ? [ownHost] : []);
  const refMeta = new Map<string, RefMeta>();
  for (const r of inputs) {
    const host = hostOf(r.source_url);
    refMeta.set(r.id, { domain: host, date: r.event_date ?? null, own_site: host !== null && ownHosts.has(host) });
  }
  return refMeta;
}

/** The own-host citation fact per item: the first cited ref whose URL host is the company's own. */
export function ownHostCitationFor(
  payload: Record<string, unknown>,
  uuidByRef: Map<string, string>,
  refMeta: Map<string, RefMeta>,
  ownHosts: Set<string>,
  refUrl: (id: string) => string | null,
): (index: number) => { cited: boolean; url: string | null } {
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  return (index) => {
    const it = items[index] ?? {};
    const ids = [...new Set((Array.isArray(it.refs) ? it.refs : []).filter((r): r is string => typeof r === "string").map((r) => uuidByRef.get(r.trim()) ?? r.trim()))];
    for (const id of ids) {
      const m = refMeta.get(id);
      if (m && (m.own_site || (m.domain !== null && ownHosts.has(m.domain)))) return { cited: true, url: refUrl(id) };
    }
    return { cited: false, url: null };
  };
}

/** Citation tokens ([S1], [O3] …) → ledger uuids, recursively, on every key that names citations/refs/ids. */
export function translateCitations(payload: unknown, uuidByRef: Map<string, string>): unknown {
  if (Array.isArray(payload)) return payload.map((x) => translateCitations(x, uuidByRef));
  if (payload && typeof payload === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (/citation|cite|refs?$|ids$/i.test(k) && Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? (uuidByRef.get(x.trim()) ?? x) : x));
      else out[k] = translateCitations(v, uuidByRef);
    }
    return out;
  }
  return payload;
}

// ── OFFERING seen_on derivation (STRUCTURAL — the model never emits seen_on) ────────────────────────
// For each offering item, resolve its cited ref tokens → ledger uuids → the per-id source metadata, then decide
// seen_on by the honesty axis WHERE it was seen: any own-site ref (own-words, or a signal whose domain matches the
// company's own host) → "own_site"; otherwise "outside". Also record source_count (distinct cited refs), the
// distinct source domains, and the earliest/latest source date. A ref that is ALREADY a uuid (a stored row's
// translated refs) resolves to itself, so the same function enriches a stored payload from its own ledger.
export function deriveOfferingSeenOn(
  payload: Record<string, unknown>,
  uuidByRef: Map<string, string>,
  refMeta: Map<string, RefMeta>,
  ownHosts: Set<string>,
): OfferingSeenOn[] {
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  return items.map((it, index) => {
    const refTokens = [...new Set((Array.isArray(it.refs) ? it.refs : []).filter((r): r is string => typeof r === "string").map((r) => r.trim()))];
    const metas = refTokens.map((t) => refMeta.get(uuidByRef.get(t) ?? t)).filter((m): m is RefMeta => !!m);
    const domains = [...new Set(metas.map((m) => m.domain).filter((d): d is string => !!d))];
    const dates = metas.map((m) => m.date).filter((d): d is string => !!d).sort();
    const ownSite = metas.some((m) => m.own_site) || domains.some((d) => ownHosts.has(d));
    return {
      index, label: typeof it.label === "string" ? it.label : "",
      seen_on: ownSite ? "own_site" : "outside",
      source_count: refTokens.length, domains,
      earliest: dates[0] ?? null, latest: dates[dates.length - 1] ?? null,
    };
  });
}

/** The offering payload with each item carrying its derived seen_on facts (text fields untouched). */
export function enrichOffering(payload: Record<string, unknown>, seenOn: OfferingSeenOn[]): Record<string, unknown> {
  const offItems = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  return {
    ...payload,
    items: offItems.map((it, i) => ({
      ...it,
      seen_on: seenOn[i]?.seen_on ?? null,
      source_count: seenOn[i]?.source_count ?? 0,
      source_domains: seenOn[i]?.domains ?? [],
      earliest_source: seenOn[i]?.earliest ?? null,
      latest_source: seenOn[i]?.latest ?? null,
    })),
  };
}

export type StoredPayloads = {
  storage: Record<string, unknown>;
  stored: Record<string, unknown>;
  staged: Record<string, unknown>;
  cascadeItems: CascadeGapItem[];
  derivedSeenOn: OfferingSeenOn[] | null;
  /** Offering only — the earned own-site state per item (rule signed 2026-09-18). */
  ownSiteVerdicts: OwnSiteVerdict[] | null;
};

/** ONE builder for what a read row stores — direct write inserts `stored`, stage inserts `staged`. */
export function buildStoredPayloads(args: {
  kind: string;
  payload: Record<string, unknown>;
  verdict: Record<string, unknown>;
  uuidByRef: Map<string, string>;
  refMeta: Map<string, RefMeta>;
  ownHosts: Set<string>;
  /** The own-site record (offering only). Absent ⇒ no page was read ⇒ items not named by citation are "own_site_not_read". */
  ownSiteRecord?: OwnSiteRecord | null;
  /** URL of a ledger input by id (for the own_host_citation evidence). */
  refUrl?: (id: string) => string | null;
}): StoredPayloads {
  const { kind, payload, verdict, uuidByRef, refMeta, ownHosts } = args;
  let storage: Record<string, unknown> = payload;
  let cascadeItems: CascadeGapItem[] = [];
  let derivedSeenOn: OfferingSeenOn[] | null = null;
  let ownSiteVerdicts: OwnSiteVerdict[] | null = null;
  if (kind === "strategy") {
    const coherence = (verdict.cascade_coherence ?? null) as CascadeCoherence | null;
    const derived = deriveCascadeSpineAndGaps(payload as StrategyPayload, coherence);
    cascadeItems = derived.items;
    storage = derived.spine as Record<string, unknown>;
  } else if (kind === "offering") {
    derivedSeenOn = deriveOfferingSeenOn(payload, uuidByRef, refMeta, ownHosts);
    const enriched = enrichOffering(payload, derivedSeenOn);
    // "Named on your own site" is EARNED (rule 2026-09-18): name check ∪ own-host citation; absence never claimed.
    const cited = ownHostCitationFor(payload, uuidByRef, refMeta, ownHosts, args.refUrl ?? (() => null));
    ownSiteVerdicts = deriveOwnSiteStates((enriched.items as Array<{ label?: unknown }>) ?? [], cited, args.ownSiteRecord ?? EMPTY_OWN_SITE_RECORD);
    storage = applyOwnSiteStates(enriched, ownSiteVerdicts);
  }
  const stored = translateCitations(storage, uuidByRef) as Record<string, unknown>;
  const staged = kind === "strategy"
    ? { ...stored, [CASCADE_SOURCE_KEY]: cascadeSourceOf(translateCitations(payload, uuidByRef) as Record<string, unknown>) }
    : stored;
  return { storage, stored, staged, cascadeItems, derivedSeenOn, ownSiteVerdicts };
}
