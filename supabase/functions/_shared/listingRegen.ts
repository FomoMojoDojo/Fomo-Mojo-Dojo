// LISTING REGENERATION — core (operator ruling 2026-09-04, shape (b)+(e)). Pure orchestration over an injected
// store (mirrors ownWordsRetype / rfChannelsApply): behind the R3 review gate by run_id, read the STORED basis
// (newest ok snapshot per URL: body + structured), run the deterministic detector, and mint listing signals —
// evidence_class='listing', quote = the title line (only when byte-exact in the body, per the DB verbatim law),
// content identity = host + product + price, dedup by identity. mode 'dry' prints would-mint rows and refusals
// and writes the ledger ONLY (status planned). Never touches held rows (supersede is a separate act). Frozen
// refused before any read. No model call anywhere.
import { FROZEN_COMPANY_IDS } from "./frozenCompanies.ts";
import { gateRegenUrls, type ReviewRefusal } from "./outsideRecrawlReview.ts";
import { buildAnchors } from "./outsideRecrawlAnchors.ts";
import { detectListing, listingIdentityInput, type Listing, type ListingRefusal, type StructuredBlock } from "./listingDetect.ts";
import { sha256Hex } from "./contentIdentity.ts";

export type ListingRegenMode = "dry" | "apply";
export type WouldMint = { source_url: string; host: string; listing: Listing; content_identity: string; verbatim_in_body: boolean; read_date: string | null };
export type UrlRefusal = { url: string; reason: ListingRefusal | "duplicate_identity" | "no_ok_snapshot" };
export type ListingRegenResult =
  | { ok: false; skipped: "frozen_company" | "company_not_found" }
  | { ok: false; error: string }
  | { ok: true; mode: ListingRegenMode; run_id: string; totals: { urls_considered: number; review_refused: number; detected: number; would_mint: number; minted: number; refused: number }; would_mint: WouldMint[]; refused: UrlRefusal[]; review_refused: ReviewRefusal[] };

// deno-lint-ignore no-explicit-any
type Store = { from: (t: string) => any };
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function listingSignalRow(args: { companyId: string; w: WouldMint; body: string | null; snapshotSha: string; runId: string; nowIso: string }): Record<string, unknown> {
  const { w } = args;
  const title = w.listing.product_name;
  return {
    company_id: args.companyId, source_id: null, source_type: "outside_listing_regen", source_title: null,
    source_url: w.source_url, signal_band: "outside", evidence_type: "market_signal",
    claim_text: title, evidence_excerpt: title,
    // DB law signals_quote_verbatim: quote must be a byte-exact substring of quote_source_text.
    quote: w.verbatim_in_body ? title : null, quote_source_text: w.verbatim_in_body ? args.body : null,
    topic: "outside_listing", directness: "direct", recency: "recent", framing_fit: "partial",
    structure_level: "extracted", validation_status: "directional", confidence_to_use: "medium",
    voice_class: "outside_voice_about_client",
    evidence_class: "listing", listing: w.listing,
    event_date: w.read_date,
    raw_payload: { source: "outside_listing_regen", content_identity: w.content_identity, page_url: w.source_url, snapshot_text_sha256: args.snapshotSha, run_id: args.runId, provenance: "public_observed", read_at: args.nowIso, detected_from: w.listing.detected_from },
  };
}

export async function runListingRegen(args: { supabase: Store; companyId: string; runId: string; mode: ListingRegenMode; urls?: string[] | null; nowIso: string }): Promise<ListingRegenResult> {
  if (FROZEN_COMPANY_IDS.has(args.companyId)) return { ok: false, skipped: "frozen_company" };
  const { data: co } = await args.supabase.from("companies").select("id, name, website, frozen, entity_anchors_json").eq("id", args.companyId).maybeSingle();
  if (!co) return { ok: false, skipped: "company_not_found" };
  const c = co as { name: string | null; website: string | null; frozen?: boolean; entity_anchors_json?: unknown[] | null };
  if (c.frozen) return { ok: false, skipped: "frozen_company" };
  const anchors = buildAnchors({ name: c.name, website: c.website, entityAnchors: c.entity_anchors_json ?? [] });
  let companyHost: string | null = null; try { if (c.website) companyHost = new URL(c.website.includes("://") ? c.website : `https://${c.website}`).hostname.replace(/^www\./, ""); } catch { /* none */ }

  // Basis: newest ok snapshot per URL (body + structured).
  const { data: snapRows, error } = await args.supabase.from("outside_page_snapshots")
    .select("source_url, clean_text, text_sha256, crawled_at, fetch_status, structured")
    .eq("company_id", args.companyId).eq("fetch_status", "ok").order("crawled_at", { ascending: false });
  if (error) return { ok: false, error: String(error.message ?? error) };
  type Snap = { source_url: string; clean_text: string | null; text_sha256: string; crawled_at: string | null; structured: StructuredBlock | null };
  const newest = new Map<string, Snap>();
  for (const r of (snapRows ?? []) as Snap[]) if (!newest.has(r.source_url)) newest.set(r.source_url, r);
  let urls = [...newest.keys()];
  if (Array.isArray(args.urls) && args.urls.length) urls = urls.filter((u) => args.urls!.includes(u));
  const urlsConsidered = Array.isArray(args.urls) && args.urls.length ? args.urls.length : urls.length;

  // R3 review gate by run_id — approved rows only.
  const { data: reviewRows } = await args.supabase.from("outside_recrawl_review").select("source_url, operator_decision").eq("company_id", args.companyId).eq("run_id", args.runId);
  const gateInput = Array.isArray(args.urls) && args.urls.length ? args.urls : urls;
  const gate = gateRegenUrls(gateInput, (reviewRows ?? []) as Array<{ source_url: string; operator_decision: string | null }>);
  urls = gate.allowed.filter((u) => newest.has(u));
  const refused: UrlRefusal[] = gate.allowed.filter((u) => !newest.has(u)).map((u) => ({ url: u, reason: "no_ok_snapshot" as const }));

  // Dedup basis: every existing listing signal's identity.
  const { data: existing } = await args.supabase.from("signals").select("id, raw_payload").eq("company_id", args.companyId).eq("evidence_class", "listing");
  const seen = new Set<string>();
  for (const s of (existing ?? []) as Array<{ raw_payload?: { content_identity?: string } | null }>) if (s.raw_payload?.content_identity) seen.add(s.raw_payload.content_identity);

  const wouldMint: WouldMint[] = [];
  let detected = 0;
  for (const url of urls) {
    const snap = newest.get(url)!;
    const r = detectListing({ structured: snap.structured, body: snap.clean_text, url, anchors, companyHost });
    if (r.ok !== true) { refused.push({ url, reason: (r as { reason: ListingRefusal }).reason }); continue; }
    detected++;
    const identity = await sha256Hex(listingIdentityInput(r.listing));
    if (seen.has(identity)) { refused.push({ url, reason: "duplicate_identity" }); continue; }
    seen.add(identity);
    const body = snap.clean_text ?? "";
    wouldMint.push({ source_url: url, host: hostOf(url), listing: r.listing, content_identity: identity, verbatim_in_body: body.includes(r.listing.product_name), read_date: snap.crawled_at ? String(snap.crawled_at).slice(0, 10) : null });
  }

  const totals = { urls_considered: urlsConsidered, review_refused: gate.refused.length, detected, would_mint: wouldMint.length, minted: 0, refused: refused.length };
  let minted = 0;
  if (args.mode === "apply" && wouldMint.length) {
    const rows = wouldMint.map((w) => listingSignalRow({ companyId: args.companyId, w, body: newest.get(w.source_url)!.clean_text, snapshotSha: newest.get(w.source_url)!.text_sha256, runId: args.runId, nowIso: args.nowIso }));
    const { error: insErr } = await args.supabase.from("signals").insert(rows);
    if (insErr) return { ok: false, error: `signal insert failed: ${insErr.message}` };
    minted = rows.length;
  }
  totals.minted = minted;
  const { error: ledErr } = await args.supabase.from("integrity_runs").insert({
    company_id: args.companyId, component: "r3_outside_listing", status: args.mode === "apply" ? "completed" : "planned",
    examined: urls.length, admitted: minted,
    excluded_by_rule: { mode: args.mode, run_id: args.runId, review_gate: true, review_refused: gate.refused, refused, would_mint: wouldMint.map((w) => ({ url: w.source_url, product_name: w.listing.product_name, price: w.listing.price, currency: w.listing.currency, identity: w.content_identity })) },
    run_ref: `r3_outside_listing_${args.runId}`,
  });
  if (ledErr) return { ok: false, error: `ledger insert failed: ${ledErr.message}` };
  return { ok: true, mode: args.mode, run_id: args.runId, totals, would_mint: wouldMint, refused, review_refused: gate.refused };
}
