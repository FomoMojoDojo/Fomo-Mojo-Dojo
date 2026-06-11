// B2.2a — Store supplement (Option C, council 2026-06-11).
//
// Problem on record: briefs and judges read ONE run's snapshot, so corroboration
// flickers run-to-run for evidence the system already holds (dry-ice: runs 7/8 carry
// the independent attestation, run 16 doesn't, the claim downgraded). The pinned
// snapshot REMAINS the brief; this module computes a clearly-marked SUPPLEMENT of
// previously-established outside evidence from the accumulated signals store, each
// item stamped with its run of origin.
//
// ADMISSION RULES — all four mandatory, each with a per-rule exclusion count, applied
// in the operator-amended order class → syndication → dedup → recency (gate decision
// 2026-06-11; strict URL-dedup deleted exactly the same-URL-content-drift evidence the
// supplement exists to preserve, and dedup-before-syndication hid the syndication
// exclusion the cross-check requires):
//   (1) class:       voice_class = outside_voice_about_client (NULL legacy rows are
//                    classified on read and lazily stamped — supplement candidates only)
//   (2) syndication: the durable verdict store + lazy stamping apply to EVERY
//                    candidate, no exceptions; unresolved ⇒ excluded (fail-safe)
//   (3) dedup:       CONTENT IDENTITY (URL + normalized-text hash) — the same
//                    observation never counts twice, against the current run's items
//                    AND within the supplement; a DIFFERENT prior observation of the
//                    same page may supplement. One URL = at most one citation in any
//                    corroboration basis (enforced at the judges' basis layer).
//   (4) recency:     window anchored to the PINNED run's date, not wall clock
//
// REPLAY LAW: deterministic given the pinned run — only evidence from runs at-or-
// before the pinned baseline_run_id is admissible, the window anchors to the pinned
// run's created_at, candidates are processed in a deterministic order, and the result
// carries a sha256 digest so two pinned replays prove byte-identity in the logs.
//
// Local-only: no external calls — the only network beyond Postgres is the existing
// local-Ollama band judge inside resolveSyndicationDurable.
//
// WINDOW CALIBRATION (reported, not hidden): 90 days. SMB public footprint (reviews,
// registries, profiles) moves on quarterly timescales; 90d bridges single-scan misses
// across any plausible scan cadence while bounding staleness to one quarter —
// licenses lapse and services change, so older attestations should not silently
// corroborate present-tense claims. The ≤-pinned-run rule binds harder than the
// window on young datasets; the window exists for the long-lived store.

import { resolveSyndicationDurable, syndicationTextHash, type ClientCorpus } from "./syndication.ts";

export const SUPPLEMENT_WINDOW_DAYS = 90;

export type SupplementItem = {
  url: string;
  text: string;
  run_of_origin: number;
  as_of: string; // ISO date of the originating signal row
};

export type StoreSupplement = {
  items: SupplementItem[];
  digest: string;
  composition: Record<string, unknown>;
};

type CandidateRow = {
  id?: string;
  source_id?: string | number;
  source_url?: string;
  claim_text?: string;
  evidence_excerpt?: string;
  voice_class?: string | null;
  raw_payload?: { bucket?: string; source_type?: string } | null;
  created_at?: string;
};

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildStoreSupplement(opts: {
  supabase: { from: (t: string) => any };
  companyId: string;
  pinnedRunId: number;
  companyHost: string;
  corpus: ClientCorpus;
  clientSample: string;
  // The current run's items as (url, text) pairs — dedup is by content identity.
  currentRunItems: Array<{ url: string; text: string }>;
  // classifyVoice from claimProvenance.ts, passed in to avoid a module cycle.
  classify: (entry: { voice_class?: string; bucket?: string; source_type?: string; url?: string }) => string;
  label: string;
}): Promise<StoreSupplement> {
  const { data: pinnedRow } = await opts.supabase
    .from("public_baseline_runs")
    .select("created_at")
    .eq("id", opts.pinnedRunId)
    .maybeSingle();
  const pinnedAtMs = Date.parse(String((pinnedRow as { created_at?: string } | null)?.created_at || ""));
  if (!Number.isFinite(pinnedAtMs)) {
    const composition = { pinned_run_id: opts.pinnedRunId, error: "pinned_run_date_unresolvable", admitted: 0 };
    console.warn(`[storeSupplement] ${opts.label} pinned run date unresolvable — empty supplement`, composition);
    return { items: [], digest: await sha256Hex("[]"), composition };
  }
  const windowStartMs = pinnedAtMs - SUPPLEMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const { data: rows } = await opts.supabase
    .from("signals")
    .select("id, source_id, source_url, claim_text, evidence_excerpt, voice_class, raw_payload, created_at")
    .eq("company_id", opts.companyId)
    .eq("source_type", "public_baseline_run")
    .order("created_at", { ascending: true })
    .limit(2000);
  const candidates = (Array.isArray(rows) ? rows : []) as CandidateRow[];

  let excludedBeyondPinned = 0;
  let excludedWindow = 0;
  let excludedClass = 0;
  let excludedDedupCurrent = 0;
  let excludedDedupWithin = 0;
  let excludedSyndicated = 0;
  let unresolvedExcluded = 0;
  const lazyStamps: Array<{ id: string; voice_class: string }> = [];
  // Content-identity keys of the current run's items: url + hash of normalized text.
  const currentRunKeys = new Set<string>();
  for (const item of opts.currentRunItems) {
    const u = String(item.url || "").trim();
    const t = String(item.text || "").trim();
    if (u && t) currentRunKeys.add(`${u}::${await syndicationTextHash(t)}`);
  }
  const seenKeys = new Set<string>();
  const admitted: SupplementItem[] = [];

  for (const row of candidates) {
    const runOfOrigin = Number(row.source_id);
    // Replay law: only runs at-or-before the pinned baseline are admissible.
    if (!Number.isFinite(runOfOrigin) || runOfOrigin > opts.pinnedRunId) { excludedBeyondPinned++; continue; }
    const url = String(row.source_url || "").trim();
    const text = String(row.claim_text || row.evidence_excerpt || "").trim();
    if (!url || !text) { excludedClass++; continue; }
    // Rule 1 — class. NULL legacy rows are classified on read; the computed class is
    // lazily stamped back (supplement candidates only — no bulk re-judge).
    const voiceClass = opts.classify({
      voice_class: row.voice_class ?? undefined,
      bucket: row.raw_payload?.bucket,
      source_type: row.raw_payload?.source_type,
      url,
    });
    if (row.voice_class == null && row.id) lazyStamps.push({ id: String(row.id), voice_class: voiceClass });
    if (voiceClass !== "outside_voice_about_client") { excludedClass++; continue; }
    // Rule 2 — syndication. Before dedup (amended order) so a syndicated store copy is
    // excluded HERE, visibly, rather than vanishing into a dedup count.
    const verdict = await resolveSyndicationDurable({
      supabase: opts.supabase,
      companyId: opts.companyId,
      sourceUrl: url,
      itemText: text,
      corpus: opts.corpus,
      clientSampleForLlm: opts.clientSample,
      label: `${opts.label}/supplement`,
    });
    if (verdict.syndicated === true) {
      excludedSyndicated++;
      console.log(`[storeSupplement] ${opts.label} EXCLUDED syndicated supplement candidate`, {
        url,
        run_of_origin: runOfOrigin,
        score: Number(verdict.score.toFixed(4)),
        method: verdict.method,
      });
      continue;
    }
    if (verdict.syndicated === null) { unresolvedExcluded++; continue; }
    // Rule 3 — dedup by CONTENT IDENTITY: the same observation never counts twice; a
    // different prior observation of the same URL may supplement.
    const key = `${url}::${await syndicationTextHash(text)}`;
    if (currentRunKeys.has(key)) { excludedDedupCurrent++; continue; }
    if (seenKeys.has(key)) { excludedDedupWithin++; continue; }
    seenKeys.add(key);
    // Rule 4 — recency window, anchored to the pinned run's date.
    const createdMs = Date.parse(String(row.created_at || ""));
    if (!Number.isFinite(createdMs) || createdMs < windowStartMs || createdMs > pinnedAtMs) { excludedWindow++; continue; }
    admitted.push({
      url,
      text,
      run_of_origin: runOfOrigin,
      as_of: String(row.created_at || "").slice(0, 10),
    });
  }

  // Lazy voice_class stamping — best-effort, idempotent (IS NULL guarded).
  for (const stamp of lazyStamps) {
    try {
      await opts.supabase
        .from("signals")
        .update({ voice_class: stamp.voice_class })
        .eq("id", stamp.id)
        .is("voice_class", null);
    } catch (_) { /* classification already held in memory */ }
  }

  admitted.sort((a, b) => a.run_of_origin - b.run_of_origin || a.url.localeCompare(b.url) || a.text.localeCompare(b.text));
  const digest = await sha256Hex(JSON.stringify(admitted));

  const composition = {
    pinned_run_id: opts.pinnedRunId,
    window_days: SUPPLEMENT_WINDOW_DAYS,
    window_start: new Date(windowStartMs).toISOString().slice(0, 10),
    window_end: new Date(pinnedAtMs).toISOString().slice(0, 10),
    candidates_total: candidates.length,
    excluded_beyond_pinned_run: excludedBeyondPinned,
    excluded_window: excludedWindow,
    excluded_class: excludedClass,
    excluded_dedup_current_run: excludedDedupCurrent,
    excluded_dedup_within: excludedDedupWithin,
    excluded_syndicated: excludedSyndicated,
    unresolved_excluded: unresolvedExcluded,
    admitted: admitted.length,
    admitted_items: admitted.map((i) => ({ url: i.url.slice(0, 80), run: i.run_of_origin, as_of: i.as_of })),
    digest,
  };
  console.log(`[storeSupplement] ${opts.label} composition`, composition);
  return { items: admitted, digest, composition };
}

// The brief section — clearly bounded, as-of stamped, standing stated. Used verbatim
// by the gen briefs; the judges add the same items to their admissible basis.
export function buildStoreSupplementBrief(supplement: StoreSupplement | null): string {
  if (!supplement || supplement.items.length === 0) return "";
  return (
    `PREVIOUSLY ESTABLISHED OUTSIDE EVIDENCE (store supplement — outside evidence from prior public scans, ` +
    `admitted through class, syndication, dedup, and recency gates; each item stamped with its run of origin):\n` +
    supplement.items
      .map((i) => `- [as-of run ${i.run_of_origin} | ${i.as_of}] ${i.text} (url: ${i.url})`)
      .join("\n") +
    `\nStanding: established outside evidence — usable as corroboration context, NEVER a substitute for naming what the current scan shows.`
  );
}
