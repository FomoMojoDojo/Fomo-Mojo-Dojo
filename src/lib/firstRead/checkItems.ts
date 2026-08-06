// First Read · Gate 2 — checkable-item assembly.
//
// Pure. Assembles the items The Check (Act 3) puts in front of the client from
// the SAME sources The Mirror (Act 2) reads: standing findings, candidate market
// options, and positioning differentiators. item_text is the VERBATIM statement
// shown and hashed — no reshaping, no canned text.
//
// Findings and markets are register-guarded exactly as the Outside surface guards
// them (public register only). Differentiators are the company's own declared
// attributes and carry no register — they render as-is (the client's to confirm).

import type { Finding } from "@/hooks/useStandingFindings";
import type { MarketOption } from "@/hooks/useMarketOptions";
import type { PositioningItem } from "@/lib/types";
import { admitForSurface } from "@/lib/registerGuard";

export type CheckItemKind = "finding" | "market" | "differentiator" | "delta";

// V2-7 — a say-vs-see delta item's render data (kind='delta' only). The SAY side is the
// client's declared statement; the SEE side is the outside record's reading; the receipt
// is a verbatim quote on the SEE side (CV-2e) or null (honest absence).
export interface DeltaRender {
  // internally_silent (Option B): the outside raised something the client hasn't spoken to.
  // Observed-anchored — its `say` is empty and its item text is the OBSERVED statement.
  deltaType: "echoed" | "divergent" | "publicly_silent" | "internally_silent";
  say: string;
  see: string;
  quote: string | null;
  quoteSourceText: string | null;
  eventDate: string | null;
}

export interface RawCheckItem {
  kind: CheckItemKind;
  ref: string; // source row id — PROVENANCE ONLY (no FK on the capture row)
  text: string; // verbatim statement shown to the client and hashed for identity
  // V2-7 — a precomputed identity (the delta's content_identity, a distinct construction
  // from contentIdentity(text)); when absent, identity is hashed from `text` as before.
  identity?: string;
  // V2-7 — present only for kind='delta'; the say-vs-see render payload.
  delta?: DeltaRender;
}

export function assembleCheckItems(args: {
  findings: Finding[];
  markets: MarketOption[];
  differentiators: PositioningItem[];
}): RawCheckItem[] {
  const items: RawCheckItem[] = [];

  for (const f of args.findings) {
    if (!admitForSurface(f, "outside")) continue; // RG guard — public findings only
    const text = (f.body || "").trim();
    if (!text) continue;
    items.push({ kind: "finding", ref: f.id, text });
  }

  for (const m of args.markets) {
    if (!admitForSurface(m, "outside")) continue; // market_register routed through the same guard
    const exec = (m.executor_statement || "").trim();
    const job = (m.job_statement || "").trim();
    const text = [exec, job].filter(Boolean).join(" — ");
    if (!text) continue;
    items.push({ kind: "market", ref: m.id, text });
  }

  for (const d of args.differentiators) {
    const text = (d.name || "").trim();
    if (!text) continue;
    items.push({ kind: "differentiator", ref: d.id, text });
  }

  return items;
}
