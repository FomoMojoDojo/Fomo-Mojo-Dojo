// E1–E5 probe (2026-10-21) — the related-entity precision layer. Every database step runs inside ONE transaction that is
// ROLLED BACK (a throwaway company seeded inside it); no network, no model. One JSON line out.
//   e1 the table refuses a row without host / source, and a second confirmed row for one company + host
//   e2 a PROPOSED (or rejected / retired) entity changes nothing: the loader returns confirmed rows only, the own-host set
//      holds the seed alone, and a URL on the proposed host is decided exactly as with no entity
//   e3 the effective-date rule: a confirmed merged_into 2026-08-20 decides own_domain_related at asOf 2026-09-01 and stays
//      off it at 2026-08-01 (stamped before_effective); an undated provisional row decides it, basis crawl_date_provisional
//   e4 the regen mint stamps raw_payload.entity {id, name, host, relation, basis} on a row a related-entity rule decided
//   e5 the signed refusals: IAQM vs iaqm.co.uk (company exclude list), Cox Enterprises / Cox Automotive (per-entity
//      exclude list), bare "Cox" / "Charter", a quote that is our model-written row 547052cd; E1a — a press host, an
//      EDGAR URL under a non-matching CIK, and EDGAR under the parent's CIK before the parent is confirmed refuse
//      source_off_entity; a quote without the entity's name refuses name_not_in_quote; with Charter confirmed as parent,
//      EDGAR under CIK 1091667 and a corporate.charter.com page pass
//   e6 only confirmed rows reach the own-host set (status filter in the loader and the resolver)
//   e7 the signed venue strings
//   e8 parity: with no confirmed entity, every live signal URL of every company is own-domain under the set exactly when
//      it is under the single host
import { lit, PsqlSession } from "../lib/psqlBlankingStore.ts";
import { isOwnDomainUrl } from "../../supabase/functions/_shared/firstReadProvenance.ts";
import { loadConfirmedRelatedEntities, ownHostsFor, relatedVenueLabel, seedHostOf, type RelatedEntityRow } from "../../supabase/functions/_shared/ownHosts.ts";
import { decideVoiceClassBeforeJudge } from "../../supabase/functions/_shared/voiceClassAtMint.ts";
import { runOutsideRegen } from "../../supabase/functions/_shared/outsideRegenHandler.ts";
import { fakeDb, seedR17, deps, r17Transport, CO, RUN2, U1 } from "../../supabase/functions/_shared/outsideRegenHandler.test.ts";
import { loadValidationCtx, validateSpecs, type EntitySpec } from "../related-entities/core.ts";

const s = new PsqlSession();
const Z = "00000000-0000-4000-8000-00000000e1a0";
// a supabase-shaped client over the psql session for the shared loader (select/eq/eq ⇒ one query)
const shim = { from: (t: string) => { const f: string[] = []; let cols = "*"; const q: any = {
  select(c: string) { cols = c; return q; }, eq(k: string, v: string) { f.push(`${k}=${lit(v)}`); return q; },
  then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return s.query(`select ${cols} from ${t}${f.length ? ` where ${f.join(" and ")}` : ""}`).then((data) => ({ data, error: null })).then(res, rej); } }; return q; } };
const decide = (url: string, related: readonly RelatedEntityRow[], asOf?: string | null) =>
  decideVoiceClassBeforeJudge({ url, item: null, labeledClass: "outside_voice_about_client", pageText: null, judgedText: null, company: { name: "ZZ Related Probe", host: "zz-related-probe.test", ...(related.length ? { related } : {}) }, ...(related.length ? { asOf: asOf ?? null } : {}), registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" } as never) as Record<string, any>;
const before = async () => (await s.query<{ n: string }>(`select (select count(*) from company_related_entities)||'|'||(select count(*) from company_related_entity_sources)||'|'||(select count(*) from company_related_entity_audit)||'|'||(select count(*) from signals) n`))[0].n;
const tryErr = async (sql: string) => { await s.exec("savepoint e1;"); try { await s.mutate(sql); await s.exec("release savepoint e1;"); return null; } catch (e) { await s.exec("rollback to savepoint e1;"); return String((e as Error).message).slice(0, 90); } };

const B0 = await before();
await s.exec("begin;");
await s.exec(`insert into companies (id, name, website, created_by) values (${lit(Z)}::uuid, 'ZZ Related Probe', 'https://www.zz-related-probe.test', (select id from auth.users order by created_at limit 1));`);
const row = (host: string, status: string, rel = "parent", from: string | null = null, basis = "cited", over: { host?: string; source_url?: string; source_quote?: string } = {}) =>
  `insert into company_related_entities (company_id, name, host, relation, effective_from, effective_basis, source_url, source_quote, source_verified_at, proposed_by, status, confirmed_by, confirmed_at)
   values (${lit(Z)}::uuid, ${lit(`Probe Entity ${host}`)}, ${over.host ?? lit(host)}, ${lit(rel)}, ${from ? `${lit(from)}::date` : "null"}, ${lit(basis)}, ${over.source_url ?? lit(`https://${host}/about`)}, ${over.source_quote ?? lit("Probe Entity owns ZZ Related Probe.")}, now(), 'probe', ${lit(status)}, ${status === "confirmed" ? "'probe', now()" : "null, null"}) returning id`;
// e1
const e1 = {
  host_null: await tryErr(row("x.test", "proposed", "parent", null, "cited", { host: "null" })),
  source_null: await tryErr(row("y.test", "proposed", "parent", null, "cited", { source_url: "null" })),
  quote_empty: await tryErr(row("w.test", "proposed", "parent", null, "cited", { source_quote: "''" })),
  second_confirmed: await (async () => { await s.mutate(row("dup.test", "confirmed")); return await tryErr(row("dup.test", "confirmed")); })(),
};
await s.exec(`delete from company_related_entities where company_id=${lit(Z)}::uuid;`);
// e2 / e6 — one row of each non-confirmed status, one confirmed
for (const [h, st] of [["proposed.test", "proposed"], ["rejected.test", "rejected"], ["retired.test", "retired"], ["confirmed.test", "confirmed"]]) await s.mutate(row(h, st));
const loaded = await loadConfirmedRelatedEntities(shim, Z);
const set2 = ownHostsFor({ website: "https://www.zz-related-probe.test" }, loaded);
const dProposed = decide("https://proposed.test/page", loaded), dNone = decide("https://proposed.test/page", []);
const dConfirmed = decide("https://confirmed.test/page", loaded);
const e2 = { loaded_hosts: loaded.map((r) => r.host), set_hosts: set2.hosts.map((h) => h.host), proposed_same_as_none: JSON.stringify(dProposed) === JSON.stringify(dNone), proposed_authority: dProposed.authority ?? null, confirmed_authority: dConfirmed.authority ?? null };
// e3 — the effective date
await s.exec(`delete from company_related_entities where company_id=${lit(Z)}::uuid;`);
await s.mutate(row("merged.test", "confirmed", "merged_into", "2026-08-20", "cited"));
await s.mutate(row("prov.test", "confirmed", "parent", null, "crawl_date_provisional"));
const rel3 = await loadConfirmedRelatedEntities(shim, Z);
const after = decide("https://news.merged.test/closing", rel3, "2026-09-01");
const prior = decide("https://news.merged.test/closing", rel3, "2026-08-01");
const prov = decide("https://prov.test/about", rel3, "2026-09-01");
const e3 = { after: { authority: after.authority, class: after.voice_class ?? after.label ?? null, basis: after.entity?.basis ?? null }, prior: { authority: prior.authority ?? null, class: prior.voice_class ?? prior.label ?? null, basis: prior.entity?.basis ?? null }, provisional: { authority: prov.authority, basis: prov.entity?.basis ?? null } };
await s.exec("rollback;");
const B1 = await before();

// e4 — the regen mint stamps the entity (fake db, fake transport — no network, no model)
const db = fakeDb(seedR17());
(db.tables as Record<string, unknown[]>).company_related_entities = [{ id: "re-probe-1", company_id: CO, name: "Acme Reviews Holdings", host: new URL(U1).hostname, relation: "parent", effective_from: null, effective_basis: "cited", status: "confirmed" }];
const { d } = deps(db, r17Transport(), null);
await runOutsideRegen({ company_id: CO, run_id: RUN2, write: true, urls: [U1] }, d);
const minted = ((db.inserts.signals ?? []) as Array<{ voice_class: string; raw_payload: Record<string, any> }>);
const e4 = { minted: minted.length, stamped: minted.filter((m) => m.raw_payload.entity).length, authority: [...new Set(minted.map((m) => m.raw_payload.voice_authority?.authority))], entity: minted[0]?.raw_payload.entity ?? null,
  stamp_ok: minted.length > 0 && minted.every((m) => m.voice_class === "client_voice" && m.raw_payload.voice_authority?.authority === "own_domain_related" && m.raw_payload.entity?.id === "re-probe-1" && m.raw_payload.entity?.name === "Acme Reviews Holdings" && m.raw_payload.entity?.host === new URL(U1).hostname && m.raw_payload.entity?.relation === "parent" && m.raw_payload.entity?.basis === "cited") };

// e5 — the signed refusals, on the live companies' own context (read-only)
await s.exec("begin transaction read only;");
const spec = (name: string, host: string, extra: Partial<EntitySpec> = {}): EntitySpec => ({ name, host, relation: "parent", effective_from: null, effective_basis: "cited", source_url: `https://${host}/about`, source_quote: `${name} is the parent of the company.`, ...extra });
const iaqm = validateSpecs([spec("IAQM United Kingdom", "iaqm.co.uk")], await loadValidationCtx(s, "d8feefb3-ce5a-43d9-bccb-f573bb95e88a"));
const spCtx = await loadValidationCtx(s, "0e413608-d42f-4a7e-b710-fa6006833af1");
const sp = validateSpecs([
  spec("Cox Communications", "cox.com", { relation: "merged_into", effective_from: "2026-08-20", exclude_hosts: ["coxenterprises.com", "coxautoinc.com", "coxmediagroup.com"] }),
  spec("Cox Enterprises", "coxenterprises.com"), spec("Cox Automotive", "coxautoinc.com"),
  spec("Cox", "cox.com"), spec("Charter", "charter.com"),
  spec("Cox Communications", "cox.com", { source_quote: "The Cox Communications acquisition (closed August 2026) is a defensive scale play" }),
], spCtx);
// E1a + the name rule — Charter not yet confirmed (spCtx), then confirmed as parent (an in-memory row; nothing written)
const COX = { relation: "merged_into", effective_from: "2026-08-20" } as const;
const coxQ = "Charter today announced that it has completed its previously announced transaction with Cox Communications.";
const EDGAR_CHARTER = "https://www.sec.gov/Archives/edgar/data/0001091667/000114036126033909/ef20080687_ex99-1.htm";
const a1 = validateSpecs([
  spec("Charter Communications", "charter.com", { source_url: "https://www.reuters.com/business/media-telecom/charter-cox-deal/" }),
  spec("Charter Communications", "charter.com", { source_quote: "Spectrum is the brand of its parent company." }),
  spec("Cox Communications", "cox.com", { ...COX, source_url: "https://www.sec.gov/Archives/edgar/data/0000320193/000032019326000001/ex99-1.htm", source_quote: coxQ }),
  spec("Cox Communications", "cox.com", { ...COX, source_url: EDGAR_CHARTER, source_quote: coxQ }),
], spCtx);
const withCharter = { ...spCtx, existing: [...spCtx.existing, { host: "charter.com", status: "confirmed", exclude_hosts: [], relation: "parent" }] };
const a2 = validateSpecs([
  spec("Cox Communications", "cox.com", { ...COX, source_url: EDGAR_CHARTER, source_quote: coxQ }),
  spec("Cox Communications", "cox.com", { ...COX, source_url: "https://corporate.charter.com/newsroom/charter-completes-cox", source_quote: coxQ }),
  spec("Cox Communications", "cox.com", { ...COX, source_url: "https://www.prnewswire.com/news-releases/charter-completes-cox.html", source_quote: coxQ }),
], withCharter);
const xid5 = (await s.query<{ xid: string | null }>(`select pg_current_xact_id_if_assigned()::text xid`))[0].xid;
await s.exec("rollback;");
const codes = (v: { refusals: Array<{ code: string }> }) => v.refusals.map((r) => r.code);
const e5 = { iaqm_co_uk: codes(iaqm[0]), cox_communications: codes(sp[0]), cox_enterprises: codes(sp[1]), cox_automotive: codes(sp[2]), bare_cox: codes(sp[3]), bare_charter: codes(sp[4]), model_written: codes(sp[5]),
  press_host: codes(a1[0]), name_not_in_quote: codes(a1[1]), edgar_wrong_cik: codes(a1[2]), edgar_parent_unconfirmed: codes(a1[3]),
  edgar_parent_confirmed: codes(a2[0]), confirmed_related_host: codes(a2[1]), press_after_confirm: codes(a2[2]), read_only_xid: xid5 };

// e7 — the signed venue strings
const e7 = {
  charter: relatedVenueLabel({ name: "Charter Communications", relation: "parent", effective_from: null, basis: "cited" }),
  cox: relatedVenueLabel({ name: "Cox Communications", relation: "merged_into", effective_from: "2026-08-20", basis: "cited" }),
  provisional: relatedVenueLabel({ name: "Charter Communications", relation: "parent", effective_from: null, basis: "crawl_date_provisional" }),
};

// e8 — parity over the live record: the set and the single host agree on every live signal URL
await s.exec("begin transaction read only;");
const cos = await s.query<{ id: string; website: string | null }>(`select id, website from companies`);
const sigs = await s.query<{ company_id: string; source_url: string }>(`select company_id, source_url from signals where superseded_at is null and held_at is null and source_url is not null`);
const confirmedFleet = Number((await s.query<{ n: string }>(`select count(*) n from company_related_entities where status='confirmed'`))[0].n);
const relByCo = new Map<string, RelatedEntityRow[]>();
for (const c of cos) relByCo.set(c.id, await loadConfirmedRelatedEntities(shim, c.id));
await s.exec("rollback;");
let checked = 0, disagree = 0; const own = new Map(cos.map((c) => [c.id, c.website]));
for (const g of sigs) {
  const w = own.get(g.company_id) ?? null;
  const single = isOwnDomainUrl(g.source_url, seedHostOf(w));
  const viaSet = isOwnDomainUrl(g.source_url, ownHostsFor({ website: w }, relByCo.get(g.company_id) ?? []));
  checked++; if (single !== viaSet) disagree++;
}
const e8 = { companies: cos.length, urls_checked: checked, disagree, confirmed_rows_fleet: confirmedFleet };
const B2 = await before();
await s.close();
console.log(JSON.stringify({ e1, e2, e3, e4, e5, e7, e8, rolled_back: B0 === B1 && B1 === B2, before: B0, after: B2 }));
