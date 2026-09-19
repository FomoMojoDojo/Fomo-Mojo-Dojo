// ── "Named on your own site" — EARNED, never inferred from citations (operator rule signed 2026-09-18) ──
//
// An offering item is NAMED on the company's own site when EITHER its name is found in the own-site
// record OR it cites an own-host input. Own host = hostOf(companies.website) only; registry, social and
// aggregator hosts never count — including own_word inputs hosted there (guidestar, linkedin …).
//
// Name check: the normalised label (parentheticals stripped, whitespace collapsed, lowercase), or the
// label minus ONE trailing generic word (program, programs, team, service, services, center, centers), or
// the parenthesised acronym as a whole word — matched against the saved own-host pages
// (own_words_page_snapshots.clean_text), the active own-host own_words claims (claims.statement) and the
// live own-host client_voice signals (claim_text ‖ evidence_excerpt).
//
// Three states, never merged, and absence is never claimed:
//   named              → "Named on your own site"
//   seen_outside       → "Seen outside your site"      (not named, and ≥1 saved own-host page was checked)
//   own_site_not_read  → "Own site not yet read"       (not named, and 0 saved own-host pages)
// The matching evidence (clause, url, fetched_at) is stored on the item. Pure over an in-memory record;
// loadOwnSiteRecord gathers the record (three SELECTs) for the generator and the re-derivation.
import { hostOf } from "./publicReadStorage.ts";

export type OwnSiteState = "named_on_site" | "seen_outside" | "own_site_not_read";
export type NameClause = "full" | "suffix" | "acronym" | "own_host_citation";
export type NamedEvidence = { clause: NameClause; url: string | null; fetched_at: string | null };

export type OwnSiteRow = { url: string; fetched_at: string | null; text: string };
export type OwnSiteRecord = {
  /** Saved own-host pages — their COUNT decides seen_outside vs own_site_not_read. */
  pages: OwnSiteRow[];
  /** Active own-host own_words claims. */
  claims: OwnSiteRow[];
  /** Live own-host client_voice signals. */
  signals: OwnSiteRow[];
};
export const EMPTY_OWN_SITE_RECORD: OwnSiteRecord = { pages: [], claims: [], signals: [] };

export const TRAILING_GENERIC_WORDS = ["program", "programs", "team", "service", "services", "center", "centers"] as const;

export function normaliseLabel(label: string): string {
  return String(label ?? "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The clauses tried, in order: full normalised label; label minus one trailing generic word; the acronym. */
export function labelClauses(label: string): Array<{ clause: NameClause; needle: string; whole_word: boolean }> {
  const out: Array<{ clause: NameClause; needle: string; whole_word: boolean }> = [];
  const full = normaliseLabel(label);
  if (full) out.push({ clause: "full", needle: full, whole_word: false });
  const m = full.match(new RegExp(`^(.+?)\\s+(${TRAILING_GENERIC_WORDS.join("|")})$`));
  if (m && m[1].trim().length >= 3) out.push({ clause: "suffix", needle: m[1].trim(), whole_word: false });
  const acr = String(label ?? "").match(/\(([A-Za-z]{2,6})\)/);
  if (acr) out.push({ clause: "acronym", needle: acr[1].toLowerCase(), whole_word: true });
  return out;
}

const norm = (t: string) => String(t ?? "").replace(/\s+/g, " ").toLowerCase();
function containsNeedle(text: string, needle: string, wholeWord: boolean): boolean {
  const t = norm(text);
  if (!wholeWord) return t.includes(needle);
  return new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`, "i").test(t);
}

const byUrl = (a: OwnSiteRow, b: OwnSiteRow) => a.url.localeCompare(b.url) || String(a.fetched_at ?? "").localeCompare(String(b.fetched_at ?? ""));

/** The name check alone: the first clause that hits, with the row that carries it — pages, then claims, then
 *  signals, each pool in (url, fetched_at) order so the evidence is the same whatever order the rows arrived in. */
export function findNamedOnSite(label: string, record: OwnSiteRecord): NamedEvidence | null {
  const pools: OwnSiteRow[] = [...[...record.pages].sort(byUrl), ...[...record.claims].sort(byUrl), ...[...record.signals].sort(byUrl)];
  for (const c of labelClauses(label)) {
    for (const row of pools) {
      if (containsNeedle(row.text, c.needle, c.whole_word)) return { clause: c.clause, url: row.url, fetched_at: row.fetched_at };
    }
  }
  return null;
}

/** One item's state: the union rule (own-host citation OR name check), then the two honest absences. */
export function ownSiteStateFor(
  label: string,
  ownHostCitation: { cited: boolean; url: string | null },
  record: OwnSiteRecord,
): { state: OwnSiteState; evidence: NamedEvidence | null } {
  const byName = findNamedOnSite(label, record);
  if (byName) return { state: "named_on_site", evidence: byName };
  if (ownHostCitation.cited) return { state: "named_on_site", evidence: { clause: "own_host_citation", url: ownHostCitation.url, fetched_at: null } };
  return { state: record.pages.length > 0 ? "seen_outside" : "own_site_not_read", evidence: null };
}

export type OwnSiteVerdict = { index: number; label: string; state: OwnSiteState; own_host_cited: boolean; evidence: NamedEvidence | null };

/** Every item's verdict. `citedOwnHost(index)` is the citation fact from the ledger (own-host URL only). */
export function deriveOwnSiteStates(
  items: ReadonlyArray<{ label?: unknown }>,
  citedOwnHost: (index: number) => { cited: boolean; url: string | null },
  record: OwnSiteRecord,
): OwnSiteVerdict[] {
  return items.map((it, index) => {
    const label = typeof it.label === "string" ? it.label : "";
    const cit = citedOwnHost(index);
    const v = ownSiteStateFor(label, cit, record);
    return { index, label, state: v.state, own_host_cited: cit.cited, evidence: v.evidence };
  });
}

/** The payload with each item carrying its state + evidence (text fields untouched). */
export function applyOwnSiteStates(payload: Record<string, unknown>, verdicts: OwnSiteVerdict[]): Record<string, unknown> {
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  return {
    ...payload,
    items: items.map((it, i) => ({
      ...it,
      seen_on: verdicts[i]?.state ?? "own_site_not_read",
      own_host_cited: verdicts[i]?.own_host_cited ?? false,
      named_on_site: verdicts[i]?.evidence ?? null,
    })),
  };
}

// deno-lint-ignore no-explicit-any
type Db = { from: (t: string) => any };

/** The own-site record for a company: own-host pages, active own-host own_words claims, live own-host
 *  client_voice signals. Rows on any other host are dropped here — the host test is the ONLY gate. */
export async function loadOwnSiteRecord(supabase: Db, companyId: string, ownHost: string | null): Promise<OwnSiteRecord> {
  if (!ownHost) return { ...EMPTY_OWN_SITE_RECORD };
  const onHost = (url: unknown) => hostOf(typeof url === "string" ? url : null) === ownHost;
  const { data: pages, error: e1 } = await supabase.from("own_words_page_snapshots").select("source_url, fetched_at, clean_text").eq("company_id", companyId);
  if (e1) throw new Error(`own-site record: pages read failed: ${String(e1.message ?? e1)}`);
  const { data: claims, error: e2 } = await supabase.from("claims").select("statement, raw_payload, created_at").eq("company_id", companyId).eq("claim_type", "own_words").eq("status", "active");
  if (e2) throw new Error(`own-site record: own_words claims read failed: ${String(e2.message ?? e2)}`);
  const { data: signals, error: e3 } = await supabase.from("signals").select("source_url, claim_text, evidence_excerpt, created_at").eq("company_id", companyId).eq("voice_class", "client_voice").is("superseded_at", null).is("held_at", null);
  if (e3) throw new Error(`own-site record: client_voice signals read failed: ${String(e3.message ?? e3)}`);
  return {
    pages: ((pages ?? []) as Array<{ source_url?: string; fetched_at?: string | null; clean_text?: string }>).filter((r) => onHost(r.source_url)).map((r) => ({ url: String(r.source_url), fetched_at: r.fetched_at ?? null, text: String(r.clean_text ?? "") })),
    claims: ((claims ?? []) as Array<{ statement?: string; raw_payload?: { page_url?: string } | null; created_at?: string | null }>).filter((r) => onHost(r.raw_payload?.page_url)).map((r) => ({ url: String(r.raw_payload?.page_url), fetched_at: r.created_at ?? null, text: String(r.statement ?? "") })),
    signals: ((signals ?? []) as Array<{ source_url?: string | null; claim_text?: string | null; evidence_excerpt?: string | null; created_at?: string | null }>).filter((r) => onHost(r.source_url)).map((r) => ({ url: String(r.source_url), fetched_at: r.created_at ?? null, text: `${r.claim_text ?? ""} ${r.evidence_excerpt ?? ""}` })),
  };
}
