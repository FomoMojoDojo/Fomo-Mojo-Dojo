// ── verify-excerpts ───────────────────────────────────────────────────────────
// The fleet BACK-VERIFICATION (mark-only; operator rulings 2026-09-14). For one company's LIVE signals whose
// evidence_excerpt is non-empty, resolve a basis and write ONE excerpt_verifications row per
// (source key, excerpt identity) at guard_version 1. Writes VERIFICATIONS ONLY — no signal is edited,
// superseded, blanked or re-labelled; nothing rendered changes. Basis resolution order:
//   1. quote_source_text on the signal (the mint-time page)          → basis_kind quote_source_text
//   2. the document's sidecar (uploads)                              → sidecar
//   3. a page snapshot of the same URL (outside/own-words snapshots) → page_snapshot (refetch-class, ruling 2)
//   4. a RE-FETCH of the URL — once per URL per run, retained into outside_page_snapshots — (ruling 1)
//      → refetch; blocked/gone → no_basis (fetch_blocked / fetch_gone)
//   5. none → no_basis with the reason (no_document, file_row_deleted, no_sidecar, no_url,
//      frozen_company_no_refetch — a frozen company is never re-crawled)
// Idempotent: a key that already has a row is skipped before any fetch. Bounded: max_urls re-fetches per call
// (Kong 150 s); call again with the same body until done=true.
//   { company_id, dry_run?=true, refetch?=true, max_urls?=25, actor? }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchOutsidePage } from "../_shared/outsidePageStore.ts";
import { normalizeForHash } from "../_shared/contentIdentity.ts";
import { EXCERPT_GUARD_VERSION, excerptIdentity, sourceKeyFor, verdictAgainstBasis, verifyAndRecord, type NoBasisReason } from "../_shared/excerptVerification.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
const DOCUMENT_SOURCE_TYPES = new Set(["uploaded_file", "intake", "file_proposal"]);
const KEY_SEP = "|#|";

type Basis = { kind: "quote_source_text" | "sidecar" | "page_snapshot" | "refetch"; text: string; at: string | null } | { kind: "none"; reason: NoBasisReason };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { company_id, dry_run, refetch, max_urls, actor } = await req.json();
    if (!company_id || typeof company_id !== "string") return json({ ok: false, error: "company_id required" }, 400);
    const dryRun = dry_run !== false;
    const doRefetch = refetch !== false;
    const maxUrls = Math.max(1, Math.min(200, Number(max_urls ?? 25) || 25));
    const recordedBy = typeof actor === "string" && actor.trim() ? actor : "verify-excerpts (operator brief 2026-09-14)";
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "") as unknown as { from: (t: string) => any; storage: any };

    const { data: co } = await supabase.from("companies").select("id, frozen").eq("id", company_id).maybeSingle();
    if (!co) return json({ ok: false, error: "company not found" }, 404);
    const frozen = !!(co as { frozen?: boolean }).frozen;

    const { data: sigRows, error: sErr } = await supabase.from("signals").select("id, source_type, source_id, source_url, evidence_excerpt, quote_source_text, created_at").eq("company_id", company_id).is("superseded_at", null).neq("evidence_excerpt", "");
    if (sErr) return json({ ok: false, error: sErr.message }, 500);
    const signals = ((sigRows ?? []) as Array<{ id: string; source_type: string; source_id: string | null; source_url: string | null; evidence_excerpt: string; quote_source_text: string | null; created_at: string }>).filter((s) => normalizeForHash(s.evidence_excerpt));

    // Document paths (uploads): proposal → file → path; sidecar text loaded once per file.
    const proposalIds = [...new Set(signals.filter((s) => DOCUMENT_SOURCE_TYPES.has(s.source_type) && s.source_id).map((s) => String(s.source_id)))];
    const fileByProposal = new Map<string, { file_id: string | null; file_path: string | null }>();
    if (proposalIds.length > 0) {
      const { data: props } = await supabase.from("file_proposals").select("id, file_id").in("id", proposalIds);
      const fileIds = [...new Set(((props ?? []) as Array<{ id: string; file_id: string | null }>).map((p) => p.file_id).filter(Boolean))] as string[];
      const { data: files } = fileIds.length ? await supabase.from("input_files").select("id, file_path").in("id", fileIds) : { data: [] };
      const pathById = new Map(((files ?? []) as Array<{ id: string; file_path: string }>).map((f) => [f.id, f.file_path]));
      for (const p of ((props ?? []) as Array<{ id: string; file_id: string | null }>)) fileByProposal.set(p.id, { file_id: p.file_id, file_path: p.file_id ? (pathById.get(p.file_id) ?? null) : null });
    }
    const sidecarCache = new Map<string, string | null>();
    const loadSidecar = async (filePath: string) => {
      if (sidecarCache.has(filePath)) return sidecarCache.get(filePath)!;
      const { data, error } = await supabase.storage.from("input-files").download(`${filePath}.extracted.txt`);
      const text = error || !data ? null : (await data.text());
      sidecarCache.set(filePath, text && text.trim() ? text : null);
      return sidecarCache.get(filePath)!;
    };
    // Existing records for this company — the idempotence check (before any fetch).
    const { data: existing } = await supabase.from("excerpt_verifications").select("source_url, excerpt_identity").eq("company_id", company_id).eq("guard_version", EXCERPT_GUARD_VERSION);
    const have = new Set(((existing ?? []) as Array<{ source_url: string; excerpt_identity: string }>).map((r) => `${r.source_url}${KEY_SEP}${r.excerpt_identity}`));
    // Snapshots of this company's URLs (latest per URL with text).
    const snapByUrl = new Map<string, { text: string; at: string }>();
    for (const tbl of ["outside_page_snapshots", "own_words_page_snapshots"]) {
      const atCol = tbl === "outside_page_snapshots" ? "crawled_at" : "fetched_at";
      const { data: snaps } = await supabase.from(tbl).select(`source_url, clean_text, ${atCol}`).eq("company_id", company_id).not("clean_text", "is", null).order(atCol, { ascending: false });
      for (const r of ((snaps ?? []) as Array<Record<string, string | null>>)) {
        const url = String(r.source_url ?? ""), text = String(r.clean_text ?? "");
        if (url && normalizeForHash(text) && !snapByUrl.has(url)) snapByUrl.set(url, { text, at: String(r[atCol]) });
      }
    }

    const counts = { signals: signals.length, already: 0, passed: 0, blanked: 0, no_basis: 0, written: 0, refetched: 0, refetch_ok: 0, refetch_blocked: 0, refetch_gone: 0, deferred: 0 };
    const byReason: Record<string, number> = {}; const byBasis: Record<string, number> = {};
    const refetched = new Map<string, Awaited<ReturnType<typeof fetchOutsidePage>> & { at: string }>();
    const deferredUrls = new Set<string>();
    for (const s of signals) {
      const file = s.source_id ? fileByProposal.get(String(s.source_id)) : undefined;
      const isDocument = DOCUMENT_SOURCE_TYPES.has(s.source_type);
      const sourceKey = sourceKeyFor({ source_url: s.source_url, file_path: isDocument ? file?.file_path ?? null : null, source_id: s.source_id });
      const identity = await excerptIdentity(s.evidence_excerpt);
      if (have.has(`${sourceKey}${KEY_SEP}${identity}`)) { counts.already++; continue; }
      let basis: Basis;
      if (s.quote_source_text && normalizeForHash(s.quote_source_text)) basis = { kind: "quote_source_text", text: s.quote_source_text, at: s.created_at };
      else if (isDocument) {
        if (!file || !file.file_id) basis = { kind: "none", reason: "no_document" };
        else if (!file.file_path) basis = { kind: "none", reason: "file_row_deleted" };
        else { const t = await loadSidecar(file.file_path); basis = t ? { kind: "sidecar", text: t, at: null } : { kind: "none", reason: "no_sidecar" }; }
      } else if (s.source_type === "mojo_analysis" || !String(s.source_url ?? "").trim()) basis = { kind: "none", reason: s.source_type === "mojo_analysis" ? "no_document" : "no_url" };
      else {
        const url = String(s.source_url).trim();
        const snap = snapByUrl.get(url);
        if (snap) basis = { kind: "page_snapshot", text: snap.text, at: snap.at };
        else if (frozen) basis = { kind: "none", reason: "frozen_company_no_refetch" };
        else if (!doRefetch) { counts.deferred++; deferredUrls.add(url); continue; }
        else {
          let d = refetched.get(url);
          if (!d) {
            if (refetched.size >= maxUrls) { counts.deferred++; deferredUrls.add(url); continue; } // bounded: the next call continues
            if (dryRun) { counts.deferred++; deferredUrls.add(url); continue; }
            const f = await fetchOutsidePage(url); d = { ...f, at: new Date().toISOString() }; refetched.set(url, d); counts.refetched++;
            counts[`refetch_${f.fetch_status}` as "refetch_ok" | "refetch_blocked" | "refetch_gone"]++;
            if (f.fetch_status === "ok" && f.clean_text) {
              // retain the re-fetched page (ruling 1): a verdict must be repeatable; signal_id NULL, dedup by (company,url,sha)
              const { data: ex } = await supabase.from("outside_page_snapshots").select("id").eq("company_id", company_id).eq("source_url", url).eq("text_sha256", f.text_sha256).limit(1);
              if (!Array.isArray(ex) || ex.length === 0) await supabase.from("outside_page_snapshots").insert({ company_id, source_url: url, signal_id: null, clean_text: f.clean_text, text_sha256: f.text_sha256, run_id: null, fetch_status: "ok", http_status: f.http_status, structured: { ...(f.structured ?? {}), refetch_for_verification: true } });
              snapByUrl.set(url, { text: f.clean_text, at: d.at });
            }
          }
          basis = d.fetch_status === "ok" && d.clean_text ? { kind: "refetch", text: d.clean_text, at: d.at } : { kind: "none", reason: d.fetch_status === "gone" ? "fetch_gone" : "fetch_blocked" };
        }
      }
      const verdict = basis.kind === "none" ? "no_basis" : verdictAgainstBasis(s.evidence_excerpt, basis.text);
      counts[verdict]++;
      if (basis.kind === "none") byReason[basis.reason] = (byReason[basis.reason] ?? 0) + 1; else byBasis[basis.kind] = (byBasis[basis.kind] ?? 0) + 1;
      if (dryRun) continue;
      const r = await verifyAndRecord(supabase, { companyId: company_id, signalId: s.id, sourceKey, excerpt: s.evidence_excerpt, basis, recordedBy, note: basis.kind === "refetch" ? `re-fetched ${basis.at} — not the mint-time page` : basis.kind === "page_snapshot" ? `snapshot of ${basis.at} — not the mint-time page` : null });
      if (r?.written) { counts.written++; have.add(`${sourceKey}${KEY_SEP}${identity}`); }
    }
    return json({ ok: true, dry_run: dryRun, company_id, frozen, guard_version: EXCERPT_GUARD_VERSION, counts, by_basis: byBasis, by_reason: byReason, deferred_urls: deferredUrls.size, done: counts.deferred === 0 });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    console.error("[verify-excerpts] error:", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
