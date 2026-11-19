// The pure half of promote-verified.ts (A5, 2026-11-18): what a verify verdict writes on a lead row. No I/O.
import type { LeadVerdict } from "../../supabase/functions/_shared/reviewHostLane.ts";

export type PromotionWrite =
  | { kind: "promote"; quote: string; quote_source_text: string; event_date: string | null; event_date_precision: string; payload: Record<string, unknown>; release: true }
  | { kind: "lead"; payload: Record<string, unknown>; release: false };

/** A promoted lead gets its quote, paragraph and date from the fetched page, names the verify call, and is released;
 *  a lead that fails keeps no quote, stays held, and records why. event_date null = keep the row's own. */
export function promotionWrite(verdict: LeadVerdict, callId: string, at: string): PromotionWrite {
  if (verdict.promoted) {
    return { kind: "promote", quote: verdict.quote, quote_source_text: verdict.quote_source_text, event_date: verdict.event_date,
      event_date_precision: verdict.event_date_precision, release: true,
      payload: { quote_basis: "web_fetch_page_text", date_basis: verdict.date_basis, review_body: verdict.review_body, verified_by_call_id: callId,
        lead_verify: { call: callId, result: "promoted", page_url: verdict.page_url, at } } };
  }
  return { kind: "lead", release: false, payload: { lead_verify: { call: callId, result: "lead", reason: verdict.reason, at } } };
}
