// REVIEW ANCHORS + BASELINE SELECTION — pure (no Deno, no DB). Operator rulings 2026-09-04.
//
// (2) ANCHORS: entity_anchors_json values first, then the website host (full hostname + its first label), then
//     the company name with a trailing fixture suffix stripped ("Cafe Barra 2" → "cafe barra"). All lowercased,
//     NFC, whitespace-collapsed. anchor_present = any anchor OR any verbatim dependent quote is a substring of
//     the page body under the SAME normalization.
// (3) BASELINE: --baseline-run given → the newest snapshot under THAT run_id only (null when none — never a
//     fallback to another run); absent → the newest snapshot whose run_id is not the sentinel and which
//     predates the review day — never bare newest (the plant lives under the sentinel).
export const norm = (s: string): string => (s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const FIXTURE_SUFFIX_RE = /\s+(?:\d+|\(\d+\)|#\d+|v\d+|copy)$/i;

export function buildAnchors(co: { name: string | null; website: string | null; entityAnchors: unknown[] | null | undefined }): string[] {
  const out: string[] = [];
  const push = (v: string) => { const n = norm(v); if (n && !out.includes(n)) out.push(n); };
  for (const a of co.entityAnchors ?? []) if (typeof a === "string") push(a);
  if (co.website) {
    try {
      const host = new URL(co.website.includes("://") ? co.website : `https://${co.website}`).hostname.replace(/^www\./, "");
      push(host);
      const label = host.split(".")[0];
      if (label && label.length >= 4) push(label);
    } catch { /* unparsable website: no host anchor */ }
  }
  if (co.name) push(co.name.replace(FIXTURE_SUFFIX_RE, ""));
  return out;
}

export function anchorPresent(body: string, anchors: string[], quotes: string[]): boolean {
  const b = norm(body);
  if (!b) return false;
  if (anchors.some((a) => a && b.includes(a))) return true;
  return quotes.some((q) => { const n = norm(q); return n.length >= 12 && b.includes(n); });
}

export type SnapshotCandidate = { sha: string; status: string; run_id: string | null; crawled_at: string };
export type Baseline = { sha: string; status: string } | null;

export function selectBaseline(rows: SnapshotCandidate[], opts: { sentinel: string; today: string; baselineRun?: string | null }): Baseline {
  const newest = (xs: SnapshotCandidate[]) => xs.slice().sort((a, b) => (a.crawled_at < b.crawled_at ? 1 : a.crawled_at > b.crawled_at ? -1 : 0))[0] ?? null;
  const pick = opts.baselineRun
    ? newest(rows.filter((r) => r.run_id === opts.baselineRun))
    : newest(rows.filter((r) => r.run_id !== opts.sentinel && r.crawled_at.slice(0, 10) < opts.today));
  return pick ? { sha: pick.sha, status: pick.status } : null;
}
