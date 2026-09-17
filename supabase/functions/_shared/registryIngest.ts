// ── Registry stamp at ingest (C1, operator ruling 2026-09-17) ───────────────────────────────────
//
// public-baseline seam: AFTER the voice overlay (own-domain → client_voice, else the model's label) and
// BEFORE the aggregator authorship judge, every result item whose URL matches REGISTRY_PATTERNS is
// decided by the deterministic classifier and carries the decision on the item as `registry` (which
// rides into signals.raw_payload.registry through the mapper's raw_payload: record). filing /
// self_reported ⇒ evidence_class 'filing' + voice_class 'client_voice' (overriding the model);
// rating / derived_metric / registry_meta ⇒ 'prose' + 'outside_voice_about_client'; journalism ⇒
// untouched. The authorship judge skips any item carrying `registry` — a classified row is never
// re-judged by a model.
//
// Section detection reads the STORED snapshot (outside_page_snapshots — clean_text + structured.ld_json);
// when no snapshot is stored for a URL yet, the crawl's own retained page text for that URL is the
// basis (the same text retainPublicPages stores). Neither ⇒ the classifier fails closed to the page default.
import { classifyRegistryRow, matchRegistryUrl, registryStamp, type RegistryClassification, type RegistrySnapshot } from "./registryClassifier.ts";

export type RegistryStampStats = { considered: number; registry: number; stamped_filing: number; stamped_outside: number; journalism: number; page_default: number; mixed: number };

const ITEM_TEXT = (e: Record<string, unknown>): string =>
  [e.signal, e.perspective, e.snippet, e.bucket].map((v) => (typeof v === "string" ? v : "")).filter(Boolean).join(" ");

/** Pure: stamp the two minted arrays of a parsed baseline result. snapshotByUrl is keyed by the item URL as written. */
export function stampRegistryInResult(
  result: Record<string, unknown>,
  snapshotByUrl: (url: string) => RegistrySnapshot | null,
): { result: Record<string, unknown>; stats: RegistryStampStats } {
  const stats: RegistryStampStats = { considered: 0, registry: 0, stamped_filing: 0, stamped_outside: 0, journalism: 0, page_default: 0, mixed: 0 };
  const stampArray = (arr: unknown): unknown => {
    if (!Array.isArray(arr)) return arr;
    return arr.map((e) => {
      if (!e || typeof e !== "object") return e;
      const item = e as Record<string, unknown>;
      stats.considered++;
      const url = String(item.url ?? "").trim();
      if (!url || !matchRegistryUrl(url)) return item;
      const c: RegistryClassification | null = classifyRegistryRow({ url, text: ITEM_TEXT(item), snapshot: snapshotByUrl(url) });
      if (!c) return item;
      stats.registry++;
      if (c.section === "page_default") stats.page_default++;
      if (c.basis.mixed) stats.mixed++;
      const stamp = registryStamp(c);
      if (!stamp) { stats.journalism++; return { ...item, registry: c }; }
      if (stamp.evidence_class === "filing") stats.stamped_filing++; else stats.stamped_outside++;
      return { ...item, registry: c, evidence_class: stamp.evidence_class, voice_class: stamp.voice_class };
    });
  };
  const next: Record<string, unknown> = { ...result };
  if (Array.isArray(result.outside_voice_signals)) next.outside_voice_signals = stampArray(result.outside_voice_signals);
  if (Array.isArray(result.evidence_ledger)) next.evidence_ledger = stampArray(result.evidence_ledger);
  return { result: next, stats };
}

/** Registry URLs present in a parsed result (both minted arrays). */
export function registryUrlsInResult(result: Record<string, unknown>): string[] {
  const out = new Set<string>();
  for (const key of ["outside_voice_signals", "evidence_ledger"]) {
    const arr = result[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const url = String((e as { url?: unknown })?.url ?? "").trim();
      if (url && matchRegistryUrl(url)) out.add(url);
    }
  }
  return [...out];
}

// deno-lint-ignore no-explicit-any
type AnySupabase = { from: (t: string) => any };

/** Latest stored snapshot per URL (outside_page_snapshots, this company), falling back to the crawl's retained
 *  text for URLs not yet stored. SELECT only. */
export async function loadRegistrySnapshots(
  supabase: AnySupabase,
  companyId: string,
  urls: string[],
  crawlTextByUrl?: Map<string, string> | null,
): Promise<Map<string, RegistrySnapshot>> {
  const out = new Map<string, RegistrySnapshot>();
  if (urls.length === 0) return out;
  try {
    const { data } = await supabase
      .from("outside_page_snapshots")
      .select("source_url, clean_text, structured, crawled_at")
      .eq("company_id", companyId)
      .in("source_url", urls)
      .order("crawled_at", { ascending: false });
    for (const r of (data ?? []) as Array<{ source_url: string; clean_text: string | null; structured: unknown }>) {
      if (!out.has(r.source_url) && r.clean_text) out.set(r.source_url, { clean_text: r.clean_text, structured: r.structured });
    }
  } catch { /* SELECT failure ⇒ no stored basis; the crawl text (if any) or the page default decides */ }
  for (const u of urls) {
    if (out.has(u)) continue;
    const t = crawlTextByUrl?.get(u);
    if (t && t.trim()) out.set(u, { clean_text: t, structured: null });
  }
  return out;
}
