import { supabase } from "@/integrations/supabase/client";

export function routeRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function buildDecisionBullets(
  detail: {
    whyThisMatters: string[];
    evidence: Array<{ status: string }>;
    steps: Array<{ status: string }>;
  },
  linkedOutcome: { statement: string } | null,
): string[] {
  const bullets: string[] = [];

  if (detail.whyThisMatters.length > 0) bullets.push(detail.whyThisMatters[0]);

  const complete = detail.evidence.filter((e) => e.status !== "missing").length;
  const total = detail.evidence.length;
  const missing = total - complete;

  if (total > 0 && complete > 0) {
    bullets.push(`${complete} of ${total} evidence item${total !== 1 ? "s" : ""} already in place.`);
  }
  if (missing === 0 && total > 0) {
    bullets.push("No critical evidence gaps flagged for this route.");
  } else if (missing === 1) {
    bullets.push("Only one evidence gap remaining before this route is ready.");
  }

  if (bullets.length < 3 && detail.whyThisMatters.length > 1) {
    bullets.push(detail.whyThisMatters[1]);
  }

  if (linkedOutcome?.statement && bullets.length < 4) {
    const stmt = linkedOutcome.statement;
    bullets.push(`Tied to outcome: "${stmt.length > 70 ? `${stmt.slice(0, 70)}…` : stmt}"`);
  }

  return bullets.slice(0, 4);
}

export async function persistSelectedRouteDecision(
  companyId: string,
  routeId: string,
  summary: Record<string, unknown>,
  now: string,
): Promise<void> {
  await supabase
    .from("companies")
    .update({
      selected_route_id: routeId,
      selected_route_summary_json: summary,
      selected_route_updated_at: now,
    } as any)
    .eq("id", companyId);
}

export async function clearSelectedRouteDecision(companyId: string): Promise<void> {
  await supabase
    .from("companies")
    .update({
      selected_route_id: null,
      selected_route_summary_json: {},
      selected_route_updated_at: null,
    } as any)
    .eq("id", companyId);
}

export async function insertRouteDecisionEvent(
  companyId: string,
  routeId: string | null,
  eventType: "selected" | "changed" | "cleared",
  summaryJson: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("route_decision_events")
    .insert({
      company_id: companyId,
      route_id: routeId,
      event_type: eventType,
      summary_json: summaryJson,
    } as any);
}
