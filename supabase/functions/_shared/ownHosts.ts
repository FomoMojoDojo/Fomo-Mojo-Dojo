// E2 (operator ruling 2026-10-21) — THE own-host set: the company's seed host plus its CONFIRMED related entities' hosts.
//
// One resolver, ownHostsFor(company, related, asOf), feeds the one own-domain rule (firstReadProvenance.isOwnDomainUrl,
// which takes either a single host — the pre-E1 call shape, unchanged — or this set). A related host joins the set only
// when its row is status = 'confirmed' and its effective_from ≤ asOf (no effective_from = always, provisional). A company
// with no confirmed related entity resolves to exactly { seed } — every caller then behaves byte-identically to the
// single-host rule (E5 parity).
//
// No company identity is re-derived here beyond the seed host: the seed is companies.website's hostname, www-stripped,
// lowercased — the same derivation every single-host site used.

export type RelatedRelation = "parent" | "subsidiary" | "acquired" | "brand" | "merged_into";
export type EffectiveBasis = "cited" | "crawl_date_provisional";
/** A company_related_entities row as the resolver reads it (status is filtered here, never assumed). */
/** Ruling 1 (2026-10-21): every confirmed entity's per-entity exclude list (hosts that share its name but are NOT it) —
 *  a web_search citation on one of them mints nothing. Separate from the loader so the loader's shape is unchanged. */
export async function loadEntityExcludeHosts(supabase: { from: (t: string) => any }, companyId: string): Promise<string[]> {
  const { data, error } = await supabase.from("company_related_entities").select("exclude_hosts").eq("company_id", companyId).eq("status", "confirmed");
  if (error) throw new Error(`company_related_entities exclude_hosts read failed for ${companyId}: ${String(error.message ?? error)}`);
  return [...new Set(((data ?? []) as Array<{ exclude_hosts?: string[] | null }>).flatMap((r) => r.exclude_hosts ?? []))];
}
export type RelatedEntityRow = {
  id: string; name: string; host: string; relation: RelatedRelation;
  effective_from: string | null; effective_basis: EffectiveBasis; status: string;
};
/** E4: the stamp every row decided by a related-entity rule carries (raw_payload.entity). basis says why the entity
 *  applies: the row's effective_basis when the relation is in effect at the row's date — cited (a cited relation; with no
 *  effective_from it is a standing one, "always") or crawl_date_provisional (uncited — shown "· date not confirmed") —
 *  and before_effective when the row predates the relation (it stays outside). */
export type EntityStamp = { id: string; name: string; host: string; relation: RelatedRelation; basis: EffectiveBasis | "before_effective" | "page_undated"; effective_from: string | null };
/** Ruling 13 (2026-10-22): the basis of a row on a related entity WITH a relation start date whose PAGE carries no
 *  published date — it keeps own voice and renders the signed "· date not confirmed". */
export const PAGE_UNDATED = "page_undated" as const;
/** One member of the set: entity null = the company's own seed host. */
export type OwnHost = { host: string; entity: EntityStamp | null };
export type OwnHostSet = { kind: "own_host_set"; seed: string | null; hosts: readonly OwnHost[] };

/** Lowercased, www-stripped hostname (the same normalisation firstReadProvenance.normalizeHost applies). */
export function normalizeOwnHost(host: string): string {
  return String(host ?? "").trim().replace(/^www\./i, "").toLowerCase();
}
/** The seed host of a company: companies.website's hostname (a bare host is accepted too). */
export function seedHostOf(website: string | null | undefined): string | null {
  const w = String(website ?? "").trim();
  if (!w) return null;
  try { return normalizeOwnHost(new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).hostname) || null; } catch { return null; }
}
const dayOf = (d: string | Date | null | undefined): string | null => {
  if (d == null || d === "") return null;
  const t = d instanceof Date ? d : new Date(d);
  return Number.isFinite(t.getTime()) ? t.toISOString().slice(0, 10) : null;
};
const stampOf = (r: RelatedEntityRow, basis: EntityStamp["basis"]): EntityStamp =>
  ({ id: r.id, name: r.name, host: normalizeOwnHost(r.host), relation: r.relation, basis, effective_from: r.effective_from ?? null });

/** A confirmed related entity is in effect at asOf when it has no effective_from, or effective_from ≤ asOf (by day).
 *  asOf absent → today. */
export function relatedInEffect(r: RelatedEntityRow, asOf?: string | Date | null): boolean {
  if (r.status !== "confirmed") return false;
  if (!r.effective_from) return true;
  const at = dayOf(asOf ?? new Date());
  const from = dayOf(r.effective_from);
  return !!at && !!from && from <= at;
}

/** THE resolver. company: { website } (or { host } when the caller already holds the seed host). */
export function ownHostsFor(company: { website?: string | null; host?: string | null }, related: readonly RelatedEntityRow[] = [], asOf?: string | Date | null): OwnHostSet {
  const seed = company.host != null ? (normalizeOwnHost(company.host) || null) : seedHostOf(company.website);
  const hosts: OwnHost[] = seed ? [{ host: seed, entity: null }] : [];
  for (const r of related) {
    if (!relatedInEffect(r, asOf)) continue;
    const h = normalizeOwnHost(r.host);
    if (!h || hosts.some((x) => x.host === h)) continue;
    hosts.push({ host: h, entity: stampOf(r, r.effective_basis) });
  }
  return { kind: "own_host_set", seed, hosts };
}
export function isOwnHostSet(v: unknown): v is OwnHostSet {
  return !!v && typeof v === "object" && (v as { kind?: unknown }).kind === "own_host_set";
}
const hostOfUrl = (url: string): string | null => { try { return normalizeOwnHost(new URL(url).hostname) || null; } catch { return null; } };
const covers = (h: string, own: string) => h === own || h.endsWith(`.${own}`);

/** The member of the set a URL falls under (equal host or a subdomain), the most specific host winning; the seed wins a
 *  tie. Null when the URL is not on any own host. */
export function ownHostMatch(url: string, set: OwnHostSet): OwnHost | null {
  const h = hostOfUrl(url);
  if (!h) return null;
  let best: OwnHost | null = null;
  for (const o of set.hosts) if (covers(h, o.host) && (!best || o.host.length > best.host.length)) best = o;
  return best;
}
/** Bare-host form: is a HOST (not a URL) one of the set's hosts or a subdomain of one. */
export function ownHostMatchHost(host: string | null | undefined, set: OwnHostSet): OwnHost | null {
  const h = normalizeOwnHost(String(host ?? ""));
  if (!h) return null;
  let best: OwnHost | null = null;
  for (const o of set.hosts) if (covers(h, o.host) && (!best || o.host.length > best.host.length)) best = o;
  return best;
}
/** E2 for OUTSIDE rows: the confirmed related entity a URL is on, whether or not it was in effect at asOf — a row dated
 *  before effective_from stays outside but is stamped with the entity (basis before_effective). Null for the seed host
 *  and for hosts no confirmed entity owns. */
export function relatedEntityFor(url: string, related: readonly RelatedEntityRow[], asOf?: string | Date | null): EntityStamp | null {
  const h = hostOfUrl(url);
  if (!h) return null;
  let best: RelatedEntityRow | null = null;
  for (const r of related) {
    if (r.status !== "confirmed") continue;
    const own = normalizeOwnHost(r.host);
    if (own && covers(h, own) && (!best || own.length > normalizeOwnHost(best.host).length)) best = r;
  }
  if (!best) return null;
  return stampOf(best, relatedInEffect(best, asOf) ? best.effective_basis : "before_effective");
}
/** Ruling 13 (2026-10-22): THE related entity a URL is on, decided by the PAGE's published date — not the crawl or run
 *  date. A confirmed entity with no effective_from is in effect for every page (its own basis). One with a start date:
 *  a page published before it → before_effective (not the company's own voice); a page on or after it → its own basis;
 *  a page with NO published date → page_undated (own voice, "· date not confirmed"). Null off every confirmed entity. */
export function relatedEntityAtPage(url: string, related: readonly RelatedEntityRow[], pageDate: string | null): EntityStamp | null {
  const h = hostOfUrl(url);
  if (!h) return null;
  let best: RelatedEntityRow | null = null;
  for (const r of related) {
    if (r.status !== "confirmed") continue;
    const own = normalizeOwnHost(r.host);
    if (own && covers(h, own) && (!best || own.length > normalizeOwnHost(best.host).length)) best = r;
  }
  if (!best) return null;
  return stampOf(best, entityBasisAtPage(best, pageDate));
}
/** The basis an entity takes on a page with this published date (see relatedEntityAtPage). */
export function entityBasisAtPage(r: Pick<RelatedEntityRow, "effective_from" | "effective_basis">, pageDate: string | null): EntityStamp["basis"] {
  if (!r.effective_from) return r.effective_basis;
  const at = dayOf(pageDate);
  if (!at) return PAGE_UNDATED;
  const from = dayOf(r.effective_from);
  return from && from <= at ? r.effective_basis : "before_effective";
}
const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
/** Ruling 13: a page's PUBLISHED day (YYYY-MM-DD) from the date string a snapshot or a search result carries — an ISO
 *  date, "April 30, 2025", "Apr 30, 2025" or "30 April 2025". A relative age ("3 days ago") or anything else is NOT a
 *  published date ⇒ null (the page is undated). */
export function publishedDayOf(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(t);
  const valid = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
  };
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const mon = (w: string) => { const k = w.toLowerCase().replace(/\.$/, ""); const i = MONTH_NAMES.findIndex((n) => n === k || (k.length >= 3 && n.startsWith(k))); return i < 0 ? null : i + 1; };
  let m = /^([A-Za-z]{3,9}\.?)\s+(\d{1,2}),?\s+(\d{4})$/.exec(t);
  if (m) { const mm = mon(m[1]); return mm ? valid(Number(m[3]), mm, Number(m[2])) : null; }
  m = /^(\d{1,2})\s+([A-Za-z]{3,9}\.?)\s+(\d{4})$/.exec(t);
  if (m) { const mm = mon(m[2]); return mm ? valid(Number(m[3]), mm, Number(m[1])) : null; }
  return null;
}
/** Ruling 13: the published day a retained page snapshot carries (outside_page_snapshots.structured) — the og
 *  article:published_time, else the first ld+json datePublished (nested @graph objects included) — or null. */
export function publishedDayOfSnapshot(structured: unknown): string | null {
  const st = (structured ?? {}) as { og?: Record<string, unknown> | null; ld_json?: unknown };
  const og = st.og && typeof st.og === "object" ? st.og["article:published_time"] : null;
  const fromOg = typeof og === "string" ? publishedDayOf(og) : null;
  if (fromOg) return fromOg;
  const stack: unknown[] = Array.isArray(st.ld_json) ? [...st.ld_json] : st.ld_json ? [st.ld_json] : [];
  for (let n = 0; stack.length && n < 500; n++) {
    const x = stack.shift();
    if (!x || typeof x !== "object") continue;
    if (Array.isArray(x)) { stack.push(...x); continue; }
    const dp = (x as Record<string, unknown>).datePublished;
    const day = typeof dp === "string" ? publishedDayOf(dp) : null;
    if (day) return day;
    for (const v of Object.values(x as Record<string, unknown>)) if (v && typeof v === "object") stack.push(v);
  }
  return null;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Aug 2026" from an ISO date (null when absent). */
export function monthYear(d: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(String(d ?? ""));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
/** E4: how a related entity stands to the company. voice "you" for the client's own screens (the signed venue strings:
 *  "your parent company", "merged with your parent, Aug 2026"); voice "subject" for judge prompts. */
export function relationPhrase(e: Pick<EntityStamp, "relation" | "effective_from">, voice: "you" | "subject" = "subject"): string {
  const your = voice === "you" ? "your" : "the subject's";
  const when = monthYear(e.effective_from);
  switch (e.relation) {
    case "parent": return `${your} parent company`;
    case "subsidiary": return `${your} subsidiary`;
    case "brand": return `${your} brand`;
    case "acquired": return voice === "you" ? `acquired by you${when ? `, ${when}` : ""}` : `acquired by the subject${when ? `, ${when}` : ""}`;
    case "merged_into": return `merged with ${your} parent${when ? `, ${when}` : ""}`;
  }
}

/** E4 (signed 2026-10-21): the venue a related entity's own site renders under — render-time only, never stored.
 *  "On Charter Communications' site · your parent company"; "On Cox Communications' site · merged with your parent,
 *  Aug 2026"; a provisional relation (no cited basis) trails "· date not confirmed". */
export function relatedVenueLabel(e: Pick<EntityStamp, "name" | "relation" | "effective_from" | "basis">): string {
  const n = String(e.name).trim();
  const possessive = /s$/i.test(n) ? `${n}'` : `${n}'s`;
  return `On ${possessive} site · ${relationPhrase(e, "you")}${dateNotConfirmed(e) ? " · date not confirmed" : ""}`;
}
/** The signed suffix applies to an uncited relation (crawl_date_provisional) and, ruling 13, to an undated page. */
const dateNotConfirmed = (e: Pick<EntityStamp, "basis">) => e.basis === "crawl_date_provisional" || e.basis === PAGE_UNDATED;

/** Ruling 12 (signed 2026-10-22): the venue a related PARENT's own SEC filing renders under — a template over the entity's
 *  stored name and relation, never a literal: "In Charter Communications' filing · your parent company". Render-time only. */
export function relatedFilingVenueLabel(e: Pick<EntityStamp, "name" | "relation" | "effective_from" | "basis">): string {
  const n = String(e.name).trim();
  const possessive = /s$/i.test(n) ? `${n}'` : `${n}'s`;
  return `In ${possessive} filing · ${relationPhrase(e, "you")}${dateNotConfirmed(e) ? " · date not confirmed" : ""}`;
}

/** The confirmed related names in effect (for name-based authorities: an "other_entity" verdict naming one is the company). */
export function relatedNamesFor(set: OwnHostSet): string[] {
  return set.hosts.filter((o) => o.entity).map((o) => o.entity!.name);
}

/** The confirmed rows of a company (service role or an RLS-visible caller). Throws on a read error — a caller that
 *  cannot read the table must not silently treat the company as having no related entity. */
export async function loadConfirmedRelatedEntities(supabase: { from: (t: string) => any }, companyId: string): Promise<RelatedEntityRow[]> {
  const { data, error } = await supabase.from("company_related_entities")
    .select("id, name, host, relation, effective_from, effective_basis, status")
    .eq("company_id", companyId).eq("status", "confirmed");
  if (error) throw new Error(`company_related_entities read failed for ${companyId}: ${String(error.message ?? error)}`);
  return (data ?? []) as RelatedEntityRow[];
}
