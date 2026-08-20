// First Read preview — "Your channels, as we read them" junk filter (R3, 2026-08-20).
//
// The client-voice inference rows are OUR read of the company's own pages. A few are
// not statements at all — a bare page title, or a research note that no readable content
// was found. R3: hide those via a DETERMINISTIC test; every hidden id is reported so the
// suppression is auditable, never silent.
//
// The test is intentionally narrow (three positive classes) so a genuine — if third-person
// — observation is never hidden:
//   1. the row IS the page title (statement === the backing signal's source_title), OR
//   2. a "content not publicly indexable"-class research note (no readable content), OR
//   3. a page-title shape: a pipe separator, which appears in titles ("Order Online | CAFE
//      BARRA …") and effectively never in prose.
// A leading "Page titled '…'" note is class (2)'s sibling — a note ABOUT a title, not a read.

const NOT_INDEXABLE_RE = /not\s+publicly\s+indexable/i;
const PAGE_TITLED_RE = /^\s*page titled\b/i;
const TITLE_PIPE_RE = /\s\|\s/; // " | " — a title separator, never sentence prose.

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** True when this channel row is junk (a title/nav label or a no-content research note). */
export function isChannelJunk(statement: string, sourceTitle: string | null): boolean {
  const s = (statement ?? "").trim();
  if (!s) return true;
  if (sourceTitle && norm(s) === norm(sourceTitle)) return true; // (1) exact page title
  if (PAGE_TITLED_RE.test(s)) return true; // (2) note about a title
  if (NOT_INDEXABLE_RE.test(s)) return true; // (2) no readable content
  if (TITLE_PIPE_RE.test(s)) return true; // (3) title shape
  return false;
}
