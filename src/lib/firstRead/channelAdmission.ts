// ── Channel-block admission (operator ruling S2 §6, signed 2026-09-18) ────────────────────────────
//
// "Your channels, as we read them" is OUR paraphrase of the company's own channels. Two guards, applied ONCE
// in the shared load path (useFirstReadPreviewData) for every reader of the row set:
//   (a) a synthesis row is never admitted — a row that is our analysis (label, marker or shape:
//       voiceLabel.isAnalysisRow) is not a channel we read; before S2, Edgewood's rows 57/58 rendered exactly
//       such rows ("Edgewood is a leading nonprofit provider…" from b577722a, an unmarked top_hypotheses row);
//   (b) a row is admitted only when its own-host signal TIES TO A SAVED PAGE — a row in own_words_page_snapshots
//       or outside_page_snapshots (fetch_status='ok') on the same URL, exact first then normalizeUrlKey. A row
//       with no saved page is a read of nothing we can show; it drops and its id is REPORTED (never silent).
// Pure: the caller loads the snapshot URLs and passes them; the predicate never touches the network.
import { isAnalysisRow } from "../../../supabase/functions/_shared/voiceLabel.ts";
import { normalizeUrlKey } from "./quoteProducer";

export type ChannelAdmission = "admitted" | "synthesis" | "no_saved_page";

export type SavedPageIndex = { exact: Set<string>; canonical: Set<string> };

/** Index the saved-page URLs of a company (both stores, already filtered to fetch_status='ok' by the caller). */
export function savedPageIndex(urls: Iterable<string | null | undefined>): SavedPageIndex {
  const exact = new Set<string>();
  const canonical = new Set<string>();
  for (const u of urls) {
    const s = String(u ?? "").trim();
    if (!s) continue;
    exact.add(s);
    const k = normalizeUrlKey(s);
    if (k) canonical.add(k);
  }
  return { exact, canonical };
}

/** Does this URL tie to a saved page — exact URL first, then the canonical key (www-stripped, trailing slash stripped)? */
export function tiesToSavedPage(url: string | null | undefined, pages: SavedPageIndex): boolean {
  const s = String(url ?? "").trim();
  if (!s) return false;
  if (pages.exact.has(s)) return true;
  const k = normalizeUrlKey(s);
  return !!k && pages.canonical.has(k);
}

/** The admission verdict for one channel row's own-host signal. Order matters: a synthesis row is refused as
 *  synthesis even when its URL has a saved page (Edgewood's home page is saved; b577722a still never renders). */
export function channelRowAdmission(
  sig: { source_url?: string | null; voice_class?: string | null; raw_payload?: unknown },
  pages: SavedPageIndex,
): ChannelAdmission {
  if (isAnalysisRow(sig)) return "synthesis";
  if (!tiesToSavedPage(sig.source_url, pages)) return "no_saved_page";
  return "admitted";
}
