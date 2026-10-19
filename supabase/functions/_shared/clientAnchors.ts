// ── R22 (operator ruling 2026-10-18): THE GENERATOR ALWAYS NAMES THE CLIENT ────────────────────────
//
// extract-outside-evidence named the client from entity_anchors_json alone and fell back to the string
// "the client" when that was empty — which it is for 16 of the 17 b3 companies. The company's NAME and its
// website HOST were never passed, so the model was asked for statements about an unnamed business and, on
// the Brand AI pilot, honestly found none.
//
// THE RULE: the anchor set is the company name, then the website host (ONE derivation, normalizeHost — www
// stripped, lowercased), then entity_anchors_json entries; anchors ADD, never replace; deduped
// case-insensitively; name and host both absent ⇒ a named refusal, never a fallback string. The set used is
// recorded on the run's integrity row and reported by plan.
import { normalizeHost } from "./firstReadProvenance.ts";

export const CLIENT_UNNAMED_GUARD = "client_unnamed" as const;

export type ClientAnchorsInput = { name?: unknown; website?: unknown; entity_anchors_json?: unknown };
export type ClientAnchors =
  | { ok: true; anchors: string[]; name: string | null; host: string | null; from_entity_anchors: number }
  | { ok: false; guard: typeof CLIENT_UNNAMED_GUARD; reason: string };

/** The website's host, through the ONE helper. null when the website is absent or unparsable. */
export function hostOfWebsite(website: unknown): string | null {
  const w = String(website ?? "").trim();
  if (!w) return null;
  try {
    const h = normalizeHost(new URL(w.includes("://") ? w : `https://${w}`).hostname);
    return h || null;
  } catch {
    return null;
  }
}

export function clientAnchorsFor(co: ClientAnchorsInput): ClientAnchors {
  const name = String(co.name ?? "").trim() || null;
  const host = hostOfWebsite(co.website);
  if (!name && !host) {
    return { ok: false, guard: CLIENT_UNNAMED_GUARD, reason: "the company has neither a name nor a website host — the generator cannot be told whom the page is about" };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: string | null) => {
    const t = String(v ?? "").trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };
  push(name);
  push(host);
  const before = out.length;
  const entities = Array.isArray(co.entity_anchors_json) ? co.entity_anchors_json : [];
  for (const a of entities) if (typeof a === "string") push(a);
  return { ok: true, anchors: out, name, host, from_entity_anchors: out.length - before };
}
