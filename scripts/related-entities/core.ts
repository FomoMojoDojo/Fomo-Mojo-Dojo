// ── E1 (operator ruling 2026-10-21) — the related-entity writer's core: validation (pure) and the write (one transaction) ──
//
// A related entity is only ever added by NAME + HOST + a CITED SOURCE. Refused before any fetch or write (signed):
//   bare_short_name        a bare short name ("Cox", "Charter") — one word under 10 characters names too many companies
//   company_excluded_host  the host is on the company's exclude list (companies.public_source_filters_json.exclude_domains)
//   entity_excluded_host   the host is on a per-entity exclude list (another row of this company, or another spec in the batch)
//   model_written_source   the cited quote is the text of one of our own model-written (analysis) rows
// and, structurally: source_missing (no source_url / source_quote), bad_host, bad_relation, bad_basis, bad_date,
// host_is_seed (the company's own website host is not a related entity), already_confirmed (one confirmed row per host).
// Signed 2026-10-21 (E1a + the name rule), both refusals:
//   name_not_in_quote      the entity's name must appear verbatim in its source_quote
//   source_off_entity      the source_url host must be the entity's host, the company's host, an ALREADY-CONFIRMED related
//                          host of the company, or sec.gov/Archives/edgar/data/<CIK> where CIK is the entity's or a
//                          confirmed parent's filer CIK (FILER_CIKS). Anything else refuses — press articles are never a
//                          source. A peer spec in the same batch is not confirmed, so it does not count: confirm in order.
//
// WRITE (scripts/related-entities.ts --write): fetches source_url, asserts source_quote byte-present in the page text,
// and in ONE transaction inserts the entity row, the page it verified against (company_related_entity_sources) and an
// audit row (company_related_entity_audit). A quote not on the page writes nothing.
import { normalizeForHash } from "../../supabase/functions/_shared/contentIdentity.ts";
import { isAnalysisRow } from "../../supabase/functions/_shared/voiceLabel.ts";
import { normalizeOwnHost, seedHostOf } from "../../supabase/functions/_shared/ownHosts.ts";
import { extractTextBasic } from "../../supabase/functions/_shared/fetchAndExtract.ts";
import { lit, type PsqlSession } from "../lib/psqlBlankingStore.ts";

export const RELATIONS = ["parent", "subsidiary", "acquired", "brand", "merged_into"] as const;
export const BASES = ["cited", "crawl_date_provisional"] as const;
export const BARE_NAME_MIN = 10;
// E1a: the signed filer CIKs and the EDGAR CIK parser moved to _shared/filerCiks.ts (ruling 12, 2026-10-22) so the mint
// authority reads the same table; re-exported here unchanged.
import { edgarCikOf, FILER_CIKS } from "../../supabase/functions/_shared/filerCiks.ts";
export { edgarCikOf, FILER_CIKS };
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type EntitySpec = {
  name: string; host: string; relation: string; effective_from: string | null; effective_basis: string;
  source_url: string | null; source_quote: string | null; exclude_hosts?: string[]; note?: string;
};
export type ValidationCtx = {
  company: { id: string; name: string; website: string | null; exclude_domains: string[] };
  /** this company's existing rows (any status) — their exclude_hosts and confirmed hosts */
  existing: Array<{ host: string; status: string; exclude_hosts: string[]; relation?: string }>;
  /** this company's model-written rows (isAnalysisRow) — the cited quote must not be one of them */
  analysisRows: Array<{ id: string; text: string }>;
};
export type SpecVerdict = { spec: EntitySpec; host: string; refusals: Array<{ code: string; detail: string }>; warnings: Array<{ code: string; detail: string }> };

const covers = (h: string, own: string) => h === own || h.endsWith(`.${own}`);
const hostOfUrl = (u: string) => { try { return normalizeOwnHost(new URL(u).hostname); } catch { return ""; } };
export function validateSpecs(specs: readonly EntitySpec[], ctx: ValidationCtx): SpecVerdict[] {
  const seed = seedHostOf(ctx.company.website);
  const confirmed = ctx.existing.filter((r) => r.status === "confirmed");
  return specs.map((spec, i) => {
    const refusals: SpecVerdict["refusals"] = []; const warnings: SpecVerdict["warnings"] = [];
    const name = String(spec.name ?? "").trim();
    const host = normalizeOwnHost(spec.host);
    if (!name) refusals.push({ code: "bad_name", detail: "name is empty" });
    else if (!/\s/.test(name) && name.length < BARE_NAME_MIN) refusals.push({ code: "bare_short_name", detail: `"${name}" is one word under ${BARE_NAME_MIN} characters — name the entity in full (e.g. "Cox Communications")` });
    if (!HOST_RE.test(host)) refusals.push({ code: "bad_host", detail: `"${spec.host}" is not a bare host` });
    if (!(RELATIONS as readonly string[]).includes(spec.relation)) refusals.push({ code: "bad_relation", detail: `relation "${spec.relation}" is not one of ${RELATIONS.join("|")}` });
    if (!(BASES as readonly string[]).includes(spec.effective_basis)) refusals.push({ code: "bad_basis", detail: `effective_basis "${spec.effective_basis}" is not one of ${BASES.join("|")}` });
    if (spec.effective_from != null && !/^\d{4}-\d{2}-\d{2}$/.test(spec.effective_from)) refusals.push({ code: "bad_date", detail: `effective_from "${spec.effective_from}" is not YYYY-MM-DD` });
    if (seed && host && covers(host, seed)) refusals.push({ code: "host_is_seed", detail: `${host} is the company's own host (${seed}), not a related entity` });
    const coEx = ctx.company.exclude_domains.map(normalizeOwnHost).find((x) => x && (covers(host, x) || covers(x, host)));
    if (coEx) refusals.push({ code: "company_excluded_host", detail: `${host} is on the company's exclude list (${coEx})` });
    const entEx = [
      ...ctx.existing.filter((r) => r.status !== "rejected").flatMap((r) => r.exclude_hosts.map((x) => ({ x, from: r.host }))),
      ...specs.flatMap((s, j) => (j === i ? [] : (s.exclude_hosts ?? []).map((x) => ({ x, from: normalizeOwnHost(s.host) })))),
    ].find((e) => covers(host, normalizeOwnHost(e.x)));
    if (entEx) refusals.push({ code: "entity_excluded_host", detail: `${host} is on the exclude list of ${entEx.from} (${entEx.x})` });
    if (ctx.existing.some((r) => r.status === "confirmed" && normalizeOwnHost(r.host) === host)) refusals.push({ code: "already_confirmed", detail: `${host} already has a confirmed row` });
    if (!spec.source_url || !/^https?:\/\//.test(spec.source_url) || !String(spec.source_quote ?? "").trim()) {
      refusals.push({ code: "source_missing", detail: "source_url (http/https) and source_quote are both required — a related entity is never added by name alone" });
    } else {
      const q = normalizeForHash(String(spec.source_quote));
      const hit = ctx.analysisRows.find((r) => q.length >= 12 && normalizeForHash(r.text).includes(q));
      if (hit) refusals.push({ code: "model_written_source", detail: `the quote is the text of our model-written row ${hit.id.slice(0, 8)} — cite the page itself` });
      if (name && !String(spec.source_quote).includes(name)) refusals.push({ code: "name_not_in_quote", detail: `the entity name "${name}" is not verbatim in the source_quote` });
      const sh = hostOfUrl(spec.source_url);
      const ciks = [FILER_CIKS[host], ...confirmed.filter((r) => r.relation === "parent").map((r) => FILER_CIKS[normalizeOwnHost(r.host)])].filter((c): c is number => typeof c === "number");
      const cik = edgarCikOf(spec.source_url);
      const onEntity = (sh && host && covers(sh, host)) || (sh && seed && covers(sh, seed))
        || confirmed.some((r) => sh && covers(sh, normalizeOwnHost(r.host)))
        || (cik != null && ciks.includes(cik));
      if (!onEntity) refusals.push({ code: "source_off_entity", detail: `source ${sh || "(none)"}${cik != null ? ` (EDGAR CIK ${cik})` : ""} is not the entity's host (${host}), the company's (${seed}), a confirmed related host, or EDGAR under ${ciks.length ? `CIK ${ciks.join("/")}` : "a known filer CIK"}` });
    }
    return { spec, host, refusals, warnings };
  });
}

/** The validation context from the database (read-only). */
export async function loadValidationCtx(s: PsqlSession, companyId: string): Promise<ValidationCtx> {
  const [co] = await s.query<{ id: string; name: string; website: string | null; exclude_domains: string[] | null }>(`select id, name, website,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(public_source_filters_json->'exclude_domains','[]'::jsonb)) x), '{}') exclude_domains
    from companies where id=${lit(companyId)}::uuid`);
  if (!co) throw new Error(`company ${companyId} not found`);
  const existing = await s.query<{ host: string; status: string; exclude_hosts: string[] }>(`select host, status, exclude_hosts, relation from company_related_entities where company_id=${lit(companyId)}::uuid`);
  const rows = await s.query<{ id: string; voice_class: string | null; claim_text: string | null; evidence_excerpt: string | null; raw_payload: Record<string, unknown> | null }>(
    `select id, voice_class, claim_text, evidence_excerpt, raw_payload from signals where company_id=${lit(companyId)}::uuid`);
  const analysisRows = rows.filter((r) => isAnalysisRow(r as never)).map((r) => ({ id: r.id, text: `${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}` }));
  return { company: { id: co.id, name: co.name, website: co.website, exclude_domains: co.exclude_domains ?? [] }, existing, analysisRows };
}

export type FetchedPage = { status: number; text: string };
/** The live fetch: the page's readable text (extractTextBasic — the crawler's own extractor), uncapped so a quote late
 *  on the page is still found. */
export async function fetchPageText(url: string): Promise<FetchedPage> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; MojoMap related-entity verifier)" } });
    const html = await r.text();
    return { status: r.status, text: r.ok ? extractTextBasic(html) : "" };
  } finally { clearTimeout(t); }
}
async function sha256Hex(t: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type WriteResult = { entity_id: string; source_id: string; audit_id: string; host: string; status: string; quote_offset: number; text_sha256: string };
/** WRITE, inside the caller's transaction: per spec — fetch, assert the quote byte-present, insert entity + source + audit.
 *  Throws (the caller rolls back) on the first spec whose quote is not on its page. */
export async function writeSpecs(s: PsqlSession, companyId: string, verdicts: readonly SpecVerdict[], opts: { status: "proposed" | "confirmed"; actor: string; fetchPage: (url: string) => Promise<FetchedPage> }): Promise<WriteResult[]> {
  const out: WriteResult[] = [];
  for (const v of verdicts) {
    if (v.refusals.length) throw new Error(`refused: ${v.host}: ${v.refusals.map((r) => r.code).join(", ")}`);
    const page = await opts.fetchPage(v.spec.source_url!);
    const quote = String(v.spec.source_quote);
    const at = page.text.indexOf(quote);
    if (at < 0) throw new Error(`quote_not_on_page: ${v.host}: the quote is not byte-present on ${v.spec.source_url} (status ${page.status}, ${page.text.length} chars)`);
    const sha = await sha256Hex(page.text);
    const confirmed = opts.status === "confirmed";
    const [e] = await s.mutate<{ id: string }>(`insert into company_related_entities (company_id, name, host, relation, effective_from, effective_basis, source_url, source_quote, source_verified_at, exclude_hosts, proposed_by, status, confirmed_by, confirmed_at)
      values (${lit(companyId)}::uuid, ${lit(v.spec.name.trim())}, ${lit(v.host)}, ${lit(v.spec.relation)}, ${v.spec.effective_from ? `${lit(v.spec.effective_from)}::date` : "null"}, ${lit(v.spec.effective_basis)},
        ${lit(v.spec.source_url)}, ${lit(quote)}, now(), ${lit(`{${(v.spec.exclude_hosts ?? []).map((x) => `"${normalizeOwnHost(x)}"`).join(",")}}`)}::text[], ${lit(opts.actor)}, ${lit(opts.status)},
        ${confirmed ? lit(opts.actor) : "null"}, ${confirmed ? "now()" : "null"}) returning id`);
    const [src] = await s.mutate<{ id: string }>(`insert into company_related_entity_sources (entity_id, company_id, source_url, http_status, clean_text, text_sha256, quote_offset)
      values (${lit(e.id)}::uuid, ${lit(companyId)}::uuid, ${lit(v.spec.source_url)}, ${page.status}, ${lit(page.text)}, ${lit(sha)}, ${at}) returning id`);
    const [row] = await s.query<Record<string, unknown>>(`select to_jsonb(r) j from company_related_entities r where id=${lit(e.id)}::uuid`);
    const [a] = await s.mutate<{ id: string }>(`insert into company_related_entity_audit (entity_id, company_id, action, actor, before, after)
      values (${lit(e.id)}::uuid, ${lit(companyId)}::uuid, ${lit(confirmed ? "confirm" : "propose")}, ${lit(opts.actor)}, null, ${lit(JSON.stringify((row as { j: unknown }).j))}::jsonb) returning id`);
    out.push({ entity_id: e.id, source_id: src.id, audit_id: a.id, host: v.host, status: opts.status, quote_offset: at, text_sha256: sha });
  }
  return out;
}
