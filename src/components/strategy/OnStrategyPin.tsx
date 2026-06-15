import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// On-strategy pin: a DISTINCT strategic assertion (which job-step set drives strategy),
// NOT the journey view-toggle next to it (that just switches what you're looking at). You
// can view one set while another is on-strategy. Persists to operator_primary_selection
// (domain='job_step_set', item_key=journey_key) — the single authority both the scorer and
// research-company read via resolve_primary_job_step_set. Mirrors the Findings primary
// control. Hidden for single-set companies (no choice to make).

// operator_primary_selection / the resolver aren't in the generated types.
const db = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown }>;
};

const MONO = '"IBM Plex Mono", ui-monospace, monospace';

export function OnStrategyPin({
  companyId,
  journeyOptions,
  focusedJourneyKey,
}: {
  companyId?: string;
  journeyOptions: { key: string; title: string }[];
  focusedJourneyKey: string | null;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["on-strategy-pin", companyId];

  const { data } = useQuery({
    queryKey,
    enabled: Boolean(companyId) && journeyOptions.length > 1,
    staleTime: 30_000,
    queryFn: async (): Promise<{ pinnedKey: string | null }> => {
      if (!companyId) return { pinnedKey: null };
      // The real operator choice ONLY — never resolve_primary_job_step_set's
      // heuristic. An un-chosen set must not claim to be on strategy.
      const pinRes = await db.from("operator_primary_selection")
        .select("item_key").eq("company_id", companyId).eq("domain", "job_step_set").maybeSingle();
      const pinned = (pinRes as { data?: { item_key?: unknown } | null }).data?.item_key;
      return { pinnedKey: typeof pinned === "string" ? pinned : null };
    },
  });

  // Single-set companies: nothing to choose — same hide rule as the journey toggle.
  if (!companyId || journeyOptions.length <= 1) return null;

  const pinnedKey = data?.pinnedKey ?? null;
  // The chosen set drives the chip only if it still exists among the current
  // sets ("choice wins only if its set still exists"); otherwise no set is on
  // strategy yet.
  const chosenKey = pinnedKey && journeyOptions.some((j) => j.key === pinnedKey) ? pinnedKey : null;
  const titleOf = (k: string | null) => journeyOptions.find((j) => j.key === k)?.title ?? k ?? "—";
  const focusIsOnStrategy = focusedJourneyKey != null && chosenKey === focusedJourneyKey;

  async function pinFocused() {
    if (!companyId || !focusedJourneyKey) return;
    await db.from("operator_primary_selection").upsert(
      {
        company_id: companyId,
        domain: "job_step_set",
        item_key: focusedJourneyKey,
        item_id: null,
        chosen_at: new Date().toISOString(),
      },
      { onConflict: "company_id,domain" },
    );
    await queryClient.invalidateQueries({ queryKey });
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "#8a7560", whiteSpace: "nowrap" }}>
        On strategy: <strong style={{ color: "#233c4b" }}>{chosenKey ? titleOf(chosenKey) : "not yet chosen"}</strong>
      </span>
      {focusedJourneyKey && !focusIsOnStrategy && (
        <button
          type="button"
          onClick={pinFocused}
          style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "#c47a1c", background: "none", border: "1px solid #e3d3b8", borderRadius: 4, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap" }}
        >
          Choose this as the on-strategy set
        </button>
      )}
      {focusedJourneyKey && focusIsOnStrategy && (
        <span style={{ fontFamily: MONO, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.07em", color: "#4a8f7f", whiteSpace: "nowrap" }}>
          ✓ On strategy
        </span>
      )}
    </div>
  );
}
